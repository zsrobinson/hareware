import { expect, test, vi } from "vitest";
import { completeDiscordSignOut } from "./auth";

/*
  where a sign-in may send somebody afterwards.

  `safeReturnTo` is not exported, so these go through the sign-out route, which
  is the shortest path to it: it takes a returnTo from a form post and answers
  with the Location it decided on.
*/
async function redirectedTo(returnTo: string) {
  const body = new FormData();
  body.set("returnTo", returnTo);

  const response = await completeDiscordSignOut(
    new Request("https://hareware.test/auth/logout", { method: "POST", body }),
  );

  return response.headers.get("location");
}

test("keeps a path on this site, with its query and hash", async () => {
  expect(await redirectedTo("/admin/log")).toBe("/admin/log");
  expect(await redirectedTo("/generate?article=x#y")).toBe(
    "/generate?article=x#y",
  );
});

test("refuses a protocol-relative url", async () => {
  expect(await redirectedTo("//evil.example")).toBe("/generate");
  expect(await redirectedTo("///evil.example")).toBe("/generate");
});

test("refuses one that becomes protocol-relative after normalisation", async () => {
  /*
    the hole this closes: `/..//evil.example` starts with a single slash and
    resolves to our own origin, because the escape happens inside the path —
    but `url.pathname` comes back as `//evil.example`, which a browser follows
    off-site. checking the input and returning the normalised value is what
    made the two disagree
  */
  expect(await redirectedTo("/..//evil.example")).toBe("/generate");
  expect(await redirectedTo("/./..//evil.example")).toBe("/generate");
  expect(await redirectedTo("/x/..//evil.example#f")).toBe("/generate");
  expect(await redirectedTo("/..//evil.example/path?x=1")).toBe("/generate");
});

test("refuses an absolute url and a javascript one", async () => {
  expect(await redirectedTo("https://evil.example")).toBe("/generate");
  expect(await redirectedTo("javascript:alert(1)")).toBe("/generate");
});

test("refuses a backslash, which some browsers read as a slash", async () => {
  expect(await redirectedTo("/\\evil.example")).toBe("/generate");
  expect(await redirectedTo("/\\@evil.example")).toBe("/generate");
});

test("signs out whatever the destination", async () => {
  const body = new FormData();
  body.set("returnTo", "/..//evil.example");

  const response = await completeDiscordSignOut(
    new Request("https://hareware.test/auth/logout", { method: "POST", body }),
  );

  // the cookie is cleared even when the redirect is rejected
  expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
});

test("falls back when returnTo is absent or not a string", async () => {
  const response = await completeDiscordSignOut(
    new Request("https://hareware.test/auth/logout", {
      method: "POST",
      body: new FormData(),
    }),
  );

  expect(response.headers.get("location")).toBe("/generate");
  vi.restoreAllMocks();
});
