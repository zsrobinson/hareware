import { afterEach, expect, test, vi } from "vitest";
import { EDITORIAL_BOARD_ROLE_ID } from "./services/discord/config";
import { createSessionCookie } from "./session";

const workers = vi.hoisted(() => ({ env: {} as Record<string, string> }));
vi.mock("cloudflare:workers", () => workers);

const { admitted, guardAdmin, REFUSAL_PATH } = await import("./admin-guard");
type Admission = import("./admin-guard").Admission;

const SECRET = "s".repeat(32);
const USER = "342850506328117249";

function mockDiscord(roles: string[] | null, ok = true) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      ok
        ? new Response(JSON.stringify({ roles }))
        : new Response(JSON.stringify({ code: 10007 }), { status: 404 }),
    ),
  );
}

/*
  astro's context and `next`, small enough to assert against. `next` records
  what it was asked to render, which is the thing a page-level test could not
  see: whether the guard sent the request on, or somewhere else entirely
*/
function context(path: string, cookie?: string) {
  const url = new URL(`https://hareware.test${path}`);
  const request = new Request(url, {
    headers: cookie ? { cookie } : undefined,
  });
  const locals: { admission?: Admission } = {};

  const rendered: (string | undefined)[] = [];
  const next = vi.fn(async (rewrite?: string) => {
    rendered.push(rewrite);
    return new Response("<html>page</html>", {
      status: 200,
      headers: { "content-type": "text/html", "x-from": "the page" },
    });
  });

  return { ctx: { url, request, locals }, next, rendered, locals };
}

async function signedInCookie(userId = USER) {
  return (await createSessionCookie({ discordUserId: userId }, SECRET)).split(
    ";",
  )[0]!;
}

afterEach(() => {
  for (const key of Object.keys(workers.env)) delete workers.env[key];
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("leaves a public route alone, without asking discord", async () => {
  workers.env.SESSION_SECRET = SECRET;
  workers.env.DISCORD_BOT_TOKEN = "bot";
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  const { ctx, next, rendered, locals } = context("/generate");
  const response = await guardAdmin(ctx, next);

  expect(response.status).toBe(200);
  expect(rendered).toEqual([undefined]);
  expect(fetchMock).not.toHaveBeenCalled();
  expect(locals.admission).toBeUndefined();
});

test("lets a board member through to the page they asked for", async () => {
  workers.env.SESSION_SECRET = SECRET;
  workers.env.DISCORD_BOT_TOKEN = "bot";
  mockDiscord([EDITORIAL_BOARD_ROLE_ID]);

  const { ctx, next, rendered, locals } = context(
    "/log",
    await signedInCookie(),
  );
  const response = await guardAdmin(ctx, next);

  expect(response.status).toBe(200);
  /* undefined means "the route they asked for", not a rewrite */
  expect(rendered).toEqual([undefined]);
  expect(locals.admission?.access.allowed).toBe(true);
});

/*
  the four refusals, end to end: the status a browser sees, and the page it is
  sent to. asserting the status here rather than in a page is what makes the
  mapping load-bearing — delete it and this fails
*/
test.each([
  ["signed-out", 401, undefined],
  ["no-role", 403, ["something-else"]],
  ["not-in-server", 403, null],
  ["unreachable", 503, "outage"],
] as const)(
  "refuses %s with %i, rendering the refusal page",
  async (denial, status, discord) => {
    workers.env.SESSION_SECRET = SECRET;
    workers.env.DISCORD_BOT_TOKEN = "bot";
    vi.spyOn(console, "error").mockImplementation(() => {});

    if (discord === "outage") {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          throw new Error("down");
        }),
      );
    } else if (discord === null) {
      mockDiscord(null, false);
    } else if (discord) {
      mockDiscord(discord as unknown as string[]);
    }

    const cookie = denial === "signed-out" ? undefined : await signedInCookie();
    const { ctx, next, rendered, locals } = context("/log", cookie);

    const response = await guardAdmin(ctx, next);

    expect(response.status).toBe(status);
    expect(rendered).toEqual([REFUSAL_PATH]);
    expect(locals.admission?.access).toMatchObject({ allowed: false, denial });
  },
);

test("keeps the page's own headers on the refusal it returns", async () => {
  workers.env.SESSION_SECRET = SECRET;
  workers.env.DISCORD_BOT_TOKEN = "bot";

  const { ctx, next } = context("/log");
  const response = await guardAdmin(ctx, next);

  /* the security headers are set inside `next`, so dropping them here would
     serve the one page that names a member without any policy on it */
  expect(response.headers.get("x-from")).toBe("the page");
  expect(response.headers.get("content-type")).toBe("text/html");
});

test("hands the refusal page somewhere to send them back to", async () => {
  workers.env.SESSION_SECRET = SECRET;
  workers.env.DISCORD_BOT_TOKEN = "bot";

  const { ctx, next, locals } = context("/log?page=2");
  await guardAdmin(ctx, next);

  /* the query string too: signing back in should return them to the row they
     were looking at, not the top of the log */
  expect(locals.admission?.returnTo).toBe("/log?page=2");
});

test("throws when a page reads an admission the guard never left", () => {
  expect(() => admitted({})).toThrow(/no admission/);
});

test("throws rather than rendering an admin page for a refused viewer", () => {
  expect(() =>
    admitted({
      admission: {
        access: { allowed: false, who: null, denial: "no-role" },
        returnTo: "/log",
      },
    }),
  ).toThrow(/refused/);
});
