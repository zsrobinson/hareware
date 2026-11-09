/*
  What an archive page reads, stubbed for a test that renders one: the
  WordPress read as the browser stored it, Jetpack's views as it stored
  them, and the gated answer with the Sheet. Names in a test are invented:
  what the Sheet maps is private.
*/

import { vi } from "vitest";
import type { Override } from "~/lib/credits/sheet";
import { queryClient } from "~/lib/query-client";

export type StubPost = {
  id: number;
  title: string;
  publishedAt: string;
  categoryIds?: number[];
  paragraphs: string[];
  /** its prose, credit lines included; none unless given */
  words?: number;
};

export function stubArchive({
  posts,
  categories = [],
  overrides,
  views,
}: {
  posts: StubPost[];
  categories?: [number, string][];
  /** the Sheet's Overrides tab; without it the Sheet is not connected */
  overrides?: Override[];
  /** each post's lifetime views, by post id, as a stored read of them;
      without it no views are kept, and /api/stats is not set up */
  views?: Record<number, number>;
}) {
  /* the client outlives a page, as it does between pages: a read another
     test left in it would be drawn instead */
  queryClient.clear();
  const snapshot = {
    posts: posts.map((post) => ({
      categoryIds: [],
      link: `https://example.com/${post.id}`,
      words: 0,
      ...post,
    })),
    categories,
    fetchedAt: new Date().toISOString(),
  };
  const sheet = overrides
    ? {
        status: "read",
        overrides,
        unscoped: [],
        ignored: [],
        labels: null,
        problems: [],
        tabs: { overrides: true, labels: true, ignored: true },
      }
    : { status: "unconfigured", missing: ["KEY"] };
  /* asked well before any post, so every one of them is counted */
  const counted = views && {
    posts: Object.fromEntries(
      Object.entries(views).map(([id, n]) => [
        id,
        n > 0 ? { "2026-10": n } : {},
      ]),
    ),
    askedAt: new Date().toISOString(),
    fetchedAt: new Date().toISOString(),
  };
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) =>
      Promise.resolve(
        String(url).startsWith("/api/stats/")
          ? new Response("WordPress stats aren't set up", { status: 503 })
          : Response.json({ sheet }),
      ),
    ),
  );
  vi.stubGlobal("caches", {
    open: () =>
      Promise.resolve({
        match: (key: string) =>
          Promise.resolve(
            key.includes("views")
              ? counted && Response.json(counted)
              : Response.json(snapshot),
          ),
        put: () => Promise.resolve(),
      }),
  });
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  /* jsdom lays nothing out */
  if (!("scrollIntoView" in Element.prototype))
    Object.assign(Element.prototype, { scrollIntoView() {} });
}
