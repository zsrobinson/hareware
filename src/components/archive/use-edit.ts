import {
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import type { Edit } from "~/lib/credits/edits";

type Save = { edit: Edit; done?: string; undo?: Edit };

async function send(edit: Edit) {
  const response = await fetch("/api/sheet", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(edit),
  });
  if (!response.ok)
    throw new Error(
      (await response.text()) || `HareWare answered ${response.status}`,
    );
}

/* the row that offered Undo has usually gone by then, so it owns nothing */
async function undoWith(queryClient: QueryClient, edit: Edit) {
  try {
    await send(edit);
    await queryClient.invalidateQueries({ queryKey: ["archive"] });
    toast.success("Undone");
  } catch (error) {
    toast.error(`Not undone: ${(error as Error).message}`);
  }
}

/**
 * Saves an edit to the Sheet, then reloads the archive so every page shows
 * it. `done` is the toast on success; a failure says what the server said.
 * An `undo` puts an Undo button on that toast, which is how every removal
 * stays recoverable without asking first.
 */
export function useEdit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ edit }: Save) => send(edit),
    onSuccess: async (_, { done, undo }) => {
      await queryClient.invalidateQueries({ queryKey: ["archive"] });
      if (!done) return;
      toast.success(
        done,
        undo && {
          action: {
            label: "Undo",
            onClick: () => void undoWith(queryClient, undo),
          },
        },
      );
    },
    onError: (error) => toast.error(`Not saved: ${error.message}`),
  });
}
