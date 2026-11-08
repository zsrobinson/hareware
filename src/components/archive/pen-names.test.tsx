// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { buildArchive, type SourcePost } from "~/lib/credits/archive";
import type { Edit } from "~/lib/credits/edits";
import { DEFAULT_LABELS } from "~/lib/credits/labels";
import type { Override } from "~/lib/credits/sheet";
import { ArticlePanel } from "./articles";
import { PenNames } from "./settings";

/* invented names only: what the Sheet maps is private */

const post = (id: number, byline: string): SourcePost => ({
  id,
  publishedAt: `2026-10-0${id}T10:00:00Z`,
  link: `https://theumdhare.com/${id}/`,
  title: `Post ${id}`,
  categoryIds: [103],
  paragraphs: [`Article by: ${byline}`, "Image Credits: Ida Imager"],
});

const answered = (postId: number): Override => ({
  postId,
  role: "writer",
  byline: "Penn Name",
  realName: "Riley Real",
  note: "",
});

const archiveOf = (overrides: Override[]) =>
  buildArchive({
    posts: [post(1, "Penn Name"), post(2, "Penn Name"), post(3, "Penn Name")],
    categories: new Map([[103, "News"]]),
    sheet: {
      status: "read",
      overrides,
      unscoped: [],
      ignored: [],
      labels: null,
      problems: [],
      tabs: { overrides: true, labels: true, ignored: true },
    },
    labels: DEFAULT_LABELS,
    fetchedAt: "2026-10-05T00:00:00Z",
  });

/* the stubbed /api/sheet records each edit the page sends */
function renderWith(ui: ReactNode) {
  const sent: Edit[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      sent.push(JSON.parse(init.body as string) as Edit);
      return Response.json({ ok: true });
    }),
  );
  const client = new QueryClient();
  render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
  return sent;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("a pen name printed again offers who it was, and saves only on this article", async () => {
  const archive = archiveOf([answered(1), answered(2)]);
  const sent = renderWith(
    <ArticlePanel
      article={archive.articles[2]!}
      archive={archive}
      onClose={() => {}}
    />,
  );

  expect(screen.getByText(/on 2 articles/)).toBeTruthy();
  await userEvent.click(
    screen.getByRole("button", { name: "Counts as Riley Real" }),
  );
  await userEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(sent).toEqual([
    {
      kind: "article-credits",
      postId: 3,
      role: "writer",
      entries: [{ byline: "Penn Name", realName: "Riley Real" }],
    },
  ]);
});

test("pasted rows are checked against the articles, and saved per article", async () => {
  const archive = archiveOf([]);
  const sent = renderWith(<PenNames archive={archive} reloadButton={null} />);

  await userEvent.click(screen.getByRole("button", { name: /Paste rows/ }));
  await userEvent.type(
    screen.getByRole("textbox"),
    "post_id\trole\tbyline\treal_name\n2\twriter\tPenn Name\tRiley Real\n2\twriter\tSomeone Else\tSam Second\n9\twriter\tPenn Name\tRiley Real",
  );

  expect(screen.getByText("Skipped: the header row")).toBeTruthy();
  expect(
    screen.getByText("Skipped: “Post 2” does not print “Someone Else”"),
  ).toBeTruthy();
  expect(screen.getByText("Skipped: no published article is 9")).toBeTruthy();

  await userEvent.click(screen.getByRole("button", { name: "Save rows" }));
  expect(sent).toEqual([
    {
      kind: "bylines",
      entries: [
        {
          postId: 2,
          role: "writer",
          byline: "Penn Name",
          realNames: ["Riley Real"],
        },
      ],
    },
  ]);
});
