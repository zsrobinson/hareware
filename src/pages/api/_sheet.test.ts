/* named with a leading underscore so Astro does not route it */
import { beforeEach, expect, test, vi } from "vitest";
import type { Rows } from "~/lib/services/google/sheets";

/* invented names only: what the Sheet holds is private */

vi.mock("cloudflare:workers", () => ({ env: {} }));
const access = vi.hoisted(() => ({
  allowed: true,
  who: {
    session: { discordUserId: "42" },
    profile: { displayName: "Riley Real" },
  },
}));
vi.mock("~/lib/admin", () => ({ adminAccess: async () => access }));
const logged = vi.hoisted(() => [] as { outcome: string; summary: string }[]);
vi.mock("~/lib/log", () => ({
  record: async (_: unknown, row: { outcome: string; summary: string }) => {
    logged.push(row);
  },
}));
/* the Sheet in memory, behind the client the route asks for */
const tabs = vi.hoisted(() => ({}) as Record<string, Rows>);
vi.mock("~/lib/credits/load", async () => {
  const { Sheets } = await import("~/lib/services/google/sheets");
  const sheets = Object.create(Sheets.prototype) as InstanceType<typeof Sheets>;
  Object.assign(sheets, {
    tabs: async () => Object.keys(tabs),
    read: async (titles: string[]) =>
      new Map(titles.filter((t) => t in tabs).map((t) => [t, tabs[t]!])),
    addTab: async (title: string) => {
      tabs[title] = [];
    },
    replace: async (title: string, rows: Rows) => {
      tabs[title] = rows;
    },
  });
  return { sheetsClient: () => sheets };
});

const { POST } = await import("./sheet");

const send = (body: unknown) =>
  (POST as (c: unknown) => Promise<Response>)({
    request: new Request("https://hareware.test/api/sheet", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  });

const view = { v: 1, label: "All", title: "Everything" };

beforeEach(() => {
  for (const key of Object.keys(tabs)) delete tabs[key];
  logged.length = 0;
  tabs.Views = [
    ["id", "page", "position", "view", "updated by", "updated at"],
    ["all", "articles", "1", "{}", "Sam Second", "T0"],
  ];
});

test("a save answers with the updated at it wrote, which the row holds", async () => {
  const response = await send({
    kind: "view-save",
    page: "articles",
    id: "all",
    view,
    basedOn: "T0",
  });

  expect(response.status).toBe(200);
  const { updatedAt } = (await response.json()) as { updatedAt: string };
  expect(tabs.Views![1]).toEqual([
    "all",
    "articles",
    "1",
    JSON.stringify(view),
    "Riley Real",
    updatedAt,
  ]);
  expect(logged).toEqual([
    expect.objectContaining({
      outcome: "ok",
      summary: "saved view all on articles",
    }),
  ]);
});

test("a save on an older copy is a 409 that says why, logged without a name", async () => {
  const response = await send({
    kind: "view-save",
    page: "articles",
    id: "all",
    view,
    basedOn: "T-older",
  });

  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({
    conflict: "Someone changed this view since you opened it",
  });
  expect(tabs.Views![1]![3]).toBe("{}");
  expect(logged).toHaveLength(1);
  expect(logged[0]!.outcome).toBe("skipped");
  expect(logged[0]!.summary).not.toContain("Riley");
});
