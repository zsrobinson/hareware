import type { APIRoute } from "astro";
import { viewer } from "~/lib/admin";

/*
  the pages the cdn caches ship the same anonymous html to everyone, so the
  account panel cannot know from the markup who is signed in. it asks here
  instead, which is never cached.

  what it does NOT answer is whether they are on the editorial board. the nav
  shows every tool to everybody and the admin pages refuse in person, so no
  island has a reason to ask — and a role is not something to hand out over an
  endpoint nothing needs it from
*/
export const GET: APIRoute = async ({ request }) => {
  const who = await viewer(request);

  return new Response(
    JSON.stringify({
      signedIn: who !== null,
      discordUserId: who?.session.discordUserId ?? null,
      profile: who?.profile ?? null,
    }),
    {
      headers: {
        "content-type": "application/json",
        "cache-control": "private, no-store",
      },
    },
  );
};
