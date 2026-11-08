/*
  The Word Counter, counted in the browser (ADR 0012). It serves the page-order
  sheet: a column of links is pasted in, and the counts are copied back into
  the next column, one per line in the same order, gaps included.
*/

import { useEffect, useRef, useState } from "react";
import { getWordCount } from "~/lib/get-word-count";
import {
  toArticleLink,
  toArticleSlug,
} from "~/lib/services/wordpress/article-url";
import { Throttled } from "~/lib/services/wordpress/request";
import { scrapeArticles } from "~/lib/services/wordpress/scrape-article";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";

/* one row per pasted line, in order; a line that couldn't be counted keeps its
   row so the rest still line up */
type Row = {
  link: string;
  title: string | null;
  words: number | null;
  /** pasted text that is not a Hare link, kept as typed */
  foreign?: boolean;
  /** an empty line in the pasted column, kept so the rows still line up */
  blank?: boolean;
  /** WordPress was busy rather than the link being wrong */
  busy?: boolean;
};

/** the pasted column as rows to count: trailing blanks are the end of the
    paste, but leading ones are rows of the sheet and must stay */
function linesOf(pasted: string): string[] {
  const lines = pasted.split(/\r?\n/).map((line) => line.trim());
  while (lines.at(-1) === "") lines.pop();
  return lines;
}

export function WordCounter() {
  /* client-only, so the address is there on the first render */
  const [text, setText] = useState(
    () => new URLSearchParams(window.location.search).get("articles") ?? "",
  );
  const [rows, setRows] = useState<Row[]>([]);
  const [counting, setCounting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"yes" | "failed" | null>(null);
  const table = useRef<HTMLTableElement>(null);

  async function count(pasted: string) {
    const lines = linesOf(pasted);
    const links = lines.filter(Boolean);
    if (links.length < 1) return setError("Paste at least one article link.");
    if (links.length > 10) return setError("Ten links at most.");
    setError(null);
    setCounting(true);

    /* the address keeps the links, so a reload or a shared link counts again */
    const url = new URL(window.location.href);
    url.searchParams.set("articles", pasted);
    window.history.replaceState(window.history.state, "", url);

    /* every link in one request: one each drew 429s from WordPress, which
       refuses quick runs of requests from one address */
    const slugs = [
      ...new Set(
        lines
          .map(toArticleLink)
          .filter((link) => link !== undefined)
          .map(toArticleSlug),
      ),
    ];
    let found: Awaited<ReturnType<typeof scrapeArticles>> | undefined;
    let busy = false;
    try {
      found = await scrapeArticles(slugs);
    } catch (thrown) {
      console.error("could not count", thrown);
      busy = thrown instanceof Throttled;
    }

    const counted = lines.map((line): Row => {
      if (line === "")
        return { link: "", title: null, words: null, blank: true };
      const link = toArticleLink(line);
      if (!link) return { link: line, title: null, words: null, foreign: true };
      const article = found?.get(toArticleSlug(link));
      return article
        ? { link, title: article.title, words: getWordCount(article.body) }
        : { link, title: null, words: null, busy };
    });
    setRows(counted);
    setCounting(false);
  }

  /* links in the address are counted on arrival, as the page always did;
     deferred a tick, so the count's state changes happen outside the effect */
  useEffect(() => {
    if (!text) return;
    const timer = setTimeout(() => void count(text), 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- on arrival only
  }, []);

  const listed = rows.filter((row) => !row.blank);
  /* one count per line, in the pasted order; an uncounted link leaves its
     cell empty */
  const column = rows.map((row) => row.words ?? "").join("\n");

  function copyColumn() {
    navigator.clipboard
      .writeText(column)
      .then(() => setCopied("yes"))
      .catch((thrown: unknown) => {
        console.error("could not copy the counts", thrown);
        setCopied("failed");
      })
      .finally(() => setTimeout(() => setCopied(null), 1500));
  }

  return (
    <div className="space-y-6">
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          void count(text);
        }}
      >
        <Textarea
          name="articles"
          aria-label="Article links"
          className="h-40"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Paste up to ten article links, one per line"
          aria-invalid={error ? true : undefined}
        />
        {error && <p className="text-destructive text-sm">{error}</p>}
        <Button type="submit" disabled={counting}>
          {counting ? "Counting…" : "Count words"}
        </Button>
      </form>

      {rows.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm font-medium">Word counts</span>
            <Button variant="outline" size="sm" onClick={copyColumn}>
              {copied === "yes"
                ? "Copied"
                : copied === "failed"
                  ? "Couldn't copy"
                  : "Copy word counts"}
            </Button>
          </div>
          <div className="overflow-hidden rounded-xl border">
            <table
              ref={table}
              className="w-full text-sm"
              /* a dragged selection down the Words column copies those rows'
                 counts one per line, gaps included: the browser would drop
                 the empty rows, and the counts would no longer line up */
              onCopy={(event) => {
                const selection = getSelection();
                if (!selection || selection.isCollapsed || !table.current)
                  return;
                const selected = [
                  ...table.current.querySelectorAll<HTMLElement>("tbody tr"),
                ].filter((row) => selection.containsNode(row, true));
                if (selected.length === 0) return;
                event.clipboardData.setData(
                  "text/plain",
                  selected.map((row) => row.dataset.words ?? "").join("\n"),
                );
                event.preventDefault();
              }}
            >
              <thead>
                <tr className="text-muted-foreground bg-muted/40 border-b text-left">
                  <th className="px-4 py-2 font-medium">Article</th>
                  <th className="px-4 py-2 text-right font-medium">Words</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((row, index) => (
                  <tr key={index} data-words={row.words ?? ""}>
                    {/* only the numbers select, so dragging down the column
                        copies one count per line, as a sheet's column pastes */}
                    <td className="px-4 py-2 break-all select-none">
                      {row.blank ? (
                        <span className="text-muted-foreground">
                          Blank line
                        </span>
                      ) : row.foreign ? (
                        <span className="text-muted-foreground">
                          {row.link}
                        </span>
                      ) : (
                        <a
                          href={row.link}
                          target="_blank"
                          rel="noreferrer"
                          className="decoration-muted-foreground/40 hover:decoration-foreground break-normal underline underline-offset-4"
                          dangerouslySetInnerHTML={{
                            __html: row.title ?? row.link,
                          }}
                        />
                      )}
                    </td>
                    <td className="text-muted-foreground px-4 py-2 text-right whitespace-nowrap tabular-nums">
                      {row.blank ? null : row.foreign ? (
                        <span className="select-none">Not a Hare link</span>
                      ) : row.words === null ? (
                        <span className="select-none">
                          {row.busy ? "WordPress was busy" : "Couldn't read it"}
                        </span>
                      ) : (
                        <span className="text-foreground">
                          {row.words.toLocaleString("en-US")}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              {listed.length > 1 && (
                <tfoot className="select-none">
                  <tr className="border-t font-medium">
                    <td className="px-4 py-2">
                      Total
                      {listed.some((row) => row.words === null) && (
                        <span className="text-muted-foreground font-normal">
                          {" "}
                          ({
                            listed.filter((row) => row.words !== null).length
                          }{" "}
                          of {listed.length} counted)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {rows
                        .reduce((sum, row) => sum + (row.words ?? 0), 0)
                        .toLocaleString("en-US")}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <p className="text-muted-foreground text-sm">
            One per line, in the order pasted, to paste into the next column.
            {rows.some((row) => row.busy) &&
              " WordPress was busy for some; count again in a minute."}
          </p>
        </div>
      )}
    </div>
  );
}
