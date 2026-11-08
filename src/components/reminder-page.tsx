/*
  The Social Reminder's cards and log. The page is a static shell (ADR 0012);
  this asks the gated /api/reminder.json, which reads D1 and plans the next run,
  and draws the refusal itself when the answer is no.
*/

import { useQuery } from "@tanstack/react-query";
import { queryClient } from "~/lib/query-client";
import { Refused } from "~/lib/gated";
import { useHydrated } from "~/lib/use-hydrated";
import { DenialMessage } from "./gated";
import { reminderQuery } from "./queries";
import { ReadFailed, Reading } from "./read-state";
import { OUTCOMES, ReminderLog } from "./reminder-log";

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
  const lastRun = view.rows.find((row) => row.action === "social-ping");
  const { next } = view;

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground -mt-4 text-sm">
        In {view.schedule} Eastern each day.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="bg-card space-y-2 rounded-xl border p-4 sm:p-5">
          <h2 className="font-semibold">Last run</h2>
          {lastRun ? (
            <>
              <p className="font-semibold">
                {OUTCOMES[lastRun.outcome]}
                <span className="text-muted-foreground font-normal">
                  {" "}
                  · {lastRunLabel(lastRun.at)}
                </span>
              </p>
              <p className="text-muted-foreground text-sm">{lastRun.summary}</p>
            </>
          ) : (
            <p className="text-muted-foreground text-sm">
              {view.logError ?? "No run recorded yet."}
            </p>
          )}
        </section>

        <section className="bg-card space-y-2 rounded-xl border p-4 sm:p-5">
          <h2 className="font-semibold">Next run</h2>
          <p className="font-semibold">
            {next.at}
            {next.pings && (
              <span className="text-muted-foreground font-normal">
                {" "}
                · pings {next.pings}
              </span>
            )}
          </p>
          {next.problem ? (
            <p className="text-destructive text-sm">{next.problem}</p>
          ) : next.articles.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nothing new since {next.since}.
            </p>
          ) : (
            <>
              <p className="text-muted-foreground text-sm">
                Would announce so far ({next.articles.length}):
              </p>
              <ul className="divide-y rounded-lg border text-sm">
                {next.articles.map((article) => (
                  <li
                    key={article.link}
                    className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2"
                  >
                    <a
                      href={article.link}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium hover:underline"
                    >
                      {article.title}
                    </a>
                    <span className="text-muted-foreground text-xs">
                      {article.at}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>

      <section className="space-y-2">
        <div>
          <h2 className="font-semibold">History</h2>
          <p className="text-muted-foreground text-sm">
            Every run, and every time someone marks an article posted or not
            posted in Discord.
          </p>
        </div>
        {view.logError && (
          <p className="text-destructive text-sm">{view.logError}</p>
        )}
        <ReminderLog rows={view.rows} names={view.names} />
      </section>
    </div>
  );
}

/* "Sat, Nov 7, 8:00 AM", as the server writes the other times on the page */
const lastRunLabel = (at: number) =>
  new Date(at * 1000)
    .toLocaleString("en-US", {
      timeZone: "America/New_York",
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
    /* newer ICU puts a narrow no-break space before AM */
    .replace(/\u202f/g, " ");
