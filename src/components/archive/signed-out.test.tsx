// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { queryClient } from "~/lib/query-client";
import { ArticlesPage } from "./articles";
import { PeoplePage } from "./people";
import { ProblemsPage } from "./problems";
import { SettingsPage } from "./settings";

afterEach(() => {
  cleanup();
  queryClient.clear();
  vi.unstubAllGlobals();
});

test.each([
  ["articles", ArticlesPage],
  ["people", PeoplePage],
  ["problems", ProblemsPage],
  ["settings", SettingsPage],
])(
  "%s shows sign-in after one 401 without restarting the gate",
  async (path, Page) => {
    window.history.replaceState(null, "", `/${path}`);
    const fetch = vi.fn(async () =>
      Response.json({ denial: "signed-out", you: null }, { status: 401 }),
    );
    vi.stubGlobal("fetch", fetch);
    render(<Page />);

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Editorial Board only" }),
      ).toBeTruthy(),
    );
    expect(
      screen
        .getByRole("link", { name: "Sign in with Discord" })
        .getAttribute("href"),
    ).toBe(`/auth/discord?returnTo=%2F${path}`);
    // Let remount-triggered requests settle too: a refusal must stay visible.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(screen.queryByText("Opening the archive…")).toBeNull();
    expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/archive.json", {
      cache: "no-store",
    });
  },
);
