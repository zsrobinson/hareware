import { expect, test } from "vitest";
import { changedPage, schemaChanged, verifyWebhook } from "./webhook";

/*
  the signature this file checks against was computed independently, with
  python's hmac, rather than by calling the code under test — a test that signs
  with the same function it verifies with passes even when both agree on the
  wrong algorithm
*/
const SECRET = "secret_test";
const BODY = '{"type":"page.created"}';
const SIGNATURE =
  "1fff4e00a80402b93ec011c942c22032c57927da109a143476cb84d3005bd8a9";

function signed(body = BODY, signature = SIGNATURE) {
  return new Request("https://hareware.test/api/notion/webhook", {
    method: "POST",
    headers: { "x-notion-signature": `sha256=${signature}` },
    body,
  });
}

test("accepts a body notion signed, and returns those exact bytes", async () => {
  expect(await verifyWebhook(signed(), SECRET)).toBe(BODY);
});

test("rejects a body that was altered after signing", async () => {
  const tampered = '{"type":"page.deleted"}';
  expect(await verifyWebhook(signed(tampered), SECRET)).toBeUndefined();
});

test("rejects a signature that is right except for one character", async () => {
  const off = SIGNATURE.slice(0, -1) + (SIGNATURE.endsWith("9") ? "8" : "9");
  expect(await verifyWebhook(signed(BODY, off), SECRET)).toBeUndefined();
});

test("rejects a signature signed with a different secret", async () => {
  expect(await verifyWebhook(signed(), "secret_other")).toBeUndefined();
});

test("rejects everything while the secret is unset", async () => {
  /*
    the handshake happens after the endpoint is already live, so there is a
    window where this is deployed and unconfigured. accepting during it would
    mean an open endpoint for as long as somebody forgets to finish
  */
  expect(await verifyWebhook(signed(), undefined)).toBeUndefined();
});

test("rejects a request carrying no signature at all", async () => {
  const bare = new Request("https://hareware.test/api/notion/webhook", {
    method: "POST",
    body: BODY,
  });

  expect(await verifyWebhook(bare, SECRET)).toBeUndefined();
});

test("rejects a signature that is not hex", async () => {
  expect(await verifyWebhook(signed(BODY, "zz".repeat(32)), SECRET)).toBe(
    undefined,
  );
});

test("names the page an event is about", () => {
  const page = { id: "3d1be415", type: "page" };

  expect(changedPage({ type: "page.properties_updated", entity: page })).toBe(
    "3d1be415",
  );
  expect(changedPage({ type: "page.created", entity: page })).toBe("3d1be415");
  expect(changedPage({ type: "page.deleted", entity: page })).toBe("3d1be415");
});

test("ignores events that are not about a page changing", () => {
  const page = { id: "3d1be415", type: "page" };

  expect(
    changedPage({ type: "comment.created", entity: page }),
  ).toBeUndefined();
  expect(
    changedPage({
      type: "page.properties_updated",
      entity: { id: "x", type: "comment" },
    }),
  ).toBeUndefined();
});

test("recognises a schema change, under either name", () => {
  /* the database.* events are deprecated in favour of data_source.*, and both
     can still arrive depending on when the subscription was created */
  expect(schemaChanged({ type: "data_source.schema_updated" })).toBe(true);
  expect(schemaChanged({ type: "database.schema_updated" })).toBe(true);
  expect(schemaChanged({ type: "page.properties_updated" })).toBe(false);
});
