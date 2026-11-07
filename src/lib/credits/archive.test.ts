import { expect, test } from "vitest";
import { buildArchive, type SourcePost } from "./archive";
import { DEFAULT_LABELS } from "./labels";
import type { Override, SheetState } from "./sheet";

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

const read = (overrides: Omit<Override, "row">[] = []): SheetState => ({
  status: "read",
  overrides: overrides.map((override, index) => ({
    ...override,
    row: index + 2,
  })),
  ignored: [],
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

const credited = (paragraphs: string[]) => post(1, paragraphs);

test("credits a post as printed when the Sheet has nothing for it", () => {
  const [article] = build([
    credited(["Article by: Penn Name", "Image Credits: Ida Imager"]),
  ]).articles;

  expect(article!.section).toBe("News");
  expect(article!.credits.map((credit) => credit.names)).toEqual([
    ["Penn Name"],
    ["Ida Imager"],
  ]);
  expect(article!.problems).toEqual([]);
});

test("the Sheet's rows replace a role's names, and keep the printed byline", () => {
  const [article] = build(
    [
      credited([
        "Article by: Penn Name and Sam Second",
        "Image Credits: Ida Imager",
      ]),
    ],
    read([
      { postId: 1, role: "writer", realName: "Riley Real" },
      { postId: 1, role: "writer", realName: "Sam Second" },
    ]),
  ).articles;

  const writer = article!.credits.find((credit) => credit.role === "writer")!;
  expect(writer.names).toEqual(["Riley Real", "Sam Second"]);
  expect(writer.printed).toBe("Penn Name and Sam Second");
  expect(writer.overridden).toBe(true);
  /* the image credit had no rows, so it is untouched */
  expect(
    article!.credits.find((credit) => credit.role === "image")!.overridden,
  ).toBe(false);
});

test("a role the post never printed can still be credited from the Sheet", () => {
  const [article] = build(
    [credited(["Article by: Somebody"])],
    read([{ postId: 1, role: "image", realName: "Cleo Drawer" }]),
  ).articles;

  expect(
    article!.credits.find((credit) => credit.role === "image")?.names,
  ).toEqual(["Cleo Drawer"]);
  expect(article!.problems.map((problem) => problem.kind)).not.toContain(
    "no-image",
  );
});

test("a Sheet row for a post that does not exist is reported, not dropped", () => {
  const archive = build(
    [credited(["Article by: A", "Image Credits: B"])],
    read([{ postId: 99, role: "writer", realName: "X" }]),
  );

  expect(archive.sheetProblems).toEqual([
    { tab: "Overrides", row: 2, message: "no published post has id 99" },
  ]);
});

test("flags a post with no credits and no section", () => {
  const [article] = build([post(1, ["Just a body paragraph."], [1])]).articles;

  expect(article!.problems.map((problem) => problem.kind).sort()).toEqual([
    "no-image",
    "no-writer",
    "uncategorized",
  ]);
});

test("flags a credit line that named nobody", () => {
  const [article] = build([
    credited(["Article by: the whole staff", "Image Credits: B"]),
  ]).articles;

  expect(article!.problems).toEqual([
    { kind: "unparsed", detail: "Article by: the whole staff" },
  ]);
});

test("a Sheet that could not be read leaves every post as printed, and says so", () => {
  const archive = build(
    [credited(["Article by: Penn Name", "Image Credits: B"])],
    {
      status: "failed",
      reason: "google sheets answered 403",
    },
  );

  expect(archive.sheet).toEqual({
    status: "failed",
    reason: "google sheets answered 403",
  });
  expect(archive.articles[0]!.credits[0]!.names).toEqual(["Penn Name"]);
});

test("a post marked fine in the Sheet keeps its problems but carries the note", () => {
  const [article] = build([post(1, ["Just a body."])], {
    ...read(),
    ignored: [{ postId: 1, note: "intentional", row: 2 }],
  } as SheetState).articles;

  expect(article!.ignored).toBe("intentional");
  expect(article!.problems.length).toBeGreaterThan(0);
});
