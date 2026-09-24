/*
  An intended change as one Notion PATCH body plus before/after values. Pure.
  Each property type has its own shape: Notion rejects `select` on a `status`
  with a 400 that reads like a bad id, and ignores an unknown property name.
*/

import { plainText } from "~/lib/services/notion/client";
import { notSharing, type Schema } from "./choices";
import { ARTICLE_PROPERTIES } from "./config";
import { optionName, propertyOf, relationIds, type ArticlePage } from "./page";

export type PropertyKey = keyof typeof ARTICLE_PROPERTIES;

export type PropertyValue = Record<string, unknown>;

export type PatchBody = { properties: Record<string, PropertyValue> };

/** one intended change, per property so a value cannot reach the wrong type */
export type Intent =
  | { property: "headline"; text: string }
  | { property: "status" | "imageStatus"; option: string }
  | { property: "section"; option: string }
  | { property: "authorByline" | "imageByline"; text: string | null }
  | { property: "publicationDate"; date: string | null }
  | { property: "author" | "imageCrew"; ids: string[] };

/** which pair of properties a credit writes; see ADR 0004 */
export type Credit = {
  credit: "author" | "image";
  /** the printed name, always filled */
  byline: string;
  memberIds: string[];
};

/**
 * A value before and after, so the logged Invocation can undo it (ADR 0009).
 */
export type ChangeValue = string | string[] | null;
export type ArticleChange = {
  property: PropertyKey;
  before: ChangeValue;
  after: ChangeValue;
  member?: { id: string; name: string };
};
export type Plan = PatchBody & { changes: ArticleChange[] };

export type PlanResult =
  { status: "planned"; plan: Plan } | { status: "refused"; reason: string };

/* ---- the value builders ------------------------------------------------- */

function titleValue(text: string): PropertyValue {
  return { title: [{ text: { content: text } }] };
}

/** `null` clears it — a rich_text is emptied with `[]`, never with `null` */
function richTextValue(text: string | null): PropertyValue {
  return { rich_text: text === null ? [] : [{ text: { content: text } }] };
}

function statusValue(name: string): PropertyValue {
  return { status: { name } };
}

function selectValue(name: string): PropertyValue {
  return { select: { name } };
}

/** `null` clears it — a date is emptied with `null`, never with `{}` or `""` */
function dateValue(start: string | null): PropertyValue {
  return { date: start === null ? null : { start } };
}

/** the whole list, replaced */
function relationValue(ids: string[]): PropertyValue {
  return { relation: ids.map((id) => ({ id })) };
}

/* ---- reading what is there now ------------------------------------------ */

/** a property's value, for planning, confirmation and logging */
export function current(page: ArticlePage, property: PropertyKey): ChangeValue {
  const value = propertyOf(page, property);
  switch (ARTICLE_PROPERTIES[property].type) {
    case "title":
      return plainText(value?.title).trim() || null;
    case "rich_text":
      return plainText(value?.rich_text).trim() || null;
    case "date":
      return value?.date?.start ?? null;
    case "relation":
      return relationIds(value);
    default:
      return optionName(value);
  }
}

export function sameValue(a: ChangeValue, b: ChangeValue): boolean {
  return Array.isArray(a) && Array.isArray(b)
    ? a.length === b.length && a.every((id) => b.includes(id))
    : a === b;
}

/** log text, keeping relation ids so an edit can be undone */
export function changesSummary(changes: ArticleChange[]): string {
  const said = (value: ChangeValue) =>
    Array.isArray(value)
      ? value.join(", ") || "nothing"
      : value === null || value === ""
        ? "nothing"
        : `"${value}"`;
  return changes
    .map(
      ({ property, before, after }) =>
        `${ARTICLE_PROPERTIES[property].name}: ${said(before)} → ${said(after)}`,
    )
    .join("; ");
}

function intended(intent: Intent): {
  value: PropertyValue;
  after: ChangeValue;
} {
  switch (intent.property) {
    case "headline":
      return { value: titleValue(intent.text), after: intent.text };
    case "status":
    case "imageStatus":
      return { value: statusValue(intent.option), after: intent.option };
    case "section":
      return { value: selectValue(intent.option), after: intent.option };
    case "authorByline":
    case "imageByline":
      return { value: richTextValue(intent.text), after: intent.text || null };
    case "publicationDate":
      return { value: dateValue(intent.date), after: intent.date };
    case "author":
    case "imageCrew":
      return { value: relationValue(intent.ids), after: intent.ids };
  }
}

/**
 * Why these properties may not be written, or undefined — see
 * `assertProperties`. Scoped to what is written, so Members going unshared does
 * not block a status change.
 */
function refusal(
  schema: Schema,
  properties: PropertyKey[],
): string | undefined {
  const missing = notSharing(
    schema,
    properties.map((key) => ARTICLE_PROPERTIES[key].name),
  );
  return missing
    ? `${missing}; refusing to write it rather than overwriting what we cannot see`
    : undefined;
}

/* ---- planning ----------------------------------------------------------- */

export function plan(
  schema: Schema,
  page: ArticlePage,
  intent: Intent,
): PlanResult {
  const reason = refusal(schema, [intent.property]);
  if (reason) return { status: "refused", reason };

  const name = ARTICLE_PROPERTIES[intent.property].name;
  const { value, after } = intended(intent);

  return {
    status: "planned",
    plan: {
      properties: { [name]: value },
      changes: [
        {
          property: intent.property,
          before: current(page, intent.property),
          after,
        },
      ],
    },
  };
}

/** what `/article new` starts an Article with */
export type NewArticle = {
  headline: string;
  /** always filled (ADR 0004) */
  byline: string;
  authorIds: string[];
  /** from the schema, or null if the option is gone */
  status: string | null;
  section: string;
};

/** a new Article, as the properties of a `POST pages` */
export function planCreate(
  schema: Schema,
  { headline, byline, authorIds, status, section }: NewArticle,
): PlanResult {
  if (authorIds.length === 0)
    return { status: "refused", reason: "An article must have an author." };

  const writing: PropertyKey[] = ["headline", "authorByline", "author"];
  if (status !== null) writing.push("status");
  writing.push("section");

  const reason = refusal(schema, writing);
  if (reason) return { status: "refused", reason };

  const name = (key: PropertyKey) => ARTICLE_PROPERTIES[key].name;

  return {
    status: "planned",
    plan: {
      properties: {
        [name("headline")]: titleValue(headline),
        [name("authorByline")]: richTextValue(byline),
        [name("author")]: relationValue(authorIds),
        ...(status === null ? {} : { [name("status")]: statusValue(status) }),
        [name("section")]: selectValue(section),
      },
      changes: writing.map((property) => ({
        property,
        before: property === "author" ? [] : null,
        after:
          (
            {
              headline,
              authorByline: byline,
              author: authorIds,
              status,
              section,
            } as Partial<Record<PropertyKey, ChangeValue>>
          )[property] ?? null,
      })),
    },
  };
}

/**
 * A credit: the printed Byline and its Members in one body, never one alone
 * (ADR 0004).
 */
export function planCredit(
  schema: Schema,
  page: ArticlePage,
  { credit, byline, memberIds }: Credit,
): PlanResult {
  const text: PropertyKey =
    credit === "author" ? "authorByline" : "imageByline";
  const relation: PropertyKey = credit === "author" ? "author" : "imageCrew";

  if (memberIds.length === 0)
    return { status: "refused", reason: "A credit must have a member." };

  const reason = refusal(schema, [text, relation]);
  if (reason) return { status: "refused", reason };

  const textName = ARTICLE_PROPERTIES[text].name;
  const relationName = ARTICLE_PROPERTIES[relation].name;

  return {
    status: "planned",
    plan: {
      properties: {
        [textName]: richTextValue(byline),
        [relationName]: relationValue(memberIds),
      },
      changes: [
        { property: text, before: current(page, text), after: byline },
        {
          property: relation,
          before: current(page, relation),
          after: memberIds,
        },
      ],
    },
  };
}
