import type { APIRoute } from "astro";
import { refusal } from "~/lib/admin-api";
import { adminAccess } from "~/lib/admin";
import { loadSheet } from "~/lib/credits/load";

export const prerender = false;

/* The Sheet's real names: the board's only. WordPress is read, and the archive
   built, in the browser (ADR 0012), so this is all the Worker does. */
export const GET: APIRoute = async ({ request }) => {
  const access = await adminAccess(request);
  if (!access.allowed) return refusal(access.denial, access.who?.profile);

  try {
    return Response.json(await loadSheet(), {
      /* no-store: a save must show on the next read, and real names must not
         sit in a browser cache after signing out */
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    console.error("[archive] could not read the Sheet", error);
    return new Response(`could not read the Sheet: ${String(error)}`, {
      status: 502,
      headers: { "cache-control": "no-store" },
    });
  }
};
