import type { APIRoute } from "astro";
import { refusal } from "~/lib/admin-api";
import { adminAccess } from "~/lib/admin";

export const prerender = false;

/* whether the asker may use the admin tools, and if not which refusal it is:
   the static /access-denied page draws its answer (ADR 0012) */
export const GET: APIRoute = async ({ request }) => {
  const access = await adminAccess(request);
  if (!access.allowed) return refusal(access.denial, access.who?.profile);
  return new Response(null, {
    status: 204,
    headers: { "cache-control": "private, no-store" },
  });
};
