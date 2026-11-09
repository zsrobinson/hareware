import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";
import { adminAccess } from "~/lib/admin";
import { applyEdit, describeEdit, parseEdit } from "~/lib/credits/edits";
import { sheetsClient } from "~/lib/credits/load";
import { refusal } from "~/lib/admin-api";
import { record } from "~/lib/log";
import { ViewConflict } from "~/lib/credits/sheet";
import { Sheets } from "~/lib/services/google/sheets";

export const prerender = false;

/* Every change the signed-in pages make to the Sheet comes through here. A
   change to views answers with the `updated at` it wrote, which the page
   reads back before it says Saved; a conflict is 409, with what changed. */
export const POST: APIRoute = async ({ request }) => {
  const access = await adminAccess(request);
  if (!access.allowed) {
    return refusal(access.denial, access.who?.profile);
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
  let updatedAt: string | void;
  try {
    updatedAt = await applyEdit(client, edit, who);
  } catch (error) {
    if (error instanceof ViewConflict) {
      await record(env.DB, {
        source: "manual",
        action: "sheet-edit",
        outcome: "skipped",
        summary: `changed since it was opened, so not: ${describeEdit(edit)}`,
        actor: access.who.session.discordUserId,
      });
      return Response.json({ conflict: error.message }, { status: 409 });
    }
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
  return updatedAt
    ? Response.json({ updatedAt })
    : new Response(null, { status: 204 });
};
