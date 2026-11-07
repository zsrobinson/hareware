import { useState } from "react";
import { Button } from "./ui/button";
import { CheckIcon, CopyIcon, XIcon } from "lucide-react";

export function CopyButton({
  id,
  label = "Copy",
}: {
  id: string;
  label?: string;
}) {
  /* the outcome shows for a moment, long enough to notice */
  const [result, setResult] = useState<"copied" | "failed" | null>(null);
  const show = (outcome: "copied" | "failed") => {
    setResult(outcome);
    setTimeout(() => setResult(null), 1500);
  };

  return (
    <Button
      onClick={() => {
        const input = document.getElementById(id) as
          HTMLInputElement | undefined;
        input?.select();
        input?.setSelectionRange(0, 99999);

        /*
          the clipboard rejects when the document is not focused or permission
          was refused, and an unhandled rejection there would be the only sign.
          the selection above still lets somebody copy it by hand, so say what
          happened and leave the tick off
        */
        navigator.clipboard
          .writeText(input?.value ?? "")
          .then(() => show("copied"))
          .catch((error: unknown) => {
            console.error("could not write to the clipboard", error);
            show("failed");
          });
      }}
      aria-label={
        result === "copied"
          ? "Copied"
          : result === "failed"
            ? "Couldn't copy; it's selected to copy by hand"
            : label
      }
      title={
        result === "failed"
          ? "Couldn't copy; it's selected to copy by hand"
          : undefined
      }
      variant="outline"
      size="icon"
      className="px-3"
    >
      {result === "copied" ? (
        <CheckIcon />
      ) : result === "failed" ? (
        <XIcon />
      ) : (
        <CopyIcon />
      )}
    </Button>
  );
}
