/*
  What an archive page reads, stubbed for a test that renders one: the
  WordPress read as the browser stored it, Jetpack's views as it stored
  them, and the gated answer with the Sheet. Names in a test are invented:
  what the Sheet maps is private.
*/

import { vi } from "vitest";
import { applyEdit, isViewEdit, parseEdit } from "~/lib/credits/edits";
import { readSheet, ViewConflict, type Override } from "~/lib/credits/sheet";
import { queryClient } from "~/lib/query-client";
import type { Rows, Sheets } from "~/lib/services/google/sheets";

export type StubPost = {
  id: number;
  title: string;
  publishedAt: string;
  categoryIds?: number[];
  paragraphs: string[];
  /** the words of its prose, its paragraphs as the credit lines it counts
      among them; none unless given */
  words?: number;
};

export function stubArchive({
  posts,
  categories = [],
  overrides,
  views,
  viewsTab,
  answer,
}: {
  posts: StubPost[];
  categories?: [number, string][];
  /** the Sheet's Overrides tab; without it the Sheet is not connected */
  overrides?: Override[];
  /** each post's lifetime views, by post id, as a stored read of them;
      without it no views are kept, and /api/stats is not set up */
  views?: Record<number, number>;
  /** the Sheet's Views tab, in memory: given, the Sheet is connected, and
      /api/sheet changes it as the Worker would, for /api/archive.json to
      read back */
  viewsTab?: Rows;
  /** how /api/sheet answers in place of writing, as a failure would */
  answer?: () => Response;
}) {
  /* the client outlives a page, as it does between pages: a read another
     test left in it would be drawn instead */
  queryClient.clear();
  const snapshot = {
    posts: posts.map(({ words = 0, ...post }) => ({
      categoryIds: [],
      link: `https://example.com/${post.id}`,
      ...post,
      prose: { words, paragraphs: post.paragraphs },
    })),
    categories,
    fetchedAt: new Date().toISOString(),
  };
  const tabs: Record<string, Rows> = viewsTab ? { Views: viewsTab } : {};
  const sheets = {
    tabs: async () => Object.keys(tabs),
    read: async (titles: string[]) =>
      new Map(titles.filter((t) => t in tabs).map((t) => [t, tabs[t]!])),
    addTab: async (title: string) => {
      tabs[title] = [];
    },
    replace: async (title: string, rows: Rows) => {
      tabs[title] = rows;
    },
  } as unknown as Sheets;
  const sheet = async () => {
    if (!overrides && !viewsTab)
      return { status: "unconfigured", missing: ["KEY"] };
    const read = await readSheet(sheets);
    return read.status === "read"
      ? {
          ...read,
          overrides: overrides ?? [],
          tabs: { ...read.tabs, overrides: true, labels: true, ignored: true },
        }
      : read;
  };
  const write = async (body: string) => {
    if (answer) return answer();
    const edit = parseEdit(JSON.parse(body));
    if ("error" in edit) return new Response(edit.error, { status: 400 });
    if (!isViewEdit(edit)) return new Response(null, { status: 204 });
    try {
      return Response.json({
        updatedAt: await applyEdit(sheets, edit, "Riley Real"),
      });
    } catch (error) {
      if (error instanceof ViewConflict)
        return Response.json({ conflict: error.message }, { status: 409 });
      throw error;
    }
  };
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
    vi.fn(async (url: string, init?: RequestInit) =>
      String(url).startsWith("/api/stats/")
        ? new Response("WordPress stats aren't set up", { status: 503 })
        : String(url) === "/api/sheet"
          ? write(String(init?.body))
          : Response.json({ sheet: await sheet() }),
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
  return { tabs };
}
