import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";
import { adminAccess } from "~/lib/admin";
import { applyEdit, describeEdit, parseEdit } from "~/lib/credits/edits";
import { sheetsClient } from "~/lib/credits/load";
import { DENIALS } from "~/lib/denial";
import { record } from "~/lib/log";
import { Sheets } from "~/lib/services/google/sheets";

export const prerender = false;

/* Every change the signed-in pages make to the Sheet comes through here. */
export const POST: APIRoute = async ({ request }) => {
  const access = await adminAccess(request);
  if (!access.allowed) {
    const { status, title } = DENIALS[access.denial];
    return new Response(title, { status });
  }

  const edit = parseEdit(await request.json().catch(() => undefined));
  if ("error" in edit) return new Response(edit.error, { status: 400 });

  const client = sheetsClient();
  if (!(client instanceof Sheets))
    return new Response(
      `The Sheet is not connected: ${client.missing.join(", ")} unset`,
      { status: 503 },
    );

  const who = access.who.profile?.displayName ?? "someone";
  try {
    await applyEdit(client, edit, who);
  } catch (error) {
    await record(env.DB, {
      source: "manual",
      action: "sheet-edit",
      outcome: "failed",
      summary: `could not save: ${describeEdit(edit)}`,
      actor: access.who.session.discordUserId,
    });
    return new Response(
      String(error instanceof Error ? error.message : error),
      { status: 502 },
    );
  }

  await record(env.DB, {
    source: "manual",
    action: "sheet-edit",
    outcome: "ok",
    summary: describeEdit(edit),
    actor: access.who.session.discordUserId,
  });
  return new Response(null, { status: 204 });
};
