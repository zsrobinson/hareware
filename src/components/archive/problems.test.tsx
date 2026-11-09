// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Override } from "~/lib/credits/sheet";
import { ProblemsPage } from "./problems";

/* invented names only: what the Sheet maps is private */

const daysAgo = (days: number) =>
  new Date(Date.now() - days * 86_400_000).toISOString();

const post = (id: number, days: number, paragraphs: string[]) => ({
  id,
  title: `Invented headline ${id}`,
  publishedAt: daysAgo(days),
  link: `https://example.com/${id}`,
  categoryIds: [1],
  paragraphs,
  prose: { words: 0, paragraphs: [] },
});

const mask = (byline: string): Override => ({
  postId: 1,
  role: "writer",
  byline,
  realName: "Riley Example",
  note: "",
});

beforeEach(() => {
  const snapshot = {
    posts: [
      /* one line, two pen names, one person */
      post(1, 10, [
        "Article by: First Mask and Second Mask",
        "Image Credits: Ida Imager",
      ]),
      /* the second printed again, and only writing credited */
      post(2, 5, ["Article by: Second Mask"]),
    ],
    categories: [[1, "News"]],
    fetchedAt: new Date().toISOString(),
  };
  const sheet = {
    status: "read",
    overrides: [mask("First Mask"), mask("Second Mask")],
    unscoped: [],
    ignored: [],
    labels: null,
    views: [],
    problems: [],
    tabs: { overrides: true, labels: true, ignored: true, views: true },
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ sheet })),
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

test("a pen name said for someone is not a new name when printed again", async () => {
  window.history.replaceState(null, "", "/problems");
  render(<ProblemsPage />);
  const heading = await screen.findByRole("heading", { name: "New names" });
  const names = within(heading.closest("section")!)
    .getAllByRole("listitem")
    .map((item) => item.querySelector("a")?.textContent);
  expect(names).toEqual(["Ida Imager"]);
});

test("a role in a link to Problems is dropped, since every role counts there", async () => {
  window.history.replaceState(null, "", "/problems?roles=image");
  render(<ProblemsPage />);
  /* post 2 has no image credit, listed under any role, and the caption
     names no role */
  const count = await screen.findByRole("heading", { name: /to check/ });
  expect(count.textContent).toBe("1 article to check");
  expect(screen.getByText("Invented headline 2")).toBeTruthy();
  expect(new URLSearchParams(window.location.search).has("roles")).toBe(false);
});
