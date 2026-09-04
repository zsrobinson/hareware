const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function fromBase64Url(value: string) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

/**
 * what a sealed value is for. two cookies, two keys.
 *
 * both the session and the oauth state are sealed with the same secret in the
 * same format, and `GET /auth/discord?returnTo=…` will sign an attacker's
 * string for them, unauthenticated. The two payloads happen not to be
 * interchangeable today — each reader requires a field the other lacks — but
 * that is a property of the current field names, not of the design. One field
 * added with an unlucky name turns the sign-in endpoint into a session-forgery
 * oracle, and nothing in the code makes that constraint visible.
 *
 * so the purpose goes into the key. a state cookie replayed as a session does
 * not verify, whatever fields either grows later
 */
export type Purpose = "session" | "oauth-state";

async function hmacKey(secret: string, purpose: Purpose) {
  /*
    HMAC over a fixed label is a standard way to derive a subkey, and needs no
    dependency: distinct labels give unrelated keys
  */
  const base = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const derived = await crypto.subtle.sign(
    "HMAC",
    base,
    encoder.encode(`hareware:${purpose}`),
  );

  return crypto.subtle.importKey(
    "raw",
    derived,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function seal(value: string, secret: string, purpose: Purpose) {
  const payload = toBase64Url(encoder.encode(value));
  const signature = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(secret, purpose),
    encoder.encode(payload),
  );

  return `${payload}.${toBase64Url(new Uint8Array(signature))}`;
}

export async function unseal(value: string, secret: string, purpose: Purpose) {
  const separator = value.lastIndexOf(".");
  if (separator === -1 || !secret) return null;

  const payload = value.slice(0, separator);
  const signature = value.slice(separator + 1);

  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(secret, purpose),
      fromBase64Url(signature),
      encoder.encode(payload),
    );

    return valid ? decoder.decode(fromBase64Url(payload)) : null;
  } catch {
    return null;
  }
}
