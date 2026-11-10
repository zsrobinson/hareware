// @vitest-environment jsdom
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ArticlesPage } from "./articles";
import { clearedState } from "./filters";
import { archiveHref, personHref } from "./open-row";
import { PeoplePage } from "./people";

/*
  A panel gives focus back to whatever opened it, so the name in the row has
  to be the same element once the panel closes. Columns that depend on which
  row is open redraw every name as a new button, and focus is lost to the
  page; these open a panel from the keyboard and close it.
*/

const post = (id: number, title: string, writer: string) => ({
  id,
  title,
  publishedAt: `2026-10-0${id}T12:00:00Z`,
  link: `https://example.com/${id}`,
  categoryIds: [],
  paragraphs: ["Some text.", `Article by: ${writer}`],
  prose: { words: 0, paragraphs: [] },
});

beforeEach(() => {
  const snapshot = {
    posts: [
      post(1, "An invented headline", "Ada Example"),
      post(2, "Another invented headline", "Ben Sample"),
    ],
    categories: [],
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
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

test.each<[string, () => ReactNode, string]>([
  ["a person", () => <PeoplePage />, "Ben Sample"],
  ["an article", () => <ArticlesPage />, "Another invented headline"],
])(
  "Escape gives focus back to the name that opened %s",
  async (_, page, name) => {
    const user = userEvent.setup();
    render(page());
    const opener = await screen.findByRole("button", { name });

    opener.focus();
    await user.keyboard("{Enter}");
    await waitFor(() =>
      expect(opener.getAttribute("aria-current")).toBe("true"),
    );
    expect(document.activeElement?.tagName).toBe("H2");

    await user.keyboard("{Escape}");
    await waitFor(() => expect(document.activeElement).toBe(opener));
    expect(opener.isConnected).toBe(true);
  },
);

test("a link to another page names the range, and keeps a search only where it means the same", () => {
  const state = {
    ...clearedState("3m"),
    roles: ["image" as const],
    search: "moon",
  };
  const link = (href: string) => new URL(href, "https://x.test");

  /* each page opens on its own range, so the one on screen is said */
  const person = link(
    personHref("Ada Example", { state, searching: "articles" }),
  );
  expect(person.pathname).toBe("/people");
  expect(person.searchParams.get("range")).toBe("3m");
  expect(person.searchParams.get("roles")).toBe("image");
  expect(person.searchParams.get("open")).toBe("Ada Example");
  /* a title searched for is not a name on People */
  expect(person.searchParams.has("q")).toBe(false);

  const all = link(
    archiveHref("articles", {
      state: clearedState("all"),
      searching: "articles",
    }),
  );
  expect(all.searchParams.get("range")).toBe("all");
  expect(
    link(
      archiveHref("problems", { state, searching: "articles" }),
    ).searchParams.get("q"),
  ).toBe("moon");
});

test("a link from before opens the person it names, under the new name", async () => {
  window.history.replaceState(null, "", "/people?person=Ben+Sample");
  render(<PeoplePage />);
  expect(
    await screen.findByRole("complementary", { name: "Ben Sample" }),
  ).toBeTruthy();
  const params = new URLSearchParams(window.location.search);
  expect(params.get("open")).toBe("Ben Sample");
  expect(params.has("person")).toBe(false);
});

test("a name in an article's panel opens the person, on these filters", async () => {
  window.history.replaceState(null, "", "/articles?range=12m&open=2");
  render(<ArticlesPage />);
  const panel = await screen.findByRole("complementary", {
    name: "Another invented headline",
  });
  const person = new URL(
    within(panel)
      .getByRole("link", { name: "Ben Sample" })
      .getAttribute("href")!,
    "https://x.test",
  );
  expect(person.pathname).toBe("/people");
  expect(person.searchParams.get("open")).toBe("Ben Sample");
  expect(person.searchParams.get("range")).toBe("12m");
});
