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

async function hmacKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function seal(value: string, secret: string) {
  const payload = toBase64Url(encoder.encode(value));
  const signature = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(secret),
    encoder.encode(payload),
  );

  return `${payload}.${toBase64Url(new Uint8Array(signature))}`;
}

export async function unseal(value: string, secret: string) {
  const separator = value.lastIndexOf(".");
  if (separator === -1 || !secret) return null;

  const payload = value.slice(0, separator);
  const signature = value.slice(separator + 1);

  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(secret),
      fromBase64Url(signature),
      encoder.encode(payload),
    );

    return valid ? decoder.decode(fromBase64Url(payload)) : null;
  } catch {
    return null;
  }
}
