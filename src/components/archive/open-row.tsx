/*
  The row whose details are open beside a table: a person, an article.

  A table's columns must not depend on which row is open. A cell drawn from
  new columns is a new button, so the one that opened the panel is gone by
  the time the panel closes and focus has nowhere to go back to. The name in
  each row reads the open row from here instead.

  The address holds it (`?person=`), so a reload keeps it open. On a phone
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
import { cn } from "~/lib/utils";

type OpenRow = {
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

/** which row is open, kept in the address under `param`; drawn once hydrated */
export function useOpenRow(param: string): OpenRow {
  const phone = useIsPhone();
  const [open, setOpen] = useState<string | null>(() => read(param));
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
