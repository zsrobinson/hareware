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

async function copyImage(image: string) {
  const response = await fetch(image);
  const blob = await response.blob();
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}

export function CopyImageButton({ image }: { image: string }) {
  return (
    <Button
      variant="outline"
      className="w-full"
      /*
        not an async handler: react calls this and drops what it returns, so a
        rejected fetch or a refused clipboard would surface only as an unhandled
        rejection in the console. the promise is run and caught here instead
      */
      onClick={() => {
        void copyImage(image).catch((error: unknown) => {
          console.error("could not copy the image", error);
        });
      }}
    >
      Copy Image
    </Button>
  );
}
