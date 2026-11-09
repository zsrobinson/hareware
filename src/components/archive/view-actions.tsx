import { useQueryClient } from "@tanstack/react-query";
import { useId, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import type { SheetPayload } from "~/lib/credits/load";
import type { Page } from "~/lib/credits/sheet";
import { readSheetPayload, SHEET_KEY } from "./archive-data";
import { pageViews, starterOf, type PageViews } from "./saved-views";
import { writeViews, type Intent, type Outcome } from "./view-writes";

/*
  How a change to a page's views is told: Saved only once the Sheet's read
  shows it, Not confirmed yet with a Recheck while it does not, a conflict as
  a choice between the Sheet's copy and this one, and a failure as what the
  server said.
*/

/** a conflict waiting on Reload or Overwrite */
export type Conflict = {
  message: string;
  /** the same change, made over whatever the Sheet now holds */
  overwrite: () => void;
  /** the Sheet's copy shown, and what this change was dropped */
  reload: () => void;
};

/** what the page does once a change is known to have landed, or may have */
type After = {
  /** the toast once it is confirmed */
  done: string;
  /** an Undo on that toast */
  undo?: () => void;
  /** run on a confirmed write, and on one the Sheet took but did not show */
  then?: (outcome: Outcome) => void;
  /** run on Reload after a conflict, once the Sheet's copy is read */
  reloaded?: () => void;
};

const UNDO_MS = 8000;

/**
 * Writes changes to one page's views. `intent(overwrite)` makes the change:
 * against the last read of the Sheet first, then, on Overwrite, against a
 * read made for it. `latest()` is that last read, which a write leaves the
 * Sheet's own once it is confirmed.
 */
export function useViewWriter(page: Page, copy: PageViews) {
  const queryClient = useQueryClient();
  const latest = (): PageViews => {
    const payload = queryClient.getQueryData<SheetPayload>(SHEET_KEY);
    return payload ? pageViews(payload, page) : copy;
  };
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const starter = starterOf(page).map((saved) => saved.view);

  const reread = async () =>
    pageViews(
      await queryClient.fetchQuery({
        queryKey: SHEET_KEY,
        queryFn: readSheetPayload,
        staleTime: 0,
      }),
      page,
    );

  const told = (outcome: Outcome, after: After) => {
    switch (outcome.status) {
      case "saved":
        if (after.undo) {
          const id = toast.success(after.done, {
            duration: UNDO_MS,
            action: {
              label: "Undo",
              onClick: () => {
                toast.dismiss(id);
                after.undo!();
              },
            },
          });
        } else toast.success(after.done);
        after.then?.(outcome);
        return;
      case "unconfirmed": {
        after.then?.(outcome);
        const id = toast.warning(
          "Not confirmed yet: the Sheet took it, but doesn't show it yet.",
          {
            duration: Infinity,
            action: {
              label: "Recheck",
              onClick: () => {
                toast.dismiss(id);
                void outcome.recheck().then((next) => told(next, after));
              },
            },
          },
        );
        return;
      }
      case "failed":
        toast.error(`Not saved: ${outcome.message}`);
        return;
      case "conflict":
        return;
    }
  };

  const write = async (
    intent: (overwrite: boolean) => Intent,
    after: After,
    on: PageViews = latest(),
    overwrite = false,
  ): Promise<Outcome> => {
    setBusy(true);
    try {
      const outcome = await writeViews(
        queryClient,
        page,
        on,
        intent(overwrite),
        starter,
      );
      if (outcome.status === "conflict")
        setConflict({
          message: outcome.message,
          overwrite: () => {
            setConflict(null);
            void reread().then((fresh) => write(intent, after, fresh, true));
          },
          reload: () => {
            setConflict(null);
            void reread().then(() => after.reloaded?.());
          },
        });
      else told(outcome, after);
      return outcome;
    } finally {
      setBusy(false);
    }
  };

  const dialog = conflict && (
    <Dialog open onOpenChange={(open) => !open && setConflict(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{conflict.message}</DialogTitle>
          <DialogDescription>
            Reload shows the views as they are saved now. Overwrite saves yours
            over them, for everyone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={conflict.reload}>
            Reload
          </Button>
          <Button variant="destructive" onClick={conflict.overwrite}>
            Overwrite
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { write, latest, busy, dialog };
}

/** a short form in a dialog: a view's name, or its title and question */
export function ViewForm({
  title,
  description,
  fields,
  submit,
  onSubmit,
  onClose,
}: {
  title: string;
  description?: ReactNode;
  fields: {
    name: string;
    label: string;
    value: string;
    long?: boolean;
    required?: boolean;
  }[];
  submit: string;
  onSubmit: (values: Record<string, string>) => void;
  onClose: () => void;
}) {
  const ids = useId();
  const [values, setValues] = useState(() =>
    Object.fromEntries(fields.map((f) => [f.name, f.value])),
  );
  const missing = fields.some((f) => f.required && !values[f.name]?.trim());
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (missing) return;
            onSubmit(
              Object.fromEntries(
                Object.entries(values).map(([k, v]) => [k, v.trim()]),
              ),
            );
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && (
              <DialogDescription>{description}</DialogDescription>
            )}
          </DialogHeader>
          {fields.map((field) => {
            const Field = field.long ? Textarea : Input;
            return (
              <label
                key={field.name}
                htmlFor={`${ids}-${field.name}`}
                className="grid gap-1.5 text-sm font-medium"
              >
                {field.label}
                <Field
                  id={`${ids}-${field.name}`}
                  value={values[field.name] ?? ""}
                  maxLength={field.long ? 300 : 60}
                  onChange={(event) =>
                    setValues((now) => ({
                      ...now,
                      [field.name]: event.target.value,
                    }))
                  }
                />
              </label>
            );
          })}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={missing}>
              {submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** a yes or no in a dialog, for what takes something away from everyone */
export function Confirm({
  title,
  description,
  confirm,
  onConfirm,
  onClose,
}: {
  title: string;
  description: ReactNode;
  confirm: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            {confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** an id for a new view: not a slug of its name, which the log would carry */
export function newViewId(taken: readonly string[]): string {
  for (;;) {
    const id = `v-${Math.random().toString(36).slice(2, 8)}`;
    if (!taken.includes(id)) return id;
  }
}
