import type { APIRoute } from "astro";
import { viewer } from "~/lib/admin";

/*
  Every page is the same static html for everyone, so the account panel asks
  here who is looking, and this is never cached. It answers who they are, not
  what they may do: /api/access.json and the gated APIs answer that.
*/
export const GET: APIRoute = async ({ request }) => {
  const who = await viewer(request);

  return Response.json(
    {
      signedIn: who !== null,
      discordUserId: who?.session.discordUserId ?? null,
      profile: who?.profile ?? null,
    },
    { headers: { "cache-control": "private, no-store" } },
  );
};
