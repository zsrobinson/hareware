/*
  the hourly pass that creates a Members row for each approved application that
  matches nobody on the roster, and leaves the rest for the reconciler. The
  read is stateless; ADR 0010 says why.
*/

import type { EasternNow } from "~/lib/eastern";
import { misconfigured, ok, skipped, type Result } from "~/lib/result";
import { record } from "~/lib/log";
import { plural } from "~/lib/utils";
import { approvedApplications } from "./applications";
import { resolveApplications, safeToCreate, type Resolution } from "./match";
import { people } from "./roster";
import { createFromApplication } from "./write";

/* creates go out one at a time with this gap, inside notion's budget of about
   three requests a second; a failure partway is picked up next hour */
const BETWEEN_WRITES_MS = 350;

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function syncApplications(
  env: Env,
  _eastern: EasternNow,
): Promise<Result> {
  const token = env.NOTION_TOKEN;
  const bot = env.DISCORD_BOT_TOKEN;
  if (!token || !bot) {
    const missing = [!token && "NOTION_TOKEN", !bot && "DISCORD_BOT_TOKEN"];
    return misconfigured(
      `application sync unset: ${missing.filter(Boolean).join(", ")}`,
    );
  }

  const [applications, roster] = await Promise.all([
    approvedApplications(bot),
    people(token),
  ]);

  const resolutions = resolveApplications(roster, applications);
  const creatable = safeToCreate(resolutions);

  if (creatable.length === 0)
    return skipped(
      `No new applications out of ${applications.length}. ${leftovers(resolutions)}`,
    );

  if (env.REMINDERS_DRY_RUN)
    return ok(
      `Would create ${plural(creatable.length, "member")} from applications. ${leftovers(resolutions)}`,
    );

  let created = 0;
  for (const application of creatable) {
    if (created > 0) await pause(BETWEEN_WRITES_MS);
    await createFromApplication(token, application);
    created += 1;

    /* one row per member, so the log says where each row came from. A roster
       edit, not the run's action: `reportFailure` reads the last row under
       that action to decide whether a failure is new */
    await record(env.DB, {
      source: "cron",
      action: "roster-edit",
      outcome: "ok",
      summary: `created a Members row for ${application.name ?? application.username} from their application`,
    });
  }

  return ok(
    `Created ${plural(created, "member")} from applications. ${leftovers(resolutions)}`,
  );
}

/* keyed by every status the cron defers on, so a new arm on `Resolution` is a
   compile error here */
const DEFERS: Record<
  Exclude<Resolution["status"], "new" | "linked">,
  (n: number) => string
> = {
  linkable: (n) => `${n} to link`,
  similar: (n) => `${n} near an existing name`,
  ambiguous: (n) => `${n} ambiguous`,
  conflicted: (n) => `${n} conflicted`,
  incomplete: (n) => `${n} missing a name or email`,
};

/** the summary's second sentence: what is waiting on the reconciler */
function leftovers(resolutions: Resolution[]): string {
  const counted = Object.entries(DEFERS).map(([status, say]) => ({
    say,
    n: resolutions.filter((one) => one.status === status).length,
  }));

  const total = counted.reduce((sum, one) => sum + one.n, 0);
  if (total === 0) return "Nothing is waiting on the reconciler.";

  const why = counted.filter((one) => one.n > 0).map((one) => one.say(one.n));

  return `${total} need${total === 1 ? "s" : ""} review on the reconciler (${why.join(", ")}).`;
}
