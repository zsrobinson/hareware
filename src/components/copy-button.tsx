import { useState } from "react";
import { Button } from "./ui/button";
import {
  CheckIcon,
  ClipboardCopyIcon,
  ClipboardIcon,
  CopyIcon,
} from "@radix-ui/react-icons";

export function CopyButton({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <Button
      onClick={() => {
        console.log("HIIII");
        const input = document.getElementById(id) as
          | HTMLInputElement
          | undefined;
        input?.select();
        input?.setSelectionRange(0, 99999);
        navigator.clipboard.writeText(input?.value || "");
        setCopied(true);
        setTimeout(() => setCopied(false), 500);
      }}
      variant="outline"
      size="icon"
      className="px-3"
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </Button>
  );
}

export function CopyImageButton({ image }: { image: string }) {
  return (
    <Button
      variant="outline"
      className="w-full"
      onClick={async () => {
        const response = await fetch(image);
        const blob = await response.blob();
        navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      }}
    >
      Copy Image
    </Button>
  );
}
