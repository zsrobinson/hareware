import { ChevronDownIcon, type LucideIcon } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { cn } from "~/lib/utils";

/*
  A page's views as one row of tabs, whatever the width: on a laptop the
  views that do not fit fold into "N more" at the end, before Custom, which
  is always shown; a touch screen swipes the row instead. The chosen view is
  always in the row, swapped in for the last that fits where it would be
  folded, so the row never wraps or moves the page under it, and a panel
  opening only folds more of it.
*/

export type Tab = { id: string; label: string; icon: LucideIcon };

/* the tabs' gap, gap-x-1 */
const GAP = 4;

/**
 * Which views a row of `room` shows, in order, and which fold into the
 * menu: as many as fit from the first, with the menu and the last tab
 * (Custom) beside them; the chosen one swapped in for those it needs room
 * from where it would be folded. `widths` are the views' and then the last
 * tab's, as drawn.
 */
export function foldTabs(
  widths: readonly number[],
  menu: number,
  room: number,
  chosen: number,
): { shown: number[]; folded: number[] } {
  const views = widths.length - 1;
  const all = [...Array(views).keys()];
  const total = widths.reduce((sum, w) => sum + w + GAP, -GAP);
  if (total <= room) return { shown: all, folded: [] };
  /* the views' share of the row, each with the gap after it */
  const free = room - widths[views]! - menu - GAP;
  const shown: number[] = [];
  let used = 0;
  for (const at of all) {
    if (used + widths[at]! + GAP > free) break;
    shown.push(at);
    used += widths[at]! + GAP;
  }
  if (chosen < views && !shown.includes(chosen)) {
    while (shown.length > 0 && used + widths[chosen]! + GAP > free)
      used -= widths[shown.pop()!]! + GAP;
    shown.push(chosen);
  }
  return { shown, folded: all.filter((at) => !shown.includes(at)) };
}

const tabClass = (selected: boolean, icons = true) =>
  cn(
    /* the chosen view is underlined, so a hovered tab never looks chosen */
    "focus-visible:ring-ring/50 flex h-10 shrink-0 items-center gap-1.5 rounded-t-md border-b-2 px-2.5 text-sm whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-inset @2xl:px-3 [&_svg]:size-4 [&_svg]:shrink-0",
    icons && "@max-2xl:[&_svg]:hidden",
    selected
      ? "border-foreground text-foreground font-medium"
      : "text-muted-foreground hover:text-foreground border-transparent",
  );

/* a touch screen swipes the row rather than folding it */
function useTouch() {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia("(pointer: coarse)");
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(pointer: coarse)").matches,
    () => false,
  );
}

export function ViewTabs({
  tabs,
  view,
  panelId,
  onChoose,
  onClickCustom,
}: {
  /** the views, then Custom last */
  tabs: Tab[];
  view: string;
  panelId: string;
  onChoose: (view: string) => void;
  /** a click on Custom opens the builder; arriving by arrow key does not,
      or the panel would take focus from the tabs */
  onClickCustom: () => void;
}) {
  const touch = useTouch();
  const box = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const ruler = useRef<HTMLDivElement>(null);
  const views = tabs.slice(0, -1);
  const custom = tabs.at(-1)!;
  const chosen = tabs.findIndex((tab) => tab.id === view);

  /* which views fold, measured from a hidden copy of the row */
  const [folded, setFolded] = useState<string[]>([]);
  const ids = tabs.map((tab) => tab.id).join();
  useLayoutEffect(() => {
    const container = box.current;
    const copy = ruler.current;
    if (touch || !container || !copy) {
      setFolded([]);
      return;
    }
    const measure = () => {
      /* not laid out (a test's document): nothing to fold for */
      if (container.clientWidth === 0) return setFolded([]);
      const widths = [...copy.children].map(
        (child) => (child as HTMLElement).offsetWidth,
      );
      const menu = widths.pop()!;
      const { folded } = foldTabs(widths, menu, container.clientWidth, chosen);
      const next = folded.map((at) => tabs[at]!.id);
      setFolded((now) => (now.join() === next.join() ? now : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tabs by their ids
  }, [touch, ids, chosen]);
  const shown = views.filter((tab) => !folded.includes(tab.id));
  const menu = views.filter((tab) => folded.includes(tab.id));

  /* a view chosen by key or from the menu is in the row once drawn, and
     takes focus there */
  const focusing = useRef<string | null>(null);
  useLayoutEffect(() => {
    const id = focusing.current;
    if (id === null) return;
    const tab = list.current?.querySelector<HTMLElement>(
      `[data-view="${CSS.escape(id)}"]`,
    );
    if (!tab) return;
    focusing.current = null;
    tab.focus();
  });
  const choose = (id: string) => {
    focusing.current = id;
    onChoose(id);
  };

  /* a phone swipes the views sideways, and a link may open on one past the
     edge, or a narrower window leave it there. Only the strip moves:
     scrollIntoView would also move where the page's first Tab starts from */
  useEffect(() => {
    const strip = list.current;
    if (!touch || !strip) return;
    const reveal = () => {
      const tab = strip.querySelector<HTMLElement>('[aria-selected="true"]');
      if (!tab) return;
      const left = tab.offsetLeft;
      const right = left + tab.offsetWidth;
      if (left < strip.scrollLeft) strip.scrollLeft = left;
      else if (right > strip.scrollLeft + strip.clientWidth)
        strip.scrollLeft = right - strip.clientWidth;
    };
    reveal();
    const observer = new ResizeObserver(reveal);
    observer.observe(strip);
    return () => observer.disconnect();
  }, [view, touch]);

  /* which ends have views scrolled past them, faded to say so */
  const [past, setPast] = useState({ start: false, end: false });
  useEffect(() => {
    const strip = list.current;
    if (!strip) return;
    const measure = () =>
      setPast({
        start: strip.scrollLeft > 1,
        end: strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 1,
      });
    measure();
    strip.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(strip);
    return () => {
      strip.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [ids, touch, folded]);
  const fade =
    past.start || past.end
      ? `linear-gradient(to right, ${past.start ? "transparent" : "#000"}, #000 8%, #000 92%, ${past.end ? "transparent" : "#000"})`
      : undefined;

  const tab = ({ id, label, icon: Icon }: Tab) => {
    const selected = view === id;
    return (
      <button
        key={id}
        type="button"
        role="tab"
        data-view={id}
        aria-selected={selected}
        aria-controls={panelId}
        tabIndex={selected ? 0 : -1}
        onClick={() => {
          onChoose(id);
          if (id === custom.id) onClickCustom();
        }}
        className={tabClass(selected)}
      >
        <Icon aria-hidden />
        {label}
      </button>
    );
  };

  return (
    /* a container, so the icons go before the labels are cut off */
    <div ref={box} className="@container relative">
      {/* the row drawn whole and unseen, for each tab's width */}
      <div
        ref={ruler}
        aria-hidden
        className="pointer-events-none invisible absolute flex h-0 gap-x-1 overflow-hidden"
      >
        {tabs.map(({ id, label, icon: Icon }) => (
          <span key={id} className={tabClass(true)}>
            <Icon />
            {label}
          </span>
        ))}
        <span className={tabClass(true, false)}>
          {views.length} more
          <ChevronDownIcon />
        </span>
      </div>
      <div
        ref={list}
        role="tablist"
        aria-label="Views"
        /* the rule under the row is a background, not a border: tabs
           pulled over a border made the strip scroll down by a pixel */
        className="relative flex [scrollbar-width:none] gap-x-1 overflow-x-auto overflow-y-hidden bg-[linear-gradient(to_top,var(--color-border)_1px,transparent_1px)]"
        style={{ maskImage: fade }}
        onKeyDown={(event) => {
          /* the tabs pattern: arrows move between every view, folded or
             not, Home and End to the first and last, and each chooses */
          if ((event.target as HTMLElement).getAttribute("role") !== "tab")
            return;
          const to =
            event.key === "ArrowRight"
              ? chosen + 1
              : event.key === "ArrowLeft"
                ? chosen - 1
                : event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? tabs.length - 1
                    : null;
          if (to === null) return;
          event.preventDefault();
          choose(tabs[(to + tabs.length) % tabs.length]!.id);
        }}
      >
        {shown.map(tab)}
        {menu.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger className={tabClass(false, false)}>
              {menu.length} more
              <ChevronDownIcon aria-hidden />
            </DropdownMenuTrigger>
            {/* the chosen view is in the row by the time the menu closes */}
            <DropdownMenuContent
              align="end"
              finalFocus={() =>
                list.current?.querySelector<HTMLElement>(
                  '[aria-selected="true"]',
                ) ?? true
              }
            >
              {menu.map(({ id, label, icon: Icon }) => (
                <DropdownMenuItem key={id} onClick={() => choose(id)}>
                  <Icon aria-hidden />
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {tab(custom)}
      </div>
    </div>
  );
}
