/*
  The row whose details are open beside a table: a person, an article.

  A table's columns must not depend on which row is open. A cell drawn from
  new columns is a new button, so the one that opened the panel is gone by
  the time the panel closes and focus has nowhere to go back to. The name in
  each row reads the open row from here instead.

  The address holds it as `?open=`, so a reload keeps it open: a person's
  name on People, a post id on Articles. `?people=` is a filter, and a name
  there counts that person alone; `?open=` only opens their panel. On a phone
  the details are a page of their own: opening one is a step in the history,
  so the system Back gesture returns to the list, and the list behind is
  inert while it is covered.
*/

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useIsPhone } from "~/components/panel";
import { holdInPlace } from "~/lib/page-scroll";
import { cn } from "~/lib/utils";
import { writeState, type FilterState, type Searching } from "./filters";

export type OpenRow = {
  open: string | null;
  show: (key: string) => void;
  close: () => void;
};

const Context = createContext<OpenRow>({
  open: null,
  show: () => {},
  close: () => {},
});

const read = (param: string) =>
  new URLSearchParams(window.location.search).get(param);

function address(param: string, key: string | null): URL {
  const url = new URL(window.location.href);
  if (key === null) url.searchParams.delete(param);
  else url.searchParams.set(param, key);
  return url;
}

/** the filters on screen, which a link to another archive page takes along */
export type Trail = { state: FilterState; searching: Searching };

/* what each page's search looks at as a link lands on it */
const SEARCHED: Record<"articles" | "people" | "problems", Searching> = {
  articles: "articles",
  people: "people",
  problems: "articles",
};

/**
 * A link to an archive page on this one's filters. It names the range
 * whatever it is, since each page opens on its own; and it keeps a search
 * only where it looks at the same thing, as a title searched for on
 * Articles is not a name on People.
 */
export function archiveHref(
  page: keyof typeof SEARCHED,
  { state, searching }: Trail,
  open?: string,
): string {
  const params = new URLSearchParams();
  writeState(
    searching === SEARCHED[page] ? state : { ...state, search: "" },
    params,
    null,
  );
  if (open !== undefined) params.set("open", open);
  return `/${page}?${params}`;
}

/** where an article's panel opens, from any page */
export const articleHref = (postId: number, trail: Trail) =>
  archiveHref("articles", trail, String(postId));

/** where a person's panel opens, from any page */
export const personHref = (name: string, trail: Trail) =>
  archiveHref("people", trail, name);

/**
 * Which row is open, kept in the address as `?open=`; drawn once hydrated.
 * `legacy` is the name a page's links used before (`person`, `article`),
 * which still opens the row, and is renamed in the address.
 */
export function useOpenRow(param: string, legacy?: string): OpenRow {
  const phone = useIsPhone();
  const [open, setOpen] = useState<string | null>(
    () => read(param) ?? (legacy ? read(legacy) : null),
  );
  useEffect(() => {
    if (!legacy || read(legacy) === null) return;
    const url = address(param, read(param) ?? read(legacy));
    url.searchParams.delete(legacy);
    window.history.replaceState(window.history.state, "", url);
  }, [param, legacy]);
  /* whether this session pushed the entry we are on, which Back takes away */
  const onStep = useRef(false);

  useEffect(() => {
    /* ClientRouter fetches and swaps in the page for a Back to an entry with
       state, even to the same page with another query, which would close the
       panel by redrawing everything. It passes over an entry without state,
       so a panel's step and the entry under it have none, and the step is
       ours to follow */
    const traverse = (event: PopStateEvent) => {
      if (event.state !== null) return;
      const key = read(param);
      onStep.current = key !== null;
      setOpen(key);
    };
    window.addEventListener("popstate", traverse);
    return () => window.removeEventListener("popstate", traverse);
  }, [param]);

  return {
    open,
    show: (key) => {
      if (key === open) return;
      /* the page narrows beside the panel: what was clicked stays put */
      if (!phone && open === null) {
        const clicked = document.activeElement;
        holdInPlace(() =>
          clicked?.isConnected && clicked !== document.body
            ? clicked
            : document.querySelector(
                `[data-row-key="${CSS.escape(key)}"], [data-pivot="${CSS.escape(key)}"]`,
              ),
        );
      }
      const url = address(param, key);
      if (phone && open === null) {
        window.history.replaceState(null, "");
        window.history.pushState(null, "", url);
        onStep.current = true;
      } else window.history.replaceState(window.history.state, "", url);
      setOpen(key);
    },
    close: () => {
      if (open === null) return;
      if (onStep.current) return window.history.back();
      window.history.replaceState(
        window.history.state,
        "",
        address(param, null),
      );
      setOpen(null);
    },
  };
}

/** gives the rows of a table, and their details, the open row */
export function OpenRowProvider({
  value,
  children,
}: {
  value: OpenRow;
  children: ReactNode;
}) {
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/** the name in a row that opens its details */
export function RowOpener({
  rowKey,
  className,
  children,
}: {
  rowKey: string;
  className?: string;
  children: ReactNode;
}) {
  const { open, show } = useContext(Context);
  return (
    <button
      type="button"
      data-row-key={rowKey}
      className={cn("text-left underline-offset-4 hover:underline", className)}
      aria-current={open === rowKey ? "true" : undefined}
      onClick={() => show(rowKey)}
    >
      {children}
    </button>
  );
}

/**
 * Wraps the open row's panel. On a phone, where the panel covers the page,
 * the page behind is inert. This lets go of it before the panel inside gives
 * focus back to the row (a parent's cleanup runs before its children's), as
 * focus cannot land in an inert page.
 */
export function RowDetails({ children }: { children: ReactNode }) {
  const phone = useIsPhone();
  useLayoutEffect(() => {
    const content = document.getElementById("content");
    if (!phone || !content) return;
    content.inert = true;
    return () => {
      content.inert = false;
    };
  }, [phone]);
  return children;
}
