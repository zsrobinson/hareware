/*
  turning an intended change into the body of one notion PATCH, and the
  sentence that says what it did.

  everything here is pure. a command re-reads its page, plans the change,
  sends the body and logs the sentence — so the interesting part, which is
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
 * a planned change: the body to send, and what to say about it.
 *
 * the sentence carries the value it is changing **from** as well as to. that
 * is what makes a command run against the wrong article undoable rather than
 * a mystery, and ADR 0009 requires every mutation to be an Invocation — a log
 * row saying only the new value cannot undo anything
 */
export type Plan = PatchBody & { sentence: string };

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

const NOTHING = "nothing";

const quoted = (text: string | null) =>
  text === null || text === "" ? NOTHING : `"${text}"`;

const listed = (ids: string[]) => (ids.length === 0 ? NOTHING : ids.join(", "));

/** the current value of a property, in the words the sentence uses */
function current(page: ArticlePage, property: PropertyKey): string {
  const value = page.properties?.[ARTICLE_PROPERTIES[property].name];

  switch (ARTICLE_PROPERTIES[property].type) {
    case "title":
      return quoted(plainText(value?.title).trim() || null);
    case "rich_text":
      return quoted(plainText(value?.rich_text).trim() || null);
    case "date":
      return value?.date?.start ?? NOTHING;
    case "relation":
      return listed(relationIds(value));
    default:
      // a status and a select both answer with the option's name
      return quoted(optionName(value));
  }
}

/** the value the intent writes, both as a patch and as words */
function intended(intent: Intent): { value: PropertyValue; said: string } {
  switch (intent.property) {
    case "headline":
      return { value: titleValue(intent.text), said: quoted(intent.text) };
    case "status":
    case "imageStatus":
      return { value: statusValue(intent.option), said: quoted(intent.option) };
    case "section":
      return { value: selectValue(intent.option), said: quoted(intent.option) };
    case "authorByline":
    case "imageByline":
      return { value: richTextValue(intent.text), said: quoted(intent.text) };
    case "publicationDate":
      return {
        value: dateValue(intent.date),
        said: intent.date ?? NOTHING,
      };
    case "author":
    case "imageCrew":
      return { value: relationValue(intent.ids), said: listed(intent.ids) };
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
  const { value, said } = intended(intent);

  return {
    status: "planned",
    plan: {
      properties: { [name]: value },
      sentence: `${name}: ${current(page, intent.property)} → ${said}`,
    },
  };
}

/** what `/article new` starts an Article with */
export type NewArticle = {
  headline: string;
  /** always filled, per ADR 0004 — the caller's display name by default */
  byline: string;
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
  { headline, byline, status, section }: NewArticle,
): PlanResult {
  const writing: PropertyKey[] = ["headline", "authorByline"];
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
        ...(status === null ? {} : { [name("status")]: statusValue(status) }),
        ...(section === null
          ? {}
          : { [name("section")]: selectValue(section) }),
      },
      sentence: [
        `${name("headline")}: ${quoted(headline)}`,
        `${name("authorByline")}: ${quoted(byline)}`,
        ...(status === null ? [] : [`${name("status")}: ${quoted(status)}`]),
        ...(section === null ? [] : [`${name("section")}: ${quoted(section)}`]),
      ].join("; "),
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
      sentence: [
        `${textName}: ${current(page, text)} → ${quoted(byline)}`,
        `${relationName}: ${current(page, relation)} → ${listed(memberIds)}`,
      ].join("; "),
    },
  };
}
