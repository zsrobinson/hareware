import { afterEach, expect, test, vi } from "vitest";
import { EDITORIAL_BOARD_ROLE_ID } from "./services/discord/config";
import { createSessionCookie } from "./session";

const workers = vi.hoisted(() => ({ env: {} as Record<string, string> }));
vi.mock("cloudflare:workers", () => workers);

const { aheadOfAstro } = await import("./ahead-of-astro");

const SECRET = "s".repeat(32);

/* Discord says the asker is on the board; WordPress answers anything. Records
   the ask */
function remote() {
  const asked: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      asked.push(url);
      return url.startsWith("https://discord.com/")
        ? Response.json({ roles: [EDITORIAL_BOARD_ROLE_ID] })
        : Response.json({ days: {} });
    }),
  );
  return asked;
}
const wordpress = (asked: string[]) =>
  asked.filter((url) => url.startsWith("https://theumdhare.com/"));

async function board(path: string, method = "GET") {
  const cookie = (
    await createSessionCookie({ discordUserId: "1" }, SECRET)
  ).split(";")[0]!;
  return new Request(`https://hareware.test${path}`, {
    method,
    headers: { cookie },
  });
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

/* the stats account is an administrator's: only a GET is ever made with it,
   and anything else is left to Astro, which has no such route */
test("leaves every method but GET to Astro, with nothing asked", async () => {
  configure();
  const asked = remote();

  for (const method of ["POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"])
    expect(
      aheadOfAstro(await board("/api/stats/top-posts?period=month", method)),
      method,
    ).toBeNull();
  expect(asked).toEqual([]);
});

test("a path that only looks like the stats route reaches the gate, then the allow-list", async () => {
  configure();
  const asked = remote();

  /* traversal is resolved before routing: this is /api/stats/top-posts */
  const signedOut = aheadOfAstro(
    new Request("https://hareware.test/api/wordpress/../stats/top-posts"),
  );
  expect((await signedOut!).status).toBe(401);

  for (const path of [
    "/api/stats/top-posts%2F..%2F..%2Fusers",
    "/api/stats/post%2F3147",
  ])
    expect((await aheadOfAstro(await board(path))!).status, path).toBe(404);
  /* an escaped dot is resolved like a dot, and an escaped slash is not a
     slash: neither of these is a route answered here */
  expect(
    aheadOfAstro(await board("/api/stats/%2e%2e/%2e%2e/wp/v2/users")),
  ).toBeNull();
  expect(aheadOfAstro(await board("/api/stats%2Ftop-posts"))).toBeNull();

  expect(wordpress(asked)).toEqual([]);
});

test("answers the board's GET of an allowed stat from WordPress", async () => {
  configure();
  const asked = remote();

  const response = await aheadOfAstro(
    await board("/api/stats/top-posts?period=month&num=48&max=0"),
  )!;

  expect(response.status).toBe(200);
  expect(wordpress(asked)).toEqual([
    "https://theumdhare.com/wp-json/jetpack/v4/stats-app/sites/212871363/stats/top-posts?period=month&num=48&max=0",
  ]);
});
