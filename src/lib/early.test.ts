import { afterEach, expect, test, vi } from "vitest";
import { earlyScript, takeEarly, type Early } from "./early";
import { articleUrl, latestUrl, recentUrl } from "./services/wordpress/urls";

afterEach(() => {
  globalThis.__early = undefined;
  vi.unstubAllGlobals();
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
  expect(run("article", `?article=${slug}`)).toEqual([articleUrl(slug)]);
  expect(takeEarly(articleUrl(slug))).toBeDefined();
  expect(takeEarly(articleUrl(slug))).toBeUndefined();
});

test("the landing starts the recent list for the page it is on", () => {
  expect(run("article-or-recent", "")).toEqual([recentUrl(1)]);
  globalThis.__early = undefined;
  expect(run("article-or-recent", "?page=3")).toEqual([recentUrl(3)]);
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
  expect(run("latest", "")).toEqual([latestUrl(10)]);
  globalThis.__early = undefined;
  expect(run({ api: "/api/archive.json" }, "")).toEqual(["/api/archive.json"]);
});
