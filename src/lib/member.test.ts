import { afterEach, expect, test, vi } from "vitest";
import { GUILD_ID } from "./services/discord/config";

const workers = vi.hoisted(() => ({ env: {} as Record<string, string> }));
vi.mock("cloudflare:workers", () => workers);

const { guildMember } = await import("./member");

const USER = "342850506328117249";

function mockDiscord(body: unknown, ok = true) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      ok
        ? new Response(JSON.stringify(body))
        : new Response("no", { status: 404 }),
    ),
  );
}

/*
  the profile, insisting the lookup succeeded. a test about naming that quietly
  ran against "absent" would pass for the wrong reason
*/
async function profileOf(userId = USER) {
  const lookup = await guildMember(userId);
  if (lookup.status !== "member")
    throw new Error(`lookup was ${lookup.status}`);
  return lookup.profile;
}

afterEach(() => {
  for (const key of Object.keys(workers.env)) delete workers.env[key];
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("prefers the server nickname over every other name", async () => {
  workers.env.DISCORD_BOT_TOKEN = "bot";
  mockDiscord({
    roles: ["a"],
    nick: "Zach (EIC)",
    user: { username: "zsrobinson", global_name: "Zach" },
  });

  const profile = await profileOf();

  expect(profile.displayName).toBe("Zach (EIC)");
  expect(profile.username).toBe("zsrobinson");
});

test("falls back through the display name to the username", async () => {
  workers.env.DISCORD_BOT_TOKEN = "bot";
  mockDiscord({
    roles: [],
    user: { username: "zsrobinson", global_name: "Zach" },
  });
  expect((await profileOf()).displayName).toBe("Zach");

  mockDiscord({ roles: [], user: { username: "zsrobinson" } });
  expect((await profileOf()).displayName).toBe("zsrobinson");
});

test("prefers a per-server avatar over the account one", async () => {
  workers.env.DISCORD_BOT_TOKEN = "bot";
  mockDiscord({ roles: [], avatar: "guildhash", user: { avatar: "userhash" } });

  expect((await profileOf()).avatarUrl).toContain(
    `/guilds/${GUILD_ID}/users/${USER}/avatars/guildhash.png`,
  );
});

test("gives an account with no avatar one of discord's defaults", async () => {
  workers.env.DISCORD_BOT_TOKEN = "bot";
  mockDiscord({ roles: [], user: { username: "zsrobinson" } });

  expect((await profileOf()).avatarUrl).toMatch(/embed\/avatars\/[0-5]\.png$/);
});

test("serves an animated avatar as a gif", async () => {
  workers.env.DISCORD_BOT_TOKEN = "bot";
  mockDiscord({ roles: [], user: { avatar: "a_hash" } });

  expect((await profileOf()).avatarUrl).toContain(".gif");
});

test("is unreachable, not absent, when discord cannot be reached", async () => {
  workers.env.DISCORD_BOT_TOKEN = "bot";
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("down");
    }),
  );
  vi.spyOn(console, "error").mockImplementation(() => {});

  expect(await guildMember(USER)).toEqual({ status: "unreachable" });
});

test("is absent when they have left the server", async () => {
  workers.env.DISCORD_BOT_TOKEN = "bot";
  mockDiscord(null, false);

  expect(await guildMember(USER)).toEqual({ status: "absent" });
});

/* a rate limit or a revoked token says nothing about whether they are here */
test("is unreachable when discord answers with an error", async () => {
  workers.env.DISCORD_BOT_TOKEN = "bot";
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("slow down", { status: 429 })),
  );

  expect(await guildMember(USER)).toEqual({ status: "unreachable" });
});

/* a 200 that is not the shape we asked for is discord misbehaving, not a
   member who holds no roles */
test("is unreachable when the body carries no roles", async () => {
  workers.env.DISCORD_BOT_TOKEN = "bot";
  vi.spyOn(console, "error").mockImplementation(() => {});
  mockDiscord({ user: { username: "zsrobinson" } });

  expect(await guildMember(USER)).toEqual({ status: "unreachable" });
});

test("is unreachable without a bot token, without asking discord", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  expect(await guildMember(USER)).toEqual({ status: "unreachable" });
  expect(fetchMock).not.toHaveBeenCalled();
});
