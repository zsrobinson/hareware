import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";
import { record } from "~/lib/log";
import { DISCORD_PUBLIC_KEY } from "~/lib/services/discord/config";
import { handleInteraction } from "~/lib/services/discord/interactions";
import { readArticle, recentArticles, search } from "~/lib/articles/live";
import { notionIO, runEdit } from "~/lib/articles/edit";
import { verifyInteraction } from "~/lib/services/discord/verify";

export const prerender = false;

const MESSAGE_COMPONENT = 3;

/* Discord's interactions endpoint. Answers nothing it cannot verify. */
export const POST: APIRoute = async ({ request, locals }) => {
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

  const reply = await handleInteraction(interaction as never, {
    articles: env.NOTION_TOKEN
      ? () => recentArticles(env.NOTION_TOKEN!)
      : undefined,
    search: env.NOTION_TOKEN
      ? (text) => search(env.NOTION_TOKEN!, text)
      : undefined,
    page: env.NOTION_TOKEN
      ? (pageId) => readArticle(env.NOTION_TOKEN!, pageId)
      : undefined,

    edit: env.NOTION_TOKEN
      ? (edit, actor) => runEdit(notionIO(env), edit, actor)
      : undefined,

    /* a promise left floating past the response may never finish */
    defer: (work) => locals.cfContext.waitUntil(work()),
  });
  if (!reply) return new Response("unhandled interaction", { status: 400 });

  const press = interaction as {
    type?: number;
    data?: { custom_id?: string };
    member?: { user?: { username?: string; id?: string } };
  };

  /* a button press is logged here; a command logs itself when it writes */
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
