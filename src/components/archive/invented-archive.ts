/*
  An invented archive for the tests of what a chart or a pivot counts, and
  what a table on a slice's filters lists. Names are invented: what the
  Sheet maps is private.
*/

import type { ArchiveArticle, Credit } from "~/lib/credits/archive";
import { contributionsOn } from "~/lib/credits/person";
import { applyFilters, isCounted, people } from "~/lib/credits/stats";
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
  words: 0,
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
