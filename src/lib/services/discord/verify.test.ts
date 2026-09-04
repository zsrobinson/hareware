import { expect, test } from "vitest";
import { verifyInteraction } from "./verify";
import { DISCORD_PUBLIC_KEY } from "./config";

const encoder = new TextEncoder();
const toHex = (bytes: ArrayBuffer) =>
  [...new Uint8Array(bytes)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

/** stands in for discord: signs a body the way discord signs an interaction */
/* discord's timestamps are unix seconds, and verification now requires one
   close to now — so the default is generated rather than fixed */
const nowSeconds = () => String(Math.floor(Date.now() / 1000));

async function signed(body: string, timestamp = nowSeconds()) {
  const pair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;

  const signature = await crypto.subtle.sign(
    { name: "Ed25519" },
    pair.privateKey,
    encoder.encode(timestamp + body),
  );

  return {
    publicKey: toHex(await crypto.subtle.exportKey("raw", pair.publicKey)),
    request: new Request("https://hareware.test/api/discord/interactions", {
      method: "POST",
      headers: {
        "x-signature-ed25519": toHex(signature),
        "x-signature-timestamp": timestamp,
      },
      body,
    }),
  };
}

test("accepts a correctly signed request and returns its body", async () => {
  const body = JSON.stringify({ type: 1 });
  const { publicKey, request } = await signed(body);

  expect(await verifyInteraction(request, publicKey)).toBe(body);
});

/*
  discord will not save an interactions endpoint url unless it rejects a
  deliberately corrupted request, so this case is the one that gates setup
*/
test("rejects a body that was tampered with after signing", async () => {
  const { publicKey, request } = await signed(JSON.stringify({ type: 1 }));

  const tampered = new Request(request, { body: JSON.stringify({ type: 2 }) });

  expect(await verifyInteraction(tampered, publicKey)).toBeUndefined();
});

test("rejects a signature from the wrong key", async () => {
  const { request } = await signed(JSON.stringify({ type: 1 }));

  // our real public key, which did not sign this
  expect(await verifyInteraction(request, DISCORD_PUBLIC_KEY)).toBeUndefined();
});

test("rejects a replay under a different timestamp", async () => {
  const body = JSON.stringify({ type: 1 });
  const { publicKey, request } = await signed(body);

  const moved = new Request(request, { body });
  // still inside the freshness window, so this tests the signature rather
  // than the clock — the point is that the timestamp is covered by it
  moved.headers.set("x-signature-timestamp", String(Number(nowSeconds()) - 30));

  expect(await verifyInteraction(moved, publicKey)).toBeUndefined();
});

test.each([["x-signature-ed25519"], ["x-signature-timestamp"]])(
  "rejects a request missing %s",
  async (header) => {
    const { publicKey, request } = await signed(JSON.stringify({ type: 1 }));

    const stripped = new Request(request, {
      body: JSON.stringify({ type: 1 }),
    });
    stripped.headers.delete(header);

    expect(await verifyInteraction(stripped, publicKey)).toBeUndefined();
  },
);

test.each([
  ["not hex at all", "zzzz"],
  ["odd length", "abc"],
  ["empty", ""],
])("rejects a malformed signature (%s) without throwing", async (_, bad) => {
  const { publicKey, request } = await signed(JSON.stringify({ type: 1 }));

  const broken = new Request(request, { body: JSON.stringify({ type: 1 }) });
  broken.headers.set("x-signature-ed25519", bad);

  expect(await verifyInteraction(broken, publicKey)).toBeUndefined();
});

test("the configured public key is a usable ed25519 key", async () => {
  const raw = Uint8Array.from(
    DISCORD_PUBLIC_KEY.match(/../g)!.map((b) => parseInt(b, 16)),
  );

  await expect(
    crypto.subtle.importKey("raw", raw, { name: "Ed25519" }, false, ["verify"]),
  ).resolves.toBeDefined();
});

test("rejects a correctly signed interaction too old to be live", async () => {
  // a captured request stays signed forever; only the clock says it is stale
  const old = String(Number(nowSeconds()) - 10 * 60);
  const { publicKey, request } = await signed("{}", old);

  expect(await verifyInteraction(request, publicKey)).toBeUndefined();
});

test("rejects one timestamped well into the future", async () => {
  const ahead = String(Number(nowSeconds()) + 10 * 60);
  const { publicKey, request } = await signed("{}", ahead);

  expect(await verifyInteraction(request, publicKey)).toBeUndefined();
});

test("allows the clock skew a real request can carry", async () => {
  const skewed = String(Number(nowSeconds()) - 60);
  const { publicKey, request } = await signed("{}", skewed);

  expect(await verifyInteraction(request, publicKey)).toBe("{}");
});

test("rejects a timestamp that is not a number", async () => {
  const { publicKey, request } = await signed("{}", "soon");

  expect(await verifyInteraction(request, publicKey)).toBeUndefined();
});
