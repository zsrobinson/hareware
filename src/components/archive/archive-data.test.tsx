// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { useArchive } from "./archive-data";

const SHEET = { sheet: { status: "unconfigured", missing: ["GOOGLE_KEY"] } };
const minutesAgo = (minutes: number) =>
  new Date(Date.now() - minutes * 60_000).toISOString();

/* the stored reads, by their keys in Cache Storage */
const SNAPSHOT = "/wordpress-snapshot-v4";
const VIEWS = "/wordpress-views-v2";

/* one invented article, as a stored read of WordPress keeps it */
const snapshot = (fetchedAt: string, publishedAt = "2026-10-01T10:00:00Z") => ({
  posts: [
    {
      id: 7,
      publishedAt,
      link: "https://theumdhare.com/7/",
      title: "Post 7",
      categoryIds: [103],
      paragraphs: ["Article by: Penn Name"],
      prose: { words: 120, paragraphs: ["Article by: Penn Name"] },
    },
  ],
  categories: [[103, "News"]],
  fetchedAt,
});

/* Jetpack's answer as of today: every month since counting began, with
   `october` in October 2026 */
function jetpack(october: object[] = [], months = monthsSince2023()) {
  const days = Object.fromEntries(
    months.map((m) => [
      `${m}-01`,
      { postviews: m === "2026-10" ? october : [] },
    ]),
  );
  return { date: new Date().toISOString().slice(0, 10), days };
}
function monthsSince2023() {
  const months: string[] = [];
  const at = new Date("2023-01-01T00:00:00Z");
  while (at <= new Date()) {
    months.push(at.toISOString().slice(0, 7));
    at.setUTCMonth(at.getUTCMonth() + 1);
  }
  return months;
}
const COUNTED = jetpack([{ id: 7, type: "post", views: 30 }]);

/* fetch answers the gate as given, and the stats with `stats`, and records
   everything asked for; Cache Storage holds `stored`, and records whether it
   was opened at all */
function setUp(
  gate: Response,
  stored: Record<string, object> = {},
  stats: () => Response | Promise<Response> = () => Response.json(COUNTED),
) {
  const asked: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      asked.push(url);
      if (url === "/api/archive.json") return gate.clone();
      if (url.startsWith("/api/stats/")) return stats();
      /* WordPress: no posts, after a moment, as a real read takes one */
      await new Promise((wake) => setTimeout(wake, 100));
      return Response.json([], { headers: { "x-wp-totalpages": "1" } });
    }),
  );
  const opened = vi.fn(async () => ({
    match: async (key: string) =>
      stored[key] ? Response.json(stored[key]) : undefined,
    put: async () => {},
  }));
  vi.stubGlobal("caches", { open: opened });

  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { asked, opened, wrapper };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test("a refused viewer never reads WordPress, nor the copy kept from it", async () => {
  const { asked, opened, wrapper } = setUp(
    Response.json({ denial: "signed-out", you: null }, { status: 401 }),
    { [SNAPSHOT]: snapshot(minutesAgo(1)) },
  );
  const { result } = renderHook(() => useArchive(), { wrapper });

  await waitFor(() => expect(result.current.status).toBe("refused"));
  expect(asked).toEqual(["/api/archive.json"]);
  expect(opened).not.toHaveBeenCalled();
});

test("a recent copy is used as it is, without asking WordPress", async () => {
  const { asked, wrapper } = setUp(Response.json(SHEET), {
    [SNAPSHOT]: snapshot(minutesAgo(2)),
    [VIEWS]: { posts: {}, askedAt: minutesAgo(2), fetchedAt: minutesAgo(2) },
  });
  const { result } = renderHook(() => useArchive(), { wrapper });

  await waitFor(() => expect(result.current.status).toBe("ready"));
  expect(asked).toEqual(["/api/archive.json"]);
});

test("an older copy is shown at once, and WordPress read behind it", async () => {
  const fetchedAt = minutesAgo(3 * 60);
  const { asked, wrapper } = setUp(Response.json(SHEET), {
    [SNAPSHOT]: snapshot(fetchedAt),
  });
  const { result } = renderHook(() => useArchive(), { wrapper });

  await waitFor(() => expect(result.current.status).toBe("ready"));
  const shown = result.current;
  if (shown.status !== "ready") throw new Error("not ready");
  expect(shown.archive.fetchedAt).toBe(fetchedAt);
  expect(shown.checking).toBe(true);

  /* the read behind finishes, and replaces the old copy */
  await waitFor(
    () => {
      const now = result.current;
      expect(now.status === "ready" && now.archive.fetchedAt).not.toBe(
        fetchedAt,
      );
    },
    { timeout: 3000 },
  );
  expect(asked.some((url) => url.includes("wp/v2/posts"))).toBe(true);
});

test("Refresh reads past every cache, so a fix made in WordPress shows", async () => {
  const { asked, wrapper } = setUp(Response.json(SHEET), {
    [SNAPSHOT]: snapshot(minutesAgo(2)),
  });
  const { result } = renderHook(() => useArchive(), { wrapper });
  await waitFor(() => expect(result.current.status).toBe("ready"));
  const ready = result.current;
  if (ready.status !== "ready") throw new Error("not ready");

  asked.length = 0;
  await ready.refresh();

  const reads = asked.filter((url) => url.includes("wp/v2/"));
  expect(reads.length).toBeGreaterThan(0);
  for (const url of reads) expect(url).toMatch(/[?&]fresh=1$/);
});

/* the archive's one article, once views have had their say */
async function shown(wrapper: ReturnType<typeof setUp>["wrapper"]) {
  const { result } = renderHook(() => useArchive(), { wrapper });
  await waitFor(() => {
    const now = result.current;
    expect(now.status).toBe("ready");
    expect(now.status === "ready" && now.archive.views.status).not.toBe(
      "reading",
    );
  });
  const ready = result.current;
  if (ready.status !== "ready") throw new Error("not ready");
  return ready;
}

test("views are merged onto the article they count, without holding up the archive", async () => {
  const { asked, wrapper } = setUp(Response.json(SHEET), {
    [SNAPSHOT]: snapshot(minutesAgo(2)),
  });
  const ready = await shown(wrapper);

  expect(asked.some((url) => url.startsWith("/api/stats/top-posts?"))).toBe(
    true,
  );
  expect(ready.archive.views.status).toBe("read");
  /* the stored count less "Article by: Penn Name" */
  expect(ready.archive.articles[0]!.words).toBe(120 - 4);
  expect(ready.archive.articles[0]!.views).toEqual({
    status: "counted",
    total: 30,
    byMonth: { "2026-10": 30 },
  });
});

test("views WordPress will not give are unavailable, never zero", async () => {
  for (const stats of [
    () => new Response("WordPress stats are busy", { status: 429 }),
    () => new Response("WordPress stats aren't set up", { status: 503 }),
    /* answered, but not a count */
    () => Response.json([]),
    /* a count, but of no months, or not of October */
    () => Response.json({ ...jetpack(), days: {} }),
    /* a count of article 7 with no number in it */
    () => Response.json(jetpack([{ id: 7, type: "post", views: null }])),
    () =>
      Response.json(
        jetpack(
          [],
          monthsSince2023().filter((m) => m !== "2026-10"),
        ),
      ),
  ]) {
    const { wrapper } = setUp(
      Response.json(SHEET),
      { [SNAPSHOT]: snapshot(minutesAgo(2)) },
      stats,
    );
    const ready = await shown(wrapper);

    expect(ready.archive.views.status).toBe("unavailable");
    expect(ready.archive.articles[0]!.views).toEqual({ status: "unavailable" });
  }
});

test("a kept count is shown while it is read again, and says so when that fails", async () => {
  const { wrapper } = setUp(
    Response.json(SHEET),
    {
      [SNAPSHOT]: snapshot(minutesAgo(2)),
      [VIEWS]: {
        posts: { 7: { "2026-10": 12 } },
        askedAt: minutesAgo(60),
        fetchedAt: minutesAgo(60),
      },
    },
    () => new Response("WordPress stats are busy", { status: 429 }),
  );
  const { result } = renderHook(() => useArchive(), { wrapper });

  await waitFor(() => {
    const now = result.current;
    expect(now.status === "ready" && now.viewsCheckFailed?.message).toBe(
      "WordPress stats are busy",
    );
  });
  const ready = result.current;
  if (ready.status !== "ready") throw new Error("not ready");
  expect(ready.archive.articles[0]!.views).toMatchObject({ total: 12 });
});

/* Jetpack's answer takes a while; an article published while it is on its
   way is in WordPress's read and cannot be in Jetpack's */
test("an article published while the count was being read is unavailable, not zero", async () => {
  const published = new Date(Date.now() + 150).toISOString();
  const { wrapper } = setUp(
    Response.json(SHEET),
    { [SNAPSHOT]: snapshot(minutesAgo(2), published) },
    async () => {
      await new Promise((wake) => setTimeout(wake, 400));
      return Response.json(jetpack());
    },
  );
  const ready = await shown(wrapper);

  expect(ready.archive.views.status).toBe("read");
  expect(Date.parse(published)).toBeLessThan(
    Date.parse(
      ready.archive.views.status === "read"
        ? ready.archive.views.fetchedAt
        : "",
    ),
  );
  expect(ready.archive.articles[0]!.views).toEqual({ status: "unavailable" });
});
