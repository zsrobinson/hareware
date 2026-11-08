import {
  CalendarClockIcon,
  CheckIcon,
  CopyIcon,
  StickyNoteIcon,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useDeferredValue, useEffect, useState } from "react";
import { queryClient } from "~/lib/query-client";
import { useHydrated } from "~/lib/use-hydrated";
import { newsletterHtml, type NewsletterArticle } from "~/lib/newsletter";
import {
  EMAIL_IMAGE_WIDTH,
  toSizedImage,
} from "~/lib/services/wordpress/image-url";
import { latestQuery } from "./queries";
import { FieldActions, FieldNote, FieldRow, FieldRows } from "./field-row";
import { couldNotRead, ReadFailed, Reading } from "./read-state";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";

/* the preview is a document of its own, so the app's styles cannot change
   what the email looks like, and what is shown is exactly what is copied */
const frame = (html: string) =>
  `<!doctype html><html><head><meta charset="utf-8" /><base target="_blank" /></head><body style="margin: 12px; font-family: Arial, sans-serif; font-size: 14px; color: #222; background: #fff;">${html}</body></html>`;

/* stable, so the list is mapped once per read rather than once per render */
const toNewsletter = (
  posts: Awaited<ReturnType<NonNullable<typeof latestQuery.queryFn>>>,
): NewsletterArticle[] =>
  posts.map((post) => ({
    title: post.title,
    link: post.link,
    image: toSizedImage(post.image, EMAIL_IMAGE_WIDTH),
    author: post.author ?? undefined,
    imageCredits: post.imageCredits ?? undefined,
  }));

/** the latest articles, read in the browser (ADR 0012), then the newsletter */
export function NewsletterPage() {
  const hydrated = useHydrated();
  const latest = useQuery(
    {
      ...latestQuery,
      select: toNewsletter,
    },
    queryClient,
  );
  useEffect(() => {
    if (latest.error)
      console.error("could not read the latest articles", latest.error);
  }, [latest.error]);

  /* what was read stays on screen if a later read fails */
  if (hydrated && latest.data) return <Newsletter articles={latest.data} />;
  if (hydrated && latest.isError)
    return (
      <ReadFailed
        message={couldNotRead(latest.error, "the latest articles")}
        onRetry={() => void latest.refetch()}
        retrying={latest.isFetching}
      />
    );
  return <Reading>Reading the latest articles…</Reading>;
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
      setTimeout(() => setCopied(null), 1600);
    } catch (error) {
      console.error("could not copy the newsletter", error);
      /* stays until the next try: it says what to do instead */
      setCopied("failed");
    }
  };

  return (
    <div className="@container">
      <div className="grid grid-cols-1 items-start gap-8 @4xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] @4xl:gap-x-10">
        <FieldRows>
          <FieldRow
            icon={CalendarClockIcon}
            label="Next meeting"
            htmlFor="meeting"
          >
            <Input
              id="meeting"
              value={meeting}
              onChange={(event) => setMeeting(event.target.value)}
              placeholder="Thursday at 7 pm in Tawes 1100"
            />
          </FieldRow>
          <FieldRow icon={StickyNoteIcon} label="Note" htmlFor="note" top>
            <Textarea
              id="note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Leave a blank line between paragraphs."
              className="h-40"
            />
          </FieldRow>
          <FieldActions>
            <Button className="min-w-36" onClick={() => void copy()}>
              {copied === "yes" ? <CheckIcon /> : <CopyIcon />}
              {copied === "yes" ? "Copied" : "Copy for Gmail"}
            </Button>
            <span className="sr-only" role="status">
              {copied === "yes" ? "Copied the newsletter" : ""}
            </span>
          </FieldActions>
          {copied === "failed" && (
            <FieldNote>
              <span className="text-destructive" role="alert">
                Couldn't copy. Select the preview and copy it instead.
              </span>
            </FieldNote>
          )}
        </FieldRows>

        <section className="space-y-2" aria-labelledby="preview">
          <h2 id="preview" className="text-sm font-medium">
            Preview
          </h2>
          <iframe
            title="The newsletter as it will be pasted"
            srcDoc={frame(shown)}
            className="w-full rounded-lg border bg-white"
            style={{ height }}
            onLoad={(event) => {
              const body = event.currentTarget.contentDocument?.body;
              if (body) setHeight(body.scrollHeight + 24);
            }}
          />
        </section>
      </div>
    </div>
  );
}
