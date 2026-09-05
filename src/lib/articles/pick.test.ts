import { expect, test } from "vitest";
import { choicesFor, MAX_CHOICE_NAME, mine } from "./pick";
import type { ArticleRow } from "~/lib/db/schema";

/** an index row, with only the fields a test cares about spelled out */
const row = (over: Partial<ArticleRow> = {}): ArticleRow => ({
  pageId: "page-1",
  headline: "Terps lose again",
  section: "News",
  status: "Written",
  imageStatus: "Not Started",
  authorByline: "Sam R.",
  publicationDate: null,
  lastEdited: "2026-09-01T10:00:00.000Z",
  syncedAt: 0,
  ...over,
});

test("a choice reads status first, then Section, Headline and Byline", () => {
  expect(choicesFor([row()])[0].name).toBe(
    'Written · News · "Terps lose again" — Sam R.',
  );
});

/*
  headlines change all the way through copy edit, and a value discord sends
  back has to still identify the same article an hour later
*/
test("the value is the notion page id, never the headline", () => {
  expect(choicesFor([row({ pageId: "abc-123" })])[0].value).toBe("abc-123");
});

test("drops the parts an article does not have yet", () => {
  const only = row({ section: null, status: null, authorByline: null });

  expect(choicesFor([only])[0].name).toBe('"Terps lose again"');
});

/*
  ADR 0009: a published article still appears — looking one up is a real use —
  but the work in front of an editor is the work that is not finished
*/
test("ranks unpublished articles ahead of published ones", () => {
  const choices = choicesFor([
    row({ pageId: "done", status: "Published", lastEdited: "2026-09-09" }),
    row({ pageId: "live", status: "Written", lastEdited: "2026-09-02" }),
  ]);

  expect(choices.map((choice) => choice.value)).toEqual(["live", "done"]);
});

test("orders by most recently edited within each group", () => {
  const choices = choicesFor([
    row({ pageId: "old", lastEdited: "2026-09-01T00:00:00.000Z" }),
    row({ pageId: "new", lastEdited: "2026-09-08T00:00:00.000Z" }),
  ]);

  expect(choices.map((choice) => choice.value)).toEqual(["new", "old"]);
});

test("offers at most the 25 choices discord accepts", () => {
  const many = Array.from({ length: 40 }, (_, index) =>
    row({ pageId: `page-${index}` }),
  );

  expect(choicesFor(many)).toHaveLength(25);
});

/*
  discord rejects the entire response when any one name is over 100 characters
  or empty, so the whole dropdown disappears rather than the offending row
*/
test("keeps every name inside discord's 100 character limit", () => {
  const long = row({ headline: "T".repeat(300), authorByline: "S".repeat(80) });

  expect(choicesFor([long])[0].name.length).toBeLessThanOrEqual(
    MAX_CHOICE_NAME,
  );
});

test("truncates the headline rather than the status prefix", () => {
  const name = choicesFor([row({ headline: "T".repeat(300) })])[0].name;

  expect(name.startsWith("Written · News · ")).toBe(true);
  expect(name).toContain("…");
});

/* the index substitutes "Untitled", but an empty name takes the whole response
   down with it, so nothing here relies on that alone */
test("never emits an empty name, even for a row with nothing on it", () => {
  const bare = row({
    headline: "",
    section: null,
    status: null,
    authorByline: null,
  });

  expect(choicesFor([bare])[0].name.length).toBeGreaterThan(0);
});

test("still names a row whose prefix alone fills the limit", () => {
  const huge = row({
    status: "S".repeat(90),
    section: "E".repeat(90),
    headline: "Terps lose again",
  });
  const name = choicesFor([huge])[0].name;

  expect(name.length).toBeGreaterThan(0);
  expect(name.length).toBeLessThanOrEqual(MAX_CHOICE_NAME);
});

test("an empty index offers nothing rather than failing", () => {
  expect(choicesFor([])).toEqual([]);
});

/* ---- whose articles ------------------------------------------------------ */

test("mine keeps the rows bylined to the person asking", () => {
  const rows = [
    row({ pageId: "theirs", authorByline: "Ada L." }),
    row({ pageId: "ours", authorByline: "Sam R." }),
  ];

  expect(mine(rows, "Sam R.").map((r) => r.pageId)).toEqual(["ours"]);
});

test("mine matches a byline loosely, since it is typed by hand", () => {
  const rows = [row({ pageId: "ours", authorByline: "  sam r.  " })];

  expect(mine(rows, "Sam R.")).toHaveLength(1);
});

/*
  a byline is the printed name and need not be the writer's, so a miss means
  "we cannot tell", not "this editor has no articles" — falling back to
  everything keeps an empty dropdown from being the answer
*/
test("mine falls back to every row when nothing is bylined to them", () => {
  const rows = [row({ pageId: "a" }), row({ pageId: "b" })];

  expect(mine(rows, "Nobody At All")).toHaveLength(2);
});

test("mine falls back to every row when we do not know who is asking", () => {
  const rows = [row({ pageId: "a" })];

  expect(mine(rows, undefined)).toHaveLength(1);
});
