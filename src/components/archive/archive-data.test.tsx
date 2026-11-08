// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { useArchive } from "./archive-data";

const SHEET = { sheet: { status: "unconfigured", missing: ["GOOGLE_KEY"] } };
const minutesAgo = (minutes: number) =>
  new Date(Date.now() - minutes * 60_000).toISOString();

/* fetch answers the gate as given and records everything asked for; Cache
   Storage holds `stored`, and records whether it was opened at all */
function setUp(gate: Response, stored?: object) {
  const asked: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      asked.push(url);
      if (url === "/api/archive.json") return gate.clone();
      /* WordPress: no posts, after a moment, as a real read takes one */
      await new Promise((wake) => setTimeout(wake, 100));
      return Response.json([], { headers: { "x-wp-totalpages": "1" } });
    }),
  );
  const opened = vi.fn(async () => ({
    match: async () => (stored ? Response.json(stored) : undefined),
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
    { posts: [], categories: [], fetchedAt: minutesAgo(1) },
  );
  const { result } = renderHook(() => useArchive(), { wrapper });

  await waitFor(() => expect(result.current.status).toBe("refused"));
  expect(asked).toEqual(["/api/archive.json"]);
  expect(opened).not.toHaveBeenCalled();
});

test("a recent copy is used as it is, without asking WordPress", async () => {
  const { asked, wrapper } = setUp(Response.json(SHEET), {
    posts: [],
    categories: [],
    fetchedAt: minutesAgo(2),
  });
  const { result } = renderHook(() => useArchive(), { wrapper });

  await waitFor(() => expect(result.current.status).toBe("ready"));
  expect(asked).toEqual(["/api/archive.json"]);
});

test("an older copy is shown at once, and WordPress read behind it", async () => {
  const fetchedAt = minutesAgo(3 * 60);
  const { asked, wrapper } = setUp(Response.json(SHEET), {
    posts: [],
    categories: [],
    fetchedAt,
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

test("Refresh reads WordPress itself, so a fix made there shows", async () => {
  const { asked, wrapper } = setUp(Response.json(SHEET), {
    posts: [],
    categories: [],
    fetchedAt: minutesAgo(2),
  });
  const { result } = renderHook(() => useArchive(), { wrapper });
  await waitFor(() => expect(result.current.status).toBe("ready"));
  const ready = result.current;
  if (ready.status !== "ready") throw new Error("not ready");

  asked.length = 0;
  await ready.refresh();

  const reads = asked.filter((url) => url.includes("wp/v2/"));
  expect(reads.length).toBeGreaterThan(0);
  for (const url of reads)
    expect(url).toMatch(/^https:\/\/theumdhare\.com\/wp-json\//);
});
