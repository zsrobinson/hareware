/*
  a record of what HareWare did, so that a quiet morning can be told apart from
  a broken one. see ADR 0007.

  nothing in here is authoritative: every row is derived from something notion,
  wordpress or discord already knows, so dropping the database costs the club
  its history and nothing else. that is the rule ADR 0006 set for D1 and the
  reason this is allowed to exist
*/

import { drizzle } from "drizzle-orm/d1";
import { and, desc, isNotNull, lt } from "drizzle-orm";
import { invocations, type Invocation, type Row } from "./db/schema";

export type { Invocation, Row };

/** how long a raw payload is kept before the summary is all that remains */
export const PAYLOAD_DAYS = 30;

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
 * drops the raw payloads older than `PAYLOAD_DAYS`, leaving their summaries.
 *
 * the sensitive half of the log ages out on its own, so the role gate protects
 * a shrinking window rather than a growing archive
 */
export async function prunePayloads(db: D1Database | undefined) {
  if (!db) return 0;

  const cutoff = now() - PAYLOAD_DAYS * 24 * 60 * 60;

  const result = await drizzle(db)
    .update(invocations)
    .set({ payload: null })
    .where(and(lt(invocations.at, cutoff), isNotNull(invocations.payload)));

  return result.meta.changes ?? 0;
}
