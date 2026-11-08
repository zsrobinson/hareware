import { afterEach, expect, test, vi } from "vitest";
import { passThrough } from "./pass-through";

afterEach(() => {
  vi.unstubAllGlobals();
});

/* answers like WordPress: compressed, with the page count; records the ask */
function wordpress() {
  const asked: { url: string; headers: Headers }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      asked.push({ url, headers: new Headers(init?.headers) });
      return new Response("[]", {
        headers: {
          "content-type": "application/json",
          "content-encoding": "gzip",
          "x-wp-totalpages": "42",
          "set-cookie": "wordpress=1",
        },
      });
    }),
  );
  return asked;
}

const at = (path: string) => new URL(`https://hareware.test${path}`);

test("asks WordPress for the same posts, without an Origin, so its cache answers", async () => {
  const asked = wordpress();
  const response = await passThrough(
    at("/api/wordpress/wp/v2/posts?slug=a&_fields=title"),
  );

  expect(response.status).toBe(200);
  expect(asked.map(({ url }) => url)).toEqual([
    "https://theumdhare.com/wp-json/wp/v2/posts?slug=a&_fields=title",
  ]);
  expect(asked[0]?.headers.has("origin")).toBe(false);
});

test("keeps the compression and the page count, and nothing else of WordPress's", async () => {
  wordpress();
  const response = await passThrough(at("/api/wordpress/wp/v2/posts?page=2"));

  expect(response.headers.get("content-encoding")).toBe("gzip");
  expect(response.headers.get("x-wp-totalpages")).toBe("42");
  expect(response.headers.has("set-cookie")).toBe(false);
  /* kept at the edge for a minute, never in the browser */
  expect(response.headers.get("cache-control")).toBe(
    "public, max-age=0, s-maxage=60",
  );
});

test("passes only the collections and query keys the pages use", async () => {
  const asked = wordpress();

  expect((await passThrough(at("/api/wordpress/wp/v2/users"))).status).toBe(
    404,
  );
  expect(
    (await passThrough(at("/api/wordpress/wp/v2/posts/../settings"))).status,
  ).toBe(404);
  await passThrough(
    at("/api/wordpress/wp/v2/posts?slug=a&context=edit&password=x"),
  );

  expect(asked.map(({ url }) => url)).toEqual([
    "https://theumdhare.com/wp-json/wp/v2/posts?slug=a",
  ]);
});
