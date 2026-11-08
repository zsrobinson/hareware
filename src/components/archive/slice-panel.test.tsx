// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { ArchiveArticle } from "~/lib/credits/archive";
import type { Member } from "~/lib/credits/stats";
import { SlicePanel } from "./slice-panel";

afterEach(cleanup);

/* invented names */
const article: ArchiveArticle = {
  id: 1,
  title: "An invented headline",
  link: "",
  publishedAt: "2026-10-08T16:00:00Z",
  section: "News",
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
      measure="contributions"
      members={members}
      roles={[]}
      onClose={() => {}}
      restoreFocus={() => null}
    />,
  );
  expect(screen.getByRole("listitem").textContent).toContain(
    "Ada Example (Writing, Image), Bo Sample (Writing)",
  );
  vi.unstubAllGlobals();
});
