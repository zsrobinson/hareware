// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, test, vi } from "vitest";
import type { ViewerState } from "~/lib/admin";
import { SidebarAccount } from "./sidebar-account";
import { SidebarGroups } from "./sidebar-sheet";

vi.hoisted(() => {
  Object.assign(globalThis, { __APP_VERSION__: "v0.0.1" });
});

let viewer: ViewerState;

vi.mock("~/lib/use-session", () => ({
  useViewer: () => viewer,
}));

afterEach(cleanup);

test("signed-out navigation offers one Discord account action", () => {
  viewer = { session: null, profile: null, admin: false };

  render(<SidebarAccount returnTo="/words" />);

  expect(
    screen
      .getByRole("link", { name: "Sign in with Discord" })
      .getAttribute("href"),
  ).toBe("/auth/discord?returnTo=%2Fwords");
  expect(screen.queryByRole("link", { name: /profile/i })).toBeNull();
});

test("signed-in navigation links the Discord identity to the profile", () => {
  viewer = {
    session: { discordUserId: "42" },
    profile: {
      discordNickname: null,
      displayName: "Ana Diaz",
      username: "ana",
      avatarUrl: "https://cdn.example/avatar.png",
    },
    admin: false,
  };

  render(<SidebarAccount returnTo="/words" />);

  expect(
    screen.getByRole("link", { name: /Ana Diaz/ }).getAttribute("href"),
  ).toBe("/profile");
  expect(screen.queryByRole("link", { name: /sign in/i })).toBeNull();
});

test("mobile navigation shows admin tools only to Editorial Board", () => {
  viewer = { session: null, profile: null, admin: false };
  const { rerender } = render(<SidebarGroups pathname="/words" />);

  expect(screen.getByText("Public tools")).toBeTruthy();
  expect(screen.queryByText("Admin tools")).toBeNull();

  viewer = { session: null, profile: null, admin: true };
  rerender(<SidebarGroups pathname="/words" />);

  expect(screen.getByText("Admin tools")).toBeTruthy();
});

test("an unresolved cached page renders no personalized navigation", () => {
  viewer = { session: null, profile: null, admin: false };

  const html = renderToStaticMarkup(<SidebarGroups pathname="/words" />);

  expect(html).toContain("Public tools");
  expect(html).not.toContain("Admin tools");
  expect(html).not.toContain("Ana Diaz");
});
