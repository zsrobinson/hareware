import { ORIGIN } from "./article-url";

/*
  WordPress's REST API, passed through from HareWare's own origin, for the
  browser. A browser's cross-origin request carries an Origin header, and
  WordPress.com answers any request with one from its server rather than its
  cache: about 400 ms for an article, against about 130 ms from the cache
  (measured 2026-11-07). Asked from the Worker there is no Origin, so the
  cache answers, and the browser reuses the connection it already has.

  src/worker.ts calls this before Astro sees the request, so it costs the
  Worker only the fetch, and the body is streamed through unread. It passes
  only what the pages ask for: two collections and the query keys they use.
  When it fails, the browser asks WordPress itself (./request).
*/

export const PREFIX = "/api/wordpress/";

const COLLECTIONS = new Set(["wp/v2/posts", "wp/v2/categories"]);
const KEYS = new Set([
  "slug",
  "per_page",
  "page",
  "offset",
  "status",
  "after",
  "order",
  "_embed",
  "_fields",
]);
/* WordPress's own headers worth keeping: what it is, how it is compressed,
   and how many pages. Content-Encoding has to stay: with it, the Worker
   forwards WordPress's compressed bytes as they are; without it, the Worker
   decompresses them and the edge compresses them again, which on the
   archive's 500 KB pages is CPU the Worker pays for */
const PASSED = [
  "content-type",
  "content-encoding",
  "vary",
  "x-wp-total",
  "x-wp-totalpages",
];

/** WordPress's answer to a GET of `/api/wordpress/<collection>?<query>` */
export async function passThrough(url: URL): Promise<Response> {
  const collection = url.pathname.slice(PREFIX.length);
  if (!COLLECTIONS.has(collection))
    return new Response("not a collection HareWare reads", { status: 404 });

  const query = new URLSearchParams();
  for (const [key, value] of url.searchParams)
    if (KEYS.has(key) && value.length <= 2000) query.set(key, value);

  let upstream: Response;
  try {
    upstream = await fetch(`${ORIGIN}/wp-json/${collection}?${query}`, {
      headers: { accept: "application/json", "accept-encoding": "br, gzip" },
    });
  } catch (error) {
    console.error("[wordpress] could not pass the request through", error);
    return new Response("WordPress did not answer", { status: 502 });
  }

  const headers = new Headers({
    "x-content-type-options": "nosniff",
    /* a minute at Cloudflare's edge, so a repeat from nearby never reaches
       the Worker; none in the browser, whose own query cache already keeps
       a read between pages, so a reload after a fix asks again */
    "cache-control": "public, max-age=0, s-maxage=60",
  });
  for (const name of PASSED) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(upstream.body, { status: upstream.status, headers });
}
