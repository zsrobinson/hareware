import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";
import { newsletterHtml, type NewsletterArticle } from "~/lib/newsletter";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";

/* the preview is a document of its own, so the app's styles cannot change
   what the email looks like, and what is shown is exactly what is copied */
const frame = (html: string) =>
  `<!doctype html><html><head><meta charset="utf-8" /><base target="_blank" /></head><body style="margin: 12px; font-family: Arial, sans-serif; font-size: 14px; color: #222; background: #fff;">${html}</body></html>`;

export function NewsletterPage({
  articles,
}: {
  articles: NewsletterArticle[];
}) {
  const [meeting, setMeeting] = useState("");
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState<"yes" | "failed" | null>(null);
  const [height, setHeight] = useState(600);

  const html = newsletterHtml({ meeting, note, articles });

  const copy = async () => {
    try {
      const plain = new DOMParser().parseFromString(html, "text/html").body
        .innerText;
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([plain], { type: "text/plain" }),
        }),
      ]);
      setCopied("yes");
    } catch (error) {
      console.error("could not copy the newsletter", error);
      setCopied("failed");
    }
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
      <div className="space-y-4">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Next meeting</span>
          <Input
            value={meeting}
            onChange={(event) => setMeeting(event.target.value)}
            placeholder="Thursday at 7 pm in Tawes 1100"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Note</span>
          <Textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Anything else this week. Leave a blank line between paragraphs."
            className="h-40"
          />
        </label>
        <div className="space-y-1.5">
          <Button onClick={() => void copy()}>
            {copied === "yes" ? <CheckIcon /> : <CopyIcon />}
            {copied === "yes" ? "Copied" : "Copy for Gmail"}
          </Button>
          <p className="text-muted-foreground text-sm">
            {copied === "failed"
              ? "Couldn't copy. Select the preview and copy it instead."
              : "Then paste it into a new email."}
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <span className="text-sm font-medium">Preview</span>
        <iframe
          title="The newsletter as it will be pasted"
          srcDoc={frame(html)}
          className="w-full rounded-xl border bg-white"
          style={{ height }}
          onLoad={(event) => {
            const body = event.currentTarget.contentDocument?.body;
            if (body) setHeight(body.scrollHeight + 24);
          }}
        />
      </div>
    </div>
  );
}
