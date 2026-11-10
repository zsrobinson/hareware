import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";
import { record } from "~/lib/log";
import { DISCORD_PUBLIC_KEY } from "~/lib/services/discord/config";
import {
  describePress,
  handleInteraction,
  type Interaction,
} from "~/lib/services/discord/interactions";
import { verifyInteraction } from "~/lib/services/discord/verify";

export const prerender = false;

/* Discord's interactions endpoint. Answers nothing it cannot verify. */
export const POST: APIRoute = async ({ request }) => {
  const body = await verifyInteraction(request, DISCORD_PUBLIC_KEY);

  // Discord checks for a 401 before it accepts the endpoint url
  if (body === undefined) {
    return new Response("invalid request signature", { status: 401 });
  }

  let interaction: unknown;
  try {
    interaction = JSON.parse(body);
  } catch {
    return new Response("malformed interaction", { status: 400 });
  }

  const press = interaction as Interaction;
  const reply = handleInteraction(press);
  if (!reply) return new Response("unhandled interaction", { status: 400 });

  const summary = describePress(press, reply);
  if (summary) {
    await record(env.DB, {
      source: "button",
      action: "mark-posted",
      outcome: "ok",
      summary,
      actor: press.member?.user?.id ?? press.user?.id,
    });
  }

  return Response.json(reply, {
    headers: { "cache-control": "private, no-store" },
  });
};
