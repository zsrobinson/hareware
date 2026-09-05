import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";
import { record } from "~/lib/log";
import { DISCORD_PUBLIC_KEY } from "~/lib/services/discord/config";
import { handleInteraction } from "~/lib/services/discord/interactions";
import { readArticle, recentArticles, search } from "~/lib/articles/live";
import { notionIO, runEdit } from "~/lib/articles/edit";
import { verifyInteraction } from "~/lib/services/discord/verify";

export const prerender = false;

/*
  discord's interactions endpoint url points here. it is never cached — the
  worker's `cache` config only ever applies to GETs, and this is a POST — and it
  answers nothing it cannot verify came from discord
*/
export const POST: APIRoute = async ({ request, locals }) => {
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

  /* awaited: `handleInteraction` reads notion for autocomplete and for
     `show`, so it returns a promise — and an un-awaited one is truthy, which
     would have answered every interaction, button presses included, with a
     serialised promise */
  const reply = await handleInteraction(interaction as never, {
    /*
      supplied here rather than imported inside the handler, so every branch of
      it — including the ones that fail — is reachable from a test without a
      d1 binding or a notion token
    */
    articles: env.NOTION_TOKEN
      ? () => recentArticles(env.NOTION_TOKEN!)
      : undefined,
    search: env.NOTION_TOKEN
      ? (text) => search(env.NOTION_TOKEN!, text)
      : undefined,
    page: env.NOTION_TOKEN
      ? (pageId) => readArticle(env.NOTION_TOKEN!, pageId)
      : undefined,

    /*
      the write half, which runs after this response has already gone out.
      absent without a token, so the handler refuses the command inline rather
      than deferring into a spinner nothing ever answers
    */
    edit: env.NOTION_TOKEN
      ? (edit, actor) => runEdit(notionIO(env), edit, actor)
      : undefined,

    /*
      `waitUntil` and nothing else. a worker may tear the isolate down as soon
      as the response is returned, and a promise left floating past that is the
      write that lands four times out of five — which reads exactly like a
      flaky notion
    */
    defer: (work) => locals.cfContext.waitUntil(work()),

    /* the handler reports the state it actually rendered, so the Invocation
       cannot say only that the marker was "toggled" or disagree with Discord */
    recordPosted: (change) =>
      record(env.DB, {
        source: "button",
        action: "mark-posted",
        outcome: "ok",
        message: `Marked “${change.article}” as ${change.state === "posted" ? "posted" : "not posted"}.`,
        actor: change.actor.id,
      }),
  });
  if (!reply) return new Response("unhandled interaction", { status: 400 });

  return new Response(JSON.stringify(reply), {
    headers: {
      "content-type": "application/json",
      "cache-control": "private, no-store",
    },
  });
};
