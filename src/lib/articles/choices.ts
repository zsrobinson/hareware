/*
  what the pickers offer, read out of notion's own schema.

  nothing here stores anything. the schema is read and the command surface is
  registered in the same invocation, so the options never need to outlive it —
  a D1 table used to sit between the two halves and was pure ceremony.

  no status, section or image status is written down in this repo. adding one
  is something the club does in notion, and the commands re-register from what
  is read here — which is also why the casing traps (`Not started`, not
  `Not Started`) cannot be introduced. see ADR 0009.

  nothing in this file builds a discord payload. it reads a schema and stores
  option names; what a command registration looks like is somebody else's
  problem, and keeping it that way is what lets this be tested without one.
*/

import { notion } from "~/lib/services/notion/client";
import {
  ARTICLES_DATA_SOURCE_ID,
  ARTICLE_PROPERTIES,
  CHOICE_PROPERTIES,
} from "./config";

/** a data source's schema, as much of it as we read */
export type Schema = {
  properties: Record<
    string,
    {
      type?: string;
      status?: { options?: { name: string }[] } | null;
      select?: { options?: { name: string }[] } | null;
    }
  >;
};

/** a property the schema does not have in the shape we expect */
/** one option a picker offers, in notion's own order */
export type ChoiceOption = { property: string; name: string; position: number };

export type MissingProperty = {
  name: string;
  expected: string;
  /** the type notion actually has, or `null` when the property is absent */
  found: string | null;
};

/**
 * every property from `ARTICLE_PROPERTIES` the schema does not carry as
 * expected.
 *
 * this is the data-loss guard, and it exists because of one notion behaviour:
 * a relation whose target the integration cannot reach is omitted from the
 * schema **entirely**, and the property then reads back on every page as `[]`
 * — indistinguishable from an article with genuinely no author. an append
 * built on that read deletes co-authors nobody could see.
 *
 * absence is therefore a state of its own here rather than an empty list, and
 * a caller that gets a non-empty answer refuses to write rather than writing
 * what it read.
 */
export function assertProperties(schema: Schema): MissingProperty[] {
  return Object.values(ARTICLE_PROPERTIES).flatMap(({ name, type }) => {
    const property = schema.properties?.[name];
    if (!property) return [{ name, expected: type, found: null }];
    if (property.type !== type)
      return [{ name, expected: type, found: property.type ?? null }];
    return [];
  });
}

/**
 * the options for each picker, in notion's own order.
 *
 * the order is stored rather than sorted because it is the order the club put
 * them in — Backlog before Published — and a picker sorted alphabetically
 * would read as a list of unrelated words.
 *
 * a `status` keeps its options under `status`, a `select` under `select`.
 */
export function extractChoices(schema: Schema): ChoiceOption[] {
  return CHOICE_PROPERTIES.flatMap((property) => {
    const definition = schema.properties?.[property];
    const options =
      definition?.status?.options ?? definition?.select?.options ?? [];

    return options.map((option, position) => ({
      property,
      name: option.name,
      position,
    }));
  });
}

/**
 * one option of one property, spelled the way notion spells it.
 *
 * the only sanctioned way to reach for a particular option, and the reason it
 * takes the schema rather than a constant: ADR 0009 forbids typing a notion
 * value into this repo, because that is how `Not started` becomes
 * `Not Started` and a write is refused with a 400 that reads like a bad id.
 * asking for a casefolded name and writing back what the schema holds keeps
 * the trap out while still letting `/article new` start an Article at a
 * sensible status.
 *
 * `null` when the club renamed or removed the option, which the caller says
 * out loud rather than inventing a value notion would reject
 */
export function optionNamed(
  schema: Schema,
  property: string,
  wanted: string,
): string | null {
  const definition = schema.properties?.[property];
  const options =
    definition?.status?.options ?? definition?.select?.options ?? [];

  const folded = wanted.trim().toLowerCase();

  return (
    options.find((option) => option.name.trim().toLowerCase() === folded)
      ?.name ?? null
  );
}

/** the Articles schema, straight from notion */
export function fetchSchema(token: string): Promise<Schema> {
  return notion(
    `data_sources/${ARTICLES_DATA_SOURCE_ID}`,
    token,
  ) as Promise<Schema>;
}
