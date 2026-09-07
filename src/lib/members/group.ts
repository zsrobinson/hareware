/*
  the Google Group, which HareWare cannot touch and therefore does not sync.

  the group is where announcements actually reach people, because most students
  have their discord notifications off. it is also unwritable: the Admin SDK
  Directory API wants Workspace administrator credentials on the domain that
  owns the group, the club's group is owned by a consumer gmail account with no
  domain and no admin console, and a Q2 2026 change to how google classifies
  external members narrowed non-admin additions further. There is no supported
  path, so ADR 0010 does not pretend there is one.

  What is left is an export with a watermark: remember when the additions were
  last done, list everyone approved since, and let a human paste them into the
  bulk-add field. Confirming advances the watermark.

  the watermark lives in D1 and is authoritative over nothing. If it drifts the
  club re-adds somebody who is already a member, which google treats as a no-op
  — a harmless failure mode, and the reason this beats a maintained *In Group*
  checkbox that somebody would eventually forget to tick.

  D1 is optional everywhere in this codebase, so both reads and writes here take
  `undefined` and degrade rather than throw, the same way `~/lib/log` does. With
  no database the watermark reads null, which means "everybody is pending" —
  erring toward showing the club too many addresses rather than too few.
*/

import { drizzle } from "drizzle-orm/d1";
import { groupWatermark as watermarks } from "~/lib/db/schema";
import type { Application } from "~/lib/services/discord/join-requests";

/** the one row's key. there is one group, so there is one watermark */
const ROW = 1;

/** the domains that auto-add, spelled as the university spells them */
const UNIVERSITY_DOMAINS = ["terpmail.umd.edu", "umd.edu"];

/**
 * the day the group was last brought up to date, or null if never.
 *
 * null covers three cases that the caller treats identically — no database, no
 * row yet, and a read that failed — because all three mean "we cannot say what
 * has already been added", and the honest answer to that is the whole list
 */
export async function groupWatermark(
  db: D1Database | undefined,
): Promise<string | null> {
  if (!db) return null;

  try {
    const [row] = await drizzle(db)
      .select({ at: watermarks.at })
      .from(watermarks)
      .limit(1);

    return row?.at ?? null;
  } catch (error) {
    console.error("[group] could not read the watermark", error);
    return null;
  }
}

/**
 * records that the additions have been done up to `at`.
 *
 * `at` is the `applied` day of the newest application in the list that was
 * pasted — **not** today. Today's date would claim credit for applications
 * that have not arrived yet, and the next run would start after them.
 *
 * an upsert on a fixed key rather than an append: the club does not need a
 * history of when it pasted emails, only where it got to. Never throws — the
 * addresses were pasted into google whether or not this row was written, and
 * losing the watermark costs a duplicate paste next time, which costs nothing
 */
export async function markGroupSynced(
  db: D1Database | undefined,
  at: string,
): Promise<void> {
  if (!db) return;

  try {
    await drizzle(db)
      .insert(watermarks)
      .values({ id: ROW, at })
      .onConflictDoUpdate({ target: watermarks.id, set: { at } });
  } catch (error) {
    console.error("[group] could not advance the watermark", error);
  }
}

/**
 * everyone approved on or since the watermark, oldest first.
 *
 * **on or since**, which re-offers a day already done. That looks like a bug
 * and is the only safe reading: an application is dated to the day, so somebody
 * who applies in the evening of a day whose additions were done at noon is
 * indistinguishable from somebody who was in the list already. Excluding the
 * boundary day would drop that person permanently and silently — the exact
 * failure ADR 0010 refuses a cursor over.
 *
 * the cost is that the last day's addresses appear once more. Google treats
 * re-adding an existing member as a no-op, so the club pastes a few duplicates
 * and nothing happens. That is the trade this whole mechanism is built on: a
 * harmless repeat beats a silent omission.
 *
 * oldest first because the club pastes them in order and the oldest have been
 * waiting longest — and because a stable order makes two people looking at the
 * page see the same thing.
 *
 * pure, and takes the watermark rather than reading it, so the rule can be
 * tested without a database
 */
export function pendingForGroup(
  applications: Application[],
  watermark: string | null,
): Application[] {
  return applications
    .filter((application) => !watermark || application.applied >= watermark)
    .sort((a, b) => a.applied.localeCompare(b.applied));
}

/**
 * whether an address needs an invitation rather than a bulk add.
 *
 * seven of the fifty-one applications measured for ADR 0010 were outside the
 * university's two domains, and google does not auto-add those — they have to
 * be invited and accept. The list flags them rather than dropping them, because
 * an address nobody can add is still an address somebody has to deal with.
 *
 * an address we do not have counts as external. it is not a member of the
 * university's domains on any reading, and a missing email flagged for a human
 * is better than a missing email silently passed over
 */
export function isExternalAddress(email: string | null): boolean {
  const domain = (email ?? "").trim().toLowerCase().split("@")[1] ?? "";

  return !UNIVERSITY_DOMAINS.includes(domain);
}
