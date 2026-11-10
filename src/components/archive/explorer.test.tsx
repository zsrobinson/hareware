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
import { Toaster } from "~/components/ui/sonner";
import { queryClient } from "~/lib/query-client";

/*
  A count in the chart's table opens what it counts beside the chart: the
  list there is as long as the count, the address names it, and Escape gives
  focus back to the count. chart-slice.test checks every chart's lists; this
  checks the page opens the one that was asked for.
*/

const daysAgo = (days: number) =>
  new Date(Date.now() - days * 86_400_000).toISOString();

const post = (id: number, title: string, section: number, by: string) => ({
  id,
  title,
  publishedAt: daysAgo(id * 3),
  link: `https://example.com/${id}`,
  categoryIds: [section],
  paragraphs: ["Some text.", `Article by: ${by}`],
  prose: { words: 0, paragraphs: [] },
});

beforeEach(() => {
  const snapshot = {
    posts: [
      post(1, "An invented headline", 1, "Ada Example"),
      post(2, "Another invented headline", 1, "Ben Sample"),
      post(3, "A third invented headline", 2, "Ada Example and Ben Sample"),
    ],
    categories: [
      [1, "News"],
      [2, "Sports"],
    ],
    fetchedAt: new Date().toISOString(),
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ sheet: { status: "unconfigured", missing: ["KEY"] } }),
    ),
  );
  vi.stubGlobal("caches", {
    open: async () => ({
      match: async () => Response.json(snapshot),
      put: async () => {},
    }),
  });
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  /* jsdom lays nothing out */
  if (!("scrollIntoView" in Element.prototype))
    Object.assign(Element.prototype, { scrollIntoView() {} });
});

afterEach(() => {
  cleanup();
  /* each test's archive is its own */
  queryClient.clear();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

test("a count in the table lists what it counts, and Escape returns to it", async () => {
  window.history.replaceState(null, "", "/articles?view=sections");
  const user = userEvent.setup();
  render(<ArticlesPage />);
  await user.click(
    await screen.findByRole("button", { name: "Show as table" }),
  );
  const count = await screen.findByRole("button", {
    name: "News: see 2 articles",
  });

  await user.click(count);
  const panel = await screen.findByRole("complementary", { name: "News" });
  expect(within(panel).getByText(/^2 articles/)).toBeTruthy();
  expect(
    within(panel)
      .getAllByRole("listitem")
      .map((item) => item.querySelector("a")?.textContent),
  ).toEqual(["An invented headline", "Another invented headline"]);
  expect(new URLSearchParams(window.location.search).get("slice")).toBe("News");

  await user.keyboard("{Escape}");
  await waitFor(() => expect(document.activeElement).toBe(count));
  expect(screen.queryByRole("complementary", { name: "News" })).toBeNull();
  expect(window.location.search).not.toContain("slice");
});

test("a link to a slice opens it, and one to nothing opens nothing", async () => {
  window.history.replaceState(null, "", "/articles?view=sections&slice=Sports");
  const { unmount } = render(<ArticlesPage />);
  const panel = await screen.findByRole("complementary", { name: "Sports" });
  expect(within(panel).getAllByRole("listitem")).toHaveLength(1);
  unmount();

  window.history.replaceState(
    null,
    "",
    "/articles?view=sections&slice=Rabbithole",
  );
  render(<ArticlesPage />);
  await screen.findByRole("button", { name: "Show as table" });
  await waitFor(() => expect(window.location.search).not.toContain("slice"));
  expect(screen.queryByRole("complementary")).toBeNull();
});

test("a view's edits are its own: another tab opens as saved, and Undo brings them back", async () => {
  const user = userEvent.setup();
  const time = () => screen.getByRole("combobox", { name: "Time" }).textContent;
  const range = () => new URLSearchParams(window.location.search).get("range");

  window.history.replaceState(null, "", "/articles?range=12m");
  render(
    <>
      <Toaster />
      <ArticlesPage />
    </>,
  );
  expect(await screen.findByRole("tab", { name: "All, edited" })).toBeTruthy();
  await user.click(screen.getByRole("tab", { name: "History" }));
  await waitFor(() => expect(time()).toContain("All time"));
  expect(range()).toBeNull();

  const toast = await screen.findByText("Unsaved changes to All discarded");
  await user.click(
    within(toast.closest("li")!).getByRole("button", { name: "Undo" }),
  );
  await waitFor(() => expect(time()).toContain("Last 12 months"));
  expect(
    screen
      .getByRole("tab", { name: "All, edited" })
      .getAttribute("aria-selected"),
  ).toBe("true");
  expect(range()).toBe("12m");
});

test("a list opened over Customize gives Customize back when it closes", async () => {
  window.history.replaceState(null, "", "/articles?view=sections");
  const user = userEvent.setup();
  render(<ArticlesPage />);
  const customize = await screen.findByRole("button", { name: "Customize" });
  await user.click(customize);
  await screen.findByRole("complementary", { name: "Customize" });

  await user.click(screen.getByRole("button", { name: "Show as table" }));
  await user.click(
    screen.getByRole("button", { name: "News: see 2 articles" }),
  );
  await screen.findByRole("complementary", { name: "News" });
  expect(screen.queryByRole("complementary", { name: "Customize" })).toBeNull();

  await user.keyboard("{Escape}");
  const panel = await screen.findByRole("complementary", { name: "Customize" });
  await waitFor(() =>
    expect(document.activeElement).toBe(
      within(panel).getByRole("heading", { name: "Customize" }),
    ),
  );
  /* and closing it returns to its own button */
  await user.keyboard("{Escape}");
  await waitFor(() => expect(document.activeElement).toBe(customize));
});

test("the one Reset takes back every change, filters and view alike", async () => {
  window.history.replaceState(
    null,
    "",
    "/articles?view=custom&base=sections&layout=chart&count=articles&by=section&split=none&draw=stacked&values=share&order=natural&top=25&range=12m&q=moon",
  );
  const user = userEvent.setup();
  render(<ArticlesPage />);
  expect(
    await screen.findByRole("tab", { name: "Sections, edited" }),
  ).toBeTruthy();
  /* no Clear beside it: Reset is the one way back */
  expect(screen.queryByRole("button", { name: /Clear/ })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Reset" }));
  await waitFor(() => expect(window.location.search).toBe("?view=sections"));
  expect(screen.getByRole("tab", { name: "Sections" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Reset" })).toBeNull();
  expect(
    screen.queryByRole("button", { name: /Save for everyone/ }),
  ).toBeNull();
});

test("a chart of one series names its count for what it is", async () => {
  window.history.replaceState(null, "", "/articles?view=sections");
  const user = userEvent.setup();
  render(<ArticlesPage />);
  await user.click(
    await screen.findByRole("button", { name: "Show as table" }),
  );
  expect(
    screen.getAllByRole("columnheader").map((cell) => cell.textContent),
  ).toEqual(["Section", "Articles"]);
});

test("a name searched for says what it matched, and can count that person alone", async () => {
  window.history.replaceState(null, "", "/people?view=contributors&q=ada");
  const user = userEvent.setup();
  render(<PeoplePage />);
  const caption = () => document.querySelector("figcaption")!.textContent;
  /* both of Ada's articles, and Ben's half of the one they wrote together */
  await waitFor(() => expect(caption()).toContain("3 contributions"));
  expect(caption()).toContain("“ada” in a title or byline");

  const search = screen.getByRole("searchbox", { name: "Search" });
  expect(search.getAttribute("placeholder")).toBe("Search people and articles");
  await user.click(search);
  const suggestions = screen.getByRole("group", {
    name: "People matching search",
  });
  expect(within(suggestions).getAllByRole("button")[0]!.textContent).toBe(
    "Only Ada Example",
  );
  await user.click(
    within(suggestions).getByRole("button", { name: "Only Ada Example" }),
  );
  await waitFor(() => expect(caption()).toContain("2 contributions"));
  expect(caption()).toContain("Ada Example");
  const params = new URLSearchParams(window.location.search);
  expect(params.getAll("people")).toEqual(["Ada Example"]);
  expect(params.has("q")).toBe(false);

  await user.click(
    screen.getByRole("button", { name: /^Ada Example, remove/ }),
  );
  await waitFor(() => expect(caption()).toContain("4 contributions"));
  expect(new URLSearchParams(window.location.search).has("people")).toBe(false);
});

test("what a mark counts opens as filters on either table", async () => {
  window.history.replaceState(null, "", "/articles?view=sections");
  const user = userEvent.setup();
  render(<ArticlesPage />);
  await user.click(
    await screen.findByRole("button", { name: "Show as table" }),
  );
  await user.click(
    screen.getByRole("button", { name: "News: see 2 articles" }),
  );
  const panel = await screen.findByRole("complementary", { name: "News" });
  const to = (name: string) =>
    new URL(
      within(panel).getByRole("link", { name }).getAttribute("href")!,
      "https://x.test",
    );
  const articles = to("See in Articles");
  expect(articles.pathname).toBe("/articles");
  expect(articles.searchParams.get("sections")).toBe("News");
  expect(articles.searchParams.get("range")).toBe("3m");
  expect(articles.searchParams.has("view")).toBe(false);
  expect(to("See the people").pathname).toBe("/people");
});

test("the builder edits the view in place, says what it was, and Reset brings the table back", async () => {
  /* a name searched for on the table is not what a chart's search reads */
  window.history.replaceState(null, "", "/people?q=ben");
  const user = userEvent.setup();
  render(<PeoplePage />);
  await user.click(await screen.findByRole("button", { name: "Customize" }));
  const panel = await screen.findByRole("complementary", { name: "Customize" });
  await user.click(within(panel).getByRole("combobox", { name: "Show as" }));
  await user.click(await screen.findByRole("option", { name: "Chart" }));
  await waitFor(() =>
    expect(
      screen
        .getByRole("tab", { name: "Everyone, edited" })
        .getAttribute("aria-selected"),
    ).toBe("true"),
  );
  expect(within(panel).getByText("saved: Table")).toBeTruthy();
  const params = new URLSearchParams(window.location.search);
  expect(params.has("view")).toBe(false);
  expect(params.get("layout")).toBe("chart");
  expect(params.has("q")).toBe(false);
  expect(document.querySelector("figcaption")).toBeTruthy();

  await user.click(screen.getByRole("button", { name: "Reset" }));
  expect(
    screen.getByRole("tab", { name: "Everyone" }).getAttribute("aria-selected"),
  ).toBe("true");
  expect(screen.getByRole("columnheader", { name: /Name/ })).toBeTruthy();
});

test("a column taken out from the Columns menu is an edit of the view, in its link", async () => {
  window.history.replaceState(null, "", "/people?min=5");
  const user = userEvent.setup();
  render(<PeoplePage />);
  await user.click(await screen.findByRole("button", { name: /Columns/ }));
  await user.click(
    await screen.findByRole("menuitemcheckbox", { name: "Latest" }),
  );
  await user.keyboard("{Escape}");
  const params = new URLSearchParams(window.location.search);
  expect(params.get("columns")).toBe(
    "name,contributions,writer,image,other,first",
  );
  expect(params.get("min")).toBe("5");
  expect(screen.getByRole("tab", { name: "Everyone, edited" })).toBeTruthy();
});

test("a search for a name is cleared on a chart, which would read it as a title", async () => {
  stubArchive({
    posts: [
      {
        id: 1,
        title: "An invented headline",
        publishedAt: daysAgo(3),
        paragraphs: ["Article by: Mask One"],
      },
    ],
    overrides: [
      {
        postId: 1,
        role: "writer",
        byline: "Mask One",
        realName: "Ada Example",
        note: "",
      },
    ],
  });
  window.history.replaceState(null, "", "/people?q=ada");
  const user = userEvent.setup();
  render(<PeoplePage />);
  /* the table finds Ada by name, though no article prints it */
  await screen.findByRole("button", { name: /Ada Example/ });
  await user.click(screen.getByRole("tab", { name: "Top contributors" }));
  await waitFor(() =>
    expect(new URLSearchParams(window.location.search).has("q")).toBe(false),
  );
  expect(screen.queryByText("Nothing matches these filters.")).toBeNull();
});

test("a link from a chart rounded to semesters takes the range as it counted it", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  /* the last three months start in August, so the semester chart counts
     from Fall's first day */
  vi.setSystemTime(new Date("2026-11-09T16:00:00Z"));
  try {
    stubArchive({
      posts: [
        {
          id: 1,
          title: "A summer headline",
          publishedAt: "2026-07-01T16:00:00Z",
          paragraphs: ["Article by: Ada Example"],
        },
      ],
    });
    window.history.replaceState(
      null,
      "",
      "/articles?view=history&range=3m&slice=2026-2",
    );
    render(<ArticlesPage />);
    const panel = await screen.findByRole("complementary", {
      name: /^Fall 2026/,
    });
    const to = new URL(
      within(panel)
        .getByRole("link", { name: "A summer headline" })
        .getAttribute("href")!,
      "https://x.test",
    );
    expect(to.searchParams.get("range")).toBe("custom");
    expect(to.searchParams.get("from")).toBe("2026-06-01");
  } finally {
    vi.useRealTimers();
  }
});

test("articles a mark chose are a filter of their own, which a chip takes off", async () => {
  window.history.replaceState(null, "", "/articles?articles=1,3");
  const user = userEvent.setup();
  render(<ArticlesPage />);
  expect((await screen.findByText(/^2 articles/)).textContent).toContain(
    "2 chosen articles",
  );
  await user.click(
    screen.getByRole("button", { name: /^2 chosen articles, remove/ }),
  );
  expect((await screen.findByText(/^3 articles/)).textContent).not.toContain(
    "chosen",
  );
  expect(new URLSearchParams(window.location.search).has("articles")).toBe(
    false,
  );
});

test("Home and End choose the first and last of the views", async () => {
  window.history.replaceState(null, "", "/articles?view=sections");
  const user = userEvent.setup();
  render(<ArticlesPage />);
  const selected = () =>
    screen
      .getAllByRole("tab")
      .find((tab) => tab.getAttribute("aria-selected") === "true");
  (await screen.findByRole("tab", { name: "Sections" })).focus();
  await user.keyboard("{End}");
  await waitFor(() => expect(selected()?.textContent).toBe("Read by section"));
  expect(document.activeElement).toBe(selected());
  await user.keyboard("{Home}");
  await waitFor(() => expect(selected()?.textContent).toBe("All"));
  expect(document.activeElement).toBe(selected());
});

test("a chart of one series still says its pale period is so far", async () => {
  window.history.replaceState(null, "", "/people?view=headcount");
  render(<PeoplePage />);
  /* every invented article is this semester's, which is not over */
  expect(await screen.findByText(/^(Spring|Fall) \d{4} so far$/)).toBeTruthy();
  expect(screen.queryByRole("toolbar", { name: "Series" })).toBeNull();
});

test("a phone writes an article's date under its title, unless sorted by it", async () => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(max-width: 767px)",
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  window.history.replaceState(null, "", "/articles");
  const first = render(<ArticlesPage />);
  const headers = async () =>
    within(await screen.findByRole("table"))
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent);
  expect(await headers()).toEqual(["Published", "Title"]);
  first.unmount();

  window.history.replaceState(null, "", "/articles?sort=title");
  render(<ArticlesPage />);
  expect(await headers()).toEqual(["Title"]);
  const row = screen.getByRole("row", { name: /A third invented headline/ });
  expect(row.textContent).toMatch(
    /A third invented headline\w{3} \d+, \d{4} · Sports/,
  );
});
