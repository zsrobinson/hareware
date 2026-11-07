import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";
import { adminAccess } from "~/lib/admin";
import { sheetsClient } from "~/lib/credits/load";
import { markFine } from "~/lib/credits/sheet";
import { DENIALS } from "~/lib/denial";
import { record } from "~/lib/log";
import { Sheets } from "~/lib/services/google/sheets";

export const prerender = false;

/* Adds a post to the Sheet's Ignored tab, so its problems stop being listed. */
export const POST: APIRoute = async ({ request }) => {
  const access = await adminAccess(request);
  if (!access.allowed) {
    const { status, title } = DENIALS[access.denial];
    return new Response(title, { status });
  }

  const body = (await request.json().catch(() => ({}))) as { postId?: unknown };
  const postId = Number(body.postId);
  if (!Number.isInteger(postId) || postId <= 0)
    return new Response("postId must be a WordPress post id", { status: 400 });

  const client = sheetsClient();
  if (!(client instanceof Sheets))
    return new Response(
      `The Sheet is not connected: ${client.missing.join(", ")}`,
      { status: 503 },
    );

  const who = access.who.profile?.displayName ?? "someone";
  const day = new Date().toISOString().slice(0, 10);
  try {
    await markFine(client, postId, `marked fine by ${who} on ${day}`);
    await record(env.DB, {
      source: "manual",
      action: "sheet-ignore",
      outcome: "ok",
      summary: `marked post ${postId} fine`,
      actor: access.who.session.discordUserId,
    });
    return Response.json({ postId });
  } catch (error) {
    return new Response(
      String(error instanceof Error ? error.message : error),
      { status: 502 },
    );
  }
};
