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
