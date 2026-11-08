import {
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import type { Edit } from "~/lib/credits/edits";
import { failureOf, Refused } from "~/lib/gated";
import { SHEET_KEY } from "./archive-data";

type Save = { edit: Edit; done?: string; undo?: Edit };

/** writes one edit to the Sheet; throws what the server said */
export async function send(edit: Edit) {
  const response = await fetch("/api/sheet", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(edit),
  });
  if (!response.ok) throw await failureOf(response);
}

/* a refusal means the session ended or changed: asking the gate again puts
   the refusal in place of the page, rather than leaving names on screen that
   this viewer may no longer see */
export function afterFailure(queryClient: QueryClient, error: unknown) {
  if (error instanceof Refused)
    void queryClient.invalidateQueries({ queryKey: SHEET_KEY });
}

/* the row that offered Undo has usually gone by then, so it owns nothing */
async function undoWith(queryClient: QueryClient, edit: Edit) {
  try {
    await send(edit);
    await queryClient.invalidateQueries({ queryKey: SHEET_KEY });
    toast.success("Undone");
  } catch (error) {
    toast.error(`Not undone: ${(error as Error).message}`);
    afterFailure(queryClient, error);
  }
}

/**
 * Saves an edit to the Sheet, then reloads the archive so every page shows
 * it. `done` is the toast on success; a failure says what the server said.
 * An `undo` puts an Undo button on that toast. A removal does not come here:
 * `useRemovals` undoes it in the row it took away.
 */
export function useEdit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ edit }: Save) => send(edit),
    onSuccess: async (_, { done, undo }) => {
      await queryClient.invalidateQueries({ queryKey: SHEET_KEY });
      if (!done) return;
      toast.success(
        done,
        undo && {
          /* long enough to reach for on a phone */
          duration: 8000,
          action: {
            label: "Undo",
            onClick: () => void undoWith(queryClient, undo),
          },
        },
      );
    },
    onError: (error) => {
      toast.error(`Not saved: ${error.message}`);
      afterFailure(queryClient, error);
    },
  });
}
