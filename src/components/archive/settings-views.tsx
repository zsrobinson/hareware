import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import type { Page } from "~/lib/credits/sheet";
import { readSheetPayload, SHEET_KEY } from "./archive-data";
import { formatDateTime } from "./dates";
import { starterOf, strayRows, usePageViews } from "./saved-views";
import { Confirm, useViewWriter } from "./view-actions";
import { restoreIntent } from "./view-writes";

/*
  Settings' list of the board's views: each page's, who saved each and when,
  the rows that could not be read, whether a page still shows its starter
  set, and a way back to it (ADR 0015).
*/

const PAGE_NAMES: Record<Page, string> = {
  articles: "Articles",
  people: "People",
};

export function SavedViews({
  list,
  row,
}: {
  /** the bordered list Settings keeps its rows in */
  list: string;
  row: string;
}) {
  const { data } = useQuery({
    queryKey: SHEET_KEY,
    queryFn: readSheetPayload,
    staleTime: 60_000,
  });
  const stray = strayRows(data);
  return (
    <div className="space-y-6">
      <PageViewsList page="articles" list={list} row={row} />
      <PageViewsList page="people" list={list} row={row} />
      {stray.length > 0 && (
        <Unreadable rows={stray} what="for no page HareWare has" />
      )}
    </div>
  );
}

function PageViewsList({
  page,
  list,
  row,
}: {
  page: Page;
  list: string;
  row: string;
}) {
  const views = usePageViews(page);
  const [asking, setAsking] = useState(false);
  const writer = useViewWriter(
    page,
    views ?? { status: "starter", views: [], unreadable: [] },
  );
  if (!views) return null;
  const name = PAGE_NAMES[page];
  const starter = starterOf(page).map((saved) => saved.view);
  const status =
    views.status === "starter"
      ? `${name} shows the starter views; they will be saved to the Sheet the first time anyone changes one.`
      : views.status === "saved"
        ? `${name}'s views are the Sheet's.`
        : views.reason;
  /* a page whose rows could not be read can be restored; one with none
     already shows its starter set */
  const restorable =
    views.status === "saved" ||
    (views.status === "unsaved" && views.unreadable.length > 0);

  return (
    <div className="space-y-2">
      {writer.dialog}
      {asking && (
        <Confirm
          title={`Restore ${name}'s starter views?`}
          description={`Every view on ${name} is replaced, for everyone, by the views HareWare started with. Views the board added there go.`}
          confirm="Restore"
          onClose={() => setAsking(false)}
          onConfirm={() => {
            setAsking(false);
            void writer.write(() => restoreIntent(starter), {
              done: `Restored the starter views on ${name}`,
            });
          }}
        />
      )}
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{name}</h3>
        {restorable && (
          <Button
            variant="outline"
            size="sm"
            disabled={writer.busy}
            onClick={() => setAsking(true)}
          >
            Restore starter views
          </Button>
        )}
      </div>
      <p className="text-muted-foreground text-sm">{status}</p>
      <ul className={list}>
        {views.views.map(({ view, updatedAt, updatedBy }) => (
          <li key={view.id} className={row}>
            <span className="min-w-0 flex-1 truncate">{view.label}</span>
            <span className="text-muted-foreground shrink-0 text-xs">
              {updatedAt
                ? `Saved by ${updatedBy || "someone"}, ${formatDateTime(updatedAt)}`
                : "Starter view"}
            </span>
          </li>
        ))}
      </ul>
      {views.unreadable.length > 0 && <Unreadable rows={views.unreadable} />}
    </div>
  );
}

function Unreadable({
  rows,
  what = "",
}: {
  rows: { row: number; id: string; reason: string }[];
  what?: string;
}) {
  return (
    <div className="space-y-1 text-sm">
      <p className="font-medium">
        {rows.length} {rows.length === 1 ? "view" : "views"} couldn't be read
        {what && ` ${what}`}
      </p>
      <ul className="text-muted-foreground space-y-0.5">
        {rows.map((each) => (
          <li key={each.row}>
            Views, row {each.row}: {each.id || "no id"}, {each.reason}
          </li>
        ))}
      </ul>
    </div>
  );
}
