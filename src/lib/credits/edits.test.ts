import { expect, test } from "vitest";
import { describeEdit, parseEdit, type Edit } from "./edits";

test("accepts each kind of edit the pages send", () => {
  expect(parseEdit({ kind: "ignore", postId: "42" })).toEqual({
    kind: "ignore",
    postId: 42,
    ignored: true,
  });
  expect(
    parseEdit({
      kind: "article-credits",
      postId: 7,
      role: "image",
      entries: [{ byline: "", realName: "X" }],
    }),
  ).toEqual({
    kind: "article-credits",
    postId: 7,
    role: "image",
    entries: [{ byline: null, realName: "X" }],
    elsewhere: [],
  });
});

test("refuses what would write nonsense to the Sheet", () => {
  for (const body of [
    undefined,
    { kind: "drop-table" },
    { kind: "article-credits", postId: -1, role: "writer", entries: [] },
    { kind: "article-credits", postId: 7, role: "author", entries: [] },
    { kind: "labels", labels: [] },
    { kind: "labels", labels: [{ label: "By", role: "editor" }] },
    { kind: "different-people", names: ["Only one"] },
  ])
    expect(parseEdit(body)).toHaveProperty("error");
});

test("a log line never carries a real name", () => {
  const edits: Edit[] = [
    {
      kind: "article-credits",
      postId: 7,
      role: "writer",
      entries: [{ byline: "Penn Name", realName: "Riley Real" }],
    },
    {
      kind: "different-people",
      names: ["Riley Real", "Riley Reel"],
      different: true,
    },
    {
      kind: "bylines",
      entries: [
        {
          postId: 3,
          role: "writer",
          byline: "Penn Name",
          realNames: ["Riley Real"],
        },
      ],
      retire: [
        { byline: "Penn Name", role: null, realName: "Riley Real", note: "" },
      ],
    },
  ];
  for (const edit of edits) {
    expect(describeEdit(edit)).not.toContain("Riley");
    expect(describeEdit(edit)).not.toContain("Penn");
  }
});

test("a bylines edit says who a byline is on which articles", () => {
  expect(
    parseEdit({
      kind: "bylines",
      entries: [
        {
          postId: "3",
          role: "writer",
          byline: " Penn Name ",
          realNames: ["Riley Real", " "],
        },
      ],
    }),
  ).toEqual({
    kind: "bylines",
    entries: [
      {
        postId: 3,
        role: "writer",
        byline: "Penn Name",
        realNames: ["Riley Real"],
      },
    ],
    retire: [],
    restore: [],
  });
  for (const body of [
    { kind: "bylines", entries: [] },
    {
      kind: "bylines",
      entries: [{ postId: 0, byline: "P", realNames: [] }],
    },
    {
      kind: "bylines",
      entries: [{ postId: 3, role: "x", byline: "P", realNames: [] }],
    },
    { kind: "bylines", entries: [{ postId: 3, realNames: ["X"] }] },
    { kind: "bylines", entries: [], retire: "Penn Name" },
  ])
    expect(parseEdit(body)).toHaveProperty("error");
});

const view = { v: 1, label: "Riley's picks", title: "What Riley picked" };

test("a change to views is checked for its page, id and declaration", () => {
  expect(
    parseEdit({
      kind: "view-save",
      page: "articles",
      id: "all",
      view,
      basedOn: "T0",
    }),
  ).toEqual({
    kind: "view-save",
    page: "articles",
    id: "all",
    view,
    basedOn: "T0",
    starter: null,
  });
  for (const body of [
    { kind: "view-save", page: "charts", id: "all", view, basedOn: "" },
    { kind: "view-save", page: "articles", id: "All Views", view, basedOn: "" },
    { kind: "view-save", page: "articles", id: "all", view },
    { kind: "view-save", page: "articles", id: "all", view: {}, basedOn: "" },
    /* a declaration's id and page are its row's columns, never its own */
    {
      kind: "view-save",
      page: "articles",
      id: "all",
      view: { ...view, source: "people" },
      basedOn: "",
    },
    {
      kind: "view-create",
      page: "articles",
      id: "x",
      view: { ...view, title: "x".repeat(9000) },
    },
    { kind: "view-reorder", page: "people", order: [], basedOn: [] },
    { kind: "views-restore", page: "people" },
    {
      kind: "view-delete",
      page: "people",
      id: "top",
      basedOn: "",
      starter: [{ id: "top" }],
    },
  ])
    expect(parseEdit(body)).toHaveProperty("error");
});

test("a change to views is logged by its page and id, never its words or its writer", () => {
  const starter = [{ id: "all", view }];
  const edits = [
    { kind: "view-save", page: "articles", id: "all", view, basedOn: "" },
    { kind: "view-rename", page: "articles", id: "all", view, basedOn: "" },
    { kind: "view-create", page: "articles", id: "v-1", view, starter },
    { kind: "view-delete", page: "articles", id: "all", basedOn: "" },
    { kind: "view-reorder", page: "articles", order: ["a"], basedOn: ["a"] },
    { kind: "views-restore", page: "articles", starter },
  ].map((body) => parseEdit(body) as Edit);

  expect(edits.map(describeEdit)).toEqual([
    "saved view all on articles",
    "renamed view all on articles",
    "added view v-1 on articles, first writing its 1 starter views",
    "deleted view all on articles",
    "moved the views on articles",
    "restored the 1 starter views on articles",
  ]);
  for (const line of edits.map(describeEdit))
    expect(line).not.toContain("Riley");
});
