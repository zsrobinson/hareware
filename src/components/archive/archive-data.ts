/*
  The archive, built in the browser (ADR 0012), as two queries and what they
  make together.

  The Sheet comes from the gated /api/archive.json, and is asked first, so
  someone the gate refuses never downloads WordPress. It is never stored: real
  names must not outlive the tab.

  WordPress's posts are read from here: five pages of bodies, which WordPress
  throttles when they come often. So the parsed read is kept in Cache Storage
  and handed to the query with the age it really has. Under ten minutes old it
  is used as it is; older, up to a day, it is shown at once while the query
  reads WordPress behind it, which is TanStack's own stale-while-revalidate.
  The pages say which is happening.

  Views are a third read, of Jetpack's counts through the gated /api/stats,
  kept the same way. They are merged onto the archive when they arrive, and
  never hold it up: until then, and when they fail, every article's views
  are unavailable, not zero (~/lib/credits/views).
*/

import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { fetchGated, Refused } from "~/lib/gated";
import {
  buildArchive,
  type Archive,
  type SourcePost,
} from "~/lib/credits/archive";
import type { SheetPayload } from "~/lib/credits/load";
import { bodyWords, paragraphs } from "~/lib/credits/parse";
import { labelsIn } from "~/lib/credits/sheet";
import { withViews } from "~/lib/credits/views";
import { allPosts, categories } from "~/lib/services/wordpress/posts";
import {
  postViewsOf,
  postViewsUrl,
  type PostViews,
} from "~/lib/services/wordpress/stats";

/* younger than this, the read is used without asking WordPress */
const FRESH_MS = 10 * 60_000;
/* older than this, a stored read is not shown at all */
const STALE_MS = 24 * 60 * 60_000;
/* bump when Snapshot or Views changes shape, so a stored copy of the old one
   is not read */
const CACHE = "hareware-wordpress";
const SNAPSHOT_STORED = "/wordpress-snapshot-v2";
const VIEWS_STORED = "/wordpress-views-v1";

export const SHEET_KEY = ["sheet"] as const;
const WORDPRESS_KEY = ["wordpress"] as const;
const VIEWS_KEY = ["views"] as const;
const RESTORED_KEY = ["wordpress", "restored"] as const;

type Stored = { fetchedAt: string };

type Snapshot = Stored & {
  posts: SourcePost[];
  categories: [number, string][];
};

type Views = Stored & { posts: PostViews };

/* ------------------------------------------------------------------------ */
/* the read in flight, page by page, for the first load's message */

export type Progress = { read: number; total: number };
let progress: Progress = { read: 0, total: 0 };
const listeners = new Set<() => void>();
function report(next: Progress) {
  progress = next;
  for (const listener of listeners) listener();
}
/** how far the read of WordPress has got */
export function useReadProgress(): Progress {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => progress,
    () => progress,
  );
}

/* `fresh` goes past every cache, for Refresh: back from fixing an article in
   WordPress, a cached read could still show it unfixed */
async function readSnapshot(fresh = false): Promise<Snapshot> {
  report({ read: 0, total: 0 });
  /* one after the other: sent to WordPress directly, together they are what
     gets throttled */
  const posts = await allPosts((read, total) => report({ read, total }), {
    fresh,
  });
  const sections = await categories({ fresh });

  const snapshot: Snapshot = {
    posts: posts.map((post) => ({
      id: post.id,
      publishedAt: post.publishedAt,
      link: post.link,
      title: post.title,
      categoryIds: post.categoryIds,
      paragraphs: paragraphs(post.html),
      words: bodyWords(post.html),
    })),
    categories: sections.map((category) => [category.id, category.name]),
    fetchedAt: new Date().toISOString(),
  };
  void toStorage(SNAPSHOT_STORED, snapshot);
  return snapshot;
}

/* every post's views, by month; never asked past a cache, since WordPress
   answers a signed-in read from its server anyway */
async function readViews(): Promise<Views> {
  const asked = new Date();
  const views: Views = {
    posts: postViewsOf(await fetchGated<unknown>(postViewsUrl(asked)), asked),
    fetchedAt: new Date().toISOString(),
  };
  void toStorage(VIEWS_STORED, views);
  return views;
}

/* Cache Storage exists only on https and localhost; without it, the read is
   simply not kept between visits */
async function fromStorage(key: string): Promise<Stored | undefined> {
  try {
    const hit = await (await caches.open(CACHE)).match(key);
    if (!hit) return undefined;
    const stored = (await hit.json()) as Stored;
    return Date.now() - Date.parse(stored.fetchedAt) < STALE_MS
      ? stored
      : undefined;
  } catch {
    return undefined;
  }
}

async function toStorage(key: string, read: Stored) {
  try {
    await (await caches.open(CACHE)).put(key, Response.json(read));
  } catch (error) {
    console.warn(`[archive] could not keep ${key}`, error);
  }
}

/* the stored reads, handed to their queries as of when they were made, so
   each query's own staleness decides whether to read again */
async function restore(queryClient: QueryClient): Promise<true> {
  const into = async (queryKey: readonly string[], key: string) => {
    if (queryClient.getQueryData(queryKey)) return;
    const stored = await fromStorage(key);
    if (stored && !queryClient.getQueryData(queryKey))
      queryClient.setQueryData(queryKey, stored, {
        updatedAt: Date.parse(stored.fetchedAt),
      });
  };
  await Promise.all([
    into(WORDPRESS_KEY, SNAPSHOT_STORED),
    into(VIEWS_KEY, VIEWS_STORED),
  ]);
  return true;
}

/* built once per pair of reads: moving between the archive pages keeps both,
   so the next page draws without building again */
const built = new WeakMap<Snapshot, WeakMap<SheetPayload, Archive>>();
function build(snapshot: Snapshot, payload: SheetPayload): Archive {
  let bySheet = built.get(snapshot);
  if (!bySheet) built.set(snapshot, (bySheet = new WeakMap()));
  let archive = bySheet.get(payload);
  if (!archive) {
    archive = buildArchive({
      posts: snapshot.posts,
      categories: new Map(snapshot.categories),
      sheet: payload.sheet,
      labels: labelsIn(payload.sheet),
      fetchedAt: snapshot.fetchedAt,
    });
    if (archive.sheet.status === "read") archive.sheet.url = payload.url;
    bySheet.set(payload, archive);
  }
  return archive;
}

/* views merged on, once per archive and read of them, or failure to read */
const viewed = new WeakMap<Archive, WeakMap<Views | Error, Archive>>();
function withRead(archive: Archive, read: Views | Error | null): Archive {
  if (!read) return archive;
  let byRead = viewed.get(archive);
  if (!byRead) viewed.set(archive, (byRead = new WeakMap()));
  let merged = byRead.get(read);
  if (!merged) {
    merged = withViews(
      archive,
      read instanceof Error
        ? { status: "unavailable", reason: read.message }
        : { status: "read", ...read },
    );
    byRead.set(read, merged);
  }
  return merged;
}

/* ------------------------------------------------------------------------ */

export type ArchiveState =
  /** the gate has not answered yet */
  | { status: "access" }
  /** admitted, and WordPress is being read for the first time */
  | { status: "reading" }
  | { status: "refused"; refusal: Refused }
  /** nothing to show: the gate or the first read failed */
  | { status: "failed"; error: Error; retry: () => void; retrying: boolean }
  | {
      status: "ready";
      archive: Archive;
      /** when the Sheet shown was read, which is not when WordPress was */
      sheetReadAt: string;
      /** WordPress is being read behind what is shown */
      checking: boolean;
      /** the last read behind failed, so what is shown is older */
      checkFailed: Error | null;
      /** the same two for views, whose own state is `archive.views` */
      viewsChecking: boolean;
      viewsCheckFailed: Error | null;
      /** reads the Sheet and WordPress again; rejects if either fails */
      refresh: () => Promise<void>;
    };

export function useArchive(): ArchiveState {
  const queryClient = useQueryClient();
  const sheet = useQuery({
    queryKey: SHEET_KEY,
    queryFn: () => fetchGated<SheetPayload>("/api/archive.json"),
    staleTime: 60_000,
  });
  const restored = useQuery({
    queryKey: RESTORED_KEY,
    queryFn: () => restore(queryClient),
    /* the gate first */
    enabled: sheet.isSuccess,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  const wordpress = useQuery({
    queryKey: WORDPRESS_KEY,
    queryFn: () => readSnapshot(),
    enabled: restored.isSuccess,
    staleTime: FRESH_MS,
    gcTime: Infinity,
    /* readSnapshot already waits out WordPress's refusals */
    retry: false,
    /* the posts are large and never compared piece by piece */
    structuralSharing: false,
  });
  const views = useQuery({
    queryKey: VIEWS_KEY,
    queryFn: readViews,
    enabled: restored.isSuccess,
    staleTime: FRESH_MS,
    gcTime: Infinity,
    /* a failure says so, and Refresh asks again */
    retry: false,
  });

  /* a read behind the page that found new articles says so */
  const previous = useRef<Snapshot | undefined>(undefined);
  useEffect(() => {
    const before = previous.current;
    previous.current = wordpress.data;
    if (!before || !wordpress.data || before === wordpress.data) return;
    const added = wordpress.data.posts.length - before.posts.length;
    if (added > 0)
      toast.success(
        `${added} new ${added === 1 ? "article" : "articles"} from WordPress`,
      );
  }, [wordpress.data]);

  /* reads the Sheet and WordPress again, WordPress past every cache. Stable,
     so a view can listen for something to refresh on. A read already running
     behind the page is cancelled first: joined, it would be a cached one */
  const refresh = useCallback(async () => {
    /* not waited for: views failing is shown on them, not as a failed Refresh */
    void queryClient.refetchQueries({ queryKey: VIEWS_KEY, exact: true });
    await queryClient.cancelQueries({ queryKey: WORDPRESS_KEY, exact: true });
    await Promise.all([
      queryClient.refetchQueries(
        { queryKey: SHEET_KEY, exact: true },
        { throwOnError: true },
      ),
      queryClient.query({
        queryKey: WORDPRESS_KEY,
        queryFn: () => readSnapshot(true),
        staleTime: 0,
      }),
    ]);
  }, [queryClient]);

  /* a refusal wins over anything already held, as when a session ends */
  if (sheet.error instanceof Refused)
    return { status: "refused", refusal: sheet.error };
  if (views.error instanceof Refused)
    return { status: "refused", refusal: views.error };
  if (!sheet.data) {
    if (sheet.error)
      return {
        status: "failed",
        error: sheet.error,
        retry: () => void sheet.refetch(),
        retrying: sheet.isFetching,
      };
    return { status: "access" };
  }
  if (!wordpress.data) {
    if (wordpress.error)
      return {
        status: "failed",
        error: wordpress.error,
        retry: () => void wordpress.refetch(),
        retrying: wordpress.isFetching,
      };
    return { status: "reading" };
  }

  return {
    status: "ready",
    archive: withRead(
      build(wordpress.data, sheet.data),
      views.data ?? views.error,
    ),
    sheetReadAt: new Date(sheet.dataUpdatedAt).toISOString(),
    checking: wordpress.isFetching,
    checkFailed: wordpress.isRefetchError ? wordpress.error : null,
    viewsChecking: views.isFetching,
    viewsCheckFailed: views.isRefetchError ? views.error : null,
    refresh,
  };
}
