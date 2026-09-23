import { afterEach, expect, test, vi } from "vitest";
import { buildCommands } from "./commands";
import { registerCommands } from "./register";
import { DISCORD_APPLICATION_ID, GUILD_ID } from "./config";

const payload = buildCommands([]);
const env = { DISCORD_BOT_TOKEN: "bot-token" } as Env;

function mockDiscord(ok = true, body = "[]") {
  const fetchMock = vi.fn(
    async (_input: string | URL, _init?: RequestInit) =>
      new Response(body, { status: ok ? 200 : 403 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

test("puts the whole surface on the guild, as the bot", async () => {
  const fetchMock = mockDiscord();

  const result = await registerCommands(env, payload);

  expect(result.outcome).toBe("ok");

  const [url, init] = fetchMock.mock.calls[0]!;
  /* guild commands are live at once; global ones take up to an hour */
  expect(String(url)).toBe(
    `https://discord.com/api/v10/applications/${DISCORD_APPLICATION_ID}/guilds/${GUILD_ID}/commands`,
  );
  // PUT replaces the surface, so a subcommand deleted here disappears there
  expect(init!.method).toBe("PUT");
  expect((init!.headers as Record<string, string>).authorization).toBe(
    "Bot bot-token",
  );
  expect(JSON.parse(init!.body as string)).toEqual(payload);
});

test("registers again when the payload changed", async () => {
  const fetchMock = mockDiscord();

  const result = await registerCommands(env, payload);

  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(result.outcome).toBe("ok");
});

test("says misconfigured, not failed, without a bot token", async () => {
  const fetchMock = mockDiscord();

  const result = await registerCommands({} as Env, payload);

  expect(fetchMock).not.toHaveBeenCalled();
  expect(result.outcome).toBe("misconfigured");
  expect(result.summary).toContain("DISCORD_BOT_TOKEN");
});

test("a refused registration is failed, and says what discord said", async () => {
  mockDiscord(false, '{"message":"Missing Access","code":50001}');

  const result = await registerCommands(env, payload);

  expect(result.outcome).toBe("failed");
  expect(result.summary).toContain("403");
  expect(result.summary).toContain("Missing Access");
});

/* a throw on the cron tick would take the reminders with it */
test("never throws into a cron tick", async () => {
  vi.stubGlobal("fetch", async () => {
    throw new TypeError("network down");
  });

  const result = await registerCommands(env, payload);

  expect(result.outcome).toBe("failed");
  expect(result.summary).toContain("network down");
});
