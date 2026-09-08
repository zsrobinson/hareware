import { afterEach, expect, test, vi } from "vitest";
import { GUILD_ID } from "./services/discord/config";

const workers = vi.hoisted(() => ({ env: {} as Record<string, string> }));
vi.mock("cloudflare:workers", () => workers);

const { changeGuildNickname, guildMember, guildMembers } =
  await import("./member");

const USER = "342850506328117249";
const CDN = "https://cdn.discordapp.com";

function mockDiscord(body: unknown, ok = true) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      ok
        ? new Response(JSON.stringify(body))
        : new Response(JSON.stringify({ code: 10007 }), { status: 404 }),
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

/*
  the same 404 answers a guild we cannot see — a wrong GUILD_ID, or the bot
  removed from the server. reading that as "they left" would print our own
  misconfiguration on the refusal page as a fact about a member
*/
test("is unreachable when the 404 is about the guild, not the member", async () => {
  workers.env.DISCORD_BOT_TOKEN = "bot";
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    /* 10004 is Unknown Guild */
    vi.fn(
      async () =>
        new Response(JSON.stringify({ code: 10004 }), { status: 404 }),
    ),
  );

  expect(await guildMember(USER)).toEqual({ status: "unreachable" });
});

test("is unreachable when a 404 carries no error code to read", async () => {
  workers.env.DISCORD_BOT_TOKEN = "bot";
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("<html>gateway</html>", { status: 404 })),
  );

  expect(await guildMember(USER)).toEqual({ status: "unreachable" });
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

/* the whole guild in one request, which is what makes a page of avatars
   affordable. the guild avatar wins over the account one, as it does per user */
test("maps every id in the list to its avatar url", async () => {
  workers.env.DISCORD_BOT_TOKEN = "bot";
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify([
            { user: { id: "1", username: "zach", avatar: "abc" } },
            {
              user: { id: "2", username: "kai", avatar: "def" },
              avatar: "a_g",
            },
            { user: { username: "nameless" } },
          ]),
        ),
    ),
  );

  const guild = await guildMembers();

  expect(guild.get("1")?.avatarUrl).toBe(`${CDN}/avatars/1/abc.png?size=64`);
  expect(guild.get("2")?.avatarUrl).toBe(
    `${CDN}/guilds/${GUILD_ID}/users/2/avatars/a_g.gif?size=64`,
  );
  /* an entry with no user id is dropped rather than keyed on undefined */
  expect(guild.size).toBe(2);
});

test.each([
  ["a 403 without the members intent", new Response("no", { status: 403 })],
  ["a body that is not a list", new Response(JSON.stringify({}))],
])(
  "answers an empty guild for %s, so every row is a ghost",
  async (_, reply) => {
    workers.env.DISCORD_BOT_TOKEN = "bot";
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply),
    );

    expect(await guildMembers()).toEqual(new Map());
  },
);

test("does not ask discord for the guild without a bot token", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  expect(await guildMembers()).toEqual(new Map());
  expect(fetchMock).not.toHaveBeenCalled();
});

test("nickname updates patch the guild member and surface role hierarchy refusal", async () => {
  workers.env.DISCORD_BOT_TOKEN = "bot";
  const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchMock);

  await changeGuildNickname(USER, "Bay");
  expect(fetchMock).toHaveBeenCalledWith(
    `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${USER}`,
    expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ nick: "Bay" }),
    }),
  );

  fetchMock.mockResolvedValueOnce(new Response("forbidden", { status: 403 }));
  await expect(changeGuildNickname(USER, "Bay")).rejects.toThrow(
    "role hierarchy",
  );
});
