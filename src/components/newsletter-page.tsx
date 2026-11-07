import { CheckIcon, CopyIcon } from "lucide-react";
import { useDeferredValue, useEffect, useState } from "react";
import { newsletterHtml, type NewsletterArticle } from "~/lib/newsletter";
import {
  EMAIL_IMAGE_WIDTH,
  toSizedImage,
} from "~/lib/services/wordpress/image-url";
import { recentArticles } from "~/lib/services/wordpress/scrape-article";
import { LoaderCircle } from "./loader-circle";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";

/* the preview is a document of its own, so the app's styles cannot change
   what the email looks like, and what is shown is exactly what is copied */
const frame = (html: string) =>
  `<!doctype html><html><head><meta charset="utf-8" /><base target="_blank" /></head><body style="margin: 12px; font-family: Arial, sans-serif; font-size: 14px; color: #222; background: #fff;">${html}</body></html>`;

/** the latest articles, read in the browser (ADR 0012), then the newsletter */
export function NewsletterPage() {
  const [articles, setArticles] = useState<
    NewsletterArticle[] | "failed" | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    recentArticles(10)
      .then((posts) => {
        if (cancelled) return;
        setArticles(
          posts.map((post) => ({
            title: post.title,
            link: post.link,
            image: toSizedImage(post.image, EMAIL_IMAGE_WIDTH),
            author: post.author ?? undefined,
            imageCredits: post.imageCredits ?? undefined,
          })),
        );
      })
      .catch((thrown: unknown) => {
        console.error("could not read the latest articles", thrown);
        if (!cancelled) setArticles("failed");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (articles === null)
    return (
      <p className="text-muted-foreground flex items-center gap-2 text-sm">
        <LoaderCircle className="size-4 animate-spin" />
        Reading the latest articles…
      </p>
    );
  if (articles === "failed")
    return (
      <p className="text-muted-foreground text-sm">
        The latest articles couldn't be read just now. Try again in a minute.
      </p>
    );
  return <Newsletter articles={articles} />;
}

function Newsletter({ articles }: { articles: NewsletterArticle[] }) {
  const [meeting, setMeeting] = useState("");
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState<"yes" | "failed" | null>(null);
  const [height, setHeight] = useState(600);

  const html = newsletterHtml({ meeting, note, articles });
  /* the preview reloads as a whole, so it waits for a pause in the typing */
  const [shown, setShown] = useState(html);
  const settled = useDeferredValue(html);
  useEffect(() => {
    const timer = setTimeout(() => setShown(settled), 300);
    return () => clearTimeout(timer);
  }, [settled]);

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
            placeholder="Optional: Thursday at 7 pm in Tawes 1100"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Note</span>
          <Textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Optional. Leave a blank line between paragraphs."
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
              : "Paste it into a new email. Anything left blank stays in brackets to fill in there."}
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <span className="text-sm font-medium">Preview</span>
        <iframe
          title="The newsletter as it will be pasted"
          srcDoc={frame(shown)}
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
