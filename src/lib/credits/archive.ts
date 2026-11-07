/*
  The archive: every published article with its section and contributors,
  the Sheet applied, and what looks wrong flagged. Pure, so the pages and the
  tests build it the same way; ./load is where the reading happens.
*/

import type { Label, Role } from "./labels";
import { creditLines, labelOf, unrecognisedLines } from "./parse";
import {
  pairKey,
  same,
  type Ignored,
  type Override,
  type SheetProblem,
  type SheetState,
} from "./sheet";

/** a post as the archive keeps it between reads: its body cut to the paragraphs a credit could be */
export type SourcePost = {
  id: number;
  publishedAt: string;
  link: string;
  title: string;
  categoryIds: number[];
  paragraphs: string[];
};

/** someone counted for a credit, and why they count as who they do */
export type Contributor = {
  name: string;
  /** the name as printed, when the Sheet says it is someone else */
  byline: string | null;
  /** where the name came from: the article, a Sheet row for every article, or one for this article */
  source: "printed" | "everywhere" | "article";
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
  uncategorized: "No section",
} as const;
export type ProblemKind = keyof typeof PROBLEM_KINDS;

export type ArchiveArticle = {
  id: number;
  title: string;
  link: string;
  publishedAt: string;
  section: string;
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

/** a pen name the Sheet resolves on every article */
export type PenName = { byline: string; realName: string[]; articles: number };

/** a Sheet row that holds for one article only */
export type ArticleOverride = Override & { title: string | null };

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
  penNames: PenName[];
  articleOverrides: ArticleOverride[];
  /** pair keys of similar names marked different people, with their notes;
      `similarNames()` reads it, on the one page that shows the pairs */
  differentPeople: Record<string, string>;
  sheet: SheetSummary;
  sheetProblems: SheetProblem[];
  /** when WordPress was read, which may be before this archive was built */
  fetchedAt: string;
};

export const UNCATEGORIZED = "Uncategorized";

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

  const everywhere = overrides.filter((o) => o.postId === null);
  const byPost = new Map<number, Override[]>();
  for (const o of overrides)
    if (o.postId !== null)
      byPost.set(o.postId, [...(byPost.get(o.postId) ?? []), o]);

  const ignoredPosts = new Map(
    ignoredRows
      .filter((i): i is Ignored & { postId: number } => i.postId !== null)
      .map((i) => [i.postId, i.note || "marked not a problem"]),
  );

  const titles = new Map(posts.map((post) => [post.id, post.title]));
  for (const o of overrides)
    if (o.postId !== null && !titles.has(o.postId))
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
      everywhere,
    );

    return {
      id: post.id,
      title: post.title,
      link: post.link,
      publishedAt: post.publishedAt,
      section,
      credits,
      problems: problemsOf(
        section,
        credits,
        unrecognisedLines(post.paragraphs, labels),
      ),
      ...(ignoredPosts.has(post.id)
        ? { ignored: ignoredPosts.get(post.id) }
        : {}),
    };
  });

  return {
    articles,
    sections: [...new Set(articles.map((a) => a.section))].sort(),
    labels,
    penNames: penNames(everywhere, articles),
    articleOverrides: overrides
      .filter((o) => o.postId !== null)
      .map((o) => ({ ...o, title: titles.get(o.postId!) ?? null })),
    differentPeople: Object.fromEntries(
      ignoredRows
        .filter((i) => i.names)
        .map((i) => [i.names!, i.note || "different people"]),
    ),
    sheet: summarize(sheet),
    sheetProblems,
    fetchedAt: input.fetchedAt,
  };
}

/**
 * Who each printed name counts as: a row for this article and role first,
 * then a row for every article, then the name as printed. Rows for this
 * article with no byline add people the article does not print.
 */
function resolve(
  lines: Omit<Credit, "contributors">[],
  articleRows: Override[],
  everywhere: Override[],
): Credit[] {
  const forRole = (rows: Override[], role: Role) =>
    rows.filter((o) => o.role === null || o.role === role);

  const credits: Credit[] = lines.map((line) => {
    const local = forRole(articleRows, line.role);
    const global = forRole(everywhere, line.role);
    const contributors = line.bylines.flatMap((byline): Contributor[] => {
      const here = local.filter((o) => o.byline && same(o.byline, byline));
      if (here.length > 0)
        return here.map((o) => ({
          name: o.realName,
          byline,
          source: "article",
        }));
      const anywhere = global.filter((o) => o.byline && same(o.byline, byline));
      if (anywhere.length > 0)
        return anywhere.map((o) => ({
          name: o.realName,
          byline,
          source: "everywhere",
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
  section: string,
  credits: Credit[],
  unrecognised: string[],
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

  if (section === UNCATEGORIZED)
    problems.push({ kind: "uncategorized", detail: "no category set" });

  return problems;
}

function penNames(everywhere: Override[], articles: ArchiveArticle[]) {
  const grouped = new Map<string, PenName>();
  for (const o of everywhere) {
    const key = o.byline!.toLowerCase();
    const entry = grouped.get(key) ?? {
      byline: o.byline!,
      realName: [],
      articles: 0,
    };
    entry.realName.push(o.realName);
    grouped.set(key, entry);
  }
  for (const entry of grouped.values())
    entry.articles = articles.filter((a) =>
      a.credits.some((c) => c.bylines.some((b) => same(b, entry.byline))),
    ).length;
  return [...grouped.values()].sort((a, b) => b.articles - a.articles);
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
 * Pairs of counted names one or two letters apart ("Clare Dombroksy",
 * "Clare Dombrosky"), or equal once accents and punctuation go ("Mat H." and
 * "Mat H"). Spelling is fixed in WordPress, so these are only pointed at.
 */
/**
 * Pairs of names a letter or two apart, which may be one person. Every name is
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
