import { afterEach, expect, test, vi } from "vitest";

const admin = vi.hoisted(() => ({ adminAccess: vi.fn() }));
const log = vi.hoisted(() => ({ record: vi.fn() }));

vi.mock("cloudflare:workers", () => ({ env: { NOTION_TOKEN: "secret" } }));
vi.mock("~/lib/admin", () => admin);
vi.mock("~/lib/log", () => log);

const { POST } = await import("./status");

admin.adminAccess.mockImplementation(async () => ({
  allowed: true,
  who: { session: { discordUserId: "editor" } },
}));

const PAGE = "11111111111141118111111111111111";

afterEach(() => vi.unstubAllGlobals());

/* the log is what an election audit reads, so whose status changed is what
   notion says, not what the browser sent alongside the id */
test("logs the name on the row, not the one in the request", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      String(url).includes("/pages/")
        ? new Response(
            JSON.stringify({
              id: PAGE,
              properties: { Name: { title: [{ plain_text: "Ana Reyes" }] } },
            }),
          )
        : new Response(
            JSON.stringify({
              properties: {
                Status: { select: { options: [{ name: "Grad" }] } },
              },
            }),
          ),
    ),
  );

  const response = await (POST as (context: unknown) => Promise<Response>)({
    request: new Request("https://hareware.test/api/members/status", {
      method: "POST",
      body: JSON.stringify({ pageId: PAGE, name: "Mallory", status: "Grad" }),
    }),
  });

  expect(response.status).toBe(200);
  expect(log.record).toHaveBeenCalledWith(
    undefined,
    expect.objectContaining({ summary: "set Ana Reyes's status to Grad" }),
  );
});

test("no NOTION_TOKEN is refused as misconfigured before anything is asked", async () => {
  const { env } = (await import("cloudflare:workers")) as unknown as {
    env: Record<string, string | undefined>;
  };
  const fetched = vi.fn();
  vi.stubGlobal("fetch", fetched);
  delete env.NOTION_TOKEN;

  const response = await (POST as (context: unknown) => Promise<Response>)({
    request: new Request("https://hareware.test/api/members/status", {
      method: "POST",
      body: JSON.stringify({ pageId: PAGE, status: "Grad" }),
    }),
  });
  env.NOTION_TOKEN = "secret";

  expect(response.status).toBe(500);
  expect(fetched).not.toHaveBeenCalled();
  expect(log.record).toHaveBeenCalledWith(
    undefined,
    expect.objectContaining({ outcome: "misconfigured" }),
  );
});
