/*
  What an archive page reads, stubbed for a test that renders one: the
  WordPress read as the browser stored it, and the gated answer with the
  Sheet. Names in a test are invented: what the Sheet maps is private.
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
};

export function stubArchive({
  posts,
  categories = [],
  overrides,
}: {
  posts: StubPost[];
  categories?: [number, string][];
  /** the Sheet's Overrides tab; without it the Sheet is not connected */
  overrides?: Override[];
}) {
  /* the client outlives a page, as it does between pages: a read another
     test left in it would be drawn instead */
  queryClient.clear();
  const snapshot = {
    posts: posts.map((post) => ({
      categoryIds: [],
      link: `https://example.com/${post.id}`,
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
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(Response.json({ sheet }))),
  );
  vi.stubGlobal("caches", {
    open: () =>
      Promise.resolve({
        match: () => Promise.resolve(Response.json(snapshot)),
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
