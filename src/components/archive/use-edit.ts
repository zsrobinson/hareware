import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Edit } from "~/lib/credits/edits";

/**
 * Saves an edit to the Sheet, then reloads the archive so every page shows
 * it. `done` is the toast on success; a failure says what the server said.
 */
export function useEdit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ edit }: { edit: Edit; done?: string }) => {
      const response = await fetch("/api/sheet", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(edit),
      });
      if (!response.ok)
        throw new Error(
          (await response.text()) || `HareWare answered ${response.status}`,
        );
    },
    onSuccess: async (_, { done }) => {
      await queryClient.invalidateQueries({ queryKey: ["archive"] });
      if (done) toast.success(done);
    },
    onError: (error) => toast.error(`Not saved: ${error.message}`),
  });
}
