import type { APIRoute } from "astro";
import { viewer } from "~/lib/admin";

/*
  A cached page ships the same anonymous html to everyone, so the account panel
  asks here instead, and this is never cached. It answers who they are and not
  what they may do: no island needs the role, so nothing hands it out.
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
