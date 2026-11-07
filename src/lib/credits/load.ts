/*
  Reads the archive's two sources. WordPress is cached for ten minutes, in the
  isolate and in Cloudflare's cache: five pages of bodies is the request
  pattern WordPress.com throttles. The Sheet is read every time, so an edit
  there shows on the next load.
*/

import { env } from "cloudflare:workers";
import { Sheets } from "~/lib/services/google/sheets";
import { allPosts, categories } from "~/lib/services/wordpress/posts";
import { buildArchive, type Archive, type SourcePost } from "./archive";
import { paragraphs } from "./parse";
import { labelsIn, readSheet, type SheetState } from "./sheet";

const TTL_SECONDS = 10 * 60;
/* bump when SourcePost changes shape, so a cached copy of the old one is not read */
const CACHE_KEY = "https://hareware.internal/archive/wordpress-v1";

type Snapshot = {
  posts: SourcePost[];
  categories: [number, string][];
  fetchedAt: string;
};

let memo: { expires: number; snapshot: Promise<Snapshot> } | undefined;

export async function loadArchive({ fresh = false } = {}): Promise<Archive> {
  const [snapshot, sheet] = await Promise.all([wordpress(fresh), loadSheet()]);

  const archive = buildArchive({
    posts: snapshot.posts,
    categories: new Map(snapshot.categories),
    sheet,
    labels: labelsIn(sheet),
    fetchedAt: snapshot.fetchedAt,
  });
  if (archive.sheet.status === "read" && env.GOOGLE_SHEET_ID)
    archive.sheet.url = `https://docs.google.com/spreadsheets/d/${env.GOOGLE_SHEET_ID.trim()}/edit`;
  return archive;
}

/** the Sheet client, or which settings are missing */
export function sheetsClient(): Sheets | { missing: string[] } {
  const key = env.GOOGLE_SERVICE_ACCOUNT_KEY?.trim();
  const id = env.GOOGLE_SHEET_ID?.trim();
  const missing = [
    !key && "GOOGLE_SERVICE_ACCOUNT_KEY",
    !id && "GOOGLE_SHEET_ID",
  ].filter((name): name is string => Boolean(name));
  if (missing.length > 0) return { missing };

  try {
    return new Sheets(key!, id!);
  } catch (error) {
    return { missing: [`GOOGLE_SERVICE_ACCOUNT_KEY (${String(error)})`] };
  }
}

async function loadSheet(): Promise<SheetState> {
  const client = sheetsClient();
  if (!(client instanceof Sheets))
    return { status: "unconfigured", missing: client.missing };
  return readSheet(client);
}

function wordpress(fresh: boolean): Promise<Snapshot> {
  if (!fresh && memo && memo.expires > Date.now()) return memo.snapshot;

  const snapshot = (async () => {
    if (!fresh) {
      const cached = await fromCache();
      if (cached) return cached;
    }
    const read = await readWordPress();
    await toCache(read);
    return read;
  })();

  memo = { expires: Date.now() + TTL_SECONDS * 1000, snapshot };
  /* a failed read is not kept: the next request tries again */
  snapshot.catch(() => {
    if (memo?.snapshot === snapshot) memo = undefined;
  });
  return snapshot;
}

async function readWordPress(): Promise<Snapshot> {
  /* one after the other: together they are what gets throttled */
  const posts = await allPosts();
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

/* the dom's CacheStorage type, which astro's check uses, has no `default` */
const edgeCache = () => (caches as unknown as { default: Cache }).default;

/* The Cache API does nothing on workers.dev, so a preview relies on the isolate
   alone; the custom domain gets both. */
async function fromCache(): Promise<Snapshot | undefined> {
  try {
    const hit = await edgeCache().match(CACHE_KEY);
    return hit ? ((await hit.json()) as Snapshot) : undefined;
  } catch {
    return undefined;
  }
}

async function toCache(snapshot: Snapshot) {
  try {
    await edgeCache().put(
      CACHE_KEY,
      new Response(JSON.stringify(snapshot), {
        headers: {
          "content-type": "application/json",
          "cache-control": `max-age=${TTL_SECONDS}`,
        },
      }),
    );
  } catch (error) {
    console.warn("[archive] could not cache the wordpress read", error);
  }
}
