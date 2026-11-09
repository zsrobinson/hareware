// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ArticlesPage } from "./articles";
import { stubArchive } from "./stub-archive";

/*
  Views are read apart from WordPress and fail apart from it, so the page
  says how old they are beside the articles' age, and when none could be
  read it says so once, rather than showing a count of nobody.
*/

const daysAgo = (days: number) =>
  new Date(Date.now() - days * 86_400_000).toISOString();

const posts = [
  {
    id: 1,
    title: "An invented headline",
    publishedAt: daysAgo(3),
    paragraphs: ["Article by: Ada Example"],
    words: 400,
  },
  {
    id: 2,
    title: "Another invented headline",
    publishedAt: daysAgo(6),
    paragraphs: ["Article by: Ben Sample"],
    words: 900,
  },
];

/* the layout's title row, where a laptop shows how old the reads are */
const status = () =>
  document.getElementById("page-actions")?.querySelector('[role="status"]')
    ?.textContent ?? "";

beforeEach(() => {
  const actions = document.createElement("div");
  actions.id = "page-actions";
  document.body.appendChild(actions);
});

afterEach(() => {
  cleanup();
  document.getElementById("page-actions")?.remove();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

test("views that could not be read are said to be unavailable, beside the articles' age", async () => {
  stubArchive({ posts });
  window.history.replaceState(null, "", "/articles");
  render(<ArticlesPage />);

  expect(
    (await screen.findByText(/Views couldn't be read, so no view counts/))
      .textContent,
  ).toContain("WordPress stats aren't set up");
  await waitFor(() =>
    expect(status()).toMatch(/^Updated .* · Views unavailable$/),
  );
});

test("views read are dated beside the articles, with no notice", async () => {
  stubArchive({ posts, views: { 1: 120, 2: 30 } });
  window.history.replaceState(null, "", "/articles");
  render(<ArticlesPage />);

  await waitFor(() => expect(status()).toMatch(/ · Views just now$/));
  expect(screen.queryByText(/Views couldn't be read/)).toBeNull();
});
