/*
  The Word Counter, counted in the browser (ADR 0012). It serves the page-order
  sheet: a column of links is pasted in, and the counts are copied back into
  the next column, one per line in the same order, gaps included.
*/

import { CheckIcon, CopyIcon, LinkIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getWordCount } from "~/lib/get-word-count";
import {
  toArticleLink,
  toArticleSlug,
} from "~/lib/services/wordpress/article-url";
import { Throttled } from "~/lib/services/wordpress/request";
import { scrapeArticles } from "~/lib/services/wordpress/scrape-article";
import { FieldActions, FieldNote, FieldRow, FieldRows } from "./field-row";
import { Button } from "./ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
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
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
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
    clearTimeout(copiedTimer.current);
    navigator.clipboard
      .writeText(column)
      .then(() => setCopied("yes"))
      .catch((thrown: unknown) => {
        console.error("could not copy the counts", thrown);
        setCopied("failed");
      })
      .finally(() => {
        copiedTimer.current = setTimeout(() => setCopied(null), 1600);
      });
  }

  return (
    <div className="space-y-8">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void count(text);
        }}
      >
        <FieldRows>
          <FieldRow icon={LinkIcon} label="Article links" htmlFor="links" top>
            <Textarea
              id="links"
              name="articles"
              /* a box of links, so set like the other tools' link field. A
                 long one wraps, as on a phone links share their first forty
                 characters; wrapping only draws, the value keeps its lines */
              className="min-h-28 font-mono wrap-anywhere whitespace-pre-wrap placeholder:font-sans md:text-[13px]"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Paste up to ten article links, one per line"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "links-error" : undefined}
            />
          </FieldRow>
          {error && (
            <FieldNote>
              <span id="links-error" className="text-destructive">
                {error}
              </span>
            </FieldNote>
          )}
          <FieldActions>
            <Button type="submit" disabled={counting}>
              {counting ? "Counting…" : "Count words"}
            </Button>
          </FieldActions>
        </FieldRows>
      </form>

      {rows.length > 0 && (
        <section className="space-y-3" aria-labelledby="counted">
          <div className="flex items-center justify-between gap-4">
            <h2 id="counted" className="text-base font-semibold">
              {listed.length} {listed.length === 1 ? "article" : "articles"}
            </h2>
            <Button variant="outline" className="min-w-32" onClick={copyColumn}>
              {copied === "yes" ? <CheckIcon /> : <CopyIcon />}
              {copied === "yes"
                ? "Copied"
                : copied === "failed"
                  ? "Couldn't copy"
                  : "Copy counts"}
            </Button>
            <span className="sr-only" role="status">
              {copied === "yes"
                ? "Copied the counts"
                : copied === "failed"
                  ? "Couldn't copy the counts"
                  : ""}
            </span>
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <Table
              ref={table}
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
              <TableHeader>
                <TableRow>
                  <TableHead>Article</TableHead>
                  <TableHead className="text-right">Words</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, index) => (
                  <TableRow key={index} data-words={row.words ?? ""}>
                    {/* only the numbers select, so dragging down the column
                        copies one count per line, as a sheet's column pastes */}
                    <TableCell className="leading-relaxed wrap-anywhere whitespace-normal select-none">
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
                          className="decoration-muted-foreground/40 hover:decoration-foreground underline-offset-4 hover:underline"
                          dangerouslySetInnerHTML={{
                            __html: row.title ?? row.link,
                          }}
                        />
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-right align-top tabular-nums">
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
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              {listed.length > 1 && (
                <TableFooter className="bg-transparent select-none">
                  <TableRow className="hover:bg-transparent">
                    <TableCell className="font-semibold whitespace-normal">
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
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {rows
                        .reduce((sum, row) => sum + (row.words ?? 0), 0)
                        .toLocaleString("en-US")}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </div>
          {rows.some((row) => row.busy) && (
            <p className="text-muted-foreground text-sm">
              WordPress was busy for some; count again in a minute.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
