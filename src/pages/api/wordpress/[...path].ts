import type { APIRoute } from "astro";
import { ORIGIN } from "~/lib/services/wordpress/article-url";

export const prerender = false;

/*
  WordPress's REST API, passed through from our own origin. A browser's
  cross-origin request carries an Origin header, and WordPress.com answers any
  request with one from its server rather than its cache: about 400 ms for an
  article, against about 130 ms from the cache (measured 2026-11-07). Asked
  from here there is no Origin, so the cache answers, and the browser reuses
  the connection it already has to this site.

  The body is streamed through unread, so this costs the Worker about what a
  refusal does (ADR 0012). It passes only what the pages ask for: two
  collections and the query keys they use. When it fails, the browser asks
  WordPress itself (~/lib/services/wordpress/request).
*/

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
/* WordPress's own headers worth keeping: what it is, and how many pages */
const PASSED = ["content-type", "x-wp-total", "x-wp-totalpages"];

export const GET: APIRoute = async ({ params, url }) => {
  const collection = params.path ?? "";
  if (!COLLECTIONS.has(collection))
    return new Response("not a collection HareWare reads", { status: 404 });

  const query = new URLSearchParams();
  for (const [key, value] of url.searchParams)
    if (KEYS.has(key) && value.length <= 2000) query.set(key, value);

  let upstream: Response;
  try {
    upstream = await fetch(`${ORIGIN}/wp-json/${collection}?${query}`, {
      headers: { accept: "application/json" },
    });
  } catch (error) {
    console.error("[wordpress] could not pass the request through", error);
    return new Response("WordPress did not answer", { status: 502 });
  }

  const headers = new Headers({
    /* the cache WordPress answers from is minutes behind at most; a minute
       more in the browser saves going back and forth between pages */
    "cache-control": "public, max-age=60",
  });
  for (const name of PASSED) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(upstream.body, { status: upstream.status, headers });
};
