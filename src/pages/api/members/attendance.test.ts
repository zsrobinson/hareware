import { expect, test, vi } from "vitest";

const admin = vi.hoisted(() => ({ adminAccess: vi.fn() }));

vi.mock("cloudflare:workers", () => ({ env: { NOTION_TOKEN: "secret" } }));
vi.mock("~/lib/admin", () => admin);
vi.mock("~/lib/log", () => ({ record: vi.fn() }));

const { POST } = await import("./attendance");

admin.adminAccess.mockImplementation(async () => ({
  allowed: true,
  who: { session: { discordUserId: "editor" } },
}));

const PAGE = "11111111111141118111111111111111";
const MEMBER = "22222222222242228222222222222222";

test("a page outside Meetings is refused before anything is written", async () => {
  const fetched = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          id: PAGE,
          parent: { data_source_id: "some-other-data-source" },
          properties: { Attendees: { id: "a", relation: [] } },
        }),
      ),
  );
  vi.stubGlobal("fetch", fetched);

  const response = await (POST as (context: unknown) => Promise<Response>)({
    request: new Request("https://hareware.test/api/members/attendance", {
      method: "POST",
      body: JSON.stringify({ meetingId: PAGE, memberIds: [MEMBER] }),
    }),
  });
  vi.unstubAllGlobals();

  expect(response.status).toBe(400);
  expect(fetched).toHaveBeenCalledTimes(1);
});
