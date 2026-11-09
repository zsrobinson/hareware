import type { SortingState, VisibilityState } from "@tanstack/react-table";
import {
  ActivityIcon,
  ChartColumnIcon,
  ChartPieIcon,
  CodeIcon,
  Grid3x3Icon,
  HistoryIcon,
  LinkIcon,
  NewspaperIcon,
  SlidersHorizontalIcon,
  SproutIcon,
  TableIcon,
  TrophyIcon,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useId, useRef, useState, type ComponentType } from "react";
import { toast } from "sonner";
import { CopyTextButton } from "~/components/copy-button";
import { PageActions } from "~/components/page-actions";
import { PanelGroup, SidePanel, useIsPhone } from "~/components/panel";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import {
  AboveToolbar,
  ArchiveShell,
  SearchRowEnd,
  SheetGroup,
  ToolbarEnd,
  type ViewProps,
} from "./archive-shell";
import { ChartView } from "./charts";
import { carryOver, type FilterState, type Searching } from "./filters";
import { useOpenRow, type OpenRow } from "./open-row";
import { useInAddress } from "./page-state";
import { PivotView } from "./pivot-view";
import { ViewBuilder } from "./view-builder";
import { ViewTabs } from "./view-tabs";
import {
  changeView,
  chooseView,
  CUSTOM,
  declarationOf,
  openingOf,
  periodOfShape,
  headingOf,
  readView,
  resetView,
  searchingOf,
  shapeOf,
  viewOf,
  viewsOn,
  viewSource,
  writeView,
  type Shape,
  type ViewState,
} from "./view-state";
import type { ColumnId, Minimum, Source, TableSort } from "./views";

/*
  A table's page: its views as tabs over the filters, the one on screen
  drawn as a table or a chart, and the builder that changes it into Custom.
  Every page is the same frame; a page brings only its table (ADR 0014).
*/

/** what a page's table is handed: the view's columns and sort, and its open row */
export type TableViewProps = ViewProps & {
  /** its title and question, over the count */
  heading: { title: string; question: string | null };
  columns: readonly ColumnId[];
  /** People's rows narrowed to whoever is new in the range */
  only?: "new";
  sorting: SortingState;
  setSorting: (sorting: SortingState) => void;
  /** the row open beside the table, kept in the address as `?open=` */
  opened: OpenRow;
  /** People's Show, which the view opens on */
  minimum: Minimum;
  setMinimum: (minimum: Minimum) => void;
  /** what the Columns menu has chosen, which Copy as view takes in */
  picked: VisibilityState;
  setPicked: (picked: VisibilityState) => void;
};

const ICONS: Record<string, LucideIcon> = {
  sections: NewspaperIcon,
  "section-share": ChartPieIcon,
  history: HistoryIcon,
  top: TrophyIcon,
  new: SproutIcon,
  headcount: ActivityIcon,
  [CUSTOM]: SlidersHorizontalIcon,
};

const SEARCHED_FOR: Record<Searching, string> = {
  articles: "this view searches articles by title or byline",
  people: "this view searches names and bylines",
};

/* a view with no icon of its own takes its layout's */
const LAYOUT_ICONS: Record<Shape["type"], LucideIcon> = {
  table: TableIcon,
  chart: ChartColumnIcon,
  pivot: Grid3x3Icon,
};

/* the name a page's open row had in links from before (see open-row.tsx) */
const LEGACY: Record<Source, string> = {
  articles: "article",
  people: "person",
};

/* the shell's Time filter starts from the view's range, and its search from
   what the view lists, so the view is kept here, over the shell */
export function ExplorerPage({
  source,
  table,
}: {
  source: Source;
  table: ComponentType<TableViewProps>;
}) {
  const [state, setState] = useInAddress(
    (search) => readView(search, source),
    (value, params) => writeView(value, params, source),
  );
  const shape = shapeOf(state, source);
  return (
    <ArchiveShell
      searching={searchingOf(shape, source)}
      opening={openingOf(state, source)}
      period={periodOfShape(shape)}
    >
      {(props) => (
        <Explorer
          {...props}
          source={source}
          state={state}
          setState={setState}
          table={table}
        />
      )}
    </ArchiveShell>
  );
}

function Explorer({
  source,
  state,
  setState,
  table: Table,
  ...props
}: ViewProps & {
  source: Source;
  state: ViewState;
  setState: (state: ViewState) => void;
  table: ComponentType<TableViewProps>;
}) {
  const { filterState, setFilterState } = props;
  const phone = useIsPhone();
  const shape = shapeOf(state, source);
  const label = state.view === CUSTOM ? "Custom" : viewOf(state, source).label;
  const [customizing, setCustomizing] = useState(false);
  /* the Columns menu's choices, for the table on screen alone */
  const [picked, setPicked] = useState<VisibilityState>({});
  const off = Object.keys(picked).filter((id) => picked[id] === false);

  /* a table opens a row beside it, and a chart or a pivot a slice */
  const row = useOpenRow("open", LEGACY[source]);
  const slice = useOpenRow("slice");
  const panel = shape.type === "table" ? row : slice;
  /* one side panel at a time: a row or a list opened over Customize gives it
     back on closing, which takes focus as Customize does when its button
     opens it */
  const customizeButton = useRef<HTMLButtonElement>(null);
  const reopen = useRef(false);
  const panelOpen = panel.open !== null;
  useEffect(() => {
    if (panelOpen || !reopen.current) return;
    reopen.current = false;
    customizeButton.current?.focus({ preventScroll: true });
    setCustomizing(true);
  }, [panelOpen]);
  const opened: OpenRow = {
    ...panel,
    show: (key) => {
      if (customizing) reopen.current = true;
      setCustomizing(false);
      panel.show(key);
    },
  };
  const customize = (open: boolean) => {
    reopen.current = false;
    if (open) panel.close();
    setCustomizing(open);
  };

  /* a view brings its own filters (`carryOver`) */
  const choose = (id: string) => {
    if (id === state.view) return;
    /* another view's rows and marks are other things, whatever their keys */
    row.close();
    slice.close();
    const next = chooseView(state, id, source);
    setState(next);
    setPicked({});
    setFilterState(
      searchOn(
        carryOver(
          filterState,
          openingOf(state, source),
          openingOf(next, source),
        ),
        shapeOf(next, source),
      ),
    );
  };
  /* a search is of names on People's table and of what articles print on a
     chart: one the next view would read another way is cleared, and said */
  const searchOn = (filters: FilterState, to: Shape): FilterState => {
    const term = filters.search.trim();
    const searching = searchingOf(to, source);
    if (!term || searching === searchingOf(shape, source)) return filters;
    toast(`Cleared the search for “${term}”: ${SEARCHED_FOR[searching]}`);
    return { ...filters, search: "" };
  };
  const change = (next: Shape) => {
    /* a slice is a chart's, and a row a table's */
    if (next.type !== shape.type) {
      row.close();
      slice.close();
    }
    setState(changeView(state, next, source));
    const filters = searchOn(filterState, next);
    if (filters !== filterState) setFilterState(filters);
  };
  const reset = () => {
    const next = resetView(state, source);
    setState(next);
    const filters = searchOn(filterState, shapeOf(next, source));
    if (filters !== filterState) setFilterState(filters);
  };

  const tabs = [
    ...viewsOn(source).map((view) => ({
      id: view.id,
      label: view.label,
      icon: ICONS[view.id] ?? LAYOUT_ICONS[view.layout.type],
    })),
    { id: CUSTOM, label: "Custom", icon: ICONS[CUSTOM]! },
  ];
  const panelId = useId();
  const heading = headingOf(state, source);

  const builder = (
    <div className="space-y-6">
      <ViewBuilder
        source={source}
        shape={shape}
        sort={state.sort}
        onChange={change}
        onSort={(sort) => setState({ ...state, sort })}
      />
      {/* a default view is a declaration in views.ts: this writes the one on screen */}
      <CopyTextButton
        text={() => {
          const { view, left } = declarationOf(
            state,
            filterState,
            source,
            shape.type === "table" ? off : [],
          );
          return viewSource(view, left);
        }}
        label="Copy as view"
        what="this view, as a declaration for views.ts"
        icon={CodeIcon}
        failed="The browser didn't allow it; try again."
      />
    </div>
  );
  const copyLink = (iconOnly: boolean) => (
    /* the address holds the whole view, which a button says out loud */
    <CopyTextButton
      text={() => window.location.href}
      label="Copy link"
      what="the link to this view"
      icon={LinkIcon}
      failed="Copy it from the address bar."
      iconOnly={iconOnly}
    />
  );

  return (
    <div className="space-y-4">
      {/* in the title row, beside a table's Download CSV */}
      <PageActions>
        <span className="contents max-md:hidden">{copyLink(false)}</span>
      </PageActions>
      {phone && <SearchRowEnd>{copyLink(true)}</SearchRowEnd>}
      {!phone && (
        <ToolbarEnd>
          <Button
            ref={customizeButton}
            variant="outline"
            aria-expanded={customizing}
            className={cn("bg-background", customizing && "bg-muted")}
            onClick={() => customize(!customizing)}
          >
            Customize
          </Button>
        </ToolbarEnd>
      )}
      {!phone && customizing && (
        <SidePanel
          title="Customize"
          back={label}
          onClose={() => setCustomizing(false)}
          actions={
            <Button
              variant="ghost"
              disabled={state.view !== CUSTOM}
              onClick={(event) => {
                /* Reset turns itself off, which would drop focus to the page */
                event.currentTarget
                  .closest("aside")
                  ?.querySelector<HTMLElement>("h2")
                  ?.focus();
                reset();
              }}
            >
              Reset
            </Button>
          }
        >
          {builder}
        </SidePanel>
      )}
      {phone && (
        <SheetGroup onReset={state.view === CUSTOM ? reset : undefined}>
          <PanelGroup label="View">{builder}</PanelGroup>
        </SheetGroup>
      )}

      {/* which view outranks how it is cut, so the views come first */}
      <AboveToolbar>
        <ViewTabs
          tabs={tabs}
          view={state.view}
          panelId={panelId}
          onChoose={choose}
          onClickCustom={() => !phone && customize(true)}
        />
      </AboveToolbar>

      <div
        id={panelId}
        role="tabpanel"
        aria-label={label}
        className="space-y-3"
      >
        {shape.type === "table" ? (
          <>
            <Table
              {...props}
              heading={{
                title:
                  heading.title ??
                  (source === "articles"
                    ? "Articles"
                    : shape.only === "new"
                      ? "New people"
                      : "People"),
                question: heading.question,
              }}
              columns={shape.columns}
              only={shape.only}
              sorting={[state.sort]}
              setSorting={([sort]) => {
                if (sort) setState({ ...state, sort: sort as TableSort });
              }}
              opened={opened}
              minimum={state.minimum}
              setMinimum={(minimum) => setState({ ...state, minimum })}
              picked={picked}
              setPicked={setPicked}
            />
          </>
        ) : shape.type === "chart" ? (
          <ChartView
            {...props}
            config={shape.chart}
            heading={heading}
            hidden={state.hidden}
            setHidden={(hidden) => setState({ ...state, hidden })}
            opened={opened}
            back={label}
          />
        ) : (
          <PivotView
            {...props}
            config={shape.pivot}
            heading={heading}
            opened={opened}
            back={label}
          />
        )}
      </div>
    </div>
  );
}
