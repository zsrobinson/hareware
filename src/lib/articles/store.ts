/*
  the article index in D1: the 138 rows an autocomplete searches, and nothing
  else.

  nothing here is authoritative. every command re-reads its page from notion
  before it writes, so the worst a stale row can do is show a label a minute
  old — which is why every function in this file swallows its own failures
  rather than letting the index break the command that was updating it, the
  same bargain `record()` makes in ~/lib/log. see ADR 0009.

  the decisions live in `wins` and `diffPageIds`, which are
  plain functions over plain data; everything else is a thin wrapper around one
  of them.
*/

import { drizzle } from "drizzle-orm/d1";
import { desc, eq } from "drizzle-orm";
import {
  articleIndex,
  type ArticleIndexEntry,
  type ArticleRow,
} from "~/lib/db/schema";

/** an index row as a caller supplies it; `syncedAt` is ours, not theirs */
export type IndexEntry = Omit<ArticleIndexEntry, "syncedAt">;

/**
 * how much of the index one autocomplete reads.
 *
 * comfortably above the 139 rows there are, because the ranking happens after
 * the read: a limit that bit would silently hide the oldest articles from
 * search rather than from the dropdown
 */
export const INDEX_READ_LIMIT = 500;

export type UpsertResult = {
  status: "written" | "stale" | "unavailable";
};

export type ReplaceResult =
  | { status: "replaced"; added: string[]; removed: string[] }
  | { status: "refused" }
  | { status: "unavailable" };

const now = () => Math.floor(Date.now() / 1000);

/**
 * whether a write may land on the row that is already there.
 *
 * `last_edited_time` has **minute** resolution, which is the whole subtlety.
 * the rule was "strictly newer", and that threw away a second edit made in the
 * same minute as the first — so somebody typing a headline in notion watched
 * discord keep the version from nine seconds ago until the next rebuild. a
 * guaranteed, visible wrong answer.
 *
 * "newer or equal" is right because of where these writes come from: every
 * non-authoritative one is a **fresh fetch of the page**, never a delta applied
 * blind. what it carries is the page as notion had it at fetch time, so a late
 * or out-of-order webhook still writes the current truth — the thing the guard
 * was protecting against cannot happen. what it still rejects is a genuinely
 * older snapshot, which is a rebuild that read before an edit and wrote after.
 *
 * a write-through keeps winning outright: it holds the page notion returned
 * from our own PATCH, and a fetch already in flight when that PATCH landed is
 * the one case where equal timestamps hide a real ordering.
 */
export function wins(
  incoming: string,
  stored: string | undefined,
  authoritative: boolean,
): boolean {
  if (stored === undefined) return true;
  return authoritative ? true : incoming >= stored;
}

/** what a full replace changed, so a caller can notice webhooks stopped */
export function diffPageIds(before: string[], after: string[]) {
  const had = new Set(before);
  const has = new Set(after);

  return {
    added: after.filter((id) => !had.has(id)),
    removed: before.filter((id) => !has.has(id)),
  };
}

/**
 * the index, most recently edited first.
 *
 * the whole table rather than a filtered query: it is 139 rows, the matching
 * is a fuzzy one that sql cannot express, and the `like` clause this replaced
 * spent a day emitting an invalid escape character — failing, as every failure
 * on this path does, by showing an empty dropdown.
 *
 * an empty result is what a discord autocomplete shows for "no matches", and
 * an unreachable index has nothing better to offer, so a failure is logged and
 * answered the same way — the alternative is discord's "didn't respond in
 * time" on every keystroke.
 */
export async function recent(
  db: D1Database,
  limit = INDEX_READ_LIMIT,
): Promise<ArticleRow[]> {
  try {
    return await drizzle(db)
      .select()
      .from(articleIndex)
      .orderBy(desc(articleIndex.lastEdited))
      .limit(limit);
  } catch (error) {
    console.error("[articles] could not read the index", error);
    return [];
  }
}

/**
 * writes one row if `wins` says it may.
 *
 * the guard is read-then-write rather than a conditional `on conflict` so that
 * the caller is told which of the three outcomes happened: a dropped webhook
 * is normal, an unreachable index is not, and flattening them into a boolean
 * is how a broken index would look like a quiet one.
 */
export async function upsert(
  db: D1Database,
  entry: IndexEntry,
  { authoritative }: { authoritative: boolean },
): Promise<UpsertResult> {
  try {
    const client = drizzle(db);

    const [current] = await client
      .select({ lastEdited: articleIndex.lastEdited })
      .from(articleIndex)
      .where(eq(articleIndex.pageId, entry.pageId))
      .limit(1);

    if (!wins(entry.lastEdited, current?.lastEdited, authoritative))
      return { status: "stale" };

    const row = { ...entry, syncedAt: now() };

    await client
      .insert(articleIndex)
      .values(row)
      .onConflictDoUpdate({ target: articleIndex.pageId, set: row });

    return { status: "written" };
  } catch (error) {
    console.error("[articles] could not write an index row", error);
    return { status: "unavailable" };
  }
}

/**
 * the hourly rebuild: the whole table, replaced.
 *
 * a full replace rather than an upsert per row because that is the only thing
 * that removes an article whose `page.deleted` webhook was one of the ones
 * notion dropped. the diff it returns is how a caller notices that delivery
 * stopped — an article that appears here having never arrived by webhook is
 * the same shape of failure as a reminder that quietly did not run.
 *
 * an empty set is refused. notion answering with no rows is far more likely to
 * be a failure we did not recognise than a club that deleted all 138 articles,
 * and emptying the index would take autocomplete down until the next hour.
 */
/**
 * how many rows go in one insert.
 *
 * d1 binds at most **100** variables to a query, which is far below sqlite's
 * own ceiling of 999 — reasoning from sqlite's number is how this was wrong
 * twice. a row is nine columns, so eleven rows is the true limit; ten leaves
 * room for a column being added without that quietly becoming the reason a
 * rebuild fails.
 *
 * the test asserts the d1 limit rather than sqlite's, so a future change that
 * reaches for the larger number fails there instead of in production
 */
const INSERT_CHUNK = 10;

/** splits into runs of at most `size`, preserving order */
export function chunk<T>(items: T[], size: number): T[][] {
  const parts: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    parts.push(items.slice(i, i + size));
  }

  return parts;
}

export async function replaceAll(
  db: D1Database,
  entries: IndexEntry[],
): Promise<ReplaceResult> {
  if (entries.length === 0) return { status: "refused" };

  try {
    const client = drizzle(db);
    const syncedAt = now();

    const before = await client
      .select({ pageId: articleIndex.pageId })
      .from(articleIndex);

    /*
      one batch, so a failure part way through cannot leave the index emptied —
      and chunked, because d1 binds at most a hundred variables to a query and
      a row here is nine of them. the whole table in one insert is about 1242,
      which d1 rejects outright: the index stayed empty while the picker options
      beside it wrote fine, so it read as "d1 is broken" rather than as a limit
    */
    const rows = entries.map((entry) => ({ ...entry, syncedAt }));
    const inserts = chunk(rows, INSERT_CHUNK).map((part) =>
      client.insert(articleIndex).values(part),
    );

    await client.batch([client.delete(articleIndex), ...inserts]);

    return {
      status: "replaced",
      ...diffPageIds(
        before.map((row) => row.pageId),
        entries.map((entry) => entry.pageId),
      ),
    };
  } catch (error) {
    console.error("[articles] could not rebuild the index", error);
    return { status: "unavailable" };
  }
}

/** drops one row, for a `page.deleted` webhook */
export async function remove(db: D1Database, pageId: string): Promise<void> {
  try {
    await drizzle(db)
      .delete(articleIndex)
      .where(eq(articleIndex.pageId, pageId));
  } catch (error) {
    console.error("[articles] could not remove an index row", error);
  }
}
