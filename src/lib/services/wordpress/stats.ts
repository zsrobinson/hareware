import { WORDPRESS_API } from "./urls";

/*
  Jetpack Stats, read through the site's own REST API with an application
  password. The account is a site administrator, and Basic auth with it can do
  anything that account can, so the Worker sends it on one kind of request
  only: a GET of the resources and query keys below, refused rather than
  dropped otherwise. It never reaches the browser, and neither do WordPress's
  cookies.

  Measured 2026-11-09, 419 posts: `top-posts?period=month&num=120&max=0`
  answers every post's views in each of 120 months in one request, 72 KB
  brotli (2 MB as JSON), in about 2 s, never from WordPress's cache (`x-ac:
  BYPASS`; it is signed in). Summed, each post's months equal `post/<id>`'s
  lifetime `views`, which costs a request a post. `period=year` is half the
  size, but no period HareWare counts in fits inside a year. Counting began in
  January 2023: every month before it is empty.

  src/worker.ts answers /api/stats/ ahead of Astro, through ~/lib/stats-api,
  which asks the gate first. The body is streamed through unread.
*/

const SITE = 212871363;
const STATS = `${WORDPRESS_API}jetpack/v4/stats-app/sites/${SITE}/stats/`;

/** where HareWare answers the stats it reads (~/lib/stats-api) */
export const STATS_THROUGH = "/api/stats/";

const RESOURCES = new Set(["top-posts"]);
/* each key a read may send, and what its value may be */
const KEYS: Record<string, RegExp> = {
  period: /^(day|week|month|year)$/,
  num: /^\d{1,3}$/,
  max: /^\d{1,4}$/,
  date: /^\d{4}-\d{2}-\d{2}$/,
};
/* as in ./pass-through: Content-Encoding kept, so the compressed bytes are
   forwarded as they are */
const PASSED = ["content-type", "content-encoding", "vary"];

/** the first month Jetpack counted, `YYYY-MM` */
export const COUNTED_SINCE = "2023-01";

export type StatsCredentials = { user: string; password: string };

const answer = (body: string, status: number) =>
  new Response(body, { status, headers: { "cache-control": "no-store" } });

/**
 * WordPress's answer to a GET of `/api/stats/<resource>?<query>`, asked with
 * the stats account. Only for someone the gate has let through
 */
export async function passStats(
  url: URL,
  credentials: StatsCredentials,
): Promise<Response> {
  const resource = url.pathname.slice(STATS_THROUGH.length);
  if (!url.pathname.startsWith(STATS_THROUGH) || !RESOURCES.has(resource))
    return answer("not a stat HareWare reads", 404);
  for (const [key, value] of url.searchParams)
    if (!KEYS[key]?.test(value))
      return answer(`not a query HareWare passes: ${key}`, 400);

  let upstream: Response;
  try {
    upstream = await fetch(`${STATS}${resource}?${url.searchParams}`, {
      headers: {
        authorization: `Basic ${btoa(`${credentials.user}:${credentials.password}`)}`,
        accept: "application/json",
        "accept-encoding": "br, gzip",
      },
      /* a redirect would be followed with the credentials on it, wherever
         it pointed */
      redirect: "manual",
    });
  } catch (error) {
    console.error("[stats] could not reach WordPress", error);
    return answer("WordPress stats did not answer", 502);
  }

  /* a throttled WordPress.com has answered 200 with an HTML page */
  const json = upstream.headers
    .get("content-type")
    ?.startsWith("application/json");
  if (!upstream.ok || !json) {
    await upstream.body?.cancel();
    return upstream.status === 429
      ? answer("WordPress stats are busy", 429)
      : answer(
          `WordPress stats answered ${upstream.status}${upstream.ok ? " with something other than JSON" : ""}`,
          502,
        );
  }

  /* views are the board's, like everything a gated route answers */
  const headers = new Headers({
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
  });
  for (const name of PASSED) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(upstream.body, { status: 200, headers });
}

/* ---- in the browser ------------------------------------------------------- */

/** each post's views by month, `YYYY-MM`; a month with none is left out */
export type PostViews = Record<number, Record<string, number>>;

/**
 * the address that asks for every post's views in every month since counting
 * began, through month `now` falls in
 */
export function postViewsUrl(now = new Date()): string {
  const [year, month] = COUNTED_SINCE.split("-").map(Number) as [
    number,
    number,
  ];
  /* one spare: the site's month can be a day ahead of UTC's or behind it */
  const months =
    (now.getUTCFullYear() - year) * 12 + now.getUTCMonth() + 1 - month + 2;
  return `${STATS_THROUGH}top-posts?${new URLSearchParams({
    period: "month",
    num: String(months),
    max: "0",
  })}`;
}

type TopPosts = {
  /** the site's own today, `YYYY-MM-DD` */
  date?: unknown;
  days?: Record<
    string,
    { postviews?: { id: number; type: string; views: number }[] }
  >;
};

const DAY_MS = 24 * 60 * 60_000;

/* every month from `COUNTED_SINCE` through `last`'s, as `YYYY-MM` */
function monthsThrough(last: string): string[] {
  const months: string[] = [];
  let [year, month] = COUNTED_SINCE.split("-").map(Number) as [number, number];
  for (;;) {
    const key = `${year}-${String(month).padStart(2, "0")}`;
    if (key > last.slice(0, 7)) return months;
    months.push(key);
    if (++month > 12) [year, month] = [year + 1, 1];
  }
}

/**
 * `top-posts` by month, as views per post, from an answer to `postViewsUrl()`
 * asked at `now`. Throws on any other shape, and on an answer missing a month
 * since counting began: a post read only in that month would count as read by
 * nobody
 */
export function postViewsOf(body: unknown, now = new Date()): PostViews {
  const { date, days } = (body ?? {}) as TopPosts;
  if (!days || typeof days !== "object" || Array.isArray(days))
    throw new Error("WordPress stats answered without any months");
  /* the site's today is a day either side of anyone's */
  if (
    typeof date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Math.abs(Date.parse(`${date}T12:00:00Z`) - now.getTime()) > 2 * DAY_MS
  )
    throw new Error(`WordPress stats answered as of ${String(date)}`);
  const missing = monthsThrough(date).filter((m) => !(`${m}-01` in days));
  if (missing.length > 0)
    throw new Error(`WordPress stats answered without ${missing.join(", ")}`);

  const views: PostViews = {};
  for (const [day, { postviews } = {}] of Object.entries(days)) {
    if (!/^\d{4}-\d{2}-01$/.test(day) || !Array.isArray(postviews))
      throw new Error(`WordPress stats answered a month as ${day}`);
    for (const row of postviews) {
      /* checked before anything is skipped: `null <= 0`, so a row missing
         its count would otherwise pass for one nobody read */
      const valid =
        typeof row?.type === "string" &&
        Number.isInteger(row.id) &&
        row.id >= (row.type === "post" ? 1 : 0) &&
        Number.isInteger(row.views) &&
        row.views >= 0;
      if (!valid)
        throw new Error("WordPress stats answered a row it did not count");
      /* the home page and pages are counted too, and are not articles */
      if (row.type !== "post" || row.views === 0) continue;
      (views[row.id] ??= {})[day.slice(0, 7)] = row.views;
    }
  }
  return views;
}
