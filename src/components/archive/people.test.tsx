// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { queryClient } from "~/lib/query-client";
import { PeoplePage } from "./people";
import { stubArchive } from "./stub-archive";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  /* each test reads its own archive, which the window would otherwise keep */
  queryClient.clear();
  window.history.replaceState(null, "", "/");
});

test("a person's panel says what the filters leave of their record, and holds the whole of it", async () => {
  stubArchive({
    posts: [
      {
        id: 1,
        title: "An invented headline",
        publishedAt: "2025-10-01T16:00:00Z",
        paragraphs: ["Article by: Mask One"],
      },
      {
        id: 2,
        title: "Another invented headline",
        publishedAt: "2026-03-01T16:00:00Z",
        paragraphs: ["Article by: Riley Example"],
      },
      {
        id: 3,
        title: "A third invented headline",
        publishedAt: "2026-10-01T16:00:00Z",
        paragraphs: ["Article by: Riley Example"],
      },
    ],
    overrides: [
      {
        postId: 1,
        role: "writer",
        byline: "Mask One",
        realName: "Riley Example",
        note: "",
      },
    ],
  });
  window.history.replaceState(
    null,
    "",
    "/people?range=custom&from=2026-06-01&to=2026-12-31&open=Riley+Example",
  );
  render(<PeoplePage />);
  const panel = await screen.findByRole("complementary", {
    name: "Riley Example",
  });
  const text = panel.textContent;
  /* a range that is one semester is named as one */
  expect(text).toContain("1 contribution in Fall 2026");
  expect(text).toContain("3 contributions in all");
  expect(text).toContain("Fall 2025 1 · Spring 2026 1 · Fall 2026 1");
  /* a pen name from outside the range is still theirs */
  const credited = within(panel).getByRole("heading", { name: "Credited as" });
  expect(credited.parentElement!.textContent).toContain("Mask One · 1");
});

test("New lists only whoever was first credited in the range, a pen name's person by their first", async () => {
  stubArchive({
    posts: [
      {
        id: 1,
        title: "An invented headline",
        publishedAt: "2025-10-01T16:00:00Z",
        categoryIds: [1],
        paragraphs: ["Article by: Mask One"],
      },
      {
        id: 2,
        title: "Another invented headline",
        publishedAt: "2026-03-01T16:00:00Z",
        categoryIds: [1],
        paragraphs: ["Article by: Riley Example", "Image Credits: Sam Sample"],
      },
      {
        id: 3,
        title: "A third invented headline",
        publishedAt: "2026-04-01T16:00:00Z",
        categoryIds: [2],
        paragraphs: ["Article by: Sam Sample"],
      },
    ],
    categories: [
      [1, "News"],
      [2, "Sports"],
    ],
    overrides: [
      {
        postId: 1,
        role: "writer",
        byline: "Mask One",
        realName: "Riley Example",
        note: "",
      },
    ],
  });
  window.history.replaceState(
    null,
    "",
    "/people?view=new&range=custom&from=2026-01-01&to=2026-05-31",
  );
  render(<PeoplePage />);
  const table = await screen.findByRole("table");
  /* Riley first wrote, as Mask One, in the fall */
  const rows = within(table).getAllByRole("row").slice(1);
  expect(rows.map((row) => row.querySelector("td")?.textContent)).toEqual([
    "Sam Sample",
  ]);
  expect(
    within(rows[0]!)
      .getAllByRole("cell")
      .map((cell) => cell.textContent),
  ).toEqual(["Sam Sample", "Mar 1, 2026", "NewsSports", "Writing, Image", "2"]);
  expect(screen.getByText(/^1 new person/)).toBeTruthy();
});

test("a phone's table keeps what it is sorted by, a date under each name", async () => {
  stubArchive({
    posts: [
      {
        id: 1,
        title: "An invented headline",
        publishedAt: "2026-03-01T16:00:00Z",
        paragraphs: ["Article by: Sam Sample"],
      },
    ],
  });
  /* a phone's width, after the stub's laptop */
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(max-width: 767px)",
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  window.history.replaceState(
    null,
    "",
    "/people?view=new&range=custom&from=2026-01-01&to=2026-05-31",
  );
  render(<PeoplePage />);
  const table = await screen.findByRole("table");
  /* New people are sorted by when each first contributed */
  expect(
    within(table)
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent),
  ).toEqual(["Name", "Contributions"]);
  /* and the date it is sorted by goes under each name */
  expect(within(table).getAllByRole("row")[1]!.textContent).toContain(
    "Sam SampleFirst Mar 1, 2026",
  );
});

test("a chart's long name breaks onto a second line before it is cut", async () => {
  stubArchive({
    posts: [
      {
        id: 1,
        title: "An invented headline",
        publishedAt: "2026-03-01T16:00:00Z",
        paragraphs: ["Article by: Maximiliana Invented-Placeholder"],
      },
    ],
  });
  window.history.replaceState(null, "", "/people?view=top&range=all");
  render(<PeoplePage />);
  await screen.findByText("Who did the most, and as what");
  const chart = document.querySelector("svg[role=group]")!;
  const lines = [...chart.querySelectorAll("tspan")].map((t) => t.textContent);
  expect(lines).toEqual(["Maximiliana", "Invented-Placeholder"]);
  /* whole, so nothing in it needs a tooltip to read */
  expect(chart.querySelector("title")).toBeNull();
});

test("a chart's Other, the faintest role, is drawn with an edge", async () => {
  stubArchive({
    posts: [
      {
        id: 1,
        title: "An invented headline",
        publishedAt: "2026-03-01T16:00:00Z",
        paragraphs: ["Article by: Sam Sample", "Formatted by: Pat Placeholder"],
      },
    ],
  });
  window.history.replaceState(null, "", "/people?view=top&range=all");
  render(<PeoplePage />);
  await screen.findByText("Who did the most, and as what");
  const chart = document.querySelector("svg[role=group]")!;
  /* Pat's one bar is Other's, and only it has an edge */
  expect(chart.querySelectorAll("path[data-edged]")).toHaveLength(1);
  const swatch = (name: string) =>
    screen.getByRole("button", { name }).querySelector("span")!;
  expect(swatch("Other").style.boxShadow).toContain("var(--role-2)");
  expect(swatch("Writing").style.boxShadow).toBe("");
});
