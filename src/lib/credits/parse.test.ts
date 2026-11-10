import { expect, test } from "vitest";
import { DEFAULT_LABELS } from "./labels";
import {
  creditLines,
  labelOf,
  names,
  paragraphs,
  unrecognisedLines,
} from "./parse";

const lines = (html: string) => creditLines(paragraphs(html), DEFAULT_LABELS);

test("reads the writer under the header and the italic image credit at the end", () => {
  const found = lines(`
    <p>Article by: Matthew Gray</p>
    <p>The body, which mentions nobody by: anything.</p>
    <p><em>Image Credits: Kenlynn Ingham</em></p>`);

  expect(found.map(({ role, names }) => ({ role, names }))).toEqual([
    { role: "writer", names: ["Matthew Gray"] },
    { role: "image", names: ["Kenlynn Ingham"] },
  ]);
});

test("does not read Image Credits as the shorter Credits label", () => {
  expect(lines("<p>Image Credits: Eric Zhu</p>")[0]?.label).toBe(
    "Image Credits",
  );
  expect(lines("<p>Credits: Eric Zhu</p>")[0]?.label).toBe("Credits");
});

test("decodes entities and ignores case, tags and non-breaking spaces", () => {
  const [line] = lines(
    "<p><strong>ARTICLE&nbsp;BY:</strong> Ian&#8217;s Ghost</p>",
  );
  expect(line?.names).toEqual(["Ian’s Ghost"]);
});

test("a body paragraph that happens to start with a label is too long to be a credit", () => {
  expect(lines(`<p>By: ${"word ".repeat(80)}</p>`)).toEqual([]);
});

test("only the labels given count", () => {
  expect(creditLines(["Photo by: Somebody"], DEFAULT_LABELS)).toEqual([]);
  expect(
    creditLines(
      ["Photo by: Somebody"],
      [{ label: "Photo by", role: "image" }],
    )[0]?.names,
  ).toEqual(["Somebody"]);
});

test.each([
  ["Joseph Kleinman and Andrew Simone", ["Joseph Kleinman", "Andrew Simone"]],
  [
    "Joseph Kleinman, Ian Jackson, and Ryan Nguyen",
    ["Joseph Kleinman", "Ian Jackson", "Ryan Nguyen"],
  ],
  ["Kenlynn Ingham & Megan Lu", ["Kenlynn Ingham", "Megan Lu"]],
  ["Testudo, as told to Seth Buus", ["Seth Buus"]],
  ["James “Jimmy” T. Dour-Handel, as told to Seth Buus", ["Seth Buus"]],
  ["Godzilla (Translated by Joseph Kleinman)", ["Joseph Kleinman"]],
  ["Clare Dombrosky (of course)", ["Clare Dombrosky"]],
  [
    "Eric Stearns (thumbnail image) and Kenlynn Ingham (internal image)",
    ["Eric Stearns", "Kenlynn Ingham"],
  ],
  [
    "Will Pipkin, cover image; Kayla Wetzel, in memoriam for Superman: Ride of Steel",
    ["Will Pipkin", "Kayla Wetzel"],
  ],
  ["7 Orange Crushes", ["7 Orange Crushes"]],
  ["Alexander Andrews", ["Alexander Andrews"]],
])("%s", (printed, expected) => {
  expect(names(printed).names).toEqual(expected);
});

test("keeps what it set aside, so a page can show it", () => {
  expect(names("Testudo, as told to Seth Buus").asides).toEqual([
    "Testudo, as told to",
  ]);
});

test("finds lines shaped like credits that no label matched", () => {
  expect(
    unrecognisedLines(
      [
        "Article by: Somebody",
        "Article by Amelia Nur",
        "Squirrel Photos and Videos by: Mohit Bogineni",
        "Article Image by Kenlynn Ingham Cocktail Illustrations by Will Pipkin",
        "For those overtaken by Spiritus Christmassium before the dawn",
        "Written by hand, and badly.",
      ],
      DEFAULT_LABELS,
    ),
  ).toEqual([
    "Article by Amelia Nur",
    "Squirrel Photos and Videos by: Mohit Bogineni",
    "Article Image by Kenlynn Ingham Cocktail Illustrations by Will Pipkin",
  ]);
});

test("labelOf offers the words before the name as the label", () => {
  expect(labelOf("Squirrel Photos and Videos by: Ida Imager")).toBe(
    "Squirrel Photos and Videos by",
  );
  expect(labelOf("Article Image by Cleo Drawer")).toBe("Article Image by");
  expect(labelOf("Puzzle credits: Sam Second")).toBe("Puzzle credits");
  expect(labelOf("The quad was paved by students.")).toBeUndefined();
});
