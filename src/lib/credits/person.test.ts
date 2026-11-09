import { expect, test } from "vitest";
import type { ArchiveArticle, Credit } from "./archive";
import { peopleOf } from "./person";
import { NO_FILTERS, people, periodsOf } from "./stats";

/** a credit line; `bylines` are what it prints when the Sheet changes a name */
const credit = (
  role: Credit["role"],
  names: string[],
  bylines: (string | null)[] = names.map(() => null),
): Credit => ({
  role,
  label: role,
  printed: names.map((name, i) => bylines[i] ?? name).join(" and "),
  bylines: names.map((name, i) => bylines[i] ?? name),
  contributors: names.map((name, i) => ({
    name,
    byline: bylines[i] ?? null,
    source: bylines[i] ? "article" : "printed",
  })),
});

const article = (
  id: number,
  publishedAt: string,
  section: string,
  credits: Credit[],
): ArchiveArticle => ({
  id,
  title: `Post ${id}`,
  link: "",
  publishedAt,
  section,
  credits,
  problems: [],
});

/* listed newest first, as WordPress lists them */
const archive = [
  article(3, "2026-09-10T15:00:00Z", "Sports", [
    credit("writer", ["Riley Real"], ["Penn Name"]),
    credit("image", ["Ann"]),
  ]),
  article(2, "2026-03-10T15:00:00Z", "News", [
    credit("writer", ["Ann", "Cy"]),
    credit("image", ["Ann", "Ann"]),
  ]),
  article(1, "2026-01-10T15:00:00Z", "News", [credit("image", ["Ann"])]),
];

test("a person's record holds every contribution of theirs, oldest first", () => {
  const ann = peopleOf(archive).get("Ann")!;
  /* credited twice for one image is one contribution */
  expect(ann.contributions.map((c) => [c.article.id, c.role])).toEqual([
    [1, "image"],
    [2, "writer"],
    [2, "image"],
    [3, "image"],
  ]);
  expect(ann.roles).toEqual({ writer: 1, image: 3, other: 0 });
  expect(ann.sections).toEqual({ News: 3, Sports: 1 });
});

test("first and latest are in any role", () => {
  const ann = peopleOf(archive).get("Ann")!;
  /* she drew before she wrote: her first contribution is the image */
  expect([ann.first.article.id, ann.first.role]).toEqual([1, "image"]);
  expect(ann.latest.article.id).toBe(3);
});

test("a pen name is the person the Sheet says, credited as the byline", () => {
  const people = peopleOf(archive);
  expect(people.has("Penn Name")).toBe(false);
  expect(people.get("Riley Real")!.penNames).toEqual([
    { byline: "Penn Name", contributions: 1 },
  ]);
  expect(people.get("Ann")!.penNames).toEqual([]);
});

test("everyone is listed in the order they first contributed, and built once", () => {
  const people = peopleOf(archive);
  expect([...people.keys()]).toEqual(["Ann", "Cy", "Riley Real"]);
  expect(peopleOf(archive)).toBe(people);
});

test("a person's contributions add up per period", () => {
  const ann = peopleOf(archive).get("Ann")!;
  expect(periodsOf(ann, "semester")).toEqual(
    new Map([
      ["2026-1", 3],
      ["2026-2", 1],
    ]),
  );
});

test("a line printing two pen names for one person keeps both, in one contribution", () => {
  const twice = [
    article(4, "2026-10-01T15:00:00Z", "News", [
      credit(
        "writer",
        ["Riley Real", "Riley Real"],
        ["First Mask", "Second Mask"],
      ),
    ]),
  ];
  const riley = peopleOf(twice).get("Riley Real")!;
  expect(riley.contributions).toHaveLength(1);
  expect(riley.contributions[0]!.bylines).toEqual([
    "First Mask",
    "Second Mask",
  ]);
  expect(riley.penNames).toEqual([
    { byline: "First Mask", contributions: 1 },
    { byline: "Second Mask", contributions: 1 },
  ]);
  /* People finds them by either */
  expect(people(twice, NO_FILTERS)[0]).toMatchObject({
    contributions: 1,
    bylines: ["First Mask", "Second Mask"],
  });
});
