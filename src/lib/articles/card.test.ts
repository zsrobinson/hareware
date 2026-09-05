import { expect, test } from "vitest";
import { card, type CardPage } from "./card";

/** a page as notion returns it, with every property an Article can carry */
const page = (
  properties: Record<string, unknown> = {},
  url = "https://notion.so/page-1",
): CardPage => ({
  id: "page-1",
  url,
  properties: {
    Headline: { type: "title", title: [{ plain_text: "Terps lose again" }] },
    "Article Status": { type: "status", status: { name: "Written" } },
    "Image Status": { type: "status", status: { name: "Unclaimed" } },
    Section: { type: "select", select: { name: "News" } },
    "Author Byline": {
      type: "rich_text",
      rich_text: [{ plain_text: "Sam R." }],
    },
    "Image Byline": {
      type: "rich_text",
      rich_text: [{ plain_text: "Ada L." }],
    },
    "Publication Date": { type: "date", date: { start: "2026-09-10" } },
    ...properties,
  },
});

test("leads with the Headline", () => {
  expect(card(page()).split("\n")[0]).toContain("Terps lose again");
});

test("shows every property the Article carries", () => {
  const text = card(page());

  expect(text).toContain("Article Status");
  expect(text).toContain("Written");
  expect(text).toContain("Image Status");
  expect(text).toContain("Unclaimed");
  expect(text).toContain("Section");
  expect(text).toContain("News");
  expect(text).toContain("Author Byline");
  expect(text).toContain("Sam R.");
  expect(text).toContain("Image Byline");
  expect(text).toContain("Ada L.");
  expect(text).toContain("Publication Date");
  expect(text).toContain("2026-09-10");
});

test("links to the page in notion", () => {
  expect(card(page())).toContain("https://notion.so/page-1");
});

/*
  notion sends `null` for an empty property, not an absent key, and "absence
  encoded as a falsy value" is how a card ends up reading "Section: undefined"
*/
test("a property notion sent as null loses its line", () => {
  const text = card(page({ Section: { type: "select", select: null } }));

  expect(text).not.toContain("Section");
  expect(text).not.toContain("undefined");
});

test("a property missing from the page altogether loses its line", () => {
  const bare = page();
  delete bare.properties["Publication Date"];

  expect(card(bare)).not.toContain("Publication Date");
});

test("an empty rich text property loses its line rather than showing blank", () => {
  const text = card(
    page({ "Author Byline": { type: "rich_text", rich_text: [] } }),
  );

  expect(text).not.toContain("Author Byline");
});

test("whitespace-only text counts as empty", () => {
  const text = card(
    page({
      "Image Byline": { type: "rich_text", rich_text: [{ plain_text: "   " }] },
    }),
  );

  expect(text).not.toContain("Image Byline");
});

/* a row often exists with nothing but a headline while somebody is typing it */
test("renders an article with only a Headline", () => {
  const text = card({
    id: "page-1",
    url: "https://notion.so/page-1",
    properties: {
      Headline: { type: "title", title: [{ plain_text: "Terps lose again" }] },
    },
  });

  expect(text).toContain("Terps lose again");
  expect(text).not.toContain("undefined");
  expect(text).not.toContain("null");
});

test("names an article whose Headline is still empty", () => {
  const text = card(page({ Headline: { type: "title", title: [] } }));

  expect(text).toContain("Untitled");
});

test("says so rather than linking nowhere when notion sent no url", () => {
  const text = card({ id: "page-1", properties: page().properties });

  expect(text).not.toContain("](");
  expect(text).toContain("Terps lose again");
});
