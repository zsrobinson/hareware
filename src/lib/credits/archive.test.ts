import { expect, test } from "vitest";
import { buildArchive, type SourcePost } from "./archive";
import { DEFAULT_LABELS } from "./labels";
import type { Ignored, Override, SheetState } from "./sheet";

/* invented names only: what the Sheet maps is private, so no test may pair a
   real byline with a real person */

const post = (
  id: number,
  paragraphs: string[],
  categoryIds = [103],
): SourcePost => ({
  id,
  publishedAt: "2026-10-01T10:00:00Z",
  link: `https://theumdhare.com/${id}/`,
  title: `Post ${id}`,
  categoryIds,
  paragraphs,
});

const categories = new Map([
  [103, "News"],
  [1, "Uncategorized"],
]);

const row = (o: Partial<Override> & { realName: string }): Override => ({
  postId: null,
  role: null,
  byline: null,
  note: "",
  ...o,
});

const read = (
  overrides: Override[] = [],
  ignored: Ignored[] = [],
): SheetState => ({
  status: "read",
  overrides,
  ignored,
  labels: null,
  problems: [],
  tabs: { overrides: true, labels: true, ignored: true },
});

const build = (posts: SourcePost[], sheet: SheetState = read()) =>
  buildArchive({
    posts,
    categories,
    sheet,
    labels: DEFAULT_LABELS,
    fetchedAt: "now",
  });

const names = (archive: ReturnType<typeof build>, index = 0, role = "writer") =>
  archive.articles[index]!.credits.filter((c) => c.role === role).flatMap((c) =>
    c.contributors.map((p) => p.name),
  );

test("credits an article as printed when the Sheet says nothing about it", () => {
  const archive = build([
    post(1, ["Article by: Penn Name", "Image Credits: Ida Imager"]),
  ]);

  expect(names(archive)).toEqual(["Penn Name"]);
  expect(names(archive, 0, "image")).toEqual(["Ida Imager"]);
  expect(archive.articles[0]!.problems).toEqual([]);
});

test("one row for a pen name resolves it on every article, and only that name", () => {
  const archive = build(
    [
      post(1, ["Article by: Penn Name and Sam Second", "Image Credits: B"]),
      post(2, ["Article by: Penn Name", "Image Credits: B"]),
    ],
    read([row({ byline: "penn name", realName: "Riley Real" })]),
  );

  expect(names(archive, 0)).toEqual(["Riley Real", "Sam Second"]);
  expect(names(archive, 1)).toEqual(["Riley Real"]);
  const riley = archive.articles[0]!.credits[0]!.contributors[0]!;
  expect(riley).toEqual({
    name: "Riley Real",
    byline: "Penn Name",
    source: "everywhere",
  });
  expect(archive.penNames).toEqual([
    { byline: "penn name", realName: ["Riley Real"], articles: 2 },
  ]);
});

test("a row for one article wins over the row for every article", () => {
  const archive = build(
    [
      post(1, ["Article by: Penn Name", "Image Credits: B"]),
      post(2, ["Article by: Penn Name", "Image Credits: B"]),
    ],
    read([
      row({ byline: "Penn Name", realName: "Riley Real" }),
      row({
        postId: 2,
        role: "writer",
        byline: "Penn Name",
        realName: "Other Person",
      }),
    ]),
  );

  expect(names(archive, 0)).toEqual(["Riley Real"]);
  expect(names(archive, 1)).toEqual(["Other Person"]);
});

test("a pen name can stand for two people", () => {
  const archive = build(
    [post(1, ["Article by: Penn Name", "Image Credits: B"])],
    read([
      row({ byline: "Penn Name", realName: "Riley Real" }),
      row({ byline: "Penn Name", realName: "Sam Second" }),
    ]),
  );

  expect(names(archive)).toEqual(["Riley Real", "Sam Second"]);
});

test("a row with no byline adds someone the article does not print", () => {
  const archive = build(
    [post(1, ["Article by: Somebody"])],
    read([row({ postId: 1, role: "image", realName: "Cleo Drawer" })]),
  );

  expect(names(archive, 0, "image")).toEqual(["Cleo Drawer"]);
  expect(archive.articles[0]!.problems.map((p) => p.kind)).not.toContain(
    "no-image",
  );
});

test("a row for an article that does not exist is reported, not dropped", () => {
  const archive = build(
    [post(1, ["Article by: A", "Image Credits: B"])],
    read([row({ postId: 99, role: "writer", byline: "X", realName: "Y" })]),
  );

  expect(archive.sheetProblems.map((p) => p.message)).toEqual([
    "no published article has post id 99",
  ]);
});

test("flags an article with no credits and no section", () => {
  const [article] = build([post(1, ["Just a body paragraph."], [1])]).articles;

  expect(article!.problems.map((p) => p.kind).sort()).toEqual([
    "no-image",
    "no-writer",
    "uncategorized",
  ]);
});

test("flags a line shaped like a credit that no label reads", () => {
  const [article] = build([
    post(1, [
      "Article by: A",
      "Image Credits: B",
      "Squirrel Photos by: Cleo Drawer",
    ]),
  ]).articles;

  expect(article!.problems).toEqual([
    { kind: "unrecognised", detail: "Squirrel Photos by: Cleo Drawer" },
  ]);
});

test("an article marked not a problem carries the note", () => {
  const archive = build(
    [post(1, ["Just a body."])],
    read([], [{ postId: 1, names: null, note: "an editor's note" }]),
  );

  expect(archive.articles[0]!.ignored).toBe("an editor's note");
});

test("points at names one letter apart, and remembers different people", () => {
  const posts = [
    post(1, ["Article by: Cleo Dombrosky", "Image Credits: Cleo Dombroksy"]),
    post(2, ["Article by: Cleo Dombrosky", "Image Credits: Ida Imager"]),
  ];

  expect(build(posts).similarNames).toEqual([
    { names: ["Cleo Dombroksy", "Cleo Dombrosky"], counts: [1, 2] },
  ]);
  expect(
    build(
      posts,
      read(
        [],
        [
          {
            postId: null,
            names: "Cleo Dombroksy | Cleo Dombrosky",
            note: "sisters",
          },
        ],
      ),
    ).similarNames[0]!.ignored,
  ).toBe("sisters");
});

test("a Sheet that could not be read leaves every article as printed, and says so", () => {
  const archive = build(
    [post(1, ["Article by: Penn Name", "Image Credits: B"])],
    {
      status: "failed",
      reason: "google sheets answered 403",
    },
  );

  expect(archive.sheet).toEqual({
    status: "failed",
    reason: "google sheets answered 403",
  });
  expect(names(archive)).toEqual(["Penn Name"]);
});

test("a missing tab is named, so a renamed Overrides tab is never mistaken for an empty one", () => {
  const archive = build([post(1, ["Article by: A"])], {
    ...read(),
    tabs: { overrides: false, labels: true, ignored: true },
  } as SheetState);

  expect(archive.sheet).toMatchObject({
    status: "read",
    missingTabs: ["Overrides"],
  });
});
