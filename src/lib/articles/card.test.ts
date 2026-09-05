import { expect, test } from "vitest";
import { card } from "./card";
import type { ArticlePage } from "./page";

const page = (): ArticlePage => ({
  id: "3d1be415-e24c-80c8-a14f-cf1fd9b7e48c",
  url: "https://www.notion.so/3d1be415e24c80c8a14fcf1fd9b7e48c",
  properties: {
    Headline: { title: [{ plain_text: "Terps lose again" }] },
    "Article Status": { status: { name: "Written", color: "red" } },
    "Image Status": { status: { name: "In progress", color: "blue" } },
    Section: { select: { name: "News", color: "default" } },
    "Author Byline": { rich_text: [{ plain_text: "Sam R." }] },
    "Image Byline": { rich_text: [] },
    "Publication Date": { date: null },
  },
});

test("the shared Article card has the selected layout, Notion link, colors and property order", () => {
  expect(card(page())).toEqual({
    type: 17,
    accent_color: 0xd44c47,
    components: [
      {
        type: 9,
        components: [{ type: 10, content: "### Terps lose again" }],
        accessory: {
          type: 2,
          style: 5,
          label: "Open in Notion",
          url: page().url,
        },
      },
      {
        type: 10,
        content:
          "**Author Byline**: Sam R.\n**Article Status**: 🔴 Written\n**Section**: News\n**Image Status**: 🔵 In progress\n**Image Byline**: Not set\n**Publication Date**: Not set",
      },
    ],
  });
});

test.each([
  ["default", "⚪", 0x8a929e],
  ["gray", "🔘", 0x9b9a97],
  ["brown", "🟤", 0x9f6b53],
  ["orange", "🟠", 0xd9730d],
  ["yellow", "🟡", 0xcb912f],
  ["green", "🟢", 0x448361],
  ["blue", "🔵", 0x337ea9],
  ["purple", "🟣", 0x9065b0],
  ["pink", "🩷", 0xc14c8a],
  ["red", "🔴", 0xd44c47],
  ["future-color", "⚪", 0x8a929e],
])(
  "Notion color %s controls the accent and marker without recognizing the status name",
  (color, emoji, accent) => {
    const article = page();
    article.properties["Article Status"] = {
      status: { name: "Renamed option", color: String(color) },
    };
    const rendered = card(article);
    expect(rendered.accent_color).toBe(accent);
    expect(JSON.stringify(rendered)).toContain(`${emoji} Renamed option`);
  },
);

test("empty and missing properties remain visible; a missing URL uses the real page id", () => {
  const article = page();
  delete article.url;
  article.properties = {};
  const rendered = JSON.stringify(card(article));
  expect(rendered).toContain("### Untitled");
  expect(rendered).toContain("**Author Byline**: Not set");
  expect(rendered).toContain("**Article Status**: Not set");
  expect(rendered).toContain(
    "https://www.notion.so/3d1be415e24c80c8a14fcf1fd9b7e48c",
  );
});

test("remote text cannot change the card's layout, create links or ping members", () => {
  const article = page();
  article.url = "https://notion.so.attacker.example/";
  article.properties.Headline = {
    title: [
      {
        plain_text: "@everyone <@&123> **bold**\n[click](https://example.com)",
      },
    ],
  };
  article.properties["Author Byline"] = {
    rich_text: [{ plain_text: "x".repeat(5000) }],
  };
  const rendered = JSON.stringify(card(article));
  expect(rendered).not.toContain("@everyone");
  expect(rendered).not.toContain("<@&123>");
  expect(rendered).not.toContain("attacker.example");
  expect(rendered).not.toContain("[click](https://example.com)");
  expect(rendered).toContain("…");
  expect(rendered.length).toBeLessThan(3000);
});
