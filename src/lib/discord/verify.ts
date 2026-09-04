/*
  every interaction discord sends is signed, and an endpoint that does not
  check the signature is an endpoint anyone on the internet can drive.

  discord validates a new endpoint url by sending one correctly signed request
  and one deliberately corrupted one, and refuses to save the url unless the
  second is rejected — so getting this wrong fails closed and loudly, which is
  the right way round
*/

const encoder = new TextEncoder();

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
 * the request body, if discord really sent it, and undefined otherwise.
 *
 * returns the body rather than a boolean because it has to read it here — a
 * request body can only be consumed once, and the signature covers the exact
 * bytes, so a caller that re-parsed its own copy could verify one thing and act
 * on another
 *
 * workerd implements ed25519 in webcrypto, so this needs no library
 */
/** how far from now a signed timestamp may be, in seconds, either direction */
const MAX_SKEW = 5 * 60;

/** whether discord's unix-seconds timestamp is close enough to now to accept */
function recent(timestamp: string) {
  const sent = Number(timestamp);
  if (!Number.isFinite(sent)) return false;

  // both directions: a clock ahead of ours is skew, not a replay
  return Math.abs(Date.now() / 1000 - sent) <= MAX_SKEW;
}

export async function verifyInteraction(
  request: Request,
  publicKey: string,
): Promise<string | undefined> {
  const signature = request.headers.get("x-signature-ed25519");
  const timestamp = request.headers.get("x-signature-timestamp");
  const body = await request.text();

  if (!signature || !timestamp) return undefined;

  /*
    a correctly signed interaction stays valid forever without this, so anyone
    who captured one could replay it and write invocation rows that look like a
    button press. discord's own guidance is to bound the timestamp; five
    minutes is generous for a request discord expects answered in three seconds
  */
  if (!recent(timestamp)) return undefined;

  const signatureBytes = fromHex(signature);
  const keyBytes = fromHex(publicKey);
  if (!signatureBytes || !keyBytes) return undefined;

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      keyBytes,
      { name: "Ed25519" },
      false,
      ["verify"],
    );

    const valid = await crypto.subtle.verify(
      { name: "Ed25519" },
      key,
      signatureBytes,
      encoder.encode(timestamp + body),
    );

    return valid ? body : undefined;
  } catch {
    // a malformed key or signature throws rather than returning false
    return undefined;
  }
}
