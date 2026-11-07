/*
  The archive: every published post with its section and credits, the Sheet's
  overrides applied, and what looks wrong flagged. Pure, so the pages and the
  tests build it the same way; ./load is where the reading happens.
*/

import { creditLines } from "./parse";
import type { Label, Role } from "./labels";
import type { Override, SheetProblem, SheetState } from "./sheet";

/** a post as the archive keeps it between reads: its body cut to the paragraphs a credit could be */
export type SourcePost = {
  id: number;
  publishedAt: string;
  link: string;
  title: string;
  categoryIds: number[];
  paragraphs: string[];
};

export type Credit = {
  role: Role;
  /** "Article by"; "Sheet" for a credit only the Sheet gives */
  label: string;
  /** as the post prints it; empty for a credit only the Sheet gives */
  printed: string;
  /** who is counted: the Sheet's names when it has rows for this, else `parsed` */
  names: string[];
  parsed: string[];
  overridden: boolean;
};

export const PROBLEM_KINDS = {
  "no-writer": "No writing credit",
  "no-image": "No image credit",
  unparsed: "Credit with no names",
  "odd-name": "Name looks wrong",
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
  problems: { kind: ProblemKind; detail: string }[];
  /** the Sheet's note when somebody marked this post fine as it is */
  ignored?: string;
};

export type SheetSummary =
  | { status: "unconfigured"; missing: string[] }
  | { status: "failed"; reason: string }
  | {
      status: "read";
      overrides: number;
      customLabels: boolean;
      /** set by the loader, which knows the id; only signed-in pages see it */
      url?: string;
    };

export type Archive = {
  articles: ArchiveArticle[];
  sections: string[];
  labels: Label[];
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
  const sheetProblems = sheet.status === "read" ? [...sheet.problems] : [];

  const ignored = new Map(
    (sheet.status === "read" ? sheet.ignored : []).map((row) => [
      row.postId,
      row.note || "marked fine",
    ]),
  );

  const byPost = new Map<number, Override[]>();
  for (const override of overrides) {
    byPost.set(override.postId, [
      ...(byPost.get(override.postId) ?? []),
      override,
    ]);
  }

  const known = new Set(posts.map((post) => post.id));
  for (const override of overrides) {
    if (!known.has(override.postId))
      sheetProblems.push({
        tab: "Overrides",
        row: override.row,
        message: `no published post has id ${override.postId}`,
      });
  }

  const articles = posts.map((post) => {
    const section =
      post.categoryIds.map((id) => categories.get(id)).find(Boolean) ??
      UNCATEGORIZED;
    const credits = applyOverrides(
      creditLines(post.paragraphs, labels).map((line): Credit => ({
        role: line.role,
        label: line.label,
        printed: line.printed,
        names: line.names,
        parsed: line.names,
        overridden: false,
      })),
      byPost.get(post.id) ?? [],
    );

    return {
      id: post.id,
      title: post.title,
      link: post.link,
      publishedAt: post.publishedAt,
      section,
      credits,
      problems: problemsOf(section, credits),
      ...(ignored.has(post.id) ? { ignored: ignored.get(post.id) } : {}),
    };
  });

  const sections = [
    ...new Set(articles.map((article) => article.section)),
  ].sort();

  return {
    articles,
    sections,
    labels,
    sheet: summarize(sheet),
    sheetProblems,
    fetchedAt: input.fetchedAt,
  };
}

/**
 * A role with Sheet rows is credited to those rows: the first printed line of
 * that role takes their names and any further lines of it count nobody, so a
 * person is never counted twice for one post.
 */
function applyOverrides(credits: Credit[], overrides: Override[]): Credit[] {
  if (overrides.length === 0) return credits;

  const result = [...credits];
  const roles = [...new Set(overrides.map((override) => override.role))];

  for (const role of roles) {
    const realNames = overrides
      .filter((override) => override.role === role)
      .map((override) => override.realName);
    const first = result.findIndex((credit) => credit.role === role);

    if (first === -1) {
      result.push({
        role,
        label: "Sheet",
        printed: "",
        names: realNames,
        parsed: [],
        overridden: true,
      });
      continue;
    }

    result.forEach((credit, index) => {
      if (credit.role !== role) return;
      result[index] = {
        ...credit,
        overridden: true,
        names: index === first ? realNames : [],
      };
    });
  }

  return result;
}

function problemsOf(
  section: string,
  credits: Credit[],
): ArchiveArticle["problems"] {
  const problems: ArchiveArticle["problems"] = [];
  const has = (role: Role) => credits.some((credit) => credit.role === role);

  if (!has("writer"))
    problems.push({
      kind: "no-writer",
      detail: "no paragraph starts with a writing label",
    });
  if (!has("image"))
    problems.push({
      kind: "no-image",
      detail: "no paragraph starts with an image label",
    });

  for (const credit of credits) {
    if (credit.names.length === 0 && !credit.overridden)
      problems.push({
        kind: "unparsed",
        detail: `${credit.label}: ${credit.printed}`,
      });

    for (const name of credit.names) {
      if (
        name.split(/\s+/).length > MAX_NAME_WORDS ||
        name.length > MAX_NAME_LENGTH
      )
        problems.push({ kind: "odd-name", detail: name });
    }
  }

  if (section === UNCATEGORIZED)
    problems.push({ kind: "uncategorized", detail: "the post has no section" });

  return problems;
}

function summarize(sheet: SheetState): SheetSummary {
  if (sheet.status !== "read") return sheet;
  return {
    status: "read",
    overrides: sheet.overrides.length,
    customLabels: sheet.labels !== null,
  };
}
