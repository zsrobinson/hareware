import { afterEach, expect, test, vi } from "vitest";

const admin = vi.hoisted(() => ({ adminAccess: vi.fn() }));

vi.mock("cloudflare:workers", () => ({
  env: { NOTION_TOKEN: "secret", DISCORD_BOT_TOKEN: "bot" },
}));
vi.mock("~/lib/admin", () => admin);
vi.mock("~/lib/log", () => ({ record: vi.fn() }));

const { POST } = await import("./create");

admin.adminAccess.mockImplementation(async () => ({
  allowed: true,
  who: { session: { discordUserId: "editor" } },
}));

const BAY = "574376763006648349";

/** discord's guild holds one account, notion's roster nobody; returns the notion writes */
function sources() {
  const created = vi.fn();

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("discord.com"))
        return String(url).endsWith(`/members/${BAY}`)
          ? new Response(
              JSON.stringify({ roles: [], user: { id: BAY, username: "bay" } }),
            )
          : new Response(JSON.stringify({ code: 10007 }), { status: 404 });
      if (String(url).includes("/query"))
        return new Response(JSON.stringify({ results: [], has_more: false }));
      if (String(url).endsWith("/pages")) {
        created(init?.body);
        return new Response(JSON.stringify({ id: "new" }));
      }
      return new Response(
        JSON.stringify({
          properties: {
            Status: { select: { options: [{ name: "Undergrad" }] } },
          },
        }),
      );
    }),
  );

  return created;
}

const create = (body: Record<string, unknown>) =>
  (POST as (context: unknown) => Promise<Response>)({
    request: new Request("https://hareware.test/api/members/create", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  });

afterEach(() => vi.unstubAllGlobals());

/* the same checks `discord.ts` and `email.ts` make: a snowflake typed by hand
   would attach a row to an account that is not in the club */
test("refuses a Discord id that is not in the server", async () => {
  const created = sources();

  const response = await create({
    name: "Bay Hoffman",
    email: "bay@terpmail.umd.edu",
    discordId: "1",
  });

  expect(response.status).toBe(400);
  expect(await response.text()).toMatch(/not in the server/);
  expect(created).not.toHaveBeenCalled();
});

test("refuses an address notion would refuse", async () => {
  const created = sources();

  const response = await create({ name: "Bay Hoffman", email: "bay" });

  expect(response.status).toBe(400);
  expect(created).not.toHaveBeenCalled();
});

test("creates a row for an account that is in the server", async () => {
  const created = sources();

  const response = await create({
    name: "Bay Hoffman",
    email: "bay@terpmail.umd.edu",
    status: "Undergrad",
    discordId: BAY,
  });

  expect(response.status).toBe(200);
  expect(created).toHaveBeenCalledTimes(1);
});

/* not knowing is not a refusal: the editor should retry, not invite anyone */
test("a Discord that does not answer fails rather than refusing", async () => {
  const created = sources();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) =>
      String(url).includes("discord.com")
        ? new Response("", { status: 502 })
        : (created as unknown as typeof fetch)(url, init),
    ),
  );

  const response = await create({
    name: "Bay Hoffman",
    email: "bay@terpmail.umd.edu",
    discordId: BAY,
  });

  expect(response.status).toBe(500);
});
