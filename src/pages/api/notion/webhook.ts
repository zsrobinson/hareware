import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";
import { refreshChoices } from "~/lib/articles/choices";
import { refreshCommands } from "~/lib/articles/refresh";
import { syncPage } from "~/lib/articles/sync";
import {
  changedPage,
  schemaChanged,
  verifyWebhook,
  type WebhookEvent,
} from "~/lib/services/notion/webhook";

export const prerender = false;

/*
  notion tells us an article changed, so the picker does not have to wait an
  hour to say so.

  this is the fast path and not the correct one. delivery is at-most-once and
  unordered, so nothing here is relied on having arrived — the hourly rebuild is
  what makes the index right, and this only makes it right sooner. see ADR 0009
*/
export const POST: APIRoute = async ({ request }) => {
  /*
    verified against the exact bytes notion signed. a handler that re-read its
    own copy could check one thing and then act on another
  */
  const body = await verifyWebhook(request.clone(), env.NOTION_WEBHOOK_SECRET);

  if (body === undefined) return handshakeOrReject(request);

  let event: WebhookEvent;
  try {
    event = JSON.parse(body) as WebhookEvent;
  } catch {
    return new Response("malformed event", { status: 400 });
  }

  /*
    awaited rather than sent to `waitUntil`, on purpose: notion retries a
    delivery we answer with an error, up to eight times over about a day. doing
    the work before answering is what turns a transient notion failure into a
    retry rather than a row that is quietly a day stale
  */
  if (schemaChanged(event)) {
    const choices = await refreshChoices(env);
    /* the options live in the command *registration*, so a new status reaches
       an editor only once the surface is registered again */
    const commands = await refreshCommands(env);

    return outcome(`choices ${choices.outcome}, commands ${commands.outcome}`, [
      choices.outcome,
      commands.outcome,
    ]);
  }

  const pageId = changedPage(event);
  /* an event about something we do not index — a comment, a meeting page — is
     not a failure, and answering with one would have notion retry it eight
     times */
  if (!pageId) return new Response("ignored", { status: 200 });

  const result = await syncPage(env, pageId);

  return outcome(result.summary, [result.outcome]);
};

/** 200 unless something went wrong, in which case notion should try again */
function outcome(summary: string, outcomes: string[]) {
  const broken = outcomes.some((o) => o === "failed" || o === "misconfigured");

  return new Response(summary, { status: broken ? 500 : 200 });
}

/**
 * notion's one-time handshake, or a refusal.
 *
 * the subscription is created against an endpoint that must already be live,
 * and the token it posts is what every later signature is signed with — so
 * there is necessarily one request that cannot be verified. it is logged rather
 * than stored: anyone can post this shape, and a token that arrived over an
 * unverified request has no business being trusted into config
 */
async function handshakeOrReject(request: Request) {
  try {
    const body = (await request.json()) as { verification_token?: string };

    if (typeof body.verification_token === "string") {
      console.log(
        "[notion] webhook verification token received — set it as the " +
          `NOTION_WEBHOOK_SECRET secret: ${body.verification_token}`,
      );

      return new Response("verification token logged", { status: 200 });
    }
  } catch {
    // not json, so not the handshake either
  }

  return new Response("invalid webhook signature", { status: 401 });
}
