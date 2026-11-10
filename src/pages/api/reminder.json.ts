import type { APIRoute } from "astro";
import { refusal } from "~/lib/admin-api";
import { adminAccess } from "~/lib/admin";
import { reminderView } from "~/lib/reminder-view";

export const prerender = false;

/* The log and the next run's plan, for the page's island. The page itself is a
   static shell (ADR 0012); this is the part that needs D1 and the board role. */
export const GET: APIRoute = async ({ request }) => {
  const access = await adminAccess(request);
  if (!access.allowed) return refusal(access.denial, access.who?.profile);

  return Response.json(await reminderView(), {
    headers: { "cache-control": "private, no-store" },
  });
};
