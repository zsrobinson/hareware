/*
  An invented archive for the tests of what a chart or a pivot counts, and
  what a table on a slice's filters lists. Names are invented: what the
  Sheet maps is private.
*/

import type { ArchiveArticle, Credit } from "~/lib/credits/archive";
import { contributionsOn } from "~/lib/credits/person";
import {
  applyFilters,
  isCounted,
  people,
  type Measure,
  type Member,
} from "~/lib/credits/stats";
import { toFilters, type FilterState } from "./filters";

export const credit = (role: Credit["role"], names: string[]): Credit => ({
  role,
  label: role,
  printed: names.join(" and "),
  bylines: names,
  contributors: names.map((name) => ({
    name,
    byline: null,
    source: "printed",
  })),
});

/* views no read could give, and an article read by nobody: neither is zero
   to a count of views, and only the second is counted */
const UNREAD = [4, 9];
const UNOPENED = 7;

export const post = (
  id: number,
  date: string,
  section: string,
  credits: Credit[],
): ArchiveArticle => ({
  id,
  title: `Invented headline ${id}`,
  link: "",
  publishedAt: `${date}T16:00:00Z`,
  section,
  /* each its own, so a sum names which articles it added */
  words: 100 + id * 53,
  views: UNREAD.includes(id)
    ? { status: "unavailable" }
    : id === UNOPENED
      ? { status: "counted", total: 0, byMonth: {} }
      : {
          status: "counted",
          total: id * 37,
          byMonth: { [date.slice(0, 7)]: id * 37 },
        },
  credits,
  problems: [],
});

/* invented names; a dozen, so a top ten leaves people out */
export const archive: ArchiveArticle[] = [
  post(1, "2025-09-04", "News", [
    credit("writer", ["Ada Example"]),
    credit("image", ["Bo Sample"]),
  ]),
  post(2, "2025-10-12", "Features", [
    credit("writer", ["Ada Example", "Cy Placeholder"]),
    /* the same person in two roles on one article: two contributions */
    credit("image", ["Ada Example"]),
  ]),
  post(3, "2025-11-20", "Sports", [credit("writer", ["Dee Invented"])]),
  post(4, "2026-01-15", "News", [
    credit("writer", ["Eli Madeup", "Fay Fictive"]),
    credit("other", ["Gus Notreal"]),
  ]),
  /* nobody credited */
  post(5, "2026-02-02", "Features", []),
  post(6, "2026-03-09", "Sports", [
    credit("writer", ["Ada Example"]),
    credit("image", ["Hal Pretend"]),
  ]),
  post(7, "2026-04-21", "News", [
    credit("writer", ["Ivy Imagined"]),
    credit("image", ["Bo Sample", "Jo Standin"]),
  ]),
  post(8, "2026-09-03", "Features", [
    credit("writer", ["Kit Dummy", "Lu Fakename"]),
    credit("image", ["Cy Placeholder"]),
  ]),
  post(9, "2026-10-08", "News", [
    credit("writer", ["Ada Example"]),
    credit("image", ["Mo Newname"]),
  ]),
  post(10, "2026-10-30", "Sports", [
    credit("writer", ["Kit Dummy"]),
    credit("other", ["Gus Notreal"]),
  ]),
];

/* what a list's number should be, worked out afresh rather than through
   `amountOf`: how many, or for words and views the sum of its articles',
   each once, leaving out those whose views are unavailable */
export function summed(measure: Measure, members: readonly Member[]) {
  if (measure !== "words" && measure !== "views") return members.length;
  const articles = new Map(
    members.flatMap((m) => m.units.map((u) => [u.article.id, u.article])),
  );
  let sum = 0;
  for (const article of articles.values())
    if (measure === "words") sum += article.words;
    else if (article.views.status === "counted") sum += article.views.total;
  return sum;
}

/* the articles in such a sum: all of a list's for words, and for views
   those whose views were read */
export function summedOver(measure: Measure, members: readonly Member[]) {
  const articles = new Map(
    members.flatMap((m) => m.units.map((u) => [u.article.id, u.article])),
  );
  return [...articles.values()].filter(
    (article) => measure !== "views" || article.views.status === "counted",
  ).length;
}

/* where an article can be in two cells of a sum of words or views: under
   two people, or two roles */
export const overlaps = (dimension: string) =>
  dimension === "person" || dimension === "role";

/* what a table on these filters lists: its articles, and the contributions
   on them the filters count */
export function listed(state: FilterState, from = archive) {
  const filters = toFilters(state);
  const articles = applyFilters(from, filters);
  return {
    articles: articles.map((a) => a.id).sort((a, b) => a - b),
    contributions: articles
      .flatMap((a) => contributionsOn(a).filter(isCounted(filters)))
      .map((c) => `${c.article.id} ${c.role} ${c.person}`)
      .sort(),
  };
}

/* who People lists on these filters, and what it counts of each */
export function onPeople(state: FilterState, articles = archive) {
  const filters = toFilters(state);
  return people(
    applyFilters(articles, { ...filters, search: undefined }),
    filters,
    articles,
  );
}
