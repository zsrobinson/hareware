/*
  A removal is written at once and stays recoverable for a while in the row it
  took away: "Removed “By:”  [Undo]", for eight seconds, longer while the
  pointer or the keyboard is on it. Undo writes the old rows back, as the
  toast's Undo did; only where it is offered has moved.

  Writes from one list go one at a time, and each is worked out when it is
  sent, from the list as it then stands less everything removed and not
  undone. Labels are saved as a whole tab, so an edit worked out earlier would
  put back a label that a second removal took away meanwhile.
*/

import { useQueryClient } from "@tanstack/react-query";
import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import type { Edit } from "~/lib/credits/edits";
import { cn } from "~/lib/utils";
import { SHEET_KEY } from "./archive-data";
import { afterFailure, send } from "./use-edit";

const UNDO_MS = 8000;

type Removal<T> = {
  /** what the row says once removed, and what is announced: "Removed “By:”" */
  done: string;
  /** announced when Undo has put it back */
  restored: string;
  /** names Undo for what it puts back: "Undo removing By:" */
  undoLabel: string;
  /** the edit, from the rest of the list as it stands when it is sent */
  edit: (rest: T[]) => Edit;
  /** the edit that puts it back, likewise */
  undo: (rest: T[]) => Edit;
};

type Pending<T> = Removal<T> & {
  key: string;
  item: T;
  /** where it was in the list, so it stays there once the list has lost it */
  index: number;
  /** resolves false if the removal was never written */
  written: Promise<boolean>;
  undoing: boolean;
};

type Entry<T> = { key: string; item: T; removed: boolean };

export function useRemovals<T>(items: T[], keyOf: (item: T) => string) {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<Pending<T>[]>([]);
  const [said, setSaid] = useState("");

  /* read by writes in flight, which outlive the render that started them */
  const latest = useRef(items);
  useLayoutEffect(() => {
    latest.current = items;
  });
  /* changed in the handlers themselves, so a write sent before the next
     render already leaves out what was just removed */
  const removedKeys = useRef(new Set<string>());
  const undoing = useRef(new Set<string>());
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  /* the row whose × takes focus back once it is drawn again */
  const refocus = useRef<string | null>(null);

  const rest = () =>
    latest.current.filter((item) => !removedKeys.current.has(keyOf(item)));

  const write = (edit: () => Edit) => {
    const next = queue.current.then(async () => {
      await send(edit());
      await queryClient.invalidateQueries({ queryKey: SHEET_KEY });
    });
    queue.current = next.catch(() => {});
    return next;
  };

  const drop = (key: string) =>
    setPending((all) => all.filter((p) => p.key !== key));

  const undo = (target: Pending<T>) => {
    /* a second press before the first has drawn would write it twice */
    if (undoing.current.has(target.key)) return;
    undoing.current.add(target.key);
    setPending((all) =>
      all.map((p) => (p.key === target.key ? { ...p, undoing: true } : p)),
    );
    void (async () => {
      try {
        if (!(await target.written)) return;
        await write(() => target.undo(rest()));
        removedKeys.current.delete(target.key);
        refocus.current = target.key;
        drop(target.key);
        setSaid(target.restored);
      } catch (error) {
        toast.error(`Not undone: ${(error as Error).message}`);
        afterFailure(queryClient, error);
        setPending((all) =>
          all.map((p) => (p.key === target.key ? { ...p, undoing: false } : p)),
        );
      } finally {
        undoing.current.delete(target.key);
      }
    })();
  };

  const expire = (target: Pending<T>) =>
    void target.written.then((written) => {
      if (!written) return;
      removedKeys.current.delete(target.key);
      drop(target.key);
    });

  /* the list as drawn: a removed row stays where it was, both while the list
     still holds it and once a reread has dropped it */
  const byKey = new Map(pending.map((p) => [p.key, p]));
  const entries: Entry<T>[] = items.map((item) => {
    const key = keyOf(item);
    const removal = byKey.get(key);
    return removal
      ? { key, item: removal.item, removed: true }
      : { key, item, removed: false };
  });
  const drawn = new Set(entries.map((entry) => entry.key));
  for (const p of [...pending].sort((a, b) => a.index - b.index))
    if (!drawn.has(p.key))
      entries.splice(Math.min(p.index, entries.length), 0, {
        key: p.key,
        item: p.item,
        removed: true,
      });

  const remove = (item: T, removal: Removal<T>) => {
    const key = keyOf(item);
    if (removedKeys.current.has(key)) return;
    removedKeys.current.add(key);

    const written = write(() => removal.edit(rest())).then(
      () => true,
      (error: unknown) => {
        removedKeys.current.delete(key);
        refocus.current = key;
        drop(key);
        toast.error(`Not saved: ${(error as Error).message}`);
        afterFailure(queryClient, error);
        return false;
      },
    );
    setPending((all) => [
      ...all,
      {
        ...removal,
        key,
        item,
        index: entries.findIndex((entry) => entry.key === key),
        written,
        undoing: false,
      },
    ]);
    setSaid(removal.done);
  };

  return {
    entries,
    remove,
    /** draws a removed entry: "Removed “By:”  [Undo]", in its row's place */
    removedRow: (key: string, className?: string) => {
      const p = byKey.get(key);
      return (
        p && (
          <RemovedRow
            key={`removed-${key}`}
            done={p.done}
            undoLabel={p.undoLabel}
            undoing={p.undoing}
            onUndo={() => undo(p)}
            onExpire={() => expire(p)}
            className={className}
          />
        )
      );
    },
    /** for a row's ×, so focus comes back to it after Undo */
    focusBack: (key: string) => (element: HTMLElement | null) => {
      if (element && refocus.current === key) {
        refocus.current = null;
        element.focus({ preventScroll: true });
      }
    },
    /** a polite live region saying what was removed or put back */
    status: (
      <p role="status" aria-live="polite" className="sr-only">
        {said}
      </p>
    ),
  };
}

/**
 * A removed row with Undo, in place of the row it was. It takes focus, and
 * goes after eight seconds unless the pointer is over it or the keyboard is
 * on it.
 */
function RemovedRow({
  done,
  undoLabel,
  undoing,
  onUndo,
  onExpire,
  className,
}: {
  done: string;
  undoLabel: string;
  undoing: boolean;
  onUndo: () => void;
  onExpire: () => void;
  className?: string;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const left = useRef(UNDO_MS);
  const expire = useEffectEvent(onExpire);

  useLayoutEffect(() => {
    button.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (hovered || focused || undoing) return;
    const started = Date.now();
    const timer = setTimeout(() => expire(), Math.max(0, left.current));
    return () => {
      clearTimeout(timer);
      left.current -= Date.now() - started;
    };
  }, [hovered, focused, undoing]);

  return (
    <li
      className={cn(
        "bg-muted/60 flex min-h-11 items-center justify-between gap-3 px-3 py-1.5 text-sm",
        className,
      )}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      /* focus comes here after ×, but only a keyboard's holds the row open */
      onFocus={(event) => setFocused(event.target.matches(":focus-visible"))}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setFocused(false);
      }}
    >
      <span className="text-muted-foreground min-w-0">{done}</span>
      <Button
        ref={button}
        variant="outline"
        aria-label={undoLabel}
        /* not disabled, which would drop focus while it writes */
        aria-disabled={undoing}
        onClick={() => !undoing && onUndo()}
      >
        Undo
      </Button>
    </li>
  );
}
