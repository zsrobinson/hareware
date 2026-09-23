/* The invocation log: what HareWare did, and nothing authoritative. ADR 0007. */

import { drizzle } from "drizzle-orm/d1";
import { and, desc, eq } from "drizzle-orm";
import { invocations, type Invocation, type Row } from "./db/schema";

export type { Invocation, Row };

const now = () => Math.floor(Date.now() / 1000);

/**
 * writes one row. Never throws, so a failed write cannot fail what it records.
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
 * How the last run of an action from this `source` ended, or null when unknown.
 * Per source, so a failed manual run cannot suppress the next cron alert.
 */
export async function lastOutcome(
  db: D1Database | undefined,
  action: Row["action"],
  source: Row["source"],
): Promise<Row["outcome"] | null> {
  if (!db) return null;

  try {
    const [row] = await drizzle(db)
      .select({ outcome: invocations.outcome })
      .from(invocations)
      .where(
        and(eq(invocations.action, action), eq(invocations.source, source)),
      )
      .orderBy(desc(invocations.at))
      .limit(1);

    return row?.outcome ?? null;
  } catch (error) {
    console.error("[log] could not read the last outcome", error);
    return null;
  }
}
