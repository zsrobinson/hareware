import { expect, test } from "vitest";
import { describeEdit, parseEdit, type Edit } from "./edits";

test("accepts each kind of edit the pages send", () => {
  expect(
    parseEdit({
      kind: "pen-names",
      entries: [{ byline: " Penn Name ", realName: "Riley Real" }],
    }),
  ).toEqual({
    kind: "pen-names",
    entries: [{ byline: "Penn Name", realName: "Riley Real" }],
  });
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
  });
});

test("refuses what would write nonsense to the Sheet", () => {
  for (const body of [
    undefined,
    { kind: "drop-table" },
    { kind: "pen-names", entries: [] },
    { kind: "pen-names", entries: [{ realName: "X" }] },
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
      kind: "pen-names",
      entries: [{ byline: "Penn Name", realName: "Riley Real" }],
    },
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
      kind: "byline",
      byline: "Penn Name",
      everywhere: ["Sam Second"],
      articles: [{ postId: 3, role: "writer", realNames: ["Riley Real"] }],
    },
  ];
  for (const edit of edits) {
    expect(describeEdit(edit)).not.toContain("Riley");
    expect(describeEdit(edit)).not.toContain("Penn");
  }
});

test("a byline edit names the byline and says who on which articles", () => {
  expect(
    parseEdit({
      kind: "byline",
      byline: " Penn Name ",
      everywhere: ["Sam Second"],
      articles: [{ postId: 3, role: "writer", realNames: ["Riley Real", " "] }],
    }),
  ).toEqual({
    kind: "byline",
    byline: "Penn Name",
    everywhere: ["Sam Second"],
    articles: [{ postId: 3, role: "writer", realNames: ["Riley Real"] }],
  });
  expect(
    parseEdit({ kind: "byline", byline: "Penn Name", articles: [] }),
  ).toEqual({ kind: "byline", byline: "Penn Name", articles: [] });
  for (const body of [
    { kind: "byline", articles: [] },
    { kind: "byline", byline: "P", articles: [{ postId: 0, realNames: [] }] },
    {
      kind: "byline",
      byline: "P",
      articles: [{ postId: 3, role: "x", realNames: [] }],
    },
    { kind: "byline", byline: "P", everywhere: "Sam", articles: [] },
  ])
    expect(parseEdit(body)).toHaveProperty("error");
});
