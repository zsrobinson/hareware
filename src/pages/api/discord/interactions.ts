import type { APIRoute } from "astro";
import { DISCORD_PUBLIC_KEY } from "~/lib/discord/config";
import { handleInteraction } from "~/lib/discord/interactions";
import { verifyInteraction } from "~/lib/discord/verify";

export const prerender = false;

/*
  discord's interactions endpoint url points here. it is never cached — the
  worker's `cache` config only ever applies to GETs, and this is a POST — and it
  answers nothing it cannot verify came from discord
*/
export const POST: APIRoute = async ({ request }) => {
  const body = await verifyInteraction(request, DISCORD_PUBLIC_KEY);

  // discord requires a 401 here, and checks for one before it will accept
  // this url at all
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

  return new Response(JSON.stringify(reply), {
    headers: {
      "content-type": "application/json",
      "cache-control": "private, no-store",
    },
  });
};
