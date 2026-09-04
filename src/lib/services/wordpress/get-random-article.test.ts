import { afterEach, expect, test, vi } from "vitest";
import { getRandomArticle } from "./get-random-article";

const LINK = "https://theumdhare.com/2026/09/03/a-story/";

/** the two calls it makes: a count, then the post at an offset */
function mockWordPress(
  total: string | null,
  posts: unknown = [{ link: LINK }],
  ok = true,
) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const headers: Record<string, string> =
        total === null ? {} : { "x-wp-total": total };

      return String(input).includes("offset=")
        ? new Response(JSON.stringify(posts), { status: ok ? 200 : 500 })
        : new Response("[]", { status: ok ? 200 : 500, headers });
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

test("returns a link", async () => {
  mockWordPress("40");
  expect(await getRandomArticle()).toBe(LINK);
});

test("is nothing when the count header is missing", async () => {
  // this made offset NaN and put `offset=NaN` in the url
  mockWordPress(null);
  expect(await getRandomArticle()).toBeUndefined();
});

test("is nothing when there are no posts at all", async () => {
  mockWordPress("0");
  expect(await getRandomArticle()).toBeUndefined();
});

test("is nothing when the second call returns an empty array", async () => {
  // `data[0].link` threw a TypeError here
  mockWordPress("40", []);
  expect(await getRandomArticle()).toBeUndefined();
});

test("is nothing when wordpress refuses", async () => {
  mockWordPress("40", [{ link: LINK }], false);
  expect(await getRandomArticle()).toBeUndefined();
});

test("is nothing when wordpress is unreachable", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("down");
    }),
  );
  expect(await getRandomArticle()).toBeUndefined();
});
