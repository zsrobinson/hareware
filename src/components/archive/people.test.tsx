// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { PeoplePage } from "./people";
import { stubArchive } from "./stub-archive";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
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
