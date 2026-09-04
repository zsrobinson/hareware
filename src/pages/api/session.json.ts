import type { APIRoute } from "astro";
import { editorialBoardMember } from "~/lib/admin";
import { getSessionSecret } from "~/lib/auth-config";
import { getSession } from "~/lib/session";

/*
  the pages the cdn caches ship the same anonymous html to everyone, so the
  sidebar cannot know from the markup whether to show the editorial nav. it
  asks here instead, which is never cached
*/
export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request, getSessionSecret());

  /*
    the sidebar needs this too, and asking discord is the same call the admin
    pages make — so a role removed there empties the group on the next load
  */
  const admin =
    session !== null && (await editorialBoardMember(request)) !== null;

  return new Response(
    JSON.stringify({
      signedIn: session !== null,
      discordUserId: session?.discordUserId ?? null,
      displayName: session?.displayName ?? null,
      username: session?.username ?? null,
      avatar: session?.avatar ?? null,
      admin,
    }),
    {
      headers: {
        "content-type": "application/json",
        "cache-control": "private, no-store",
      },
    },
  );
};
