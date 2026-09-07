import { afterEach, expect, test, vi } from "vitest";

/*
  the same gate, asserted on its own route rather than assumed from the kiosk's.

  this one answers with more than the kiosk does — every approved application's
  name and email alongside the roster — so "the other read is gated" is not a
  fact about this file. Each route is held down where it lives.
*/

vi.mock("cloudflare:workers", () => ({ env: {} }));

const admin = vi.hoisted(() => ({ editorialBoardMember: vi.fn() }));
vi.mock("~/lib/admin", () => admin);

const views = vi.hoisted(() => ({
  kioskData: vi.fn(),
  reconcilerData: vi.fn(),
}));
vi.mock("~/lib/members/views", () => views);

const { GET } = await import("./reconciler");
const { POST } = await import("./group");

const WAITING = {
  resolutions: [],
  duplicates: [],
  unknownStatus: [
    {
      pageId: "p1",
      name: "Bay Hoffman",
      discordId: null,
      email: "bay@terpmail.umd.edu",
      status: null,
    },
  ],
  statuses: ["Undergrad"],
  group: {
    watermark: "2026-09-01",
    pending: [],
    external: ["bay@example.com"],
  },
  liveStatuses: ["Undergrad"],
  alumMissing: false,
  discordProblem: null,
};

const call = (route: unknown, method = "GET") =>
  (route as (c: unknown) => Promise<Response>)({
    request: new Request("https://hareware.test/api/members/reconciler", {
      method,
    }),
  });

afterEach(() => vi.clearAllMocks());

test("an anonymous request is refused and carries no roster", async () => {
  admin.editorialBoardMember.mockResolvedValue(null);
  views.reconcilerData.mockResolvedValue(WAITING);

  const response = await call(GET);
  const body = await response.text();

  expect(response.status).toBe(404);
  expect(body).not.toContain("Bay Hoffman");
  expect(body).not.toContain("bay@terpmail.umd.edu");
  expect(body).not.toContain("bay@example.com");
  expect(views.reconcilerData).not.toHaveBeenCalled();
});

test("refuses an anonymous read exactly as the mutations beside it do", async () => {
  admin.editorialBoardMember.mockResolvedValue(null);

  const read = await call(GET);
  const write = await call(POST, "POST");

  expect(read.status).toBe(write.status);
  expect(await read.text()).toBe(await write.text());
  expect(read.headers.get("cache-control")).toBe(
    write.headers.get("cache-control"),
  );
});

test("a refusal may not be cached by anything", async () => {
  admin.editorialBoardMember.mockResolvedValue(null);

  const response = await call(GET);

  expect(response.headers.get("cache-control")).toBe("private, no-store");
});

test("an editor gets the page's answer, and nothing may cache that either", async () => {
  admin.editorialBoardMember.mockResolvedValue({ discordUserId: "1" });
  views.reconcilerData.mockResolvedValue(WAITING);

  const response = await call(GET);

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(WAITING);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});
