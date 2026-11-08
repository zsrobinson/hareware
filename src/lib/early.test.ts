import { afterEach, expect, test, vi } from "vitest";
import { earlyScript, type Early } from "./early";
import { EARLY_FOR_MS, takeEarly } from "./early-requests";
import {
  articleUrl,
  latestUrl,
  NEWSLETTER_COUNT,
  pageOf,
  recentUrl,
  viaHareWare,
} from "./services/wordpress/urls";

/* the early requests go through HareWare's pass-through, as the islands' do */
const article = (slug: string) => viaHareWare(articleUrl(slug));
const recent = (page: number) => viaHareWare(recentUrl(page));

afterEach(() => {
  globalThis.__early = undefined;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/* runs a page's inline script against an address, and says what it fetched */
function run(early: Early, search: string): string[] {
  const fetched: string[] = [];
  vi.stubGlobal("window", globalThis);
  vi.stubGlobal("location", { search });
  vi.stubGlobal("fetch", (url: string) => {
    fetched.push(url);
    return Promise.resolve(new Response("[]"));
  });
  /* the script is source text the page inlines, so the test runs it as such */
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function(earlyScript(early))();
  return fetched;
}

/* the island must find the request under the address it builds itself, or the
   page would send every request twice */
test("an article page starts exactly the request its island makes", () => {
  const slug = "testudo-learns-to-swim";
  expect(run("article", `?article=${slug}`)).toEqual([article(slug)]);
  expect(article(slug)).toMatch(/^\/api\/wordpress\/wp\/v2\/posts\?/);
  expect(takeEarly(article(slug))).toBeDefined();
  expect(takeEarly(article(slug))).toBeUndefined();
});

/* the script reads `?page=` in its own source; the island reads it with pageOf,
   and a page they disagreed on would be read twice */
test("the landing starts the recent list for the page the island shows", () => {
  for (const search of ["", "?page=3", "?page=0", "?page=-2", "?page=x"]) {
    globalThis.__early = undefined;
    expect(run("article-or-recent", search)).toEqual([
      recent(pageOf(new URLSearchParams(search))),
    ]);
  }
});

test("a pasted link is left to the island, which reads it more carefully", () => {
  expect(
    run(
      "article",
      "?article=https%3A%2F%2Ftheumdhare.com%2F2026%2F11%2F05%2Fx%2F",
    ),
  ).toEqual([]);
});

test("the newsletter and the gated pages start their one request", () => {
  expect(run("latest", "")).toEqual([viaHareWare(latestUrl(NEWSLETTER_COUNT))]);
  globalThis.__early = undefined;
  expect(run({ api: "/api/archive.json" }, "")).toEqual(["/api/archive.json"]);
});

/* the router runs a page's script once per window, so a request the island
   never took (it already had the answer) must not be served as new later */
test("a request sent early is not taken once it is old", () => {
  vi.useFakeTimers();
  run("article", "?article=testudo-learns-to-swim");
  vi.advanceTimersByTime(EARLY_FOR_MS);
  expect(takeEarly(article("testudo-learns-to-swim"))).toBeUndefined();
});
