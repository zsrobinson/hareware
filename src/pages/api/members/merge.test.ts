import { afterEach, expect, test, vi } from "vitest";

const admin = vi.hoisted(() => ({ editorialBoardMember: vi.fn() }));
const roster = vi.hoisted(() => ({ people: vi.fn() }));
const matching = vi.hoisted(() => ({ duplicates: vi.fn() }));
const writes = vi.hoisted(() => ({ mergeMembers: vi.fn() }));

vi.mock("cloudflare:workers", () => ({
  env: { NOTION_TOKEN: "secret" },
}));
vi.mock("~/lib/admin", () => admin);
vi.mock("~/lib/members/roster", () => roster);
vi.mock("~/lib/members/match", () => matching);
vi.mock("~/lib/members/write", () => writes);
vi.mock("~/lib/log", () => ({ record: vi.fn() }));

const { POST } = await import("./merge");

const person = (pageId: string) => ({
  pageId,
  name: pageId,
  discordId: null,
  email: null,
  status: null,
  contributions: 0,
});

function request() {
  return (POST as (context: unknown) => Promise<Response>)({
    request: new Request("https://hareware.test/api/members/merge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        keepId: "keep",
        dropId: "drop",
        keepName: "Keeper",
      }),
    }),
  });
}

afterEach(() => vi.clearAllMocks());

test("refuses a stale merge when the rows are not a detected duplicate pair", async () => {
  admin.editorialBoardMember.mockResolvedValue({ discordUserId: "editor" });
  roster.people.mockResolvedValue([person("keep"), person("drop")]);
  matching.duplicates.mockReturnValue([]);

  const response = await request();

  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({
    error: expect.stringMatching(/no longer a detected duplicate pair/),
  });
  expect(writes.mergeMembers).not.toHaveBeenCalled();
});

test("merges only after the fresh roster still groups the exact pair", async () => {
  const keep = person("keep");
  const drop = person("drop");
  admin.editorialBoardMember.mockResolvedValue({ discordUserId: "editor" });
  roster.people.mockResolvedValue([keep, drop]);
  matching.duplicates.mockReturnValue([
    { on: "name", value: "same", people: [keep, drop] },
  ]);

  const response = await request();

  expect(response.status).toBe(200);
  expect(writes.mergeMembers).toHaveBeenCalledWith(
    expect.objectContaining({ NOTION_TOKEN: "secret" }),
    "keep",
    "drop",
  );
});
