/* Ed25519 verification of Discord interactions, which webcrypto in workerd
   provides. */

const encoder = new TextEncoder();

/* not `Uint8Array.from`: its `ArrayBufferLike` is not a webcrypto
   `BufferSource` */
function fromHex(hex: string): Uint8Array<ArrayBuffer> | undefined {
  if (hex.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(hex)) return undefined;

  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }

  return bytes;
}

/** seconds a signed timestamp may be from now, either way */
const MAX_SKEW = 5 * 60;

function recent(timestamp: string) {
  const sent = Number(timestamp);
  if (!Number.isFinite(sent)) return false;

  return Math.abs(Date.now() / 1000 - sent) <= MAX_SKEW;
}

/**
 * The body if Discord signed it. Returned so the caller acts on the exact bytes
 * verified.
 */
export async function verifyInteraction(
  request: Request,
  publicKey: string,
): Promise<string | undefined> {
  const signature = request.headers.get("x-signature-ed25519");
  const timestamp = request.headers.get("x-signature-timestamp");
  const body = await request.text();

  if (!signature || !timestamp) return undefined;

  /* without a bound, a captured interaction could be replayed forever */
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
