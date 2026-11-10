import { useRef, useState } from "react";
import { CheckIcon, CopyIcon, XIcon, type LucideIcon } from "lucide-react";
import { cn } from "~/lib/utils";
import { Button } from "./ui/button";

type Outcome = "copied" | "failed";

/* what the last copy did, for as long as a glance takes */
function useOutcome() {
  const [result, setResult] = useState<Outcome | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = (outcome: Outcome) => {
    clearTimeout(timer.current);
    setResult(outcome);
    timer.current = setTimeout(() => setResult(null), 1600);
  };
  return [result, show] as const;
}

/** a field's copy button: the icon says what happened, and a screen reader
    hears it, while focus stays on the button */
export function CopyButton({ id, what }: { id: string; what: string }) {
  const [result, show] = useOutcome();

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

/** a copy button that says what it copies ("Copy link"): it reads "Copied"
    for a moment, at the width it already had, so nothing beside it moves.
    `iconOnly` draws its icon alone, named by `label`, where a row is short */
export function CopyTextButton({
  text,
  label,
  what,
  icon: Icon,
  failed,
  iconOnly = false,
}: {
  /** read on the click, so it is what is on screen then */
  text: () => string;
  label: string;
  /** what a screen reader hears was copied ("the link") */
  what: string;
  icon: LucideIcon;
  /** where to copy it by hand instead */
  failed: string;
  iconOnly?: boolean;
}) {
  const [result, show] = useOutcome();
  const shown = result === "copied" ? "Copied" : label;

  return (
    <>
      <Button
        variant={iconOnly ? "ghost" : "outline"}
        size={iconOnly ? "icon" : "default"}
        className={cn(!iconOnly && "bg-background")}
        aria-label={iconOnly ? label : undefined}
        title={
          result === "failed"
            ? `Couldn't copy. ${failed}`
            : iconOnly
              ? shown
              : undefined
        }
        onClick={() => {
          navigator.clipboard
            .writeText(text())
            .then(() => show("copied"))
            .catch((error: unknown) => {
              console.error("could not write to the clipboard", error);
              show("failed");
            });
        }}
      >
        {result === "copied" ? (
          <CheckIcon />
        ) : result === "failed" ? (
          <XIcon />
        ) : (
          <Icon />
        )}
        {/* both words in one cell, the other hidden, so the width holds */}
        {!iconOnly && (
          <span className="grid *:col-start-1 *:row-start-1">
            {[label, "Copied"].map((word) => (
              <span key={word} className={cn(word !== shown && "invisible")}>
                {word}
              </span>
            ))}
          </span>
        )}
      </Button>
      <span className="sr-only" role="status">
        {result === "copied"
          ? `Copied ${what}`
          : result === "failed"
            ? `Couldn't copy ${what}. ${failed}`
            : ""}
      </span>
    </>
  );
}
