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
*/

import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { fetchGated, Refused } from "~/components/gated";
import {
  buildArchive,
  type Archive,
  type SourcePost,
} from "~/lib/credits/archive";
import type { SheetPayload } from "~/lib/credits/load";
import { paragraphs } from "~/lib/credits/parse";
import { labelsIn } from "~/lib/credits/sheet";
import { allPosts, categories } from "~/lib/services/wordpress/posts";

/* younger than this, the read is used without asking WordPress */
const FRESH_MS = 10 * 60_000;
/* older than this, a stored read is not shown at all */
const STALE_MS = 24 * 60 * 60_000;
/* bump when Snapshot changes shape, so a stored copy of the old one is not read */
const CACHE = "hareware-wordpress";
const KEY = "/wordpress-snapshot-v1";

export const SHEET_KEY = ["sheet"] as const;
const WORDPRESS_KEY = ["wordpress"] as const;
const RESTORED_KEY = ["wordpress", "restored"] as const;

type Snapshot = {
  posts: SourcePost[];
  categories: [number, string][];
  fetchedAt: string;
};

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

async function readWordPress(): Promise<Snapshot> {
  report({ read: 0, total: 0 });
  /* one after the other: sent to WordPress directly, together they are what
     gets throttled */
  const posts = await allPosts((read, total) => report({ read, total }));
  const sections = await categories();

  const snapshot: Snapshot = {
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
  void toStorage(snapshot);
  return snapshot;
}

/* Cache Storage exists only on https and localhost; without it, the read is
   simply not kept between visits */
async function fromStorage(): Promise<Snapshot | undefined> {
  try {
    const hit = await (await caches.open(CACHE)).match(KEY);
    if (!hit) return undefined;
    const snapshot = (await hit.json()) as Snapshot;
    return Date.now() - Date.parse(snapshot.fetchedAt) < STALE_MS
      ? snapshot
      : undefined;
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

/* the stored read, handed to the query as of when it was made, so the query's
   own staleness decides whether to read again */
async function restore(queryClient: QueryClient): Promise<true> {
  if (queryClient.getQueryData(WORDPRESS_KEY)) return true;
  const stored = await fromStorage();
  if (stored && !queryClient.getQueryData(WORDPRESS_KEY))
    queryClient.setQueryData(WORDPRESS_KEY, stored, {
      updatedAt: Date.parse(stored.fetchedAt),
    });
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

/* ------------------------------------------------------------------------ */

export type ArchiveState =
  /** the gate has not answered yet */
  | { status: "access" }
  /** admitted, and WordPress is being read for the first time */
  | { status: "reading" }
  | { status: "refused"; refusal: Refused }
  /** nothing to show: the gate or the first read failed */
  | { status: "failed"; error: Error; retry: () => void }
  | {
      status: "ready";
      archive: Archive;
      /** WordPress is being read behind what is shown */
      checking: boolean;
      /** the last read behind failed, so what is shown is older */
      checkFailed: Error | null;
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
    queryFn: readWordPress,
    enabled: restored.isSuccess,
    staleTime: FRESH_MS,
    gcTime: Infinity,
    /* readWordPress already waits out WordPress's refusals */
    retry: false,
    /* the posts are large and never compared piece by piece */
    structuralSharing: false,
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

  /* a refusal wins over anything already held, as when a session ends */
  if (sheet.error instanceof Refused)
    return { status: "refused", refusal: sheet.error };
  if (!sheet.data) {
    if (sheet.error)
      return {
        status: "failed",
        error: sheet.error,
        retry: () => void sheet.refetch(),
      };
    return { status: "access" };
  }
  if (!wordpress.data) {
    if (wordpress.error)
      return {
        status: "failed",
        error: wordpress.error,
        retry: () => void wordpress.refetch(),
      };
    return { status: "reading" };
  }

  return {
    status: "ready",
    archive: build(wordpress.data, sheet.data),
    checking: wordpress.isFetching,
    checkFailed: wordpress.isRefetchError ? wordpress.error : null,
    refresh: async () => {
      await Promise.all([
        queryClient.refetchQueries(
          { queryKey: SHEET_KEY, exact: true },
          { throwOnError: true },
        ),
        queryClient.refetchQueries(
          { queryKey: WORDPRESS_KEY, exact: true },
          { throwOnError: true },
        ),
      ]);
    },
  };
}
