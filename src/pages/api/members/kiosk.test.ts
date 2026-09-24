import { afterEach, expect, test, vi } from "vitest";

/* the gate itself is held down for every route in `gate.test.ts` */

vi.mock("cloudflare:workers", () => ({ env: {} }));

const admin = vi.hoisted(() => ({ adminAccess: vi.fn() }));
vi.mock("~/lib/admin", () => admin);

const views = vi.hoisted(() => ({ kioskData: vi.fn() }));
vi.mock("~/lib/members/views", () => views);

const { GET } = await import("./kiosk");

const ROSTER = {
  meetings: [],
  candidates: [],
  openingId: null,
  statuses: ["Undergrad"],
  notionProblem: null,
};

const call = (search = "") =>
  (GET as (c: unknown) => Promise<Response>)({
    request: new Request(`https://hareware.test/api/members/kiosk${search}`),
  });

const editor = () =>
  admin.adminAccess.mockResolvedValue({
    allowed: true,
    who: { session: { discordUserId: "1" } },
  });

afterEach(() => vi.clearAllMocks());

test("an editor gets the roster, and nothing may cache that either", async () => {
  editor();
  views.kioskData.mockResolvedValue(ROSTER);

  const response = await call("?today=2026-09-07");

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(ROSTER);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(views.kioskData).toHaveBeenCalledWith(
    expect.anything(),
    "2026-09-07",
    null,
  );
});

/* `today` picks the meeting the room signs into; a value that is not a day
   compares as a string against every meeting and opens on the wrong one */
test.each(["tomorrow", "2026-9-7", "2026-02-30", "2026-13-01"])(
  "refuses ?today=%s rather than comparing it as a day",
  async (today) => {
    editor();

    const response = await call(`?today=${today}`);

    expect(response.status).toBe(400);
    expect(views.kioskData).not.toHaveBeenCalled();
  },
);
