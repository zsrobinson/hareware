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
import { ChartsPage } from "./charts";

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
});

beforeEach(() => {
  const snapshot = {
    posts: [
      post(1, "An invented headline", 1, "Ada Example"),
      post(2, "Another invented headline", 1, "Ben Sample"),
      post(3, "A third invented headline", 2, "Ada Example"),
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
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

test("a count in the table lists what it counts, and Escape returns to it", async () => {
  const user = userEvent.setup();
  render(<ChartsPage />);
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
  window.history.replaceState(null, "", "/charts?slice=Sports");
  const { unmount } = render(<ChartsPage />);
  const panel = await screen.findByRole("complementary", { name: "Sports" });
  expect(within(panel).getAllByRole("listitem")).toHaveLength(1);
  unmount();

  window.history.replaceState(null, "", "/charts?slice=Rabbithole");
  render(<ChartsPage />);
  await screen.findByRole("button", { name: "Show as table" });
  await waitFor(() => expect(window.location.search).not.toContain("slice"));
  expect(screen.queryByRole("complementary")).toBeNull();
});

test("a view brings its own time range, unless Time was chosen", async () => {
  const user = userEvent.setup();
  const time = () => screen.getByRole("combobox", { name: "Time" }).textContent;
  const range = () => new URLSearchParams(window.location.search).get("range");

  const { unmount } = render(<ChartsPage />);
  await user.click(await screen.findByRole("tab", { name: "History" }));
  await waitFor(() => expect(time()).toContain("All time"));
  await user.click(screen.getByRole("tab", { name: "Contributors" }));
  await waitFor(() => expect(time()).toContain("Last 3 months"));
  unmount();

  /* a year chosen on Sections stays through the views, and in the link */
  window.history.replaceState(null, "", "/charts?range=12m");
  render(<ChartsPage />);
  await user.click(await screen.findByRole("tab", { name: "History" }));
  await user.click(screen.getByRole("tab", { name: "Contributors" }));
  expect(time()).toContain("Last 12 months");
  expect(range()).toBe("12m");
});
