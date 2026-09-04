/*
  every webhook notion sends is signed, and an endpoint that does not check the
  signature is an endpoint anyone on the internet can drive — here, into
  fetching arbitrary pages and rewriting rows of the article index.

  the signing key is not the integration token. it is the one-time
  `verification_token` notion posts when the subscription is first created,
  which is why NOTION_WEBHOOK_SECRET exists separately: the handshake happens
  once, in notion's UI, against an endpoint that must already be live
*/

const encoder = new TextEncoder();

/** the header notion signs with, `sha256=` followed by lowercase hex */
const PREFIX = "sha256=";

/*
  allocated rather than built with `Uint8Array.from`, which infers
  `ArrayBufferLike` and will not satisfy webcrypto's `BufferSource`
*/
function fromHex(hex: string): Uint8Array<ArrayBuffer> | undefined {
  if (hex.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(hex)) return undefined;

  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }

  return bytes;
}

/**
 * whether two byte strings match, in time that does not depend on where they
 * first differ.
 *
 * `===` on the hex would leak the length of the correct prefix over enough
 * attempts, and a webhook endpoint accepts as many attempts as anyone cares to
 * make
 */
function sameBytes(a: Uint8Array, b: Uint8Array) {
  if (a.byteLength !== b.byteLength) return false;

  let difference = 0;
  for (let i = 0; i < a.byteLength; i++) difference |= a[i]! ^ b[i]!;

  return difference === 0;
}

/**
 * the request body, if notion really sent it, and undefined otherwise.
 *
 * returns the body rather than a boolean for the same reason
 * `verifyInteraction` does: a request body can only be read once, and the
 * signature covers those exact bytes, so a caller that re-read its own copy
 * could verify one thing and then act on another
 */
export async function verifyWebhook(
  request: Request,
  secret: string | undefined,
): Promise<string | undefined> {
  /* no secret means the handshake has not happened yet. fail closed: an
     endpoint that accepts anything until it is configured is an endpoint that
     is wide open for exactly as long as somebody forgets */
  if (!secret) return undefined;

  const header = request.headers.get("x-notion-signature");
  if (!header?.startsWith(PREFIX)) return undefined;

  const sent = fromHex(header.slice(PREFIX.length));
  if (!sent) return undefined;

  const body = await request.text();

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(body)),
  );

  return sameBytes(sent, expected) ? body : undefined;
}

/** the events we act on. everything else is acknowledged and ignored */
export type WebhookEvent = {
  type: string;
  entity?: { id?: string; type?: string };
  data?: { parent?: { id?: string; type?: string } };
};

/**
 * the page id an event is about, when the event is one that changes a row of
 * the Articles database.
 *
 * notion's payloads carry ids and never values — a `page.properties_updated`
 * names which property ids changed, not what they changed to — so acting on
 * one always means fetching the page. that is not a shortcoming worked around
 * here; it is why the sync fetches rather than applies a delta, which is also
 * what makes out-of-order delivery harmless
 */
export function changedPage(event: WebhookEvent): string | undefined {
  const interesting = [
    "page.created",
    "page.properties_updated",
    "page.content_updated",
    "page.deleted",
    "page.undeleted",
    "page.moved",
  ];

  if (!interesting.includes(event.type)) return undefined;
  if (event.entity?.type !== "page") return undefined;

  return event.entity.id;
}

/** whether an event says the schema changed, so the pickers need rebuilding */
export function schemaChanged(event: WebhookEvent) {
  return (
    event.type === "data_source.schema_updated" ||
    event.type === "database.schema_updated"
  );
}
