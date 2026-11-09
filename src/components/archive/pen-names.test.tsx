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
  words: 0,
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

const panel = (overrides: Override[], index = 2) => {
  const archive = archiveOf(overrides);
  return renderWith(
    <ArticlePanel
      article={archive.articles[index]!}
      archive={archive}
      onClose={() => {}}
    />,
  );
};

const writers = { kind: "article-credits", postId: 3, role: "writer" } as const;
/* post 3 prints Penn Name as its writer only, so nothing to split elsewhere */
const elsewhere = [{ byline: "Penn Name", roles: [] }];

test("a pen name printed again offers who it was, and saves only on this article", async () => {
  const sent = panel([answered(1), answered(2)]);

  expect(screen.getByText(/on 2 articles/)).toBeTruthy();
  await userEvent.click(screen.getByRole("button", { name: "Riley Real" }));
  await userEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(sent).toEqual([
    {
      ...writers,
      entries: [{ byline: "Penn Name", realName: "Riley Real" }],
      elsewhere,
    },
  ]);
});

test("a real person under a name once used as a pen name can be said so", async () => {
  const sent = panel([answered(1)]);

  await userEvent.click(
    screen.getByRole("button", { name: "Not a pen name here" }),
  );
  await userEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(sent).toEqual([
    {
      ...writers,
      entries: [{ byline: "Penn Name", realName: "Penn Name" }],
      elsewhere,
    },
  ]);
});

test("a byline two people share keeps both when the article is saved", async () => {
  const sent = panel([
    { ...answered(3) },
    { ...answered(3), realName: "Sam Second" },
  ]);

  /* any save of the writers: here, an empty extra row, which saves nothing */
  await userEvent.click(
    screen.getAllByRole("button", { name: /Add someone not printed/ })[0]!,
  );
  await userEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(sent).toEqual([
    {
      ...writers,
      entries: [
        { byline: "Penn Name", realName: "Riley Real" },
        { byline: "Penn Name", realName: "Sam Second" },
      ],
      elsewhere,
    },
  ]);
});

const rows = (text: string) => text.replaceAll(" | ", "\t");

test("pasted rows are checked against the articles, and saved per article", async () => {
  const archive = archiveOf([]);
  const sent = renderWith(<PenNames archive={archive} reloadButton={null} />);

  await userEvent.click(screen.getByRole("button", { name: /Paste rows/ }));
  await userEvent.type(
    screen.getByRole("textbox"),
    rows(
      [
        "post_id | role | byline | real_name | note",
        "2 | writer | Penn Name | Riley Real, Jr. | back-fill",
        "2 | Image | Ida Imager | Cleo Drawer",
        "2 | writer | Someone Else | Sam Second",
        "9 | writer | Penn Name | Riley Real",
      ].join("\n"),
    ),
  );

  expect(screen.getByText("2 to save · 2 skipped")).toBeTruthy();
  expect(
    screen.getByText("Line 4 skipped: “Post 2” does not print “Someone Else”"),
  ).toBeTruthy();
  expect(
    screen.getByText("Line 5 skipped: no published article is 9"),
  ).toBeTruthy();

  await userEvent.click(screen.getByRole("button", { name: "Save rows" }));
  expect(sent).toEqual([
    {
      kind: "bylines",
      entries: [
        {
          postId: 2,
          role: "writer",
          byline: "Penn Name",
          realNames: ["Riley Real, Jr."],
          note: "back-fill",
        },
        {
          postId: 2,
          role: "image",
          byline: "Ida Imager",
          realNames: ["Cleo Drawer"],
        },
      ],
    },
  ]);
  /* what was skipped stays, to fix and paste again */
  await screen.findByText(
    "Line 1 skipped: “Post 2” does not print “Someone Else”",
  );
});

test("an old every-article row shows where it would go, and leaves answered articles alone", async () => {
  const archive = buildArchive({
    ...{
      posts: [post(1, "Penn Name"), post(2, "Penn Name")],
      categories: new Map([[103, "News"]]),
      labels: DEFAULT_LABELS,
      fetchedAt: "2026-10-05T00:00:00Z",
    },
    sheet: {
      status: "read",
      overrides: [{ ...answered(2), realName: "Sam Second" }],
      unscoped: [
        { byline: "Penn Name", role: null, realName: "Riley Real", note: "" },
      ],
      ignored: [],
      labels: null,
      problems: [],
      tabs: { overrides: true, labels: true, ignored: true },
    },
  });
  const sent = renderWith(<PenNames archive={archive} reloadButton={null} />);

  await userEvent.click(
    screen.getByRole("button", { name: "Set on 1 article" }),
  );
  expect(screen.getByText("Post 1 · Writing")).toBeTruthy();
  await userEvent.click(screen.getByRole("button", { name: "Set on these" }));

  expect(sent).toEqual([
    {
      kind: "bylines",
      entries: [
        {
          postId: 1,
          role: "writer",
          byline: "Penn Name",
          realNames: ["Riley Real"],
        },
      ],
      retire: [
        { byline: "Penn Name", role: null, realName: "Riley Real", note: "" },
      ],
    },
  ]);
});

test("old rows for different roles are set role by role, each with its own name", async () => {
  const both = (id: number): SourcePost => ({
    ...post(id, "Penn Name"),
    paragraphs: ["Article by: Penn Name", "Image Credits: Penn Name"],
  });
  const writer = {
    byline: "Penn Name",
    role: "writer" as const,
    realName: "Riley Real",
    note: "",
  };
  const image = {
    byline: "Penn Name",
    role: "image" as const,
    realName: "Sam Second",
    note: "",
  };
  const archive = buildArchive({
    posts: [both(1)],
    categories: new Map([[103, "News"]]),
    labels: DEFAULT_LABELS,
    fetchedAt: "2026-10-05T00:00:00Z",
    sheet: {
      status: "read",
      overrides: [],
      unscoped: [writer, image],
      ignored: [],
      labels: null,
      problems: [],
      tabs: { overrides: true, labels: true, ignored: true },
    },
  });
  const sent = renderWith(<PenNames archive={archive} reloadButton={null} />);

  await userEvent.click(
    screen.getByRole("button", { name: "Set on 1 article" }),
  );
  await userEvent.click(screen.getByRole("button", { name: "Set on these" }));

  expect(sent).toEqual([
    {
      kind: "bylines",
      entries: [
        {
          postId: 1,
          role: "writer",
          byline: "Penn Name",
          realNames: ["Riley Real"],
        },
        {
          postId: 1,
          role: "image",
          byline: "Penn Name",
          realNames: ["Sam Second"],
        },
      ],
      retire: [writer, image],
    },
  ]);
});
