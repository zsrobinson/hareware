// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ArticlesPage } from "./articles";
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
