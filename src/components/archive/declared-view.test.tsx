// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ArticlesPage } from "./articles";
import { stubArchive } from "./stub-archive";
import type { View } from "./views";

/*
  A view's filters are where it starts however it is reached: from its tab,
  its link, a reload, or Clear. No default declares any yet, so this adds
  one, as a paste into views.ts would.
*/

vi.mock("./views", async (importOriginal) => {
  const real = await importOriginal<typeof import("./views")>();
  const news = {
    id: "news",
    label: "News",
    question: "What has News published?",
    source: "articles",
    range: "all",
    filters: { sections: ["News"] },
    layout: {
      type: "table",
      table: {
        columns: ["date", "title", "section"],
        sort: { id: "date", desc: true },
      },
    },
  } as const satisfies View;
  return { ...real, VIEWS: [...real.VIEWS, news] };
});

beforeEach(() => {
  stubArchive({
    posts: [
      {
        id: 1,
        title: "An invented headline",
        publishedAt: "2026-10-01T16:00:00Z",
        categoryIds: [1],
        paragraphs: ["Article by: Ada Example"],
      },
      {
        id: 2,
        title: "Another invented headline",
        publishedAt: "2026-10-02T16:00:00Z",
        categoryIds: [2],
        paragraphs: ["Article by: Ben Sample"],
      },
    ],
    categories: [
      [1, "News"],
      [2, "Sports"],
    ],
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

const count = () => screen.findByText(/^\d+ articles?/);

test("a view's own filters hold on its link, on a reload, and after Clear", async () => {
  window.history.replaceState(null, "", "/articles?view=news");
  const first = render(<ArticlesPage />);
  expect((await count()).textContent).toMatch(/^1 article · News$/);
  /* its own, so its link leaves them out */
  expect(window.location.search).toBe("?view=news");
  first.unmount();

  /* cleared, the link says so, and a reload keeps it cleared */
  window.history.replaceState(null, "", "/articles?view=news&sections=");
  const again = render(<ArticlesPage />);
  expect((await count()).textContent).toMatch(/^2 articles/);
  again.unmount();
  render(<ArticlesPage />);
  expect((await count()).textContent).toMatch(/^2 articles/);

  /* Clear goes back to the view's own, not to nothing */
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /Clear/ }));
  await waitFor(async () =>
    expect((await count()).textContent).toMatch(/^1 article · News$/),
  );
  expect(window.location.search).toBe("?view=news");
});
