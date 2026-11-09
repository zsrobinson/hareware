/*
  The archive: every published article with its section and contributors,
  the Sheet applied, and what looks wrong flagged. Pure, so the pages and the
  tests build it the same way; ./load is where the reading happens.
*/

import { ROLES, type Label, type Role } from "./labels";
import { countWords } from "~/lib/get-word-count";
import {
  creditLines,
  creditParagraphs,
  labelOf,
  unrecognisedLines,
} from "./parse";
import { sortSections } from "./sections";
import {
  pairKey,
  same,
  type Ignored,
  type Override,
  type SheetProblem,
  type SheetState,
  type Unscoped,
} from "./sheet";
import type { ArticleViews, ViewsSummary } from "./views";

/** a post as the archive keeps it between reads: its body cut to the paragraphs a credit could be */
export type SourcePost = {
  id: number;
  publishedAt: string;
  link: string;
  title: string;
  categoryIds: number[];
  paragraphs: string[];
  /** `bodyProse()` of the body: the words of its prose, credit lines
      included, and its short paragraphs among them, which the labels may
      make credit lines to take off */
  prose: { words: number; paragraphs: string[] };
};

/** someone counted for a credit, and why they count as who they do */
export type Contributor = {
  name: string;
  /** the name as printed, when the Sheet says it is someone else */
  byline: string | null;
  /** where the name came from: the article as printed, or a Sheet row for it */
  source: "printed" | "article";
};

export type Credit = {
  role: Role;
  /** "Article by"; empty for someone only the Sheet credits */
  label: string;
  /** the line as the article prints it; empty for someone only the Sheet credits */
  printed: string;
  /** the names the line prints, before the Sheet */
  bylines: string[];
  contributors: Contributor[];
};

export const PROBLEM_KINDS = {
  "no-writer": "No writing credit",
  "no-image": "No image credit",
  unrecognised: "Unknown credit label",
  "no-colon": "Credit line without a colon",
  unparsed: "Credit line with no name",
  "odd-name": "Name reads like a sentence",
  "pen-name-again": "Pen name used before",
  uncategorized: "No section",
} as const;
export type ProblemKind = keyof typeof PROBLEM_KINDS;

export type ArchiveArticle = {
  id: number;
  title: string;
  link: string;
  publishedAt: string;
  section: string;
  /** the words of its prose, less its credit lines (`bodyWords()`) */
  words: number;
  /** what Jetpack counted, merged on by `withViews()` once it is read */
  views: ArticleViews;
  credits: Credit[];
  /* `label` is what an unknown credit line starts with, to add as a label */
  problems: { kind: ProblemKind; detail: string; label?: string }[];
  /** the Sheet's note when someone marked this article fine as it is */
  ignored?: string;
};

/** two names that are probably one person spelled two ways */
export type SimilarNames = {
  names: [string, string];
  counts: [number, number];
  /** the Sheet's note when someone said they are different people */
  ignored?: string;
};

/** a Sheet row, with the title of the article it is for */
export type ArticleOverride = Override & { title: string | null };

/** someone a byline was, and on which articles */
export type PastUse = { name: string; postIds: number[] };

/**
 * a byline's rows with no post id, which count nowhere (ADR 0013), with the
 * articles they could be set on: those printing the byline, in the rows'
 * roles, that have no row for it of their own
 */
export type UnscopedPenName = {
  byline: string;
  /** the rows' one role, or null for any or a mix */
  role: Role | null;
  realNames: string[];
  rows: Unscoped[];
  targets: { postId: number; title: string; roles: Role[] }[];
};

export type SheetSummary =
  | { status: "unconfigured"; missing: string[] }
  | { status: "failed"; reason: string }
  | {
      status: "read";
      /** tabs the Sheet does not have yet; HareWare adds them on the first save */
      missingTabs: string[];
      customLabels: boolean;
      /** set by the loader, which knows the id; only signed-in pages see it */
      url?: string;
    };

export type Archive = {
  articles: ArchiveArticle[];
  sections: string[];
  labels: Label[];
  overrides: ArticleOverride[];
  /** by `bylineKey`: who each byline has been, most often and latest first;
      `pastUsesOn` leaves out the article being looked at */
  pastUses: Record<string, PastUse[]>;
  unscoped: UnscopedPenName[];
  /** pair keys of similar names marked different people, with their notes;
      `similarNames()` reads it, on the one page that shows the pairs */
  differentPeople: Record<string, string>;
  sheet: SheetSummary;
  sheetProblems: SheetProblem[];
  /** whether views were read; each article's `views` says what they were */
  views: ViewsSummary;
  /** when WordPress was read, which may be before this archive was built */
  fetchedAt: string;
};

const UNCATEGORIZED = "Uncategorized";

/* past these a "name" is more likely a sentence the parser swallowed */
const MAX_NAME_WORDS = 5;
const MAX_NAME_LENGTH = 40;

export function buildArchive(input: {
  posts: SourcePost[];
  categories: Map<number, string>;
  sheet: SheetState;
  labels: Label[];
  fetchedAt: string;
}): Archive {
  const { posts, categories, sheet, labels } = input;
  const overrides = sheet.status === "read" ? sheet.overrides : [];
  const ignoredRows = sheet.status === "read" ? sheet.ignored : [];
  const sheetProblems = sheet.status === "read" ? [...sheet.problems] : [];

  const byPost = new Map<number, Override[]>();
  for (const o of overrides)
    byPost.set(o.postId, [...(byPost.get(o.postId) ?? []), o]);
  const publishedAt = new Map(posts.map((post) => [post.id, post.publishedAt]));
  const answered = usesOf(overrides, publishedAt);

  const ignoredPosts = new Map(
    ignoredRows
      .filter((i): i is Ignored & { postId: number } => i.postId !== null)
      .map((i) => [i.postId, i.note || "marked not a problem"]),
  );

  const titles = new Map(posts.map((post) => [post.id, post.title]));
  for (const o of overrides)
    if (!titles.has(o.postId))
      sheetProblems.push({
        tab: "Overrides",
        row: 0,
        message: `no published article has post id ${o.postId}`,
      });

  const articles = posts.map((post): ArchiveArticle => {
    const section =
      post.categoryIds.map((id) => categories.get(id)).find(Boolean) ??
      UNCATEGORIZED;
    const credits = resolve(
      creditLines(post.paragraphs, labels).map((line) => ({
        role: line.role,
        label: line.label,
        printed: line.printed,
        bylines: line.names,
      })),
      byPost.get(post.id) ?? [],
    );

    return {
      id: post.id,
      title: post.title,
      link: post.link,
      publishedAt: post.publishedAt,
      section,
      words:
        post.prose.words -
        countWords(creditParagraphs(post.prose.paragraphs, labels).join(" ")),
      views: { status: "unavailable" },
      credits,
      problems: problemsOf(
        post.id,
        section,
        credits,
        unrecognisedLines(post.paragraphs, labels),
        answered,
        post.publishedAt,
      ),
      ...(ignoredPosts.has(post.id)
        ? { ignored: ignoredPosts.get(post.id) }
        : {}),
    };
  });

  return {
    articles,
    sections: sortSections(new Set(articles.map((a) => a.section))),
    labels,
    overrides: overrides.map((o) => ({
      ...o,
      title: titles.get(o.postId) ?? null,
    })),
    ...withUnscoped(
      answered,
      sheet.status === "read" ? sheet.unscoped : [],
      articles,
      byPost,
    ),
    differentPeople: Object.fromEntries(
      ignoredRows
        .filter((i) => i.names)
        .map((i) => [i.names!, i.note || "different people"]),
    ),
    sheet: summarize(sheet),
    sheetProblems,
    views: { status: "reading" },
    fetchedAt: input.fetchedAt,
  };
}

/** a byline as the archive compares them: case and spacing do not count */
export const bylineKey = (byline: string) =>
  byline.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * Who each printed name counts as: this article's row for the byline in this
 * role, or else the name as printed. Rows for this article with no byline add
 * people the article does not print.
 */
function resolve(
  lines: Omit<Credit, "contributors">[],
  articleRows: Override[],
): Credit[] {
  const credits: Credit[] = lines.map((line) => {
    const local = articleRows.filter(
      (o) => o.role === null || o.role === line.role,
    );
    const contributors = line.bylines.flatMap((byline): Contributor[] => {
      const here = local.filter((o) => o.byline && same(o.byline, byline));
      if (here.length > 0)
        return here.map((o) => ({
          name: o.realName,
          byline,
          source: "article",
        }));
      return [{ name: byline, byline: null, source: "printed" }];
    });
    return { ...line, contributors };
  });

  /* people the article does not print, added by a row for this article */
  for (const o of articleRows.filter((o) => !o.byline && o.role)) {
    const target = credits.find((c) => c.role === o.role);
    const added: Contributor = {
      name: o.realName,
      byline: null,
      source: "article",
    };
    if (target) target.contributors.push(added);
    else
      credits.push({
        role: o.role!,
        label: "",
        printed: "",
        bylines: [],
        contributors: [added],
      });
  }

  return credits;
}

function problemsOf(
  postId: number,
  section: string,
  credits: Credit[],
  unrecognised: string[],
  answered: Map<string, Use[]>,
  publishedAt: string,
): ArchiveArticle["problems"] {
  const problems: ArchiveArticle["problems"] = [];
  const has = (role: Role) =>
    credits.some((c) => c.role === role && c.contributors.length > 0);

  /* a label only reads a line with a colon after it, so a line without one
     is fixed in WordPress, not by adding its label */
  for (const line of unrecognised) {
    const label = labelOf(line);
    problems.push(
      label && line.slice(label.length).trimStart().startsWith(":")
        ? { kind: "unrecognised", detail: line, label }
        : { kind: "no-colon", detail: line },
    );
  }
  if (!has("writer"))
    problems.push({ kind: "no-writer", detail: "no “Article by:” line" });
  if (!has("image"))
    problems.push({ kind: "no-image", detail: "no “Image Credits:” line" });

  for (const credit of credits) {
    if (credit.printed && credit.bylines.length === 0)
      problems.push({
        kind: "unparsed",
        detail: `${credit.label}: ${credit.printed}`,
      });
    for (const byline of credit.bylines)
      if (
        byline.split(/\s+/).length > MAX_NAME_WORDS ||
        byline.length > MAX_NAME_LENGTH
      )
        problems.push({ kind: "odd-name", detail: byline });
  }

  /* a byline that was someone else on another article, printed here with no
     answer: most likely the same pen name again. Only after it was first a
     pen name: a real person's earlier articles are not the question */
  const flagged = new Set<string>();
  for (const credit of credits)
    for (const c of credit.contributors) {
      const key = bylineKey(c.name);
      if (c.source !== "printed" || flagged.has(key)) continue;
      const elsewhere = (answered.get(key) ?? []).filter(
        (use) => use.postId !== postId,
      );
      if (!elsewhere.some((use) => use.at < publishedAt)) continue;
      flagged.add(key);
      problems.push({
        kind: "pen-name-again",
        detail: `${c.name} was ${usesInWords(countUses(elsewhere))}`,
      });
    }

  if (section === UNCATEGORIZED)
    problems.push({ kind: "uncategorized", detail: "no category set" });

  return problems;
}

/* one row naming who a byline was on one published article */
type Use = { postId: number; name: string; at: string };

function usesOf(overrides: Override[], publishedAt: Map<number, string>) {
  const uses = new Map<string, Use[]>();
  for (const o of overrides) {
    const at = publishedAt.get(o.postId);
    if (!o.byline || !at || same(o.byline, o.realName)) continue;
    const key = bylineKey(o.byline);
    const list = uses.get(key) ?? [];
    if (!list.some((u) => u.postId === o.postId && same(u.name, o.realName)))
      list.push({ postId: o.postId, name: o.realName, at });
    uses.set(key, list);
  }
  return uses;
}

/** each person a byline was, on the most articles first, then most recently */
function countUses(uses: Use[]): PastUse[] {
  const people = new Map<string, { use: PastUse; latest: string }>();
  for (const u of uses) {
    const key = u.name.toLowerCase();
    const entry = people.get(key) ?? {
      use: { name: u.name, postIds: [] },
      latest: "",
    };
    if (!entry.use.postIds.includes(u.postId)) entry.use.postIds.push(u.postId);
    if (u.at > entry.latest) entry.latest = u.at;
    people.set(key, entry);
  }
  return [...people.values()]
    .sort(
      (a, b) =>
        b.use.postIds.length - a.use.postIds.length ||
        b.latest.localeCompare(a.latest),
    )
    .map(({ use }) => use);
}

/** "Riley Real on 2 articles, Sam Second on 1" */
function usesInWords(uses: PastUse[]) {
  return uses
    .map(
      (u, i) =>
        `${u.name} on ${u.postIds.length}${i === 0 ? (u.postIds.length === 1 ? " article" : " articles") : ""}`,
    )
    .join(", ");
}

/** who a byline was on articles other than this one */
export function pastUsesOn(archive: Archive, byline: string, postId: number) {
  return (archive.pastUses[bylineKey(byline)] ?? [])
    .map((u) => ({ ...u, postIds: u.postIds.filter((id) => id !== postId) }))
    .filter((u) => u.postIds.length > 0);
}

/*
  Rows with no post id still say who a byline was, so they are offered as
  suggestions, on the articles that print it, until they are set or removed.
  They never credit anyone or raise a problem by themselves.
*/
function withUnscoped(
  answered: Map<string, Use[]>,
  rows: Unscoped[],
  articles: ArchiveArticle[],
  byPost: Map<number, Override[]>,
) {
  const suggested = new Map(answered);
  const grouped = new Map<string, UnscopedPenName>();

  for (const row of rows) {
    const key = bylineKey(row.byline);
    const printing = articles.filter((a) =>
      a.credits.some((c) => c.bylines.some((b) => same(b, row.byline))),
    );
    suggested.set(key, [
      ...(suggested.get(key) ?? []),
      ...printing.map((a) => ({
        postId: a.id,
        name: row.realName,
        at: a.publishedAt,
      })),
    ]);

    const entry = grouped.get(key) ?? {
      byline: row.byline,
      role: row.role,
      realNames: [],
      rows: [],
      targets: [],
    };
    entry.rows.push(row);
    if (entry.role !== row.role) entry.role = null;
    if (!entry.realNames.some((n) => same(n, row.realName)))
      entry.realNames.push(row.realName);
    /* the articles without a row of their own, in the roles a row applies to */
    entry.targets = printing
      .filter(
        (a) =>
          !(byPost.get(a.id) ?? []).some(
            (o) => o.byline && same(o.byline, row.byline),
          ),
      )
      .map((a) => ({
        postId: a.id,
        title: a.title,
        roles: ROLES.filter(
          (r) =>
            entry.rows.some((x) => x.role === null || x.role === r) &&
            a.credits.some(
              (c) => c.role === r && c.bylines.some((b) => same(b, row.byline)),
            ),
        ),
      }))
      .filter((t) => t.roles.length > 0);
    grouped.set(key, entry);
  }

  return {
    pastUses: Object.fromEntries(
      [...suggested].map(([key, uses]) => [key, countUses(uses)]),
    ),
    unscoped: [...grouped.values()],
  };
}

/* ---- names that are probably the same person ------------------------------ */

const fold = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N} ]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

function distance(a: string, b: string, limit: number) {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        previous[j]! + 1,
        current[j - 1]! + 1,
        previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      best = Math.min(best, current[j]!);
    }
    if (best > limit) return limit + 1;
    previous = current;
  }
  return previous[b.length]!;
}

/**
 * Pairs of names a letter or two apart, or equal once accents and punctuation
 * go, which may be one person; spelling is fixed in WordPress, so these are
 * only pointed at. Every name is
 * compared with every other, which is most of the cost of reading the archive,
 * so only the page that shows them asks; names are compared only with those
 * close enough in length to be within the distance at all.
 */
export function similarNames(archive: Archive): SimilarNames[] {
  const counts = new Map<string, number>();
  for (const article of archive.articles)
    for (const credit of article.credits)
      for (const c of credit.contributors)
        counts.set(c.name, (counts.get(c.name) ?? 0) + 1);

  const named = [...counts.keys()]
    .map((name) => ({ name, folded: fold(name) }))
    .filter(({ folded }) => folded.length >= 6)
    .sort((x, y) => x.folded.length - y.folded.length);
  const pairs: SimilarNames[] = [];

  for (let i = 0; i < named.length; i++)
    for (let j = i + 1; j < named.length; j++) {
      const a = named[i]!.folded;
      const b = named[j]!.folded;
      /* sorted by length, so every name after this one is longer still */
      if (b.length - a.length > 2) break;
      if (a !== b && distance(a, b, 2) > (a.length >= 10 ? 2 : 1)) continue;
      const pair = [named[i]!.name, named[j]!.name].sort() as [string, string];
      const note = archive.differentPeople[pairKey(pair)];
      pairs.push({
        names: pair,
        counts: [counts.get(pair[0])!, counts.get(pair[1])!],
        ...(note ? { ignored: note } : {}),
      });
    }

  return pairs.sort(
    (x, y) => y.counts[0] + y.counts[1] - (x.counts[0] + x.counts[1]),
  );
}

function summarize(sheet: SheetState): SheetSummary {
  if (sheet.status !== "read") return sheet;
  return {
    status: "read",
    missingTabs: Object.entries(sheet.tabs)
      .filter(([, present]) => !present)
      .map(([tab]) => tab[0]!.toUpperCase() + tab.slice(1)),
    customLabels: sheet.labels !== null,
  };
}
