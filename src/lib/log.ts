/*
  a record of what HareWare did, so that a quiet morning can be told apart from
  a broken one. see ADR 0007.

  nothing in here is authoritative: every row is derived from something notion,
  wordpress or discord already knows, so dropping the database costs the club
  its history and nothing else. that is the rule ADR 0006 set for D1 and the
  reason this is allowed to exist
*/

import { drizzle } from "drizzle-orm/d1";
import { desc, eq } from "drizzle-orm";
import { invocations, type Invocation, type Row } from "./db/schema";

export type { Invocation, Row };

const now = () => Math.floor(Date.now() / 1000);

/**
 * writes one row, and never throws.
 *
 * a reminder that posted correctly must not be reported as failed because the
 * log was unreachable, and the log is the less important of the two
 */
export async function record(
  db: D1Database | undefined,
  entry: Omit<Invocation, "at">,
) {
  if (!db) return;

  try {
    await drizzle(db)
      .insert(invocations)
      .values({ ...entry, at: now() });
  } catch (error) {
    console.error("[log] could not record an invocation", error);
  }
}

/** the newest invocations, for the log page */
export function recent(db: D1Database, limit = 100): Promise<Row[]> {
  return drizzle(db)
    .select()
    .from(invocations)
    .orderBy(desc(invocations.at))
    .limit(limit);
}

/**
 * how the last recorded run of an action ended, or null if there is no record.
 *
 * used to tell a new failure from a continuing one. null means "nothing to
 * compare against" — no database, no history, or a read that failed — and the
 * caller treats all three as "this is news", because a missing log is a reason
 * to say more rather than less
 */
export async function lastOutcome(
  db: D1Database | undefined,
  action: Row["action"],
): Promise<Row["outcome"] | null> {
  if (!db) return null;

  try {
    const [row] = await drizzle(db)
      .select({ outcome: invocations.outcome })
      .from(invocations)
      .where(eq(invocations.action, action))
      .orderBy(desc(invocations.at))
      .limit(1);

    return row?.outcome ?? null;
  } catch (error) {
    console.error("[log] could not read the last outcome", error);
    return null;
  }
}
