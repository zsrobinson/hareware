import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";
import { adminAccess } from "~/lib/admin";
import { refusal } from "~/lib/admin-api";

export const prerender = false;

/* Every change the signed-in pages make to the Sheet comes through here. */
export const POST: APIRoute = async ({ request }) => {
  const access = await adminAccess(request);
  if (!access.allowed) {
    return refusal(access.denial, access.who?.profile);
  }

  /* loaded after the gate, so a refusal never loads the Sheets client or D1's */
  const [
    { applyEdit, describeEdit, parseEdit },
    { sheetsClient },
    { record },
    { Sheets },
  ] = await Promise.all([
    import("~/lib/credits/edits"),
    import("~/lib/credits/load"),
    import("~/lib/log"),
    import("~/lib/services/google/sheets"),
  ]);

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
