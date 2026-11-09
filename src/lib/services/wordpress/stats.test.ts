import { afterEach, expect, test, vi } from "vitest";
import { passStats, postViewsOf, postViewsUrl } from "./stats";

afterEach(() => {
  vi.unstubAllGlobals();
});

const CREDENTIALS = { user: "invented-user", password: "abcd efgh ijkl" };

/* answers like Jetpack: compressed JSON, with a cookie of its own; records
   the ask */
function jetpack(answer = () => new Response("{}", { headers: JSON_HEADERS })) {
  const asked: { url: string; init: RequestInit; headers: Headers }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      asked.push({ url, init, headers: new Headers(init.headers) });
      return answer();
    }),
  );
  return asked;
}
const JSON_HEADERS = {
  "content-type": "application/json; charset=UTF-8",
  "content-encoding": "br",
  "set-cookie": "wordpress_logged_in=1",
};

const at = (path: string) => new URL(`https://hareware.test${path}`);

test("asks Jetpack for the stat with the account, and nothing of the browser's", async () => {
  const asked = jetpack();
  const response = await passStats(
    at("/api/stats/top-posts?period=month&num=48&max=0"),
    CREDENTIALS,
  );

  expect(response.status).toBe(200);
  expect(asked.map(({ url }) => url)).toEqual([
    "https://theumdhare.com/wp-json/jetpack/v4/stats-app/sites/212871363/stats/top-posts?period=month&num=48&max=0",
  ]);
  const { headers, init } = asked[0]!;
  expect(headers.get("authorization")).toBe(
    `Basic ${btoa("invented-user:abcd efgh ijkl")}`,
  );
  expect([...headers.keys()].sort()).toEqual([
    "accept",
    "accept-encoding",
    "authorization",
  ]);
  /* followed, a redirect would carry the password wherever it pointed */
  expect(init.redirect).toBe("manual");
});

test("keeps the compression, and none of WordPress's cookies, in the board's cache only", async () => {
  jetpack();
  const response = await passStats(
    at("/api/stats/top-posts?period=month"),
    CREDENTIALS,
  );

  expect(response.headers.get("content-encoding")).toBe("br");
  expect(response.headers.has("set-cookie")).toBe(false);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  for (const [, value] of response.headers) expect(value).not.toContain("abcd");
});

/* the account can do anything an administrator can: only these GETs */
test("refuses any other stat, path or query, without asking WordPress", async () => {
  const asked = jetpack();
  const refused = async (path: string) =>
    (await passStats(at(path), CREDENTIALS)).status;

  expect(await refused("/api/stats/")).toBe(404);
  expect(await refused("/api/stats/post/3147")).toBe(404);
  expect(await refused("/api/stats/top-posts/3147")).toBe(404);
  expect(await refused("/api/stats/subscribers")).toBe(404);
  expect(await refused("/api/stats/%2e%2e/%2e%2e/wp/v2/users")).toBe(404);
  expect(await refused("/api/stats/top-posts?period=month&_method=POST")).toBe(
    400,
  );
  expect(await refused("/api/stats/top-posts?period=forever")).toBe(400);
  expect(await refused("/api/stats/top-posts?num=1;2")).toBe(400);
  expect(await refused("/api/stats/top-posts?period=month&period=x")).toBe(400);
  /* every object has these; none is a key HareWare passes */
  for (const key of ["constructor", "__proto__", "toString", "hasOwnProperty"])
    expect(await refused(`/api/stats/top-posts?${key}=1`)).toBe(400);

  expect(asked).toEqual([]);
});

test("a refusal, a redirect or a page from WordPress is a failure, never views", async () => {
  const status = async (upstream: Response) => {
    jetpack(() => upstream);
    const response = await passStats(
      at("/api/stats/top-posts?period=month"),
      CREDENTIALS,
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    return [response.status, await response.text()];
  };

  expect(await status(new Response("<html>", { status: 429 }))).toEqual([
    429,
    "WordPress stats are busy",
  ]);
  expect(
    await status(new Response(null, { status: 401, headers: JSON_HEADERS })),
  ).toEqual([502, "WordPress stats answered 401"]);
  expect(
    await status(
      new Response(null, {
        status: 302,
        headers: { location: "https://elsewhere.test/" },
      }),
    ),
  ).toEqual([502, "WordPress stats answered 302"]);
  /* a throttled WordPress.com has answered 200 with an HTML page */
  expect(
    await status(
      new Response("<html>", { headers: { "content-type": "text/html" } }),
    ),
  ).toEqual([
    502,
    "WordPress stats answered 200 with something other than JSON",
  ]);
});

test("asks for every month since counting began, and one more", () => {
  const url = new URL(
    postViewsUrl(new Date("2026-11-09T12:00:00Z")),
    "https://hareware.test",
  );

  expect(url.pathname).toBe("/api/stats/top-posts");
  /* January 2023 to November 2026 is 47 months */
  expect(Object.fromEntries(url.searchParams)).toEqual({
    period: "month",
    num: "48",
    max: "0",
  });
});

/* an answer to `postViewsUrl()` asked on 9 November 2026: every month since
   counting began, empty unless `months` says otherwise */
const NOW = new Date("2026-11-09T15:00:00Z");
function answered(months: Record<string, object[]> = {}) {
  const days: Record<string, { postviews: object[] }> = {};
  for (const at = new Date("2022-12-01T00:00:00Z"); at <= NOW;) {
    const key = at.toISOString().slice(0, 10);
    days[key] = { postviews: months[key.slice(0, 7)] ?? [] };
    at.setUTCMonth(at.getUTCMonth() + 1);
  }
  return { date: "2026-11-09", days };
}
const row = (id: number, views: unknown, type: unknown = "post") => ({
  id,
  type,
  views,
  title: "Invented",
});

test("reads each post's views by month, and leaves out what is not an article", () => {
  expect(
    postViewsOf(
      answered({
        "2026-11": [row(0, 50, "homepage"), row(901, 4, "page"), row(7, 3)],
        "2026-10": [row(7, 10), row(8, 2)],
      }),
      NOW,
    ),
  ).toEqual({ 7: { "2026-11": 3, "2026-10": 10 }, 8: { "2026-10": 2 } });
});

/* read wrong, any of these would count as nobody having read anything */
test("an answer of any other shape is an error, not an empty count", () => {
  const read = (body: unknown) => () => postViewsOf(body, NOW);
  expect(read({ code: "rest_forbidden" })).toThrow();
  expect(read(null)).toThrow();
  expect(
    read({
      ...answered(),
      days: { ...answered().days, "2026-11-09": { postviews: [] } },
    }),
  ).toThrow();
  expect(
    read({ ...answered(), days: { ...answered().days, "2026-11-01": {} } }),
  ).toThrow();
});

/* asked for every month, an answer short of one would make a post read only
   in that month a post read by nobody */
test("an answer missing any month since counting began is an error", () => {
  const read = (body: unknown) => () => postViewsOf(body, NOW);
  const short = answered().days;
  delete short["2026-10-01"];

  expect(read({ date: "2026-11-09", days: {} })).toThrow();
  expect(read({ date: "2026-11-09", days: [] })).toThrow();
  expect(read({ date: "2026-11-09", days: short })).toThrow("2026-10");
  /* without its own date, nothing says which months it should have */
  expect(read({ days: answered().days })).toThrow();
  /* nor is an answer as of some other day this one */
  expect(read({ ...answered(), date: "2026-10-09" })).toThrow();
  expect(read(answered())).not.toThrow();
});

/* a row that cannot be read is not a row nobody read */
test("a row without a type, an id or a count is an error, not a skipped row", () => {
  const read = (bad: object) => () =>
    postViewsOf(answered({ "2026-10": [row(8, 2), bad] }), NOW);

  expect(read(row(7, null))).toThrow();
  expect(read(row(7, undefined))).toThrow();
  expect(read(row(7, -3))).toThrow();
  expect(read(row(7, 2.5))).toThrow();
  expect(read(row(7, "4"))).toThrow();
  expect(read({ id: 7, views: 4 })).toThrow();
  expect(read(row(Number.NaN, 4))).toThrow();
  expect(read(row(0, 4))).toThrow();
  expect(read({ type: "post", views: 4 })).toThrow();
  /* a page, or the home page, is counted too, and still left out */
  expect(read(row(0, 50, "homepage"))()).toEqual({ 8: { "2026-10": 2 } });
  expect(read(row(7, 0))()).toEqual({ 8: { "2026-10": 2 } });
});
