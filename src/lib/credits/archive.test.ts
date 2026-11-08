import { expect, test } from "vitest";
import { buildArchive, similarNames, type SourcePost } from "./archive";
import { DEFAULT_LABELS } from "./labels";
import type { Ignored, Override, SheetState, Unscoped } from "./sheet";

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

const row = (
  o: Partial<Override> & { postId: number; realName: string },
): Override => ({
  role: null,
  byline: null,
  note: "",
  ...o,
});

const read = (
  overrides: Override[] = [],
  ignored: Ignored[] = [],
  unscoped: Unscoped[] = [],
): SheetState => ({
  status: "read",
  overrides,
  unscoped,
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

test("a row says who a pen name is on its own article, and nowhere else", () => {
  const archive = build(
    [
      post(1, ["Article by: Penn Name and Sam Second", "Image Credits: B"]),
      post(2, ["Article by: Penn Name", "Image Credits: B"]),
    ],
    read([
      row({
        postId: 1,
        role: "writer",
        byline: "penn name",
        realName: "Riley Real",
      }),
    ]),
  );

  expect(names(archive, 0)).toEqual(["Riley Real", "Sam Second"]);
  expect(archive.articles[0]!.credits[0]!.contributors[0]).toEqual({
    name: "Riley Real",
    byline: "Penn Name",
    source: "article",
  });
  /* the same name on another article is that article's question */
  expect(names(archive, 1)).toEqual(["Penn Name"]);
});

test("a row in one role leaves the same byline in another role as printed", () => {
  const archive = build(
    [post(1, ["Article by: Penn Name", "Image Credits: Penn Name"])],
    read([
      row({
        postId: 1,
        role: "writer",
        byline: "Penn Name",
        realName: "Riley Real",
      }),
    ]),
  );

  expect(names(archive, 0, "writer")).toEqual(["Riley Real"]);
  expect(names(archive, 0, "image")).toEqual(["Penn Name"]);
});

test("a byline on one article can be two people", () => {
  const archive = build(
    [post(1, ["Article by: Penn Name", "Image Credits: B"])],
    read([
      row({ postId: 1, byline: "Penn Name", realName: "Riley Real" }),
      row({ postId: 1, byline: "Penn Name", realName: "Sam Second" }),
    ]),
  );

  expect(names(archive)).toEqual(["Riley Real", "Sam Second"]);
});

test("a pen name printed again with no answer is flagged, naming who it was", () => {
  const archive = build(
    [
      post(1, ["Article by: Penn Name", "Image Credits: B"]),
      post(2, ["Article by: Penn Name", "Image Credits: B"]),
      post(3, ["Article by: Penn Name", "Image Credits: B"]),
    ],
    read([
      row({
        postId: 1,
        role: "writer",
        byline: "Penn Name",
        realName: "Riley Real",
      }),
      row({
        postId: 2,
        role: "writer",
        byline: "Penn Name",
        realName: "Riley Real",
      }),
    ]),
  );

  expect(archive.pastUses["penn name"]).toEqual([
    { name: "Riley Real", articles: 2 },
  ]);
  /* the answered ones are fine; the third is the question */
  expect(archive.articles[0]!.problems).toEqual([]);
  expect(archive.articles[2]!.problems).toEqual([
    {
      kind: "pen-name-again",
      detail: "Penn Name was Riley Real on 2 articles",
    },
  ]);
});

test("an old row for every article no longer counts, and is listed to convert", () => {
  const archive = build(
    [
      post(1, ["Article by: Penn Name", "Image Credits: B"]),
      post(2, ["Article by: Somebody Else", "Image Credits: B"]),
    ],
    read([], [], [{ byline: "Penn Name", realName: "Riley Real" }]),
  );

  expect(names(archive)).toEqual(["Penn Name"]);
  expect(archive.unscoped).toEqual([
    { byline: "Penn Name", realNames: ["Riley Real"], articleIds: [1] },
  ]);
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
    {
      kind: "unrecognised",
      detail: "Squirrel Photos by: Cleo Drawer",
      label: "Squirrel Photos by",
    },
  ]);
});

test("a credit line without its colon is fixed in WordPress, not with a label", () => {
  const [article] = build([
    post(1, ["Article by Cleo Drawer", "Image Credits: B"]),
  ]).articles;

  expect(article!.problems).toContainEqual({
    kind: "no-colon",
    detail: "Article by Cleo Drawer",
  });
  expect(article!.problems.some((p) => p.kind === "unrecognised")).toBe(false);
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

  expect(similarNames(build(posts))).toEqual([
    { names: ["Cleo Dombroksy", "Cleo Dombrosky"], counts: [1, 2] },
  ]);
  expect(
    similarNames(
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
      ),
    )[0]!.ignored,
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

test("a series under one pen name counts each part as whoever wrote it", () => {
  const archive = build(
    [post(1, ["Article by: Penn Name"]), post(2, ["Article by: Penn Name"])],
    read([
      row({
        postId: 1,
        role: "writer",
        byline: "Penn Name",
        realName: "Riley Real",
      }),
      row({
        postId: 2,
        role: "writer",
        byline: "Penn Name",
        realName: "Sam Second",
      }),
    ]),
  );

  expect(names(archive, 0)).toEqual(["Riley Real"]);
  expect(names(archive, 1)).toEqual(["Sam Second"]);
  expect(archive.pastUses["penn name"]).toEqual([
    { name: "Riley Real", articles: 1 },
    { name: "Sam Second", articles: 1 },
  ]);
});

test("the archive lists its sections in the paper's order, not alphabetically", () => {
  const archive = buildArchive({
    posts: [post(1, [], [2]), post(2, [], [1]), post(3, [], [3])],
    categories: new Map([
      [1, "Entertainment"],
      [2, "Uncategorized"],
      [3, "Features"],
    ]),
    sheet: read(),
    labels: DEFAULT_LABELS,
    fetchedAt: "now",
  });
  expect(archive.sections).toEqual([
    "Features",
    "Entertainment",
    "Uncategorized",
  ]);
});
