import { afterEach, expect, test, vi } from "vitest";

/*
  the gate on the read, not the shape of the read.

  this route answers with the club's roster — every member's name, email and
  discord id — so it is exactly as sensitive as the mutations beside it, and
  the thing worth holding down is that an anonymous request gets *nothing*. A
  status assertion alone would pass on a 404 whose body still carried the
  roster.
*/

vi.mock("cloudflare:workers", () => ({ env: {} }));

const admin = vi.hoisted(() => ({ editorialBoardMember: vi.fn() }));
vi.mock("~/lib/admin", () => admin);

const views = vi.hoisted(() => ({
  kioskData: vi.fn(),
  reconcilerData: vi.fn(),
}));
vi.mock("~/lib/members/views", () => views);

const { GET } = await import("./kiosk");
const { POST } = await import("./group");

const ROSTER = {
  meetings: [],
  candidates: [
    {
      pageId: "p1",
      name: "Bay Hoffman",
      discordId: "574376763006648349",
      email: "bay@terpmail.umd.edu",
      status: "Undergrad",
      contributions: 3,
    },
  ],
  openingId: null,
  statuses: ["Undergrad"],
};

const call = (route: unknown, method = "GET") =>
  (route as (c: unknown) => Promise<Response>)({
    request: new Request("https://hareware.test/api/members/kiosk", { method }),
  });

afterEach(() => vi.clearAllMocks());

test("an anonymous request is refused and carries no roster", async () => {
  admin.editorialBoardMember.mockResolvedValue(null);
  views.kioskData.mockResolvedValue(ROSTER);

  const response = await call(GET);
  const body = await response.text();

  expect(response.status).toBe(404);
  expect(body).not.toContain("Bay Hoffman");
  expect(body).not.toContain("bay@terpmail.umd.edu");
  expect(body).not.toContain("574376763006648349");
  /* and notion was never asked, so a refused request costs nothing either */
  expect(views.kioskData).not.toHaveBeenCalled();
});

/* the point of factoring the gate out of `rosterRoute` was that there is one
   of it. This goes red the day somebody writes a second check here */
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

test("an editor gets the roster, and nothing may cache that either", async () => {
  admin.editorialBoardMember.mockResolvedValue({ discordUserId: "1" });
  views.kioskData.mockResolvedValue(ROSTER);

  const response = await call(GET);

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(ROSTER);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});
