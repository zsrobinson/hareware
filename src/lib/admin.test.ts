import { afterEach, expect, test, vi } from "vitest";
import { EDITORIAL_BOARD_ROLE_ID } from "./discord/config";
import { createSessionCookie } from "./session";

const workers = vi.hoisted(() => ({ env: {} as Record<string, string> }));
vi.mock("cloudflare:workers", () => workers);

const { editorialBoardMember } = await import("./admin");

const SECRET = "s".repeat(32);
const USER = "342850506328117249";

async function signedIn(userId = USER) {
  const cookie = (
    await createSessionCookie({ discordUserId: userId }, SECRET)
  ).split(";")[0]!;
  return new Request("https://hareware.test/admin", {
    headers: { cookie },
  });
}

function mockDiscord(roles: string[] | null, ok = true) {
  const fetchMock = vi.fn(async () =>
    ok
      ? new Response(JSON.stringify({ roles }))
      : new Response("not found", { status: 404 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  for (const key of Object.keys(workers.env)) delete workers.env[key];
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("lets in a member holding the role", async () => {
  workers.env.SESSION_SECRET = SECRET;
  workers.env.DISCORD_BOT_TOKEN = "bot";
  mockDiscord(["something-else", EDITORIAL_BOARD_ROLE_ID]);

  const session = await editorialBoardMember(await signedIn());

  expect(session?.discordUserId).toBe(USER);
});

test("keeps out a member without the role", async () => {
  workers.env.SESSION_SECRET = SECRET;
  workers.env.DISCORD_BOT_TOKEN = "bot";
  mockDiscord(["something-else"]);

  expect(await editorialBoardMember(await signedIn())).toBeNull();
});

test("keeps out somebody who has left the server", async () => {
  workers.env.SESSION_SECRET = SECRET;
  workers.env.DISCORD_BOT_TOKEN = "bot";
  mockDiscord(null, false);

  expect(await editorialBoardMember(await signedIn())).toBeNull();
});

test("keeps out a signed-out visitor without asking discord", async () => {
  workers.env.SESSION_SECRET = SECRET;
  workers.env.DISCORD_BOT_TOKEN = "bot";
  const fetchMock = mockDiscord([EDITORIAL_BOARD_ROLE_ID]);

  const request = new Request("https://hareware.test/admin");

  expect(await editorialBoardMember(request)).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
});

test("rejects a tampered session cookie", async () => {
  workers.env.SESSION_SECRET = SECRET;
  workers.env.DISCORD_BOT_TOKEN = "bot";
  mockDiscord([EDITORIAL_BOARD_ROLE_ID]);

  const request = new Request("https://hareware.test/admin", {
    headers: { cookie: "__Host-hareware-session=nonsense.signature" },
  });

  expect(await editorialBoardMember(request)).toBeNull();
});

/*
  an outage denies rather than grants. the alternative fails open on the one
  surface holding the byline-to-member mapping
*/
test("denies when discord is unreachable", async () => {
  workers.env.SESSION_SECRET = SECRET;
  workers.env.DISCORD_BOT_TOKEN = "bot";
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("network");
    }),
  );

  expect(await editorialBoardMember(await signedIn())).toBeNull();
});

test("denies when there is no bot token to ask with", async () => {
  workers.env.SESSION_SECRET = SECRET;
  mockDiscord([EDITORIAL_BOARD_ROLE_ID]);

  expect(await editorialBoardMember(await signedIn())).toBeNull();
});
