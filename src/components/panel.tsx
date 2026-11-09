/*
  The two non-modal panels the tools open: a side panel beside the content on a
  laptop (Customize, a person), which narrows the page rather than covering it
  and folds the sidebar to make room,
  and a bottom sheet on a phone that leaves the chart or table above it in view.
  Neither dims anything. Both take focus on opening and give it back to
  whatever opened them, and Escape closes either.
*/

import { ChevronLeftIcon, XIcon } from "lucide-react";
import {
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { Button } from "~/components/ui/button";
import { pageScroller } from "~/lib/page-scroll";
import { cn } from "~/lib/utils";

const PHONE = "(max-width: 767px)";

/** true below the layout's `md`, where the sidebar becomes a menu */
export function useIsPhone(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(PHONE);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia(PHONE).matches,
    () => false,
  );
}

/* the opener, remembered at the moment of opening, gets focus back on close;
   Escape closes; the heading takes focus so a screen reader starts there */
function useFocusLoop(
  onClose: () => void,
  restoreFocus?: () => HTMLElement | null,
) {
  const heading = useRef<HTMLHeadingElement>(null);
  const close = useRef(onClose);
  const restore = useRef(restoreFocus);
  useLayoutEffect(() => {
    close.current = onClose;
    restore.current = restoreFocus;
  });

  useLayoutEffect(() => {
    /* body when the opener was redrawn by the same click that opened this */
    const active = document.activeElement;
    const opener =
      active instanceof HTMLElement && active !== document.body ? active : null;
    heading.current?.focus({ preventScroll: true });

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) close.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (opener?.isConnected) {
        opener.focus({ preventScroll: true });
        return;
      }
      /* closing may redraw the opener again, in this commit or a frame
         later, so its replacement is asked for after each, for as long as
         focus is left on nothing */
      const replacement = restore.current;
      if (!replacement) return;
      let frames = 0;
      const settle = () => {
        const now = document.activeElement;
        if (now && now !== document.body) return;
        replacement()?.focus({ preventScroll: true });
        if (++frames < 3) requestAnimationFrame(settle);
      };
      queueMicrotask(settle);
    };
  }, []);

  return heading;
}

/* below this a panel beside the page would squeeze it into another layout,
   so the sidebar folds to its icons while one is open */
const ROOMY = "(min-width: 1600px)";

/**
 * Folds the sidebar to its icons while a side panel is open on a laptop
 * narrower than `ROOMY`, and unfolds it on closing, unless it was folded
 * already or someone has used its toggle since. The cookie is left alone:
 * it is the sidebar as someone chose it.
 */
function useFoldedSidebar() {
  useLayoutEffect(() => {
    const shell = document.getElementById("shell");
    if (
      !shell ||
      shell.dataset.state !== "expanded" ||
      window.matchMedia(PHONE).matches ||
      window.matchMedia(ROOMY).matches
    )
      return;
    shell.dataset.state = "collapsed";
    /* the layout's toggle takes this away, and with it the unfolding */
    shell.dataset.folded = "panel";
    return () => {
      if (shell.dataset.folded !== "panel") return;
      delete shell.dataset.folded;
      shell.dataset.state = "expanded";
    };
  }, []);
}

/** whether a table beside a side panel keeps all its columns: past the
    width where the folded sidebar leaves it its usual room */
export function useRoomBesidePanel(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(WIDE);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia(WIDE).matches,
    () => false,
  );
}
const WIDE = "(min-width: 1280px)";

/* the layout's slot beside <main>; null on a page without the layout. It is
   static html, so it never changes under a mounted island */
const noSubscription = () => () => {};
export function useSlot(id: string): HTMLElement | null {
  return useSyncExternalStore(
    noSubscription,
    () => document.getElementById(id),
    () => null,
  );
}

/**
 * A panel at the right of the content on a laptop. On a phone it becomes a
 * page of its own over the content, with a back link named by `back`.
 * Render it only while open.
 */
export function SidePanel({
  title,
  onClose,
  actions,
  back,
  restoreFocus,
  children,
}: {
  title: ReactNode;
  onClose: () => void;
  /** beside the title, before the close button (Reset, …) */
  actions?: ReactNode;
  /** the phone's back link, e.g. "All people" */
  back: string;
  /** where focus goes on closing if the opener is gone from the page, as
      when its row was redrawn: the opener's replacement */
  restoreFocus?: () => HTMLElement | null;
  children: ReactNode;
}) {
  const slot = useSlot("side-panel");
  const heading = useFocusLoop(onClose, restoreFocus);
  useFoldedSidebar();

  const panel = (
    <aside
      aria-label={typeof title === "string" ? title : undefined}
      className={cn(
        "bg-background flex flex-col gap-5 overflow-y-auto p-6",
        /* a phone: a page of its own, under the bar that names the tool, and
           over the Customize sheet a list can be opened from. It scrolls
           on its own, so the page behind keeps its place for coming back
           to, and never hands its scrolling on to that page */
        "max-md:fixed max-md:inset-x-0 max-md:top-12 max-md:bottom-0 max-md:z-50 max-md:overscroll-contain max-md:p-4",
        "md:relative md:w-90 md:shrink-0 md:border-l",
      )}
    >
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2 self-start md:hidden"
        onClick={onClose}
      >
        <ChevronLeftIcon />
        {back}
      </Button>
      <div className="flex min-h-8 items-center gap-2">
        <h2
          ref={heading}
          tabIndex={-1}
          className="min-w-0 flex-1 text-base font-semibold outline-none"
        >
          {title}
        </h2>
        {actions}
        <Button
          variant="ghost"
          size="icon"
          className="max-md:hidden"
          onClick={onClose}
          aria-label="Close"
        >
          <XIcon />
        </Button>
      </div>
      {children}
    </aside>
  );

  return slot ? createPortal(panel, slot) : panel;
}

/**
 * A phone's bottom sheet, at most half the screen, so the chart or table it
 * changes stays in view above it. Not modal: the page behind still scrolls.
 * Render it only while open.
 */
export function BottomSheet({
  title,
  onClose,
  actions,
  children,
}: {
  title: string;
  onClose: () => void;
  /** in the header, before Done (Reset, …) */
  actions?: ReactNode;
  children: ReactNode;
}) {
  const heading = useFocusLoop(onClose);
  const sheet = useRef<HTMLElement>(null);
  useRoomAbove(sheet);

  return createPortal(
    <section
      ref={sheet}
      role="dialog"
      aria-modal="false"
      aria-label={title}
      className="bg-background fixed inset-x-0 bottom-0 z-40 max-h-[50svh] overflow-y-auto rounded-t-xl border-t px-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_-12px_rgb(0_0_0/0.25)]"
    >
      {/* stays put while the options scroll under it */}
      <div className="bg-background sticky top-0 z-10 -mx-4 flex items-center gap-2 border-b px-4 py-2">
        <h2
          ref={heading}
          tabIndex={-1}
          className="min-w-0 flex-1 text-base font-semibold outline-none"
        >
          {title}
        </h2>
        {actions}
        <Button variant="outline" onClick={onClose}>
          Done
        </Button>
      </div>
      <div className="flex flex-col gap-4 pt-4">{children}</div>
    </section>,
    document.body,
  );
}

/* the sheet covers the bottom of the page, so the layout's <main> gets that
   much more room to scroll into, and what the sheet changes is brought up
   above it: the chart or table a view marks with data-sheet-anchor, or the
   page's table */
function useRoomAbove(sheet: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const content = document.getElementById("content");
    const element = sheet.current;
    if (!content || !element) return;

    const pad = () => {
      content.style.paddingBottom = `calc(${element.offsetHeight}px + 1rem)`;
    };
    pad();
    const resized = new ResizeObserver(pad);
    resized.observe(element);

    /* a frame on, once the view's own group has filled the sheet */
    const frame = requestAnimationFrame(() => {
      /* before the observer has seen it grow, or the scroll stops short */
      pad();
      const anchor =
        content.querySelector<HTMLElement>("[data-sheet-anchor]") ??
        content.querySelector("table");
      if (!anchor) return;
      const { element: scroller, top } = pageScroller();
      const shown = anchor.getBoundingClientRect();
      if (
        shown.top >= top &&
        shown.bottom <= element.getBoundingClientRect().top
      )
        return;
      const still = window.matchMedia("(prefers-reduced-motion: reduce)");
      scroller.scrollBy({
        top: shown.top - top - 16,
        behavior: still.matches ? "auto" : "smooth",
      });
    });

    return () => {
      cancelAnimationFrame(frame);
      resized.disconnect();
      content.style.paddingBottom = "";
    };
  }, [sheet]);
}

/** a quiet heading for a group inside a panel or sheet ("Filter", "Chart") */
export function PanelGroup({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-2.5">
      <div className="text-muted-foreground text-xs font-medium">{label}</div>
      {children}
    </div>
  );
}
