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
  window.history.replaceState(null, "", "/articles?view=most-read");
  render(<ArticlesPage />);

  const notice = await screen.findByText(
    /^Views couldn't be read from WordPress just now/,
    undefined,
    WAIT,
  );
  expect(notice.textContent).toBe(
    "Views couldn't be read from WordPress just now. Try reloading in a minute.WordPress stats aren't set up",
  );
  /* what was said, in small text of its own */
  expect(notice.querySelector(".text-xs")!.textContent).toBe(
    "WordPress stats aren't set up",
  );
  await waitFor(
    () => expect(status()).toMatch(/^Updated .* · Views unavailable$/),
    WAIT,
  );
  /* only the half that failed warns */
  const [articles, views] = [
    ...document.querySelectorAll('#page-actions [role="status"] > span'),
  ];
  expect(articles!.className).not.toMatch(/amber/);
  expect(views!.className).toMatch(/amber/);
});

/* All shows no views, so says nothing of a read it has no use for, even
   one that failed */
test("a view that counts no views says nothing of them", async () => {
  stubArchive({ posts });
  window.history.replaceState(null, "", "/articles");
  render(<ArticlesPage />);

  await waitFor(() => expect(status()).toMatch(/^Updated /), WAIT);
  expect(status()).not.toMatch(/Views/);
  expect(screen.queryByText(/^Views couldn't be read/)).toBeNull();
});

test("Most read sorts by date until views load, and says so", async () => {
  stubArchive({ posts });
  window.history.replaceState(null, "", "/articles?view=most-read");
  render(<ArticlesPage />);

  await screen.findByText(/Sorted by date until views load/, undefined, WAIT);
  const header = (name: string) =>
    screen
      .getAllByRole("columnheader")
      .find((cell) => cell.textContent === name)!;
  /* Views claims no order it is not in; Published has the one it is in */
  expect(header("Views").querySelector(".lucide-arrow-up-down")).toBeTruthy();
  expect(header("Published").querySelector(".lucide-arrow-down")).toBeTruthy();
  const titles = screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[1]!.textContent);
  expect(titles.map((title) => title!.split("No image")[0])).toEqual([
    "A third invented headline",
    "An invented headline",
    "Another invented headline",
  ]);
});

test("views read are dated beside the articles, with no notice", async () => {
  stubArchive({ posts, views: VIEWS });
  window.history.replaceState(null, "", "/articles?view=most-read");
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
  /* 150 views over the two articles counted; the third is too new, which
     its sum is marked for, and which the caption says last */
  const [sum, average] = within(news.closest("tr")!).getAllByRole("cell");
  expect(average!.textContent).toBe("75");
  expect(sum!.textContent).toBe("150†, 1 article too new to count yet");
  expect(sum!.querySelector("sup")!.title).toBe(
    "1 article too new to count yet",
  );
  const caption = document.querySelector("figcaption")!.textContent!;
  expect(caption).toMatch(/^.*150 views · /);
  expect(caption).toMatch(/ · 1 article too new to count yet$/);

  /* and its list names it last, as not counted yet */
  await userEvent.click(within(sum!).getByRole("button"));
  const list = await screen.findByRole("complementary", undefined, WAIT);
  const items = within(list).getAllByRole("listitem");
  expect(items.at(-1)!.textContent).toMatch(
    /^A third invented headlinenot counted yet/,
  );
});

/* News's one article has 120 views; Sports's was published a minute ago,
   after the count was asked for, so it has none read: not none at all */
function newsAndSports(newsAt = daysAgo(3)) {
  stubArchive({
    posts: [
      {
        id: 1,
        title: "Counted",
        publishedAt: newsAt,
        paragraphs: ["Article by: Ada Example"],
        words: 100,
        categoryIds: [1],
      },
      {
        id: 2,
        title: "Unread",
        publishedAt: minutesAgo(1),
        paragraphs: ["Article by: Bo Sample"],
        words: 100,
        categoryIds: [2],
      },
    ],
    categories: [
      [1, "News"],
      [2, "Sports"],
    ],
    views: { 1: 120 },
  });
}
const chartOfViews = (settings: string) =>
  `/articles?view=custom&base=sections&layout=chart&count=views&split=none&order=natural&top=25&compare=none&range=all&${settings}`;
const marks = () =>
  [...document.querySelectorAll("[data-category]")]
    .map((mark) => mark.getAttribute("aria-label"))
    .filter(Boolean);
const drawnText = () =>
  [...document.querySelectorAll("svg text")].map((text) => text.textContent);

test.each([
  ["a sum", "by=section&draw=stacked&values=number"],
  ["per article", "by=section&draw=stacked&values=per-article"],
])(
  "a category none of whose views were read is unavailable, never 0, as %s",
  async (_, settings) => {
    newsAndSports();
    window.history.replaceState(null, "", chartOfViews(settings));
    render(<ArticlesPage />);

    await waitFor(
      () => expect(marks()).toContain("Sports: views unavailable"),
      WAIT,
    );
    expect(marks().some((label) => /Sports: 0/.test(label!))).toBe(false);
    /* its bar's end says so, as the counted one says its number */
    expect(drawnText()).toContain("–");
  },
);

test("a line breaks at a period none of whose views were read", async () => {
  newsAndSports(daysAgo(60));
  window.history.replaceState(
    null,
    "",
    chartOfViews("by=month&draw=lines&values=number"),
  );
  render(<ArticlesPage />);

  await waitFor(
    () =>
      expect(
        marks().some((label) => label!.endsWith(": views unavailable")),
      ).toBe(true),
    WAIT,
  );
  /* a point each month but the unread one, which is the last, and no
     segment into it; a month with no articles is a 0, which it is */
  const months = marks().length;
  expect(months).toBeGreaterThanOrEqual(2);
  expect(document.querySelectorAll('svg circle[r="4"]')).toHaveLength(
    months - 1,
  );
  expect(
    document.querySelectorAll(
      'svg line[stroke="currentColor"][stroke-width="2"]',
    ),
  ).toHaveLength(months - 2);
});

test("filters that leave only articles without views read say so, and draw nothing", async () => {
  newsAndSports();
  window.history.replaceState(
    null,
    "",
    `${chartOfViews("by=section&draw=stacked&values=number")}&sections=Sports`,
  );
  render(<ArticlesPage />);

  expect(
    await screen.findByText(
      "None of this article's views are counted yet: it is newer than the last read of views.",
      undefined,
      WAIT,
    ),
  ).toBeTruthy();
  expect(document.querySelector("[data-category]")).toBeNull();

  cleanup();
  newsAndSports();
  window.history.replaceState(
    null,
    "",
    "/articles?view=read-by-section&sections=Sports",
  );
  render(<ArticlesPage />);
  expect(
    await screen.findByText(/^None of this article's views/, undefined, WAIT),
  ).toBeTruthy();
});

/* four articles over a month old, and Jetpack answered for one of them */
test("a count of views that looks short says so under its caption", async () => {
  stubArchive({
    posts: [1, 2, 3, 4].map((id) => ({
      id,
      title: `Invented headline ${id}`,
      publishedAt: daysAgo(40 + id),
      paragraphs: ["Article by: Ada Example"],
      categoryIds: [1],
    })),
    categories: [[1, "News"]],
    views: { 1: 100 },
  });
  window.history.replaceState(
    null,
    "",
    "/articles?view=read-by-section&range=all",
  );
  render(<ArticlesPage />);

  expect(
    await screen.findByText(
      "3 of 4 articles have no recorded views; Jetpack may have left some out.",
      undefined,
      WAIT,
    ),
  ).toBeTruthy();
});

/* News's two articles have 10 and 20 views, Sports's one 300 */
test("Read by section reads the most per article first, each with a faint bar", async () => {
  stubArchive({
    posts: [1, 2, 3].map((id) => ({
      id,
      title: `Invented headline ${id}`,
      publishedAt: daysAgo(3 * id),
      paragraphs: ["Article by: Ada Example"],
      categoryIds: [id === 3 ? 2 : 1],
    })),
    categories: [
      [1, "News"],
      [2, "Sports"],
    ],
    views: { 1: 10, 2: 20, 3: 300 },
  });
  window.history.replaceState(null, "", "/articles?view=read-by-section");
  render(<ArticlesPage />);

  await screen.findByRole("rowheader", { name: /Sports/ }, WAIT);
  const order = screen
    .getAllByRole("rowheader")
    .map((header) => header.textContent);
  expect(order.slice(0, 2)).toEqual(["Sports", "News"]);
  /* a bar for each row with views per article, and none for the total */
  expect(document.querySelectorAll("[data-bar]")).toHaveLength(2);
  expect(
    screen.getByText(
      "Which section's articles are read most, per article, this semester?",
    ),
  ).toBeTruthy();
  /* nothing on screen is from before Jetpack began counting */
  expect(document.querySelector("figcaption")!.textContent).not.toContain(
    "counted since January 2023",
  );
});
