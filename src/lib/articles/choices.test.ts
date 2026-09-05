import { afterEach, expect, test, vi } from "vitest";
import {
  assertProperties,
  extractChoices,
  optionNamed,
  type Schema,
} from "./choices";
import { ARTICLE_PROPERTIES } from "./config";

const options = (...names: string[]) => names.map((name) => ({ name }));

/** the Articles schema as notion returns it when everything is shared */
const schema = (over: Schema["properties"] = {}): Schema => ({
  properties: {
    Headline: { type: "title" },
    "Article Status": {
      type: "status",
      status: { options: options("Backlog", "Approved", "Published") },
    },
    "Image Status": {
      type: "status",
      status: { options: options("Not Started", "Done") },
    },
    Section: {
      type: "select",
      select: { options: options("News", "Rabbithole") },
    },
    "Author Byline": { type: "rich_text" },
    "Image Byline": { type: "rich_text" },
    "Publication Date": { type: "date" },
    Author: { type: "relation" },
    "Image Crew": { type: "relation" },
    ...over,
  },
});

afterEach(() => vi.unstubAllGlobals());

/* ---- the schema check --------------------------------------------------- */

test("a schema with everything shared is missing nothing", () => {
  expect(assertProperties(schema())).toEqual([]);
});

test("a relation notion omitted is reported, because its value reads as []", () => {
  /* the whole point: when Members is not shared with the integration, notion
     drops `Author` from the schema and the page's value comes back `[]` —
     identical to an article with no author. an append built on that read would
     delete co-authors nobody could see */
  const withoutAuthor = schema();
  delete withoutAuthor.properties["Author"];

  expect(assertProperties(withoutAuthor)).toEqual([
    { name: "Author", expected: "relation", found: null },
  ]);
});

test("a property that changed type is reported as well as one that vanished", () => {
  const changed = assertProperties(
    schema({ "Article Status": { type: "select", select: { options: [] } } }),
  );

  expect(changed).toEqual([
    { name: "Article Status", expected: "status", found: "select" },
  ]);
});

/* ---- the options -------------------------------------------------------- */

test("the options come out in notion's own order, per property", () => {
  expect(extractChoices(schema())).toEqual([
    { property: "Article Status", name: "Backlog", position: 0 },
    { property: "Article Status", name: "Approved", position: 1 },
    { property: "Article Status", name: "Published", position: 2 },
    { property: "Image Status", name: "Not Started", position: 0 },
    { property: "Image Status", name: "Done", position: 1 },
    { property: "Section", name: "News", position: 0 },
    { property: "Section", name: "Rabbithole", position: 1 },
  ]);
});

test("a status and a select hold their options in different places", () => {
  const names = extractChoices(schema()).map((choice) => choice.name);

  // `Article Status` is a status and `Section` a select; both were read
  expect(names).toContain("Published");
  expect(names).toContain("Rabbithole");
});

test("option names keep notion's casing, traps included", () => {
  const choices = extractChoices(
    schema({
      "Article Status": {
        type: "status",
        status: { options: options("Not started") },
      },
    }),
  );

  expect(choices[0]!.name).toBe("Not started");
});

test("every property the commands touch is checked, not only the pickers", () => {
  // the pickers are three properties; the data-loss guard is about all nine
  const empty = { properties: {} };
  expect(
    assertProperties(empty)
      .map((miss) => miss.name)
      .sort(),
  ).toEqual(
    Object.values(ARTICLE_PROPERTIES)
      .map((property) => property.name)
      .sort(),
  );
});

/* ---- finding one option by name ----------------------------------------- */

test("an option is found in the schema whatever case it was asked for", () => {
  /* what reaches notion is notion's own spelling. asking for "approved" and
     writing "Approved" is what keeps ADR 0009's rule — no notion value typed
     into this repo — while still letting `/article new` start an Article
     somewhere sensible */
  expect(optionNamed(schema(), "Article Status", "approved")).toBe("Approved");
  expect(optionNamed(schema(), "Section", "rabbithole")).toBe("Rabbithole");
});
