import type { APIRoute } from "astro";
import { adminAccess } from "~/lib/admin";
import { sheetsClient } from "~/lib/credits/load";
import { setUpSheet } from "~/lib/credits/sheet";
import { DENIALS } from "~/lib/denial";
import { record } from "~/lib/log";
import { env } from "cloudflare:workers";
import { Sheets } from "~/lib/services/google/sheets";

export const prerender = false;

/* Creates the Sheet's tabs and headers if they are missing. Never rewrites a
   row somebody entered. */
export const POST: APIRoute = async ({ request }) => {
  const access = await adminAccess(request);
  if (!access.allowed) {
    const { status, title } = DENIALS[access.denial];
    return new Response(title, { status });
  }

  const client = sheetsClient();
  if (!(client instanceof Sheets))
    return new Response(`not configured: ${client.missing.join(", ")}`, {
      status: 503,
    });

  try {
    const done = await setUpSheet(client);
    const summary =
      done.length > 0 ? done.join("; ") : "the Sheet was already set up";
    await record(env.DB, {
      source: "manual",
      action: "sheet-setup",
      outcome: "ok",
      summary,
      actor: access.who.session.discordUserId,
    });
    return Response.json({ summary });
  } catch (error) {
    return new Response(
      String(error instanceof Error ? error.message : error),
      { status: 502 },
    );
  }
};
