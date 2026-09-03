import type { APIRoute } from "astro";
import { getSession } from "~/lib/session";

/*
  the pages the cdn caches ship the same anonymous html to everyone, so the
  sidebar cannot know from the markup whether to show the editorial nav. it
  asks here instead, which is never cached
*/
export const GET: APIRoute = ({ request }) => {
  const session = getSession(request);

  return new Response(JSON.stringify({ signedIn: session !== null }), {
    headers: {
      "content-type": "application/json",
      "cache-control": "private, no-store",
    },
  });
};
