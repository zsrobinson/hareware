import type { APIRoute } from "astro";
import { viewer } from "~/lib/admin";

/*
  A cached page ships the same anonymous html to everyone, so the account panel
  asks here instead, and this is never cached. It includes the single admin
  decision navigation needs, without exposing Discord's role ids.
*/
export const GET: APIRoute = async ({ request }) => {
  const who = await viewer(request);

  return new Response(
    JSON.stringify({
      signedIn: who !== null,
      discordUserId: who?.session.discordUserId ?? null,
      profile: who?.profile ?? null,
      admin: who?.admin === true,
    }),
    {
      headers: {
        "content-type": "application/json",
        "cache-control": "private, no-store",
      },
    },
  );
};
