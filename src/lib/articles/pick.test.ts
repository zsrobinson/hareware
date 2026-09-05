import { expect, test } from "vitest";
import { suggestions, MAX_CHOICE_NAME, quality } from "./pick";
import type { Article } from "./page";

const row = (over: Partial<Article> = {}): Article => ({
  pageId: "page-1",
  headline: "Terps lose again, somehow",
  section: "News",
  status: "Written",
  imageStatus: "Not started",
  authorByline: "Sam Rivera",
  publicationDate: null,
  lastEdited: "2026-09-01T12:00:00.000Z",
  ...over,
});

/* ---- what an editor sees ------------------------------------------------ */

test("shows the headline and nothing else", () => {
  /*
    the status, section and byline used to be crammed in front of it. an editor
    picking an article already knows which one they mean, and the card they get
    back answers everything else
  */
  const [choice] = suggestions([row()]);

  expect(choice!.name).toBe("Terps lose again, somehow");
});

test("the value is the page id, never the headline", () => {
  /* a headline changes throughout copy edit, so the label somebody scanned and
     the article they picked cannot be identified by the same string */
  const [choice] = suggestions([row({ pageId: "3d1be415" })]);

  expect(choice!.value).toBe("3d1be415");
});

test("an untitled row still gets a name", () => {
  /* discord rejects the entire response — every choice, not just this one —
     when a name is empty, which reaches the editor as a blank dropdown */
  const [choice] = suggestions([row({ headline: "   " })]);

  expect(choice!.name).toBe("Untitled");
});

test("a very long headline is cut rather than taking the dropdown down", () => {
  const [choice] = suggestions([row({ headline: "x".repeat(300) })]);

  expect(choice!.name.length).toBeLessThanOrEqual(MAX_CHOICE_NAME);
  expect(choice!.name.endsWith("…")).toBe(true);
});

test("never offers a 26th choice", () => {
  const many = Array.from({ length: 40 }, (_, i) =>
    row({ pageId: `page-${i}`, headline: `Article ${i}` }),
  );

  expect(suggestions(many)).toHaveLength(25);
});

/* ---- matching ----------------------------------------------------------- */

test("finds a headline by a word inside it", () => {
  expect(quality("Local perv excited to leer", "leer")).toBeGreaterThan(0);
});

test("ignores case, accents and punctuation", () => {
  /* headlines carry curly quotes and em dashes nobody types into a picker */
  expect(quality("“Terps’ loss — again”", "terps loss")).toBeGreaterThan(0);
  expect(quality("Café society", "cafe")).toBeGreaterThan(0);
});

test("forgives a dropped letter", () => {
  // the whole of the fuzziness: a subsequence, in order
  expect(quality("Ellicott Hall Stolen", "elicott")).toBeGreaterThan(0);
});

test("refuses letters that are not there in order", () => {
  expect(quality("Terps lose again", "zebra")).toBe(0);
  expect(quality("Terps lose again", "again terps")).toBe(0);
});

test("an empty query matches everything", () => {
  /* a picker that has only just opened is not a search, and answering it with
     nothing is how this looked broken for an evening */
  expect(quality("anything at all", "")).toBeGreaterThan(0);
  expect(suggestions([row(), row({ pageId: "b" })], "")).toHaveLength(2);
});

test("ranks a better match above a worse one", () => {
  const start = quality("Looney's patrons banned", "looney");
  const word = quality("McDonalds to ban Looney's patrons", "looney");
  const loose = quality("Long or nearly every word", "looney");

  expect(start).toBeGreaterThan(word);
  expect(word).toBeGreaterThan(loose);
});

/* ---- ranking ------------------------------------------------------------ */

test("among comparable matches, the most recently edited comes first", () => {
  /*
    the ranking the club actually needs: a command is nearly always run against
    something touched this week, so recency decides between equals
  */
  const rows = [
    row({
      pageId: "old",
      headline: "Terps one",
      lastEdited: "2025-01-01T00:00:00.000Z",
    }),
    row({
      pageId: "new",
      headline: "Terps two",
      lastEdited: "2026-09-04T00:00:00.000Z",
    }),
  ];

  expect(suggestions(rows, "terps").map((c) => c.value)).toEqual([
    "new",
    "old",
  ]);
});

test("an empty query is the recently-edited list, in order", () => {
  const rows = [
    row({ pageId: "a", lastEdited: "2025-05-05T00:00:00.000Z" }),
    row({ pageId: "c", lastEdited: "2026-09-04T00:00:00.000Z" }),
    row({ pageId: "b", lastEdited: "2026-01-01T00:00:00.000Z" }),
  ];

  expect(suggestions(rows, "").map((c) => c.value)).toEqual(["c", "b", "a"]);
});

test("a stronger match still beats a more recent weak one", () => {
  const rows = [
    row({
      pageId: "recent-weak",
      headline: "Lots of odd, nearly empty yelling",
      lastEdited: "2026-09-04T00:00:00.000Z",
    }),
    row({
      pageId: "old-strong",
      headline: "Looney's patrons banned",
      lastEdited: "2025-01-01T00:00:00.000Z",
    }),
  ];

  expect(suggestions(rows, "looney")[0]!.value).toBe("old-strong");
});

test("drops rows that do not match at all", () => {
  const rows = [
    row({ pageId: "hit" }),
    row({ pageId: "miss", headline: "Zzz" }),
  ];

  expect(suggestions(rows, "terps").map((c) => c.value)).toEqual(["hit"]);
});
