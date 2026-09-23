import { useState } from "react";
import { Button } from "./ui/button";
import { CheckIcon, CopyIcon } from "lucide-react";

export function CopyButton({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);

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
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 500);
          })
          .catch((error: unknown) => {
            console.error("could not write to the clipboard", error);
          });
      }}
      variant="outline"
      size="icon"
      className="px-3"
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </Button>
  );
}
