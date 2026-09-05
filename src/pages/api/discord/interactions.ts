import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";
import { record } from "~/lib/log";
import { DISCORD_PUBLIC_KEY } from "~/lib/services/discord/config";
import { handleInteraction } from "~/lib/services/discord/interactions";
import { search } from "~/lib/articles/store";
import { readArticle } from "~/lib/articles/card";
import { verifyInteraction } from "~/lib/services/discord/verify";

export const prerender = false;

/** discord's interaction type for a button press */
const MESSAGE_COMPONENT = 3;

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

  /* awaited: `handleInteraction` reads d1 for autocomplete and notion for
     `show`, so it returns a promise — and an un-awaited one is truthy, which
     would have answered every interaction, button presses included, with a
     serialised promise */
  const reply = await handleInteraction(interaction as never, {
    /*
      supplied here rather than imported inside the handler, so every branch of
      it — including the ones that fail — is reachable from a test without a
      d1 binding or a notion token
    */
    search: env.DB
      ? (query, limit) => search(env.DB!, query, limit)
      : undefined,
    page: env.NOTION_TOKEN
      ? (pageId) => readArticle(pageId, env.NOTION_TOKEN!)
      : undefined,
  });
  if (!reply) return new Response("unhandled interaction", { status: 400 });

  /*
    a button press is the only record of who marked what, and it costs one
    insert on a request that happens anyway. the ping discord sends to check
    this endpoint is not an invocation
  */
  const press = interaction as {
    type?: number;
    data?: { custom_id?: string };
    member?: { user?: { username?: string; id?: string } };
  };

  /*
    slash commands answer through the same handler and are logged when they
    write, not when they run: ADR 0009 makes every *mutation* an invocation, and
    `/article ping` mutates nothing. a row saying "article-edit" for a command
    that edited nothing is the kind of log entry that makes the log unreadable.
    the write paths record from where they follow up, which is also the only
    place that knows whether the write landed
  */
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
