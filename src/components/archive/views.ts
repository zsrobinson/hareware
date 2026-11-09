/*
  The archive's default views, as plain data: the question each answers,
  the table it counts, where its filters start, and how it is drawn. A new
  default is a declaration added here, and nothing else.

  The editors' questions are mostly about the last three months; the
  long-run views keep a range where three months would be a sliver.
*/

import type { ChartConfig } from "./chart-config";
import type { FilterState, Preset } from "./filters";

/** how a view shows what it counts */
export type Layout = { type: "chart"; chart: ChartConfig };

export type View = {
  id: string;
  label: string;
  /** what it answers, shown under it */
  question: string;
  /** what it counts: articles, or the people credited on them */
  source: "articles" | "people";
  /** the Time filter it opens on */
  range: Preset;
  /** what else it narrows to as it opens; changing them leaves the view as it is */
  filters?: {
    readonly [K in "sections" | "roles" | "people"]?: Readonly<FilterState[K]>;
  };
  layout: Layout;
};

export const VIEWS = [
  {
    id: "sections",
    label: "Sections",
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
      },
    },
  },
  {
    id: "contributors",
    label: "Contributors",
    question: "Who has been doing the work, and what work?",
    source: "people",
    range: "3m",
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
      },
    },
  },
  {
    id: "newcomers",
    label: "Newcomers",
    question: "Who joined lately, where did they start, and as what?",
    source: "people",
    range: "3m",
    layout: {
      type: "chart",
      chart: {
        count: "newcomers",
        by: "section",
        split: "role",
        draw: "stacked",
        values: "number",
        order: "natural",
        top: 25,
      },
    },
  },
  {
    id: "headcount",
    label: "Headcount",
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
      },
    },
  },
  {
    id: "history",
    label: "History",
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
      },
    },
  },
] as const satisfies readonly View[];
