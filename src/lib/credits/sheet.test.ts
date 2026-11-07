import { expect, test } from "vitest";
import type { Rows, Sheets } from "~/lib/services/google/sheets";
import { DEFAULT_LABELS } from "./labels";
import { labelsIn, readSheet, setUpSheet } from "./sheet";

/** a Sheet held in memory, with the three calls the module makes */
function fakeSheet(tabs: Record<string, Rows>) {
  const writes: { title: string; rows: Rows }[] = [];
  const sheets = {
    tabs: async () => Object.keys(tabs),
    read: async (titles: string[]) =>
      new Map(titles.filter((t) => t in tabs).map((t) => [t, tabs[t]!])),
    addTab: async (title: string) => {
      tabs[title] = [];
    },
    write: async (title: string, rows: Rows) => {
      writes.push({ title, rows });
      tabs[title] = rows;
    },
  } as unknown as Sheets;
  return { sheets, writes };
}

test("reads overrides and skips the header", async () => {
  const { sheets } = fakeSheet({
    Overrides: [
      ["post_id", "role", "real_name", "note"],
      ["123", "writer", "Zach", ""],
      ["123", "Image", "Kenlynn", ""],
    ],
  });

  const state = await readSheet(sheets);

  expect(
    state.status === "read" &&
      state.overrides.map((o) => [o.postId, o.role, o.realName]),
  ).toEqual([
    [123, "writer", "Zach"],
    [123, "image", "Kenlynn"],
  ]);
});

test("a row it cannot use is reported with its row number, not dropped silently", async () => {
  const { sheets } = fakeSheet({
    Overrides: [
      ["post_id", "role", "real_name"],
      ["abc", "writer", "Zach"],
      ["5", "author", "Zach"],
      ["6", "writer", ""],
    ],
  });

  const state = await readSheet(sheets);

  expect(state.status === "read" && state.problems.map((p) => p.row)).toEqual([
    2, 3, 4,
  ]);
  expect(state.status === "read" && state.overrides).toEqual([]);
});

test("a missing Labels tab means the defaults, and so does an empty one", async () => {
  expect(
    labelsIn(await readSheet(fakeSheet({ Overrides: [] }).sheets)),
  ).toEqual(DEFAULT_LABELS);
  expect(
    labelsIn(
      await readSheet(fakeSheet({ Labels: [["label", "role"]] }).sheets),
    ),
  ).toEqual(DEFAULT_LABELS);
});

test("a Labels tab with rows replaces the defaults entirely", async () => {
  const { sheets } = fakeSheet({
    Labels: [
      ["label", "role"],
      ["Photo by:", "image"],
    ],
  });

  expect(labelsIn(await readSheet(sheets))).toEqual([
    { label: "Photo by", role: "image" },
  ]);
});

test("a Sheet that cannot be read says so, rather than looking empty", async () => {
  const refuse = async () => {
    throw new Error("google sheets answered 403");
  };
  const sheets = { tabs: refuse, read: refuse } as unknown as Sheets;

  expect(await readSheet(sheets)).toEqual({
    status: "failed",
    reason: "google sheets answered 403",
  });
});

test("setup creates what is missing and never rewrites a row somebody wrote", async () => {
  const { sheets, writes } = fakeSheet({
    Overrides: [
      ["post_id", "role", "real_name", "note"],
      ["1", "writer", "Zach", ""],
    ],
  });

  await setUpSheet(sheets);

  expect(writes.map((w) => w.title).sort()).toEqual(["Ignored", "Labels"]);
  expect(writes.find((w) => w.title === "Labels")!.rows.length).toBe(
    DEFAULT_LABELS.length + 1,
  );
});
