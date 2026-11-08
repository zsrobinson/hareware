/*
  The Social Reminder's next run and log. The page is a static shell (ADR
  0012); this asks the gated /api/reminder.json, which reads D1 and plans the
  next run, and draws the refusal itself when the answer is no.
*/

import { useQuery } from "@tanstack/react-query";
import { queryClient } from "~/lib/query-client";
import { Refused } from "~/lib/gated";
import { useHydrated } from "~/lib/use-hydrated";
import { DenialMessage } from "./gated";
import { PageActions } from "./page-actions";
import { reminderQuery } from "./queries";
import { ReadFailed, Reading } from "./read-state";
import { ReminderLog } from "./reminder-log";

export function ReminderPage() {
  const hydrated = useHydrated();
  const query = useQuery(reminderQuery, queryClient);

  /* a refusal wins over anything already held, as when a session ends */
  if (query.error instanceof Refused)
    return <DenialMessage refusal={query.error.body} />;
  /* what was read stays on screen if a later read fails */
  if (!hydrated || !query.data)
    return hydrated && query.isError ? (
      <ReadFailed
        message={query.error.message}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    ) : (
      <Reading>Reading the log…</Reading>
    );

  const view = query.data;
  const { next } = view;

  return (
    <div className="space-y-10">
      {/* where and when, every day: true of the whole page */}
      <PageActions>
        <span className="text-muted-foreground text-sm">
          {view.schedule} Eastern, daily
        </span>
      </PageActions>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h2 className="text-base font-semibold">Next run</h2>
          <span className="text-muted-foreground text-sm">
            {next.at}
            {next.pings && <> · pings {next.pings}</>}
          </span>
        </div>
        {next.problem ? (
          <p className="text-destructive text-sm">{next.problem}</p>
        ) : next.articles.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border px-4 py-6 text-center text-sm">
            Nothing new since {next.since}.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border text-sm">
            {next.articles.map((article) => (
              <li
                key={article.link}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-3 py-2.5"
              >
                <a
                  href={article.link}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {article.title}
                </a>
                <span className="text-muted-foreground text-xs whitespace-nowrap">
                  {article.at}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">History</h2>
        {view.logError && (
          <p className="text-destructive text-sm">{view.logError}</p>
        )}
        <ReminderLog rows={view.rows} names={view.names} />
      </section>
    </div>
  );
}
