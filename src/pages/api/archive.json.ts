import type { APIRoute } from "astro";
import { adminAccess } from "~/lib/admin";
import { loadArchive } from "~/lib/credits/load";
import { DENIALS } from "~/lib/denial";

export const prerender = false;

/* The archive with the Sheet's real names in it: the board's only. `?fresh=1`
   rereads WordPress instead of the ten-minute copy. */
export const GET: APIRoute = async ({ request }) => {
  const access = await adminAccess(request);
  if (!access.allowed) {
    const { status, title } = DENIALS[access.denial];
    return new Response(title, { status });
  }

  const fresh = new URL(request.url).searchParams.has("fresh");
  try {
    const archive = await loadArchive({ fresh });
    return Response.json(archive, {
      /* no-store: a save must show on the next read, and real names must not
         sit in a browser cache after signing out */
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    console.error("[archive] could not load", error);
    return new Response(`could not read WordPress: ${String(error)}`, {
      status: 502,
      headers: { "cache-control": "no-store" },
    });
  }
};
