import type { APIRoute } from "astro";
import { viewer } from "~/lib/admin";

/*
  the pages the cdn caches ship the same anonymous html to everyone, so the
  sidebar cannot know from the markup who is signed in or whether to show the
  editorial nav. it asks here instead, which is never cached.

  one call answers both, so the name and the permission always come from the
  same moment — a role removed in discord empties the group on the next load,
  and a nickname changed there is on screen just as fast
*/
export const GET: APIRoute = async ({ request }) => {
  const who = await viewer(request);

  return new Response(
    JSON.stringify({
      signedIn: who !== null,
      discordUserId: who?.session.discordUserId ?? null,
      profile: who?.profile ?? null,
      admin: who?.admin ?? false,
    }),
    {
      headers: {
        "content-type": "application/json",
        "cache-control": "private, no-store",
      },
    },
  );
};
