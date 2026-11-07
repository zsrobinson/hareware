/*
  The archive, built in the browser (ADR 0012). The Worker hands out only the
  Sheet, behind the gate; WordPress's REST API answers any origin, so its posts
  are read from here, and parsing them costs the viewer's CPU rather than the
  Worker's 10 ms.

  The read is five pages of bodies, which WordPress.com throttles when it comes
  often, so the parsed result is kept in the browser's Cache Storage. A copy
  under ten minutes old is used as it is; an older one, up to a day, is shown
  at once while a fresh read happens behind it and replaces it when done.
  Refresh reads past it.
*/

import { fetchGated } from "~/components/gated";
import {
  buildArchive,
  type Archive,
  type SourcePost,
} from "~/lib/credits/archive";
import type { SheetPayload } from "~/lib/credits/load";
import { paragraphs } from "~/lib/credits/parse";
import { labelsIn } from "~/lib/credits/sheet";
import { allPosts, categories } from "~/lib/services/wordpress/posts";
import { breathe } from "~/lib/services/wordpress/request";

/* younger than this, the stored read is used without asking WordPress */
const FRESH_MS = 10 * 60_000;
/* older than this, it is not shown at all: the page waits for a new read */
const STALE_MS = 24 * 60 * 60_000;
/* bump when Snapshot changes shape, so a stored copy of the old one is not read */
const CACHE = "hareware-wordpress";
const KEY = "/wordpress-snapshot-v1";

type Snapshot = {
  posts: SourcePost[];
  categories: [number, string][];
  fetchedAt: string;
};

/* within one page load, every view shares one read */
let memo: { expires: number; snapshot: Promise<Snapshot> } | undefined;
/* and at most one read behind a stale copy */
let behind: Promise<Snapshot> | undefined;

/**
 * the archive; when it was built from a stored read over ten minutes old,
 * `onFresher` is later handed one built from a new read
 */
export async function loadArchive(
  fresh: boolean,
  onFresher?: (archive: Archive) => void,
): Promise<Archive> {
  /* the gate first: someone it refuses never downloads the archive */
  const payload = await fetchGated<SheetPayload>("/api/archive.json");
  const build = (snapshot: Snapshot) => {
    const archive = buildArchive({
      posts: snapshot.posts,
      categories: new Map(snapshot.categories),
      sheet: payload.sheet,
      labels: labelsIn(payload.sheet),
      fetchedAt: snapshot.fetchedAt,
    });
    if (archive.sheet.status === "read") archive.sheet.url = payload.url;
    return archive;
  };

  if (!fresh && !memo) {
    const stored = await fromStorage();
    if (stored && stored.age >= FRESH_MS) {
      behind ??= readAndKeep().finally(() => (behind = undefined));
      behind
        .then((read) => onFresher?.(build(read)))
        /* the stale copy stays on screen; Refresh can try again */
        .catch((error: unknown) =>
          console.warn("[archive] could not read wordpress behind", error),
        );
      return build(stored.snapshot);
    }
  }
  return build(await wordpress(fresh));
}

function wordpress(fresh: boolean): Promise<Snapshot> {
  if (!fresh && memo && memo.expires > Date.now()) return memo.snapshot;

  const snapshot = (async () => {
    if (!fresh) {
      const stored = await fromStorage();
      if (stored && stored.age < FRESH_MS) return stored.snapshot;
    }
    return readAndKeep();
  })();

  memo = { expires: Date.now() + FRESH_MS, snapshot };
  /* a failed read is not kept: the next try reads again */
  snapshot.catch(() => {
    if (memo?.snapshot === snapshot) memo = undefined;
  });
  return snapshot;
}

async function readAndKeep(): Promise<Snapshot> {
  const read = await readWordPress();
  void toStorage(read);
  memo = { expires: Date.now() + FRESH_MS, snapshot: Promise.resolve(read) };
  return read;
}

async function readWordPress(): Promise<Snapshot> {
  /* one after the other: together they are what gets throttled */
  const posts = await allPosts();
  await breathe();
  const sections = await categories();

  return {
    posts: posts.map((post) => ({
      id: post.id,
      publishedAt: post.publishedAt,
      link: post.link,
      title: post.title,
      categoryIds: post.categoryIds,
      paragraphs: paragraphs(post.html),
    })),
    categories: sections.map((category) => [category.id, category.name]),
    fetchedAt: new Date().toISOString(),
  };
}

/* Cache Storage exists only on https and localhost; without it, the read is
   simply not kept between pages */
async function fromStorage(): Promise<
  { snapshot: Snapshot; age: number } | undefined
> {
  try {
    const hit = await (await caches.open(CACHE)).match(KEY);
    if (!hit) return undefined;
    const snapshot = (await hit.json()) as Snapshot;
    const age = Date.now() - Date.parse(snapshot.fetchedAt);
    return age < STALE_MS ? { snapshot, age } : undefined;
  } catch {
    return undefined;
  }
}

async function toStorage(snapshot: Snapshot) {
  try {
    await (await caches.open(CACHE)).put(KEY, Response.json(snapshot));
  } catch (error) {
    console.warn("[archive] could not keep the wordpress read", error);
  }
}
