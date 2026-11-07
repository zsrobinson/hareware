import { expect, test } from "vitest";
import type { Rows, Sheets } from "~/lib/services/google/sheets";
import { DEFAULT_LABELS } from "./labels";
import {
  labelsIn,
  readSheet,
  setArticleCredits,
  setDifferentPeople,
  setIgnored,
  setLabels,
  setPenNames,
} from "./sheet";

/* invented names only: what the Sheet maps is private */

/** a Sheet held in memory, with the calls the module makes */
function fakeSheet(tabs: Record<string, Rows>) {
  const sheets = {
    tabs: async () => Object.keys(tabs),
    read: async (titles: string[]) =>
      new Map(titles.filter((t) => t in tabs).map((t) => [t, tabs[t]!])),
    addTab: async (title: string) => {
      tabs[title] = [];
    },
    replace: async (title: string, rows: Rows) => {
      tabs[title] = rows;
    },
  } as unknown as Sheets;
  return { sheets, tabs };
}

test("reads overrides by their header, whatever order the columns are in", async () => {
  const { sheets } = fakeSheet({
    Overrides: [
      ["real_name", "byline", "post_id", "role"],
      ["Riley Real", "Penn Name", "", ""],
      ["Cleo Drawer", "", "12", "Image"],
    ],
  });

  const state = await readSheet(sheets);

  expect(state.status === "read" && state.overrides).toEqual([
    {
      postId: null,
      role: null,
      byline: "Penn Name",
      realName: "Riley Real",
      note: "",
    },
    {
      postId: 12,
      role: "image",
      byline: null,
      realName: "Cleo Drawer",
      note: "",
    },
  ]);
});

test("a tab typed in without a header is read in HareWare's column order", async () => {
  const { sheets } = fakeSheet({
    Overrides: [["", "", "Penn Name", "Riley Real"]],
  });

  const state = await readSheet(sheets);

  expect(state.status === "read" && state.overrides[0]?.realName).toBe(
    "Riley Real",
  );
});

test("a row it cannot use is reported with its row number, not dropped silently", async () => {
  const { sheets } = fakeSheet({
    Overrides: [
      ["post_id", "role", "byline", "real_name"],
      ["abc", "writer", "X", "Y"],
      ["5", "author", "X", "Y"],
      ["6", "writer", "X", ""],
      ["", "writer", "", "Y"],
    ],
  });

  const state = await readSheet(sheets);

  expect(state.status === "read" && state.problems.map((p) => p.row)).toEqual([
    2, 3, 4, 5,
  ]);
  expect(state.status === "read" && state.overrides).toEqual([]);
});

test("a missing or empty Labels tab means the defaults; one with rows replaces them", async () => {
  expect(labelsIn(await readSheet(fakeSheet({}).sheets))).toEqual(
    DEFAULT_LABELS,
  );
  expect(
    labelsIn(
      await readSheet(fakeSheet({ Labels: [["label", "role"]] }).sheets),
    ),
  ).toEqual(DEFAULT_LABELS);
  expect(
    labelsIn(
      await readSheet(
        fakeSheet({
          Labels: [
            ["label", "role"],
            ["Photo by:", "image"],
          ],
        }).sheets,
      ),
    ),
  ).toEqual([{ label: "Photo by", role: "image" }]);
});

test("a Sheet that cannot be read says so, rather than looking empty", async () => {
  const refuse = async () => {
    throw new Error("google sheets answered 403");
  };

  expect(
    await readSheet({ tabs: refuse, read: refuse } as unknown as Sheets),
  ).toEqual({
    status: "failed",
    reason: "google sheets answered 403",
  });
});

test("which tabs exist is reported, so a renamed one is not read as empty", async () => {
  const state = await readSheet(fakeSheet({ overrides: [["x"]] }).sheets);

  expect(state.status === "read" && state.tabs).toEqual({
    overrides: false,
    labels: false,
    ignored: false,
  });
});

test("setting a pen name replaces its everywhere row and leaves every other row as it was", async () => {
  const { sheets, tabs } = fakeSheet({
    Overrides: [
      ["post_id", "role", "byline", "real_name", "note"],
      ["", "", "penn name", "Old Guess", ""],
      ["7", "writer", "Penn Name", "Someone Else", "kept"],
      ["", "", "Other Pen", "Sam Second", "typed by hand"],
      ["not a number", "", "", "", ""],
    ],
  });

  await setPenNames(sheets, [{ byline: "Penn Name", realName: "Riley Real" }]);

  expect(tabs.Overrides).toEqual([
    ["post_id", "role", "byline", "real_name", "note"],
    ["7", "writer", "Penn Name", "Someone Else", "kept"],
    ["", "", "Other Pen", "Sam Second", "typed by hand"],
    ["not a number", "", "", "", ""],
    ["", "", "Penn Name", "Riley Real", ""],
  ]);
});

test("clearing a pen name removes it, and a write keeps the tab's own column order", async () => {
  const { sheets, tabs } = fakeSheet({
    Overrides: [
      ["real_name", "byline"],
      ["Riley Real", "Penn Name"],
    ],
  });

  await setPenNames(sheets, [{ byline: "Penn Name", realName: "Riley Real" }]);
  expect(tabs.Overrides).toEqual([
    ["real_name", "byline"],
    ["Riley Real", "Penn Name"],
  ]);

  await setPenNames(sheets, [{ byline: "Penn Name", realName: "" }]);
  expect(tabs.Overrides).toEqual([["real_name", "byline"]]);
});

test("editing one article's credits touches only that article and role", async () => {
  const { sheets, tabs } = fakeSheet({
    Overrides: [
      ["post_id", "role", "byline", "real_name", "note"],
      ["7", "writer", "Penn Name", "Old", ""],
      ["7", "image", "Pic", "Kept", ""],
      ["", "", "Penn Name", "Riley Real", ""],
    ],
  });

  await setArticleCredits(sheets, 7, "writer", [
    { byline: "Penn Name", realName: "Sam Second" },
    { byline: null, realName: "Cleo Drawer" },
  ]);

  expect(tabs.Overrides!.slice(1)).toEqual([
    ["7", "image", "Pic", "Kept", ""],
    ["", "", "Penn Name", "Riley Real", ""],
    ["7", "writer", "Penn Name", "Sam Second", ""],
    ["7", "writer", "", "Cleo Drawer", ""],
  ]);
});

test("the first write to a missing tab creates it with a header", async () => {
  const { sheets, tabs } = fakeSheet({});

  await setIgnored(sheets, 42, true, "a quiz");

  expect(tabs.Ignored).toEqual([
    ["post_id", "names", "note"],
    ["42", "", "a quiz"],
  ]);
});

test("ignoring twice leaves one row, and restoring removes it", async () => {
  const { sheets, tabs } = fakeSheet({});

  await setIgnored(sheets, 42, true);
  await setIgnored(sheets, 42, true);
  expect(tabs.Ignored).toHaveLength(2);

  await setIgnored(sheets, 42, false);
  expect(tabs.Ignored).toEqual([["post_id", "names", "note"]]);
});

test("different people are remembered as a pair, in either order", async () => {
  const { sheets, tabs } = fakeSheet({});

  await setDifferentPeople(sheets, ["Zed Name", "Abe Name"], true);
  await setDifferentPeople(sheets, ["Abe Name", "Zed Name"], true);

  expect(tabs.Ignored).toEqual([
    ["post_id", "names", "note"],
    ["", "Abe Name | Zed Name", ""],
  ]);
});

test("labels are written whole, as the settings page edits them", async () => {
  const { sheets, tabs } = fakeSheet({
    Labels: [
      ["label", "role"],
      ["Old", "writer"],
    ],
  });

  await setLabels(sheets, [{ label: "Puzzle by", role: "writer" }]);

  expect(tabs.Labels).toEqual([
    ["label", "role"],
    ["Puzzle by", "writer"],
  ]);
});

test("a pen name two people share keeps both, set in one write", async () => {
  const { sheets, tabs } = fakeSheet({});

  await setPenNames(sheets, [
    { byline: "Penn Name", realName: "Riley Real" },
    { byline: "Penn Name", realName: "Sam Second" },
    { byline: "Other Pen", realName: "Cleo Drawer" },
  ]);

  expect(tabs.Overrides!.slice(1).map((row) => [row[2], row[3]])).toEqual([
    ["Penn Name", "Riley Real"],
    ["Penn Name", "Sam Second"],
    ["Other Pen", "Cleo Drawer"],
  ]);
});
