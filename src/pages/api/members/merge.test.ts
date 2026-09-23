import { afterEach, expect, test, vi } from "vitest";

const admin = vi.hoisted(() => ({ adminAccess: vi.fn() }));
const roster = vi.hoisted(() => ({ people: vi.fn() }));
const writes = vi.hoisted(() => ({ mergeMembers: vi.fn() }));
const log = vi.hoisted(() => ({ record: vi.fn() }));

vi.mock("cloudflare:workers", () => ({
  env: { NOTION_TOKEN: "secret" },
}));
vi.mock("~/lib/admin", () => admin);
vi.mock("~/lib/members/roster", () => roster);
vi.mock("~/lib/members/write", () => writes);
vi.mock("~/lib/log", () => log);

const { POST } = await import("./merge");

const KEEP = "11111111-1111-4111-8111-111111111111";
const DROP = "22222222-2222-4222-8222-222222222222";

const person = (pageId: string, name: string) => ({
  pageId,
  name,
  discordId: null,
  email: null,
  status: null,
  contributions: 0,
});

function request(body: Record<string, unknown>) {
  return (POST as (context: unknown) => Promise<Response>)({
    request: new Request("https://hareware.test/api/members/merge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  });
}

afterEach(() => vi.clearAllMocks());

admin.adminAccess.mockImplementation(async () => ({
  allowed: true,
  who: { session: { discordUserId: "editor" } },
}));

test("refuses a stale merge, and logs it as a refusal rather than a fault", async () => {
  roster.people.mockResolvedValue([
    person(KEEP, "Ana Reyes"),
    person(DROP, "Jo Park"),
  ]);

  const response = await request({ keepId: KEEP, dropId: DROP });

  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({
    error: expect.stringMatching(/no longer a detected duplicate pair/),
  });
  expect(writes.mergeMembers).not.toHaveBeenCalled();
  expect(log.record).toHaveBeenCalledWith(
    undefined,
    expect.objectContaining({ outcome: "skipped", actor: "editor" }),
  );
});

/* the log is what an election audit reads, so the names come from notion and
   not from whatever the browser sent */
test("merges a pair the fresh roster still groups, naming both from notion", async () => {
  roster.people.mockResolvedValue([
    person(KEEP, "Ana Reyes"),
    person(DROP, "ana reyes"),
  ]);

  const response = await request({
    keepId: KEEP,
    dropId: DROP,
    keepName: "Somebody Else",
  });

  expect(response.status).toBe(200);
  expect(writes.mergeMembers).toHaveBeenCalledWith("secret", KEEP, DROP);
  expect(log.record).toHaveBeenCalledWith(undefined, {
    source: "button",
    action: "roster-edit",
    outcome: "ok",
    summary: "merged ana reyes's duplicate Members row into Ana Reyes",
    actor: "editor",
  });
});

/* these go into notion url paths */
test("an id that is not a Notion id never reaches notion", async () => {
  const response = await request({ keepId: "../../users/me", dropId: DROP });

  expect(response.status).toBe(400);
  expect(roster.people).not.toHaveBeenCalled();
});
