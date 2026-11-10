import { expect, test } from "vitest";
import type { Rows, Sheets } from "~/lib/services/google/sheets";
import { DEFAULT_LABELS } from "./labels";
import {
  labelsIn,
  readSheet,
  setArticleCredits,
  setBylines,
  setDifferentPeople,
  setIgnored,
  setLabels,
  ViewConflict,
  writeViews,
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
      ["Riley Real", "Penn Name", "3", ""],
      ["Cleo Drawer", "", "12", "Image"],
    ],
  });

  const state = await readSheet(sheets);

  expect(state.status === "read" && state.overrides).toEqual([
    {
      postId: 3,
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
    Overrides: [["3", "", "Penn Name", "Riley Real"]],
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
    views: false,
  });
});

test("setting a byline on articles replaces only its rows there, and keeps the tab's column order", async () => {
  const { sheets, tabs } = fakeSheet({
    Overrides: [
      ["real_name", "byline", "post_id", "role"],
      ["Old Guess", "penn name", "7", "writer"],
      ["Kept", "Penn Name", "8", "writer"],
      ["Typed By Hand", "Other Pen", "7", "writer"],
      ["", "", "not a number", ""],
    ],
  });

  await setBylines(sheets, [
    {
      postId: 7,
      role: "writer",
      byline: "Penn Name",
      realNames: ["Riley Real"],
    },
  ]);

  expect(tabs.Overrides).toEqual([
    ["real_name", "byline", "post_id", "role"],
    ["Kept", "Penn Name", "8", "writer"],
    ["Typed By Hand", "Other Pen", "7", "writer"],
    ["", "", "not a number", ""],
    ["Riley Real", "Penn Name", "7", "writer"],
  ]);

  await setBylines(sheets, [
    { postId: 7, role: "writer", byline: "Penn Name", realNames: [] },
  ]);
  expect(tabs.Overrides).toHaveLength(4);
});

test("an old every-article row is read apart, and converting it retires it", async () => {
  const { sheets, tabs } = fakeSheet({
    Overrides: [
      ["post_id", "role", "byline", "real_name", "note"],
      ["", "", "Penn Name", "Riley Real", ""],
      ["", "", "Other Pen", "Sam Second", ""],
    ],
  });

  const state = await readSheet(sheets);
  expect(state.status === "read" && state.overrides).toEqual([]);
  const penn = {
    byline: "Penn Name",
    role: null,
    realName: "Riley Real",
    note: "",
  };
  expect(state.status === "read" && state.unscoped).toEqual([
    penn,
    { byline: "Other Pen", role: null, realName: "Sam Second", note: "" },
  ]);

  const set = [
    {
      postId: 3,
      role: "writer" as const,
      byline: "Penn Name",
      realNames: ["Riley Real"],
    },
  ];
  await setBylines(sheets, set, [penn]);
  expect(tabs.Overrides!.slice(1)).toEqual([
    ["", "", "Other Pen", "Sam Second", ""],
    ["3", "writer", "Penn Name", "Riley Real", ""],
  ]);

  /* and undoing it puts the old row back as it was */
  await setBylines(
    sheets,
    set.map((e) => ({ ...e, realNames: [] })),
    [],
    [penn],
  );
  expect(tabs.Overrides!.slice(1)).toEqual([
    ["", "", "Other Pen", "Sam Second", ""],
    ["", "", "Penn Name", "Riley Real", ""],
  ]);
});

test("saving one role splits a row for any role, so it neither stays nor vanishes", async () => {
  const { sheets, tabs } = fakeSheet({
    Overrides: [
      ["post_id", "role", "byline", "real_name", "note"],
      ["7", "", "Penn Name", "Riley Real", "kept"],
      ["8", "", "Penn Name", "Riley Real", "other article"],
    ],
  });

  /* the article prints Penn Name as its writer and its image */
  await setArticleCredits(
    sheets,
    7,
    "writer",
    [{ byline: "Penn Name", realName: "Sam Second" }],
    [{ byline: "Penn Name", roles: ["image"] }],
  );

  expect(tabs.Overrides!.slice(1)).toEqual([
    ["7", "image", "Penn Name", "Riley Real", "kept"],
    ["8", "", "Penn Name", "Riley Real", "other article"],
    ["7", "writer", "Penn Name", "Sam Second", ""],
  ]);
});

test("saving one role leaves an any-role row alone when that role does not print its byline", async () => {
  const { sheets, tabs } = fakeSheet({
    Overrides: [
      ["post_id", "role", "byline", "real_name", "note"],
      ["7", "", "Image Pen", "Riley Real", "kept"],
    ],
  });

  /* the writers print only Alex Author; the image is Image Pen's */
  await setArticleCredits(
    sheets,
    7,
    "writer",
    [{ byline: "Alex Author", realName: "Sam Second" }],
    [{ byline: "Alex Author", roles: [] }],
  );

  expect(tabs.Overrides!.slice(1)).toEqual([
    ["7", "", "Image Pen", "Riley Real", "kept"],
    ["7", "writer", "Alex Author", "Sam Second", ""],
  ]);
});

test("retiring a row with no post id removes that row only, not a mistyped one beside it", async () => {
  const { sheets, tabs } = fakeSheet({
    Overrides: [
      ["post_id", "role", "byline", "real_name", "note"],
      ["", "", "Penn Name", "Riley Real", ""],
      ["", "Writr", "Penn Name", "Sam Second", ""],
    ],
  });

  await setBylines(
    sheets,
    [],
    [{ byline: "Penn Name", role: null, realName: "Riley Real", note: "" }],
  );

  expect(tabs.Overrides!.slice(1)).toEqual([
    ["", "Writr", "Penn Name", "Sam Second", ""],
  ]);
});

test("a post id typed with a leading zero is the same article to a write", async () => {
  const { sheets, tabs } = fakeSheet({
    Overrides: [
      ["post_id", "role", "byline", "real_name", "note"],
      ["0123", "writer", "Penn Name", "Riley Real", ""],
    ],
  });

  await setBylines(sheets, [
    {
      postId: 123,
      role: "writer",
      byline: "Penn Name",
      realNames: ["Sam Second"],
    },
  ]);

  expect(tabs.Overrides!.slice(1)).toEqual([
    ["123", "writer", "Penn Name", "Sam Second", ""],
  ]);
});

test("a pasted note is kept on its rows; otherwise a write signs them", async () => {
  const { sheets, tabs } = fakeSheet({});

  await setBylines(
    sheets,
    [
      {
        postId: 3,
        role: "writer",
        byline: "Penn Name",
        realNames: ["Riley Real"],
        note: "back-fill",
      },
      {
        postId: 4,
        role: "writer",
        byline: "Penn Name",
        realNames: ["Riley Real"],
      },
    ],
    [],
    [],
    "An Editor, Nov 8, 2026",
  );

  expect(tabs.Overrides!.slice(1).map((row) => row[4])).toEqual([
    "back-fill",
    "An Editor, Nov 8, 2026",
  ]);
});

test("editing one article's credits touches only that article and role", async () => {
  const { sheets, tabs } = fakeSheet({
    Overrides: [
      ["post_id", "role", "byline", "real_name", "note"],
      ["7", "writer", "Penn Name", "Old", ""],
      ["7", "image", "Pic", "Kept", ""],
      ["8", "writer", "Penn Name", "Riley Real", ""],
    ],
  });

  await setArticleCredits(sheets, 7, "writer", [
    { byline: "Penn Name", realName: "Sam Second" },
    { byline: null, realName: "Cleo Drawer" },
  ]);

  expect(tabs.Overrides!.slice(1)).toEqual([
    ["7", "image", "Pic", "Kept", ""],
    ["8", "writer", "Penn Name", "Riley Real", ""],
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

/* ---- views ---------------------------------------------------------------- */

const HEADER = ["id", "page", "position", "view", "updated by", "updated at"];
const declared = (label: string) => ({ v: 1, label, title: label });
const starterOf = (...ids: string[]) =>
  ids.map((id) => ({ id, view: declared(id) }));

test("the Views tab comes through as the rows it holds, unread", async () => {
  const { sheets } = fakeSheet({
    Views: [
      ["updated at", "id", "page", "view", "position", "updated by"],
      [
        "2026-11-01T00:00:00.000Z",
        "all",
        "articles",
        "{not json",
        "1",
        "Riley",
      ],
      ["", "", "", "", "", ""],
    ],
  });

  const state = await readSheet(sheets);

  expect(state.status === "read" && state.views).toEqual([
    {
      row: 2,
      id: "all",
      page: "articles",
      position: "1",
      view: "{not json",
      updatedBy: "Riley",
      updatedAt: "2026-11-01T00:00:00.000Z",
    },
  ]);
  expect(state.status === "read" && state.tabs.views).toBe(true);
});

test("the first write on a page writes its starter views with the change, creating the tab", async () => {
  const { sheets, tabs } = fakeSheet({});

  const at = await writeViews(
    sheets,
    "people",
    { kind: "save", id: "top", view: declared("Top"), basedOn: "" },
    { starter: starterOf("everyone", "top"), who: "Riley", at: "T1" },
  );

  expect(at).toBe("T1");
  expect(tabs.Views).toEqual([
    HEADER,
    [
      "everyone",
      "people",
      "1",
      JSON.stringify(declared("everyone")),
      "Riley",
      "T1",
    ],
    ["top", "people", "2", JSON.stringify(declared("Top")), "Riley", "T1"],
  ]);
});

test("a starter copy is refused once someone has written the page", async () => {
  const { sheets, tabs } = fakeSheet({
    Views: [HEADER, ["everyone", "people", "1", "{}", "Sam", "T0"]],
  });
  const before = structuredClone(tabs.Views);

  await expect(
    writeViews(
      sheets,
      "people",
      { kind: "save", id: "everyone", view: declared("E"), basedOn: "" },
      { starter: starterOf("everyone"), who: "Riley" },
    ),
  ).rejects.toThrow(ViewConflict);
  expect(tabs.Views).toEqual(before);
});

test("a save based on an older copy of the row is a conflict, and writes nothing", async () => {
  const { sheets, tabs } = fakeSheet({
    Views: [
      HEADER,
      ["all", "articles", "1", "{}", "Sam", "T2"],
      ["everyone", "people", "1", "{}", "Sam", "T0"],
    ],
  });
  const before = structuredClone(tabs.Views);

  await expect(
    writeViews(
      sheets,
      "articles",
      { kind: "save", id: "all", view: declared("All"), basedOn: "T1" },
      { starter: null, who: "Riley" },
    ),
  ).rejects.toThrow("Someone changed this view since you opened it");
  expect(tabs.Views).toEqual(before);

  await expect(
    writeViews(
      sheets,
      "articles",
      { kind: "delete", id: "gone", basedOn: "T1" },
      { starter: null, who: "Riley" },
    ),
  ).rejects.toThrow("Someone deleted this view since you opened it");
  expect(tabs.Views).toEqual(before);
});

test("a save on the copy it was based on rewrites that row alone", async () => {
  const { sheets, tabs } = fakeSheet({
    Views: [
      ["view", "id", "page", "position", "updated by", "updated at"],
      ["{}", "all", "articles", "1", "Sam", "T0"],
      ["{}", "all", "people", "1", "Sam", "T0"],
      ["typed by hand", "", "", "", "", ""],
    ],
  });

  await writeViews(
    sheets,
    "articles",
    { kind: "save", id: "all", view: declared("All"), basedOn: "T0" },
    { starter: null, who: "Riley", at: "T1" },
  );

  expect(tabs.Views).toEqual([
    ["view", "id", "page", "position", "updated by", "updated at"],
    [JSON.stringify(declared("All")), "all", "articles", "1", "Riley", "T1"],
    ["{}", "all", "people", "1", "Sam", "T0"],
    ["typed by hand", "", "", "", "", ""],
  ]);
});

test("a page whose rows have gone refuses a write based on them", async () => {
  const { sheets } = fakeSheet({ Views: [HEADER] });

  await expect(
    writeViews(
      sheets,
      "articles",
      { kind: "save", id: "all", view: declared("All"), basedOn: "T0" },
      { starter: null, who: "Riley" },
    ),
  ).rejects.toThrow(ViewConflict);
});

test("a new view goes last, or where it is put back; an id taken is a conflict", async () => {
  const { sheets, tabs } = fakeSheet({
    Views: [HEADER, ["all", "articles", "1", "{}", "Sam", "T0"]],
  });
  const create = (id: string, position?: number) =>
    writeViews(
      sheets,
      "articles",
      { kind: "create", id, view: declared(id), position },
      { starter: null, who: "Riley", at: "T1" },
    );

  await create("v-new");
  await create("v-back", 7);

  expect(tabs.Views!.slice(2).map((row) => row.slice(0, 3))).toEqual([
    ["v-new", "articles", "2"],
    ["v-back", "articles", "7"],
  ]);
  await expect(create("all")).rejects.toThrow(ViewConflict);
});

test("a move rewrites positions alone, and is refused if the order it saw has changed", async () => {
  const { sheets, tabs } = fakeSheet({
    Views: [
      HEADER,
      ["b", "articles", "2", "{}", "Sam", "T0"],
      ["a", "articles", "1", "{}", "Sam", "T0"],
    ],
  });
  const move = (order: string[], basedOn: string[]) =>
    writeViews(
      sheets,
      "articles",
      { kind: "reorder", order, basedOn },
      { starter: null, who: "Riley", at: "T1" },
    );

  await expect(move(["b", "a"], ["b", "a"])).rejects.toThrow(ViewConflict);
  await expect(move(["b"], ["a", "b"])).rejects.toThrow(ViewConflict);
  await move(["b", "a"], ["a", "b"]);

  expect(tabs.Views).toEqual([
    HEADER,
    ["b", "articles", "1", "{}", "Sam", "T0"],
    ["a", "articles", "2", "{}", "Sam", "T0"],
  ]);
});

test("restoring a page replaces its rows with the starter set and leaves the other page's", async () => {
  const { sheets, tabs } = fakeSheet({
    Views: [
      HEADER,
      ["mine", "articles", "1", "{}", "Sam", "T0"],
      ["everyone", "people", "1", "{}", "Sam", "T0"],
    ],
  });

  await writeViews(
    sheets,
    "articles",
    { kind: "restore" },
    { starter: starterOf("all"), who: "Riley", at: "T1" },
  );

  expect(tabs.Views).toEqual([
    HEADER,
    ["everyone", "people", "1", "{}", "Sam", "T0"],
    ["all", "articles", "1", JSON.stringify(declared("all")), "Riley", "T1"],
  ]);
});
