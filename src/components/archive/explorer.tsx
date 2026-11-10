import { QueryClientProvider } from "@tanstack/react-query";
import type { SortingState, VisibilityState } from "@tanstack/react-table";
import {
  ActivityIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ChartColumnIcon,
  ChartPieIcon,
  ChevronDownIcon,
  CopyIcon,
  Grid3x3Icon,
  HistoryIcon,
  LinkIcon,
  MessageSquareTextIcon,
  NewspaperIcon,
  PencilIcon,
  SproutIcon,
  TableIcon,
  Trash2Icon,
  TrophyIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { CopyTextButton } from "~/components/copy-button";
import { PageActions } from "~/components/page-actions";
import { PanelGroup, SidePanel, useIsPhone } from "~/components/panel";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { queryClient } from "~/lib/query-client";
import { cn } from "~/lib/utils";
import {
  AboveToolbar,
  ArchiveShell,
  SearchRowEnd,
  SheetGroup,
  ToolbarEnd,
  useViewEdits,
  type ViewProps,
} from "./archive-shell";
import { ChartView } from "./charts";
import { EDITED, SAVE } from "./edited";
import type { FilterState, Searching } from "./filters";
import { useOpenRow, type OpenRow } from "./open-row";
import { useInAddress } from "./page-state";
import { PivotView } from "./pivot-view";
import { usePageViews, type PageViews, type Saved } from "./saved-views";
import { Confirm, newViewId, useViewWriter, ViewForm } from "./view-actions";
import { ViewBuilder } from "./view-builder";
import {
  changeView,
  declarationOf,
  differences,
  headingOf,
  NEW,
  openingOf,
  openingState,
  periodOfShape,
  readView,
  resetView,
  savedOf,
  searchingOf,
  withColumn,
  writeView,
  type Shape,
  type ViewState,
} from "./view-state";
import { ViewTabs } from "./view-tabs";
import {
  createIntent,
  deleteIntent,
  reorderIntent,
  saveIntent,
} from "./view-writes";
import type { ColumnId, Minimum, Source, TableSort, View } from "./views";

/*
  A table's page: its views as tabs over the filters, the one on screen
  drawn as a table, a chart or a pivot, and the builder that changes it.
  The views are the board's, kept in the Sheet (ADR 0015): any change to
  the one on screen makes it edited, which Reset takes back and Save for
  everyone keeps. Every page is the same frame; a page brings only its
  table (ADR 0014).
*/

/** what a page's table is handed: the view's columns and sort, and its open row */
export type TableViewProps = ViewProps & {
  /** its title and question, over the count */
  heading: { title: string; question: string | null };
  columns: readonly ColumnId[];
  /** the columns differ from the view's as saved */
  columnsEdited: boolean;
  /** People's rows narrowed to whoever is new in the range */
  only?: "new";
  sorting: SortingState;
  setSorting: (sorting: SortingState) => void;
  /** the row open beside the table, kept in the address as `?open=` */
  opened: OpenRow;
  /** People's Show, which the view opens on */
  minimum: Minimum;
  setMinimum: (minimum: Minimum) => void;
  /** Show differs from the view's as saved */
  minimumEdited: boolean;
  /** what the Columns menu has chosen: a column taken out leaves the view's
      columns, and one a narrow table hides is shown anyway */
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

const PAGE_NAMES: Record<Source, string> = {
  articles: "Articles",
  people: "People",
};

/* the name a page's open row had in links from before (see open-row.tsx) */
const LEGACY: Record<Source, string> = {
  articles: "article",
  people: "person",
};

const UNDO_MS = 8000;

export function ExplorerPage({
  source,
  table,
}: {
  source: Source;
  table: ComponentType<TableViewProps>;
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <Views source={source} table={table} />
    </QueryClientProvider>
  );
}

/* the page's views come with the Sheet; until it is read the shell says
   it is opening, or why it cannot */
function Views({
  source,
  table,
}: {
  source: Source;
  table: ComponentType<TableViewProps>;
}) {
  const page = usePageViews(source);
  if (!page) return <ArchiveShell>{() => null}</ArchiveShell>;
  return <Page source={source} table={table} page={page} />;
}

/* the shell's Time filter starts from the view's range, and its search from
   what the view lists, so the view is kept here, over the shell */
function Page({
  source,
  table,
  page,
}: {
  source: Source;
  table: ComponentType<TableViewProps>;
  page: PageViews;
}) {
  const views = page.views.map((saved) => saved.view);
  /* a link to a view the page no longer has opens its first as saved: what
     it changed was another view's, so the address is cleared before the
     filters read it */
  const [opened] = useState(() => {
    const read = readView(window.location.search, views, source);
    if (read.missing !== null)
      window.history.replaceState(
        window.history.state,
        "",
        window.location.pathname,
      );
    return read;
  });
  const [state, setState] = useInAddress(
    () => opened.state,
    (value, params) => writeView(value, params, views),
  );
  const saved = savedOf(views, state.view);
  return (
    <ArchiveShell
      peopleSearch={source === "people" && state.shape.type !== "table"}
      searching={searchingOf(state.shape, source)}
      opening={openingOf(saved)}
      period={periodOfShape(state.shape)}
    >
      {(props) => (
        <Explorer
          {...props}
          source={source}
          page={page}
          views={views}
          state={state}
          setState={setState}
          missing={opened.missing}
          table={table}
        />
      )}
    </ArchiveShell>
  );
}

/** what Undo puts back: a view's edits, on screen as they were */
type Edits = { state: ViewState; filters: FilterState; basedOn: string };

function Explorer({
  source,
  page,
  views,
  state,
  setState,
  missing: linkMissing,
  table: Table,
  ...props
}: ViewProps & {
  source: Source;
  page: PageViews;
  views: View[];
  state: ViewState;
  setState: (state: ViewState) => void;
  /** a view a link named that the page no longer has */
  missing: string | null;
  table: ComponentType<TableViewProps>;
}) {
  const { filterState, setFilterState } = props;
  const phone = useIsPhone();
  const shape = state.shape;
  const saved = savedOf(views, state.view);
  const savedRow = (id: string): Saved | undefined =>
    page.views.find((each) => each.view.id === id);
  const label = saved.label;
  const opening = openingState(saved, views);
  const changes = differences(state, filterState, views);
  const edited = state.view === NEW || changes.length > 0;
  const customized = changes.some((d) =>
    ["layout", "sort", "minimum"].includes(d),
  );
  const canSave = page.status !== "unsaved";
  const why = page.status === "unsaved" ? page.reason : undefined;

  const [customizing, setCustomizing] = useState(false);
  const [missing, setMissing] = useState(linkMissing);
  /* the Columns menu's own choices: a column a narrow table hides, shown */
  const [shownAnyway, setShownAnyway] = useState<VisibilityState>({});
  /* the view's `updated at` when it was opened, which a save is based on,
     so a save over someone else's since is a conflict, not a quiet loss */
  const [basedOn, setBasedOn] = useState(
    () => savedRow(state.view)?.updatedAt ?? "",
  );
  const writer = useViewWriter(source, page);
  const [form, setForm] = useState<ReactNode>(null);

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
  const openedRow: OpenRow = {
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

  /* what is on screen now, for an Undo to put back */
  const current = (): Edits => ({ state, filters: filterState, basedOn });
  const restore = (edits: Edits) => {
    row.close();
    slice.close();
    setState(edits.state);
    setFilterState(edits.filters);
    setBasedOn(edits.basedOn);
    setShownAnyway({});
  };
  /* a view opened as saved; from the last read of the Sheet when a write
     has just changed it */
  const show = (id: string, copy: readonly Saved[] = page.views) => {
    const fresh = copy.map((each) => each.view);
    const view = savedOf(fresh, id);
    row.close();
    slice.close();
    setState(openingState(view, fresh));
    setFilterState(openingOf(view));
    setShownAnyway({});
    setBasedOn(copy.find((each) => each.view.id === view.id)?.updatedAt ?? "");
    setMissing(null);
  };
  const latest = () => writer.latest().views;
  /* the `updated at` the last read gives a view, after a write to it */
  const savedRowIn = (id: string) =>
    latest().find((each) => each.view.id === id)?.updatedAt ?? "";
  /* edits belong to their view: leaving it drops them, and says so */
  const leave = (then: () => void) => {
    const before = current();
    const was = edited ? label : null;
    then();
    if (was === null) return;
    const id = toast(
      state.view === NEW
        ? "New view discarded"
        : `Unsaved changes to ${was} discarded`,
      {
        duration: UNDO_MS,
        action: {
          label: "Undo",
          onClick: () => {
            toast.dismiss(id);
            restore(before);
          },
        },
      },
    );
  };
  const choose = (id: string) => {
    if (id === state.view) return;
    leave(() => show(id));
  };
  const reset = () => {
    row.close();
    slice.close();
    setState(resetView(state, views));
    setFilterState(openingOf(saved));
    setShownAnyway({});
  };
  useViewEdits(changes.length + (state.view === NEW ? 1 : 0), reset);

  /* a search is of names on People's table and of what articles print on a
     chart: one the next layout would read another way is cleared, and said */
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
    setState(changeView(state, next));
    const filters = searchOn(filterState, next);
    if (filters !== filterState) setFilterState(filters);
  };
  const pickColumns = (after: VisibilityState) => {
    const off = Object.keys(after).filter(
      (id) => after[id] === false && !shownAnyway[id],
    );
    if (shape.type === "table" && off.length > 0)
      change({
        ...shape,
        columns: off.reduce(
          (columns, id) => withColumn(columns, id as ColumnId, false),
          shape.columns,
        ),
      });
    setShownAnyway(
      Object.fromEntries(Object.entries(after).filter(([, on]) => on)),
    );
  };

  /* ---- saving ---------------------------------------------------------- */

  const ids = views.map((view) => view.id);
  const saveAsNew = (name: string, question = "") => {
    const { view, left } = declarationOf(state, filterState, views);
    const made = {
      ...view,
      id: newViewId(ids),
      label: name,
      title: name,
      question,
    } as View;
    void writer.write(() => createIntent(made), {
      done: kept(`Saved “${name}” for everyone`, left),
      then: (outcome) => {
        if (outcome.status !== "saved") return;
        /* what was on screen is the new view now, and nothing is lost */
        setState({ ...state, view: made.id });
        setBasedOn(savedRowIn(made.id));
        setMissing(null);
      },
    });
  };

  const save = () => {
    if (state.view === NEW)
      return setForm(
        <ViewForm
          title="Save the new view for everyone"
          fields={[
            { name: "label", label: "Name", value: "New view", required: true },
            {
              name: "question",
              label: "What it answers",
              value: "",
              long: true,
            },
          ]}
          submit="Save for everyone"
          onClose={() => setForm(null)}
          onSubmit={({ label, question }) => {
            setForm(null);
            saveAsNew(label!, question);
          }}
        />,
      );
    const { view, left } = declarationOf(state, filterState, views);
    void writer.write(
      (overwrite) => saveIntent(view, overwrite ? null : basedOn),
      {
        done: kept(`Saved ${label} for everyone`, left),
        then: (outcome) => {
          if (outcome.status === "saved" || outcome.status === "unconfirmed")
            setBasedOn(savedRowIn(view.id) || basedOn);
        },
        /* theirs, as saved; Undo puts these edits back over it */
        reloaded: () => leave(() => show(state.view, latest())),
      },
    );
  };
  const askSaveAsNew = () =>
    setForm(
      <ViewForm
        title="Save as a new view"
        description={`A new tab for everyone, as this is on screen. ${label} stays as it was saved.`}
        fields={[
          {
            name: "label",
            label: "Name",
            value: `${label} copy`,
            required: true,
          },
          { name: "question", label: "What it answers", value: "", long: true },
        ]}
        submit="Save as new view"
        onClose={() => setForm(null)}
        onSubmit={({ label, question }) => {
          setForm(null);
          saveAsNew(label!, question);
        }}
      />,
    );

  /* ---- the tab's menu: changes to the view as saved, not to its edits -- */

  const at = ids.indexOf(state.view);
  const words = (patch: Partial<View>, done: string) =>
    void writer.write(
      (overwrite) =>
        saveIntent(
          { ...saved, ...patch } as View,
          overwrite ? null : basedOn,
          "view-rename",
        ),
      {
        done,
        then: () => setBasedOn(savedRowIn(saved.id) || basedOn),
      },
    );
  const rename = () =>
    setForm(
      <ViewForm
        title={`Rename ${label}`}
        fields={[
          { name: "label", label: "Name", value: label, required: true },
        ]}
        submit="Rename"
        onClose={() => setForm(null)}
        onSubmit={({ label: name }) => {
          setForm(null);
          words({ label: name! }, `Renamed to ${name}`);
        }}
      />,
    );
  const editQuestion = () =>
    setForm(
      <ViewForm
        title={`What ${label} answers`}
        fields={[
          { name: "title", label: "Title", value: saved.title, required: true },
          {
            name: "question",
            label: "Question",
            value: saved.question,
            long: true,
          },
        ]}
        submit="Save"
        onClose={() => setForm(null)}
        onSubmit={({ title, question }) => {
          setForm(null);
          words(
            { title: title!, question: question! },
            `Saved what ${label} answers`,
          );
        }}
      />,
    );
  const duplicate = () => {
    const copy = {
      ...saved,
      id: newViewId(ids),
      label: `${label} copy`,
    } as View;
    void writer.write(() => createIntent(copy), {
      done: `Duplicated as ${copy.label}`,
      then: (outcome) => {
        if (outcome.status === "saved") leave(() => show(copy.id, latest()));
      },
    });
  };
  const move = (step: -1 | 1) => {
    const order = [...ids];
    const to = at + step;
    [order[at], order[to]] = [order[to]!, order[at]!];
    void writer.write(() => reorderIntent(order), {
      done: `Moved ${label} ${step < 0 ? "left" : "right"}`,
      undo: () =>
        void writer.write(() => reorderIntent(ids), { done: "Moved back" }),
    });
  };
  const remove = () =>
    setForm(
      <Confirm
        title={`Delete ${label} for everyone?`}
        description="It goes from this page for the whole board. You can undo it from the message that follows, while it shows."
        confirm="Delete"
        onClose={() => setForm(null)}
        onConfirm={() => {
          setForm(null);
          const gone = savedRow(saved.id)!;
          const position = gone.position;
          void writer.write(
            (overwrite) => deleteIntent(saved.id, overwrite ? null : basedOn),
            {
              done: `Deleted ${label}`,
              undo: () =>
                void writer.write(() => createIntent(gone.view, position), {
                  done: `${label} is back`,
                }),
              then: (outcome) => {
                if (outcome.status === "saved")
                  show(latest()[0]!.view.id, latest());
              },
            },
          );
        }}
      />,
    );

  const tabs = [
    ...views.map((view) => ({
      id: view.id,
      label: view.label,
      icon: ICONS[view.id] ?? LAYOUT_ICONS[view.layout.type],
    })),
    ...(state.view === NEW
      ? [{ id: NEW, label: saved.label, icon: LAYOUT_ICONS[shape.type] }]
      : []),
  ];
  const off = (reason?: string) =>
    reason ? { disabled: true, title: reason } : {};
  const writing = writer.busy ? "Saving…" : undefined;
  const menu = state.view !== NEW && (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`${label}'s menu`}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 my-auto flex size-7 items-center justify-center rounded-md outline-none focus-visible:ring-3"
      >
        <ChevronDownIcon className="size-4" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onClick={rename} {...off(why ?? writing)}>
          <PencilIcon aria-hidden />
          Rename
        </DropdownMenuItem>
        <DropdownMenuItem onClick={editQuestion} {...off(why ?? writing)}>
          <MessageSquareTextIcon aria-hidden />
          Edit question
        </DropdownMenuItem>
        <DropdownMenuItem onClick={duplicate} {...off(why ?? writing)}>
          <CopyIcon aria-hidden />
          Duplicate
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => move(-1)}
          {...off(why ?? writing ?? (at <= 0 ? "It is first" : undefined))}
        >
          <ArrowLeftIcon aria-hidden />
          Move left
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => move(1)}
          {...off(
            why ?? writing ?? (at >= ids.length - 1 ? "It is last" : undefined),
          )}
        >
          <ArrowRightIcon aria-hidden />
          Move right
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() =>
            void navigator.clipboard.writeText(window.location.href).then(
              () => toast.success("Copied the link to this view"),
              () =>
                toast.error(
                  "The browser didn't allow it; copy it from the address bar.",
                ),
            )
          }
        >
          <LinkIcon aria-hidden />
          Copy link
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          onClick={remove}
          {...off(
            why ??
              writing ??
              (views.length === 1
                ? "A page keeps one view at least"
                : undefined),
          )}
        >
          <Trash2Icon aria-hidden />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const panelId = useId();
  const heading = headingOf(state, views);

  const builder = (
    <ViewBuilder
      source={source}
      shape={shape}
      sort={state.sort}
      saved={{ view: saved, shape: opening.shape, sort: opening.sort }}
      views={views}
      onChange={change}
      onSort={(sort) => setState({ ...state, sort })}
    />
  );
  const copyLink = (iconOnly: boolean) => (
    /* the address holds the whole view, edits and all, which a button says
       out loud */
    <CopyTextButton
      text={() => window.location.href}
      label="Copy link"
      what={
        edited
          ? "the link to this view, with its changes"
          : "the link to this view"
      }
      icon={LinkIcon}
      failed="Copy it from the address bar."
      iconOnly={iconOnly}
    />
  );
  const actions = edited && (
    <div className="flex shrink-0 items-center gap-1.5 pb-1 pl-2">
      <Button
        variant="ghost"
        size={phone ? "sm" : "default"}
        className="text-edited hover:text-edited"
        title={`Back to ${label} as saved`}
        onClick={reset}
        disabled={state.view !== NEW && changes.length === 0}
      >
        Reset
      </Button>
      <span className="flex">
        <Button
          size={phone ? "sm" : "default"}
          className={cn(SAVE, state.view !== NEW && "rounded-r-none")}
          disabled={!canSave || writer.busy}
          title={why}
          onClick={save}
        >
          {writer.busy ? "Saving…" : phone ? "Save" : "Save for everyone"}
        </Button>
        {state.view !== NEW && (
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="More ways to save"
              disabled={!canSave || writer.busy}
              render={
                <Button
                  size={phone ? "icon-sm" : "icon"}
                  className={cn(
                    SAVE,
                    "border-edited-solid-foreground/25 rounded-l-none border-l",
                  )}
                />
              }
            >
              <ChevronDownIcon aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={askSaveAsNew}>
                Save as new view…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </span>
    </div>
  );

  return (
    <div className="space-y-4">
      {writer.dialog}
      {form}
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
            aria-description={
              customized ? "changed from the saved view" : undefined
            }
            className={cn(
              "bg-background",
              customizing && "bg-muted",
              customized && EDITED,
            )}
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
        >
          {builder}
        </SidePanel>
      )}
      {phone && (
        <SheetGroup>
          <PanelGroup label="View">{builder}</PanelGroup>
        </SheetGroup>
      )}

      {/* which view outranks how it is cut, so the views come first */}
      <AboveToolbar>
        <div className="space-y-2">
          {missing !== null && (
            <p className="text-muted-foreground flex items-start gap-2 border-l-2 border-amber-500/60 pl-3 text-sm">
              <span className="flex-1">
                The link was to a view, “{missing}”, that {PAGE_NAMES[source]}{" "}
                no longer has, so this is {views[0]!.label} as saved.
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Dismiss"
                onClick={() => setMissing(null)}
              >
                <XIcon />
              </Button>
            </p>
          )}
          {page.status === "unsaved" && (
            <p className="text-muted-foreground border-l-2 border-amber-500/60 pl-3 text-sm">
              {page.reason}
            </p>
          )}
          <div className="flex items-end">
            <div className="min-w-0 flex-1">
              <ViewTabs
                tabs={tabs}
                view={state.view}
                edited={edited}
                menu={menu}
                panelId={panelId}
                onChoose={choose}
                onNew={() =>
                  leave(() => {
                    show(NEW);
                    if (!phone) customize(true);
                  })
                }
              />
            </div>
            {actions}
          </div>
        </div>
      </AboveToolbar>

      <div
        id={panelId}
        role="tabpanel"
        aria-label={label}
        className="space-y-3"
      >
        {shape.type === "table" ? (
          <Table
            {...props}
            heading={heading}
            columns={shape.columns}
            columnsEdited={
              opening.shape.type === "table" &&
              opening.shape.columns.join() !== shape.columns.join()
            }
            only={shape.only}
            sorting={[state.sort]}
            setSorting={([sort]) => {
              if (sort) setState({ ...state, sort: sort as TableSort });
            }}
            opened={openedRow}
            minimum={state.minimum}
            setMinimum={(minimum) => setState({ ...state, minimum })}
            minimumEdited={changes.includes("minimum")}
            picked={shownAnyway}
            setPicked={pickColumns}
          />
        ) : shape.type === "chart" ? (
          <ChartView
            {...props}
            config={shape.chart}
            heading={heading}
            hidden={state.hidden}
            setHidden={(hidden) => setState({ ...state, hidden })}
            opened={openedRow}
            back={label}
          />
        ) : (
          <PivotView
            {...props}
            config={shape.pivot}
            heading={heading}
            opened={openedRow}
            back={label}
          />
        )}
      </div>
    </div>
  );
}

/* a save's toast, with what a view cannot hold and so stays an edit */
const kept = (done: string, left: readonly string[]) =>
  left.length > 0 ? `${done}. Not kept: ${left.join("; ")}.` : done;
