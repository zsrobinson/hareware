/*
  turning an intended change into one notion PATCH and structured before/after
  values. The response and Invocation log format those same facts.

  everything here is pure. a command re-reads its page, plans the change,
  sends the body and confirms the returned values — so the interesting part, which is
  which shape each property type takes and what the value was before, is
  testable without notion and without a write token. see ADR 0009.

  the shapes are not interchangeable and getting one wrong is silent: notion
  rejects `{ select: … }` on a `status` property with a 400 that reads like a
  bad id, and accepts a body whose property name it does not recognise by
  ignoring it. `Article Status` and `Image Status` are `status` properties
  where `Section` is a `select`, which is why the builders below are separate
  functions rather than one that takes a type.
*/

import { plainText } from "~/lib/services/notion/client";
import { assertProperties, type Schema } from "./choices";
import { ARTICLE_PROPERTIES } from "./config";
import { optionName, relationIds, type ArticlePage } from "./page";

/** the key of an Articles property, as `config.ts` names it */
export type PropertyKey = keyof typeof ARTICLE_PROPERTIES;

/** a property value as notion accepts it in a PATCH body */
export type PropertyValue = Record<string, unknown>;

/** the body of a `PATCH pages/{id}` */
export type PatchBody = { properties: Record<string, PropertyValue> };

/**
 * one intended change, keyed by property.
 *
 * the union is per-property rather than per-type so a caller cannot hand a
 * `select` value to a `status` property: `section` takes an option and
 * `publicationDate` takes a date, and there is no spelling of this type that
 * mixes them up
 */
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
  /** the printed name — always filled, and authoritative for what gets printed */
  byline: string;
  /** the Members behind it, possibly none and possibly several */
  memberIds: string[];
};

/**
 * a planned change: the body to send and the values to verify.
 *
 * each change carries the value it is changing **from** as well as to. that
 * is what makes a command run against the wrong article undoable rather than
 * a mystery, and ADR 0009 requires every mutation to be an Invocation — a log
 * row saying only the new value cannot undo anything
 */
export type ChangeValue = string | string[] | null;
export type ArticleChange = {
  property: PropertyKey;
  before: ChangeValue;
  after: ChangeValue;
  member?: { id: string; name: string };
};
export type Plan = PatchBody & { changes: ArticleChange[] };

/**
 * a plan, or a refusal to make one.
 *
 * refusal is a state rather than a thrown error or an empty body, because the
 * caller has an editor waiting on a deferred interaction and has to say
 * something either way
 */
export type PlanResult =
  { status: "planned"; plan: Plan } | { status: "refused"; reason: string };

/* ---- the value builders ------------------------------------------------- */

export function titleValue(text: string): PropertyValue {
  return { title: [{ text: { content: text } }] };
}

/** `null` clears it — a rich_text is emptied with `[]`, never with `null` */
export function richTextValue(text: string | null): PropertyValue {
  return { rich_text: text === null ? [] : [{ text: { content: text } }] };
}

export function statusValue(name: string): PropertyValue {
  return { status: { name } };
}

export function selectValue(name: string): PropertyValue {
  return { select: { name } };
}

/** `null` clears it — a date is emptied with `null`, never with `{}` or `""` */
export function dateValue(start: string | null): PropertyValue {
  return { date: start === null ? null : { start } };
}

/** the whole list, replaced. an append is the caller's read plus its addition */
export function relationValue(ids: string[]): PropertyValue {
  return { relation: ids.map((id) => ({ id })) };
}

/* ---- reading what is there now ------------------------------------------ */

/** Read raw values once for planning, confirmation and logging. */
export function current(page: ArticlePage, property: PropertyKey): ChangeValue {
  const value = page.properties?.[ARTICLE_PROPERTIES[property].name];
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

/** Detailed log text retains relation ids for undoing an edit. */
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
 * why a property may not be written, or undefined.
 *
 * this is the data-loss guard and it is why a schema is a parameter rather
 * than something the builders do without. notion omits a relation whose target
 * the integration cannot reach **from the schema entirely**, and the property
 * then reads back on every page as `[]` — indistinguishable from an article
 * with genuinely no author, so an append built on that read deletes co-authors
 * nobody could see. absent is not empty, and only the schema can tell them
 * apart.
 *
 * scoped to the properties actually being written: Members going unshared must
 * not stop an editor moving an article to _Section Edited_
 */
function refusal(
  schema: Schema,
  properties: PropertyKey[],
): string | undefined {
  /* widened to string: the names are a union of literals, and a missing
     property arrives from the schema as plain text */
  const names: string[] = properties.map((key) => ARTICLE_PROPERTIES[key].name);
  const missing = assertProperties(schema).filter((miss) =>
    names.includes(miss.name),
  );
  if (missing.length === 0) return undefined;

  return `notion is not sharing ${missing
    .map((miss) => `${miss.name} (${miss.found ?? "absent"})`)
    .join(
      ", ",
    )}; refusing to write it rather than overwriting what we cannot see`;
}

/* ---- planning ----------------------------------------------------------- */

/** one property, changed */
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
  /** always filled, per ADR 0004 — the caller's display name by default */
  byline: string;
  /** the Members rows behind that byline. empty when nobody was picked */
  authorIds: string[];
  /** notion's own spelling, resolved from the schema, or null if it is gone */
  status: string | null;
  /** null when the editor did not pick one */
  section: string | null;
};

/**
 * a new Article, as the properties of a `POST pages`.
 *
 * a create rather than a change, so there is nothing to say it changed *from*
 * — but it goes through the same refusal as everything else, scoped to the
 * properties it would actually write. an unchosen section is left out of the
 * body entirely: `null` and `{ select: { name: "" } }` are both values notion
 * treats as a write, and neither is what "the editor did not pick one" means
 */
export function planCreate(
  schema: Schema,
  { headline, byline, authorIds, status, section }: NewArticle,
): PlanResult {
  const writing: PropertyKey[] = ["headline", "authorByline"];
  /* ADR 0004 keeps the printed Byline and the relation together, so a create
     that knows the member writes both or refuses both */
  if (authorIds.length > 0) writing.push("author");
  if (status !== null) writing.push("status");
  if (section !== null) writing.push("section");

  const reason = refusal(schema, writing);
  if (reason) return { status: "refused", reason };

  const name = (key: PropertyKey) => ARTICLE_PROPERTIES[key].name;

  return {
    status: "planned",
    plan: {
      properties: {
        [name("headline")]: titleValue(headline),
        [name("authorByline")]: richTextValue(byline),
        ...(authorIds.length === 0
          ? {}
          : { [name("author")]: relationValue(authorIds) }),
        ...(status === null ? {} : { [name("status")]: statusValue(status) }),
        ...(section === null
          ? {}
          : { [name("section")]: selectValue(section) }),
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
 * a credit, as ADR 0004 requires it: the printed Byline and the Member behind
 * it, in **one** patch body.
 *
 * never one without the other. the ADR accepts storing the printed name twice
 * over on the understanding that HareWare writes both together — a helper that
 * could emit the text alone is the dual-write drift it names as the cost, and
 * the whole pair is refused rather than half-written when the relation cannot
 * be reached
 */
export function planCredit(
  schema: Schema,
  page: ArticlePage,
  { credit, byline, memberIds }: Credit,
): PlanResult {
  const text: PropertyKey =
    credit === "author" ? "authorByline" : "imageByline";
  const relation: PropertyKey = credit === "author" ? "author" : "imageCrew";

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
