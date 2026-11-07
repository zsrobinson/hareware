import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";
import { record } from "~/lib/log";
import { DISCORD_PUBLIC_KEY } from "~/lib/services/discord/config";
import { handleInteraction } from "~/lib/services/discord/interactions";
import { verifyInteraction } from "~/lib/services/discord/verify";

export const prerender = false;

const MESSAGE_COMPONENT = 3;

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

  const reply = handleInteraction(interaction as never);
  if (!reply) return new Response("unhandled interaction", { status: 400 });

  const press = interaction as {
    type?: number;
    data?: { custom_id?: string };
    member?: { user?: { username?: string; id?: string } };
  };

  if (press.type === MESSAGE_COMPONENT) {
    await record(env.DB, {
      source: "button",
      action: "mark-posted",
      outcome: "ok",
      summary: `${press.member?.user?.username ?? "someone"} toggled ${press.data?.custom_id}`,
      actor: press.member?.user?.id,
    });
  }

  return new Response(JSON.stringify(reply), {
    headers: {
      "content-type": "application/json",
      "cache-control": "private, no-store",
    },
  });
};
