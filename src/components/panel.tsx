/*
  The two non-modal panels the tools open: a side panel beside the content on a
  laptop (Customize, a person), which narrows the page rather than covering it,
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
} from "react";
import { createPortal } from "react-dom";
import { Button } from "~/components/ui/button";
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
function useFocusLoop(onClose: () => void) {
  const heading = useRef<HTMLHeadingElement>(null);
  const close = useRef(onClose);
  useLayoutEffect(() => {
    close.current = onClose;
  });

  useLayoutEffect(() => {
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    heading.current?.focus({ preventScroll: true });

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) close.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      /* the opener may have been redrawn while the panel was open */
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  return heading;
}

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
  children,
}: {
  title: ReactNode;
  onClose: () => void;
  /** beside the title, before the close button (Reset, …) */
  actions?: ReactNode;
  /** the phone's back link, e.g. "All people" */
  back: string;
  children: ReactNode;
}) {
  const slot = useSlot("side-panel");
  const heading = useFocusLoop(onClose);

  const panel = (
    <aside
      aria-label={typeof title === "string" ? title : undefined}
      className={cn(
        "bg-background flex flex-col gap-5 overflow-y-auto p-6",
        /* a phone: a page of its own, under the bar that names the tool */
        "max-md:fixed max-md:inset-x-0 max-md:top-12 max-md:bottom-0 max-md:z-30 max-md:p-4",
        "md:w-90 md:shrink-0 md:border-l",
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

  return createPortal(
    <section
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
