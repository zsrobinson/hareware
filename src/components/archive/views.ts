/*
  The archive's default views, as plain data: the question each answers,
  the table it counts, where its filters start, and how it is shown. Each
  table is a page, and its views are its tabs, in this order. A new default
  is a declaration added here, and nothing else; Copy as view writes one
  from whatever is on screen (ADR 0014).

  The editors' questions are mostly about the last three months; the
  long-run views keep a range where three months would be a sliver.
*/

import type { ChartConfig } from "./chart-config";
import type { FilterState, Preset } from "./filters";
import type { PivotConfig } from "./pivot-config";

/** each table's columns, in the order a new view lists them */
export const COLUMNS = {
  articles: [
    "date",
    "title",
    "section",
    "writer",
    "image",
    "other",
    "words",
    "views",
  ],
  people: [
    "name",
    "contributions",
    "writer",
    "image",
    "other",
    "sections",
    "roles",
    "first",
    "last",
  ],
} as const;

/** what a page counts, and so which page a view is on */
export type Source = keyof typeof COLUMNS;

export type ColumnId<S extends Source = Source> = (typeof COLUMNS)[S][number];

export const COLUMN_NAMES: Record<ColumnId, string> = {
  date: "Published",
  title: "Title",
  section: "Section",
  writer: "Writing",
  image: "Image",
  other: "Other",
  words: "Words",
  views: "Views",
  name: "Name",
  contributions: "Contributions",
  sections: "Sections",
  roles: "Roles",
  first: "First",
  last: "Latest",
};

/** a table's sort: one column, either way */
export type TableSort<S extends Source = Source> = {
  id: ColumnId<S>;
  desc: boolean;
};

/** the fewest contributions someone shown on People has made; 1 is everyone */
export const MINIMUMS = [1, 2, 3, 5, 10] as const;
export type Minimum = (typeof MINIMUMS)[number];

export type TableLayout<S extends Source = Source> = {
  /** which columns, in order */
  columns: readonly ColumnId<S>[];
  /** the sort it opens on; a header changes it and leaves the view as it is */
  sort: TableSort<S>;
} & (S extends "people"
  ? {
      /** People's Show as it opens, which changing leaves the view as it is;
          everyone when left out */
      minimum?: Minimum;
      /** People's rows narrowed to whoever is new: first credited in the range */
      only?: "new";
    }
  : unknown);

/** how a view shows what it counts */
export type Layout<S extends Source = Source> =
  | { type: "table"; table: TableLayout<S> }
  | {
      type: "chart";
      chart: ChartConfig;
      /** the series its legend opens with off */
      hidden?: readonly string[];
    }
  | { type: "pivot"; pivot: PivotConfig };

type ViewOf<S extends Source> = {
  id: string;
  /** its tab */
  label: string;
  /** what heads it, as an editor would put it */
  title: string;
  /** what it answers, shown under its title */
  question: string;
  /** what it counts: articles, or the people credited on them */
  source: S;
  /** the Time filter it opens on */
  range: Exclude<Preset, "custom">;
  /** what else it narrows to as it opens; changing them leaves the view as it is */
  filters?: {
    readonly [K in "sections" | "roles" | "people"]?: Readonly<FilterState[K]>;
  };
  layout: Layout<S>;
};

export type View = { [S in Source]: ViewOf<S> }[Source];

/** views merged into another, whose links open the one they became */
export const RENAMED: Record<string, string> = {
  contributors: "top",
  newcomers: "new",
};

export const VIEWS = [
  {
    id: "all",
    label: "All",
    title: "What we published",
    question: "What have we published, and who made it?",
    source: "articles",
    range: "3m",
    layout: {
      type: "table",
      table: {
        columns: ["date", "title", "section", "writer", "image"],
        sort: { id: "date", desc: true },
      },
    },
  },
  {
    id: "sections",
    label: "Sections",
    title: "Articles in each section",
    question: "What have we published lately, and where?",
    source: "articles",
    range: "3m",
    layout: {
      type: "chart",
      chart: {
        count: "articles",
        by: "section",
        split: "none",
        draw: "stacked",
        values: "number",
        order: "natural",
        top: 25,
        compare: "none",
      },
    },
  },
  {
    id: "section-share",
    label: "Section share",
    title: "Each section's share of the articles",
    question: "What share of the articles is each section's?",
    source: "articles",
    range: "semester",
    layout: {
      type: "pivot",
      pivot: {
        count: "articles",
        rows: "section",
        columns: "none",
        values: "total",
        top: 25,
        compare: "none",
      },
    },
  },
  {
    id: "history",
    label: "History",
    title: "Articles each semester, since the start",
    question: "What has the paper published since the archive began?",
    source: "articles",
    range: "all",
    layout: {
      type: "chart",
      chart: {
        count: "articles",
        by: "semester",
        split: "section",
        draw: "stacked",
        values: "number",
        order: "largest",
        top: 25,
        compare: "none",
      },
    },
  },
  {
    id: "most-read",
    label: "Most read",
    title: "The most read articles",
    question: "Which articles have been read the most?",
    source: "articles",
    range: "semester",
    layout: {
      type: "table",
      table: {
        columns: ["date", "title", "section", "writer", "words", "views"],
        sort: { id: "views", desc: true },
      },
    },
  },
  {
    id: "read-by-section",
    label: "Read by section",
    title: "Views per article, by section",
    question: "Which section's articles are read most, per article?",
    source: "articles",
    range: "semester",
    layout: {
      type: "pivot",
      pivot: {
        count: "views",
        rows: "section",
        columns: "none",
        values: "per-article",
        top: 25,
        compare: "none",
      },
    },
  },
  {
    id: "everyone",
    label: "Everyone",
    title: "Everyone who contributed",
    question: "Who has contributed, and how much?",
    source: "people",
    range: "3m",
    layout: {
      type: "table",
      table: {
        columns: [
          "name",
          "contributions",
          "writer",
          "image",
          "other",
          "first",
          "last",
        ],
        sort: { id: "contributions", desc: true },
      },
    },
  },
  {
    id: "top",
    label: "Top contributors",
    title: "Who did the most, and as what",
    question: "Who has done the most, and what?",
    source: "people",
    range: "semester",
    layout: {
      type: "chart",
      chart: {
        count: "contributions",
        by: "person",
        split: "role",
        draw: "stacked",
        values: "number",
        order: "largest",
        top: 25,
        compare: "none",
      },
    },
  },
  {
    id: "new",
    label: "New people",
    title: "Who joined, and where they started",
    question: "Who made their first contribution, where, and as what?",
    source: "people",
    range: "semester",
    layout: {
      type: "table",
      table: {
        columns: ["name", "first", "sections", "roles", "contributions"],
        sort: { id: "first", desc: true },
        only: "new",
      },
    },
  },
  {
    id: "headcount",
    label: "Headcount",
    title: "People at work each semester",
    question: "How many people has the club had at work, semester to semester?",
    source: "people",
    range: "all",
    layout: {
      type: "chart",
      chart: {
        count: "people",
        by: "semester",
        split: "none",
        draw: "stacked",
        values: "number",
        order: "largest",
        top: 25,
        compare: "none",
      },
    },
  },
  {
    id: "retention",
    label: "Retention",
    title: "Who came back, by semester joined",
    question:
      "Of the people who joined each semester, how many came back each semester after?",
    source: "people",
    range: "all",
    layout: {
      type: "pivot",
      pivot: {
        count: "people",
        rows: "joined",
        columns: "since",
        values: "number",
        top: 25,
        compare: "none",
      },
    },
  },
] as const satisfies readonly View[];
