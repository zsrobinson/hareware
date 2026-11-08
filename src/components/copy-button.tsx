import { useRef, useState } from "react";
import { CheckIcon, CopyIcon, XIcon } from "lucide-react";
import { Button } from "./ui/button";

/** a field's copy button: the icon says what happened, and a screen reader
    hears it, while focus stays on the button */
export function CopyButton({ id, what }: { id: string; what: string }) {
  const [result, setResult] = useState<"copied" | "failed" | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = (outcome: "copied" | "failed") => {
    clearTimeout(timer.current);
    setResult(outcome);
    timer.current = setTimeout(() => setResult(null), 1600);
  };

  return (
    <>
      <Button
        onClick={() => {
          const field = document.getElementById(id) as
            HTMLInputElement | HTMLTextAreaElement | null;

          /*
            the clipboard rejects when the document is not focused or permission
            was refused, and an unhandled rejection there would be the only sign.
            selecting the text then lets somebody copy it by hand; only then,
            since selecting moves focus off the button
          */
          navigator.clipboard
            .writeText(field?.value ?? "")
            .then(() => show("copied"))
            .catch((error: unknown) => {
              console.error("could not write to the clipboard", error);
              field?.select();
              show("failed");
            });
        }}
        aria-label={`Copy ${what}`}
        title={
          result === "failed"
            ? "Couldn't copy; it's selected to copy by hand"
            : `Copy ${what}`
        }
        variant="ghost"
        size="icon"
      >
        {result === "copied" ? (
          <CheckIcon />
        ) : result === "failed" ? (
          <XIcon />
        ) : (
          <CopyIcon />
        )}
      </Button>
      <span className="sr-only" role="status">
        {result === "copied"
          ? `Copied ${what}`
          : result === "failed"
            ? `Couldn't copy ${what}; it's selected to copy by hand`
            : ""}
      </span>
    </>
  );
}
