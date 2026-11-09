// @vitest-environment jsdom
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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

const minutesAgo = (minutes: number) =>
  new Date(Date.now() - minutes * 60_000).toISOString();

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
  /* newer than the count of views, so not in it, and not a zero */
  {
    id: 3,
    title: "A third invented headline",
    publishedAt: minutesAgo(1),
    paragraphs: ["Article by: Ada Example"],
    words: 250,
  },
];

const VIEWS = { 1: 120, 2: 30 };

/* the views read follows WordPress's, which a loaded machine makes slow */
const WAIT = { timeout: 4000 };

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
    (
      await screen.findByText(
        /Views couldn't be read, so no view counts/,
        undefined,
        WAIT,
      )
    ).textContent,
  ).toContain("WordPress stats aren't set up");
  await waitFor(
    () => expect(status()).toMatch(/^Updated .* · Views unavailable$/),
    WAIT,
  );
});

test("views read are dated beside the articles, with no notice", async () => {
  stubArchive({ posts, views: VIEWS });
  window.history.replaceState(null, "", "/articles");
  render(<ArticlesPage />);

  await waitFor(() => expect(status()).toMatch(/ · Views just now$/), WAIT);
  expect(screen.queryByText(/Views couldn't be read/)).toBeNull();
});

test("Most read lists this semester's articles by views, an unread one last", async () => {
  stubArchive({ posts, views: VIEWS });
  window.history.replaceState(null, "", "/articles?view=most-read");
  render(<ArticlesPage />);

  await screen.findByText("A third invented headline", undefined, WAIT);
  const rows = screen
    .getAllByRole("row")
    .slice(1)
    .map((row) =>
      within(row)
        .getAllByRole("cell")
        .map((cell) => cell.textContent),
    );
  expect(
    screen.getAllByRole("columnheader").map((cell) => cell.textContent),
  ).toEqual(["Published", "Title", "Section", "Writing", "Words", "Views"]);
  /* words less each article's four-word credit line */
  expect(rows.map((row) => [row[4], row[5]])).toEqual([
    ["396", "120"],
    ["896", "30"],
    ["246", "–Views unavailable"],
  ]);
  expect(rows.map((row) => row[1]!.split("No image")[0])).toEqual([
    "An invented headline",
    "Another invented headline",
    "A third invented headline",
  ]);
});

test("Read by section is each section's views, and what they are per article", async () => {
  stubArchive({
    posts: posts.map((post) => ({ ...post, categoryIds: [1] })),
    categories: [[1, "News"]],
    views: VIEWS,
  });
  window.history.replaceState(null, "", "/articles?view=read-by-section");
  render(<ArticlesPage />);

  const news = await screen.findByRole("rowheader", { name: /News/ }, WAIT);
  expect(
    screen.getAllByRole("columnheader").map((cell) => cell.textContent),
  ).toEqual(["Section", "Views", "Per article"]);
  /* 150 views over the two articles counted; the third has none read */
  expect(
    within(news.closest("tr")!)
      .getAllByRole("cell")
      .map((cell) => cell.textContent),
  ).toEqual(["150", "75"]);
  expect(document.querySelector("figcaption")!.textContent).toContain(
    "150 views · 1 article without views",
  );
});
