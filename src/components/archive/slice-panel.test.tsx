// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { ArchiveArticle } from "~/lib/credits/archive";
import { NO_FILTERS, type Member } from "~/lib/credits/stats";
import { SlicePanel } from "./slice-panel";

afterEach(cleanup);

/* invented names */
const article: ArchiveArticle = {
  id: 1,
  title: "An invented headline",
  link: "",
  publishedAt: "2026-10-08T16:00:00Z",
  section: "News",
  words: 0,
  views: { status: "unavailable" },
  credits: [],
  problems: [],
};

test("a list of contributions names a person once, with every role", () => {
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  const members: Member[] = [
    { id: 0, units: [{ article, role: "image", person: "Ada Example" }] },
    { id: 1, units: [{ article, role: "writer", person: "Bo Sample" }] },
    { id: 2, units: [{ article, role: "writer", person: "Ada Example" }] },
  ];
  render(
    <SlicePanel
      title="News"
      caption="3 contributions on 1 article"
      back="Contributors"
      measure="contributions"
      members={members}
      filters={NO_FILTERS}
      onClose={() => {}}
      restoreFocus={() => null}
    />,
  );
  expect(screen.getByRole("listitem").textContent).toContain(
    "Ada Example (Writing, Image), Bo Sample (Writing)",
  );
  vi.unstubAllGlobals();
});

test("a list of articles names only who the filters count on each", () => {
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  const written: ArchiveArticle = {
    ...article,
    credits: [
      {
        role: "writer",
        label: "Article by",
        printed: "Ada Example and Bo Sample",
        bylines: ["Ada Example", "Bo Sample"],
        contributors: ["Ada Example", "Bo Sample"].map((name) => ({
          name,
          byline: null,
          source: "printed" as const,
        })),
      },
    ],
  };
  render(
    <SlicePanel
      title="News"
      caption="1 article"
      back="Sections"
      measure="articles"
      members={[{ id: 1, units: [{ article: written }] }]}
      filters={{ ...NO_FILTERS, people: ["Bo Sample"] }}
      onClose={() => {}}
      restoreFocus={() => null}
    />,
  );
  const names = screen
    .getAllByRole("link")
    .map((link) => link.textContent)
    .slice(1);
  expect(names).toEqual(["Bo Sample"]);
  vi.unstubAllGlobals();
});
