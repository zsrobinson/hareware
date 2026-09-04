import { afterEach, expect, test, vi } from "vitest";
import { GUILD_ID } from "./discord/config";

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

  const member = await guildMember(USER);

  expect(member?.profile.displayName).toBe("Zach (EIC)");
  expect(member?.profile.username).toBe("zsrobinson");
});

test("falls back through the display name to the username", async () => {
  workers.env.DISCORD_BOT_TOKEN = "bot";
  mockDiscord({
    roles: [],
    user: { username: "zsrobinson", global_name: "Zach" },
  });
  expect((await guildMember(USER))?.profile.displayName).toBe("Zach");

  mockDiscord({ roles: [], user: { username: "zsrobinson" } });
  expect((await guildMember(USER))?.profile.displayName).toBe("zsrobinson");
});

test("prefers a per-server avatar over the account one", async () => {
  workers.env.DISCORD_BOT_TOKEN = "bot";
  mockDiscord({ roles: [], avatar: "guildhash", user: { avatar: "userhash" } });

  expect((await guildMember(USER))?.profile.avatarUrl).toContain(
    `/guilds/${GUILD_ID}/users/${USER}/avatars/guildhash.png`,
  );
});

test("gives an account with no avatar one of discord's defaults", async () => {
  workers.env.DISCORD_BOT_TOKEN = "bot";
  mockDiscord({ roles: [], user: { username: "zsrobinson" } });

  expect((await guildMember(USER))?.profile.avatarUrl).toMatch(
    /embed\/avatars\/[0-5]\.png$/,
  );
});

test("serves an animated avatar as a gif", async () => {
  workers.env.DISCORD_BOT_TOKEN = "bot";
  mockDiscord({ roles: [], user: { avatar: "a_hash" } });

  expect((await guildMember(USER))?.profile.avatarUrl).toContain(".gif");
});

test("is nobody when discord cannot be reached", async () => {
  workers.env.DISCORD_BOT_TOKEN = "bot";
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("down");
    }),
  );
  vi.spyOn(console, "error").mockImplementation(() => {});

  expect(await guildMember(USER)).toBeNull();
});

test("is nobody when they have left the server", async () => {
  workers.env.DISCORD_BOT_TOKEN = "bot";
  mockDiscord(null, false);

  expect(await guildMember(USER)).toBeNull();
});

test("is nobody without a bot token, without asking discord", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  expect(await guildMember(USER)).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
});
