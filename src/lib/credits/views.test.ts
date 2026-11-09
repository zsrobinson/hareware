import { expect, test } from "vitest";
import { buildArchive, type SourcePost } from "./archive";
import { DEFAULT_LABELS } from "./labels";
import { withViews } from "./views";

const post = (id: number, publishedAt: string): SourcePost => ({
  id,
  publishedAt,
  link: `https://theumdhare.com/${id}/`,
  title: `Post ${id}`,
  categoryIds: [103],
  paragraphs: ["Article by: Penn Name"],
  words: 0,
});

const archive = buildArchive({
  posts: [
    post(1, "2026-09-01T10:00:00Z"),
    post(2, "2026-10-01T10:00:00Z"),
    post(3, "2026-11-09T15:00:00Z"),
  ],
  categories: new Map([[103, "News"]]),
  sheet: { status: "unconfigured", missing: [] },
  labels: DEFAULT_LABELS,
  fetchedAt: "2026-11-09T16:00:00Z",
});
const views = (a: typeof archive) => a.articles.map((article) => article.views);

test("an archive is built with every article's views unavailable, until they are read", () => {
  expect(archive.views).toEqual({ status: "reading" });
  for (const v of views(archive)) expect(v).toEqual({ status: "unavailable" });
});

test("merges each article's views by post id, and its total", () => {
  const merged = withViews(archive, {
    status: "read",
    posts: { 1: { "2026-09": 40, "2026-10": 2 }, 2: { "2026-10": 7 } },
    askedAt: "2026-11-09T16:59:58Z",
    fetchedAt: "2026-11-09T17:00:00Z",
  });

  expect(merged.views).toEqual({
    status: "read",
    fetchedAt: "2026-11-09T17:00:00Z",
  });
  expect(views(merged).slice(0, 2)).toEqual([
    { status: "counted", total: 42, byMonth: { "2026-09": 40, "2026-10": 2 } },
    { status: "counted", total: 7, byMonth: { "2026-10": 7 } },
  ]);
});

/* Jetpack leaves out a post nobody read; one published after the count was
   asked for is not in it either, and nobody has said it was not read */
test("an article missing from the count was read by nobody, unless it is newer than the ask", () => {
  /* post 3 was published at 15:00 */
  const read = (askedAt: string, fetchedAt = askedAt) =>
    views(
      withViews(archive, { status: "read", posts: {}, askedAt, fetchedAt }),
    )[2];

  expect(read("2026-11-09T17:00:00Z")).toEqual({
    status: "counted",
    total: 0,
    byMonth: {},
  });
  expect(read("2026-11-09T14:00:00Z")).toEqual({ status: "unavailable" });
  /* asked before it was published, answered after: no proof either way */
  expect(read("2026-11-09T14:59:59Z", "2026-11-09T15:00:02Z")).toEqual({
    status: "unavailable",
  });
  /* nor within ten minutes of it, since the two clocks may differ */
  expect(read("2026-11-09T15:05:00Z")).toEqual({ status: "unavailable" });
});

test("views that could not be read are unavailable on every article, never zero", () => {
  const counted = withViews(archive, {
    status: "read",
    posts: { 1: { "2026-09": 40 } },
    askedAt: "2026-11-09T16:59:58Z",
    fetchedAt: "2026-11-09T17:00:00Z",
  });
  const failed = withViews(counted, {
    status: "unavailable",
    reason: "WordPress stats are busy",
  });

  expect(failed.views).toEqual({
    status: "unavailable",
    reason: "WordPress stats are busy",
  });
  for (const v of views(failed)) expect(v).toEqual({ status: "unavailable" });
});
