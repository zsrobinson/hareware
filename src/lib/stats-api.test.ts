import { afterEach, expect, test, vi } from "vitest";
import { EDITORIAL_BOARD_ROLE_ID } from "./services/discord/config";
import { createSessionCookie } from "./session";

const workers = vi.hoisted(() => ({ env: {} as Record<string, string> }));
vi.mock("cloudflare:workers", () => workers);

const { answerStats } = await import("./stats-api");

const SECRET = "s".repeat(32);
const ASK =
  "https://hareware.test/api/stats/top-posts?period=month&num=48&max=0";

/* Discord answers with `roles`; Jetpack with an empty count. Records the ask */
function remote(roles: string[]) {
  const asked: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      asked.push(url);
      return url.startsWith("https://discord.com/")
        ? Response.json({ roles })
        : Response.json({ days: {} });
    }),
  );
  return asked;
}

async function signedIn() {
  const cookie = (
    await createSessionCookie({ discordUserId: "1" }, SECRET)
  ).split(";")[0]!;
  return new Request(ASK, { headers: { cookie } });
}

afterEach(() => {
  for (const key of Object.keys(workers.env)) delete workers.env[key];
  vi.unstubAllGlobals();
});

function configure() {
  Object.assign(workers.env, {
    SESSION_SECRET: SECRET,
    DISCORD_BOT_TOKEN: "bot",
    WORDPRESS_STATS_USER: "invented-user",
    WORDPRESS_STATS_PASSWORD: "invented password",
  });
}

test("asks the gate before WordPress, and says no as the other gated APIs do", async () => {
  configure();
  const asked = remote([]);

  const signedOut = await answerStats(new Request(ASK));
  expect(signedOut.status).toBe(401);
  expect(await signedOut.json()).toEqual({ denial: "signed-out", you: null });

  const noRole = await answerStats(await signedIn());
  expect(noRole.status).toBe(403);

  expect(asked.some((url) => url.includes("theumdhare.com"))).toBe(false);
});

test("answers the board with WordPress's count", async () => {
  configure();
  const asked = remote([EDITORIAL_BOARD_ROLE_ID]);

  const response = await answerStats(await signedIn());

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ days: {} });
  expect(asked.at(-1)).toMatch(
    /^https:\/\/theumdhare\.com\/wp-json\/jetpack\//,
  );
});

test("says which credential is missing rather than asking without one", async () => {
  configure();
  delete workers.env.WORDPRESS_STATS_PASSWORD;
  const asked = remote([EDITORIAL_BOARD_ROLE_ID]);

  const response = await answerStats(await signedIn());

  expect(response.status).toBe(503);
  expect(await response.text()).toContain("WORDPRESS_STATS_PASSWORD");
  expect(asked.some((url) => url.includes("theumdhare.com"))).toBe(false);
});
