// @vitest-environment jsdom
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ArticlesPage } from "./articles";
import { PeoplePage } from "./people";
import { stubArchive } from "./stub-archive";

/*
  A pivot's cell opens what it counts beside it: the list is as long as the
  cell says, the address names it, and Escape gives focus back to the cell.
  pivot.test checks every pivot's lists; this checks the page opens the one
  that was asked for.
*/

const post = (id: number, date: string, section: number, by: string) => ({
  id,
  title: `Invented headline ${id}`,
  publishedAt: `${date}T16:00:00Z`,
  categoryIds: [section],
  paragraphs: ["Some text.", `Article by: ${by}`],
});

beforeEach(() =>
  stubArchive({
    posts: [
      post(1, "2025-09-04", 1, "Ada Example"),
      post(2, "2025-10-12", 1, "Ben Sample"),
      post(3, "2026-02-03", 2, "Ada Example"),
      post(4, "2026-03-03", 1, "Cy Placeholder"),
    ],
    categories: [
      [1, "News"],
      [2, "Sports"],
    ],
  }),
);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

test("a cell lists the people it counts, and Escape returns to it", async () => {
  window.history.replaceState(null, "", "/people?view=retention");
  const user = userEvent.setup();
  render(<PeoplePage />);
  /* of Fall 2025's two, Ada came back in the spring */
  const cell = await screen.findByRole("button", {
    name: "Joined Fall 2025, 1 semester after joining: see 1 person",
  });
  await user.click(cell);
  const panel = await screen.findByRole("complementary", {
    name: "Joined Fall 2025 · 1 semester after joining",
  });
  expect(
    within(panel)
      .getAllByRole("listitem")
      .map((item) => item.querySelector("a")?.textContent),
  ).toEqual(["Ada Example"]);
  expect(new URLSearchParams(window.location.search).get("slice")).toBe(
    "2025-2~1",
  );

  /* and as filters, those people on what they did that semester */
  const people = new URL(
    within(panel)
      .getByRole("link", { name: "See the people" })
      .getAttribute("href")!,
    "https://x.test",
  );
  expect(people.searchParams.getAll("people")).toEqual(["Ada Example"]);
  expect(people.searchParams.get("articles")).toBe("3");

  await user.keyboard("{Escape}");
  await waitFor(() => expect(document.activeElement).toBe(cell));
  expect(window.location.search).not.toContain("slice");
});

test("the table is one tab stop, and arrows move between its numbers", async () => {
  window.history.replaceState(null, "", "/people?view=retention");
  const user = userEvent.setup();
  render(<PeoplePage />);
  const table = await screen.findByRole("table");
  const stops = within(table)
    .getAllByRole("button")
    .filter((button) => button.tabIndex === 0);
  expect(stops).toHaveLength(1);

  const intake = within(table).getByRole("button", {
    name: "Joined Fall 2025, Semester joined: see 2 people",
  });
  intake.focus();
  await user.keyboard("{ArrowRight}");
  expect(document.activeElement?.getAttribute("aria-label")).toBe(
    "Joined Fall 2025, 1 semester after joining: see 1 person",
  );
  /* nobody who joined in the spring has come back yet: passed over */
  await user.keyboard("{ArrowDown}");
  expect(document.activeElement?.getAttribute("aria-label")).toBe(
    "Total, 1 semester after joining: see 1 person",
  );
  expect((document.activeElement as HTMLElement).tabIndex).toBe(0);
});

test("a link to a cell opens it, and one to nothing opens nothing", async () => {
  window.history.replaceState(
    null,
    "",
    "/articles?view=section-share&range=all&slice=News~*",
  );
  const { unmount } = render(<ArticlesPage />);
  const panel = await screen.findByRole("complementary", { name: "News" });
  expect(within(panel).getByText(/^3 of 4 articles · 75%/)).toBeTruthy();
  expect(within(panel).getAllByRole("listitem")).toHaveLength(3);
  unmount();

  window.history.replaceState(
    null,
    "",
    "/articles?view=section-share&range=all&slice=Rabbithole~*",
  );
  render(<ArticlesPage />);
  await screen.findByRole("table");
  await waitFor(() => expect(window.location.search).not.toContain("slice"));
  expect(screen.queryByRole("complementary")).toBeNull();
});

test("the builder makes a pivot, and the address keeps it", async () => {
  window.history.replaceState(null, "", "/articles?range=all");
  const user = userEvent.setup();
  render(<ArticlesPage />);
  await user.click(await screen.findByRole("button", { name: "Customize" }));
  const panel = await screen.findByRole("complementary", { name: "Customize" });
  await user.click(within(panel).getByRole("combobox", { name: "Show as" }));
  await user.click(await screen.findByRole("option", { name: "Pivot" }));
  await user.click(within(panel).getByRole("combobox", { name: "Columns" }));
  await user.click(await screen.findByRole("option", { name: "Semester" }));
  const params = new URLSearchParams(window.location.search);
  expect(params.get("layout")).toBe("pivot");
  expect(params.get("cols")).toBe("semester");
  expect(
    await screen.findByRole("button", {
      name: "News, Fall 2025: 50%, see 2 articles",
    }),
  ).toBeTruthy();
});

test("a pivot against the period before pairs each row, and opens either range", async () => {
  window.history.replaceState(
    null,
    "",
    "/articles?view=custom&base=section-share&layout=pivot&count=articles&rows=section&cols=none&values=number&top=25&compare=previous&range=custom&from=2026-01-01&to=2026-05-31",
  );
  const user = userEvent.setup();
  render(<ArticlesPage />);
  const table = await screen.findByRole("table");
  expect(
    within(table)
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent),
  ).toEqual([
    "Section",
    "Spring 2026",
    "Aug 3, 2025 to Dec 31, 2025",
    "Difference",
  ]);
  const news = within(table).getByRole("row", { name: /^News/ });
  expect(
    within(news)
      .getAllByRole("cell")
      .map((cell) => cell.textContent),
  ).toEqual(["1", "2", "−1"]);

  await user.click(
    within(table).getByRole("button", {
      name: "News, Aug 3, 2025 to Dec 31, 2025: see 2 articles",
    }),
  );
  const panel = await screen.findByRole("complementary", {
    name: "News · Aug 3, 2025 to Dec 31, 2025",
  });
  const articles = new URL(
    within(panel)
      .getByRole("link", { name: "See in Articles" })
      .getAttribute("href")!,
    "https://x.test",
  );
  expect(articles.searchParams.get("from")).toBe("2025-08-03");
  expect(articles.searchParams.get("to")).toBe("2025-12-31");
  expect(articles.searchParams.get("sections")).toBe("News");
});

test("a chart against what came before all time says there is nothing, and draws one range", async () => {
  window.history.replaceState(
    null,
    "",
    "/articles?view=custom&base=sections&layout=chart&count=articles&by=section&split=none&draw=grouped&values=number&order=natural&top=25&compare=previous&range=all",
  );
  const user = userEvent.setup();
  render(<ArticlesPage />);
  expect(
    await screen.findByText(/^All time has nothing before it to compare with/),
  ).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Show as table" }));
  expect(
    screen.getAllByRole("columnheader").map((cell) => cell.textContent),
  ).toEqual(["Section", "Articles"]);
});

test("a chart against the period before draws each category's pair, and their difference", async () => {
  window.history.replaceState(
    null,
    "",
    "/articles?view=custom&base=sections&layout=chart&count=articles&by=section&split=none&draw=grouped&values=number&order=natural&top=25&compare=previous&range=custom&from=2026-01-01&to=2026-05-31",
  );
  const user = userEvent.setup();
  render(<ArticlesPage />);
  const table = await screen.findByRole("button", { name: "Show as table" });
  expect(document.querySelector("figcaption")!.textContent).toContain(
    "Articles by section, against the period before",
  );
  await user.click(table);
  expect(
    screen.getAllByRole("columnheader").map((cell) => cell.textContent),
  ).toEqual([
    "Section",
    "Spring 2026",
    "Aug 3, 2025 to Dec 31, 2025",
    "Difference",
  ]);
  await user.click(
    screen.getByRole("button", {
      name: "Aug 3, 2025 to Dec 31, 2025, News: see 2 articles",
    }),
  );
  const panel = await screen.findByRole("complementary", {
    name: "Aug 3, 2025 to Dec 31, 2025 · News",
  });
  expect(within(panel).getAllByRole("listitem")).toHaveLength(2);
});

test("a section with nothing is a row of zeros, which opens nothing", async () => {
  window.history.replaceState(
    null,
    "",
    "/articles?view=section-share&range=all",
  );
  render(<ArticlesPage />);
  const table = await screen.findByRole("table");
  const rabbithole = within(table).getByRole("row", { name: /^Rabbithole/ });
  expect(
    within(rabbithole)
      .getAllByRole("cell")
      .map((cell) => cell.textContent),
  ).toEqual(["0", "0%"]);
  expect(within(rabbithole).queryByRole("button")).toBeNull();
});

 test("one-column shares show a count and a share, both opening the same slice", async () => {
 window.history.replaceState(null, "", "/articles?view=section-share&range=all");
 const user = userEvent.setup(); render(<ArticlesPage />);
 const table = await screen.findByRole("table");
 expect(within(table).getAllByRole("columnheader").map(c => c.textContent)).toEqual(["Section", "Articles", "Share"]);
 expect(within(table).getByRole("row", {name: /^Total/}).textContent).toBe("Total4100%");
 const row = within(table).getByRole("row", {name: /^News/});
 const cells = within(row).getAllByRole("cell");
 expect(cells.map(c => c.textContent)).toEqual(["3", "75%"]);
 for (const cell of cells) {
 await user.click(within(cell).getByRole("button"));
 expect(within(await screen.findByRole("complementary", {name: "News"})).getAllByRole("listitem")).toHaveLength(3);
 await user.keyboard("{Escape}");
 }
 });
