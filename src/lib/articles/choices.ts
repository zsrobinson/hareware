/*
  what the pickers offer, read out of notion's own schema.

  no status, section or image status is written down in this repo. adding one
  is something the club does in notion, and the commands re-register from what
  is read here — which is also why the casing traps (`Not started`, not
  `Not Started`) cannot be introduced. see ADR 0009.

  nothing in this file builds a discord payload. it reads a schema and stores
  option names; what a command registration looks like is somebody else's
  problem, and keeping it that way is what lets this be tested without one.
*/

import { drizzle } from "drizzle-orm/d1";
import { asc } from "drizzle-orm";
import { notion } from "~/lib/services/notion/client";
import { choiceOptions, type ChoiceOption } from "~/lib/db/schema";
import { chunk } from "./store";
import {
  failed,
  misconfigured,
  ok,
  type Result,
} from "~/lib/automations/registry";
import {
  ARTICLES_DATA_SOURCE_ID,
  ARTICLE_PROPERTIES,
  CHOICE_PROPERTIES,
} from "./config";

/**
 * how many picker options go in one insert.
 *
 * a choice is three columns against d1's hundred-variable ceiling, so
 * thirty-three is the true limit — which the three pickers are one added
 * section away from reaching
 */
const CHOICE_CHUNK = 20;

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

/**
 * re-reads the schema and stores what the pickers should offer.
 *
 * every refusal below leaves the stored options exactly as they were, which is
 * the right failure: yesterday's picker is a small annoyance and an empty one
 * is a command nobody can run.
 */
export async function refreshChoices(env: Env): Promise<Result> {
  const missing = [!env.NOTION_TOKEN && "NOTION_TOKEN", !env.DB && "DB"].filter(
    Boolean,
  );
  if (missing.length > 0)
    return misconfigured(`article choices unset: ${missing.join(", ")}`);

  let schema: Schema;
  try {
    schema = await fetchSchema(env.NOTION_TOKEN!);
  } catch (error) {
    /* a Result, not a throw: the webhook route and `?sync=1` answer with what
       this returns, and an exception reaches them as a 500 page */
    console.error("[articles] could not read the schema", error);
    return failed(`notion refused the schema: ${String(error)}`);
  }

  const absent = assertProperties(schema);
  if (absent.length > 0)
    return misconfigured(
      `notion is not sharing: ${absent
        .map((miss) => `${miss.name} (${miss.found ?? "absent"})`)
        .join(", ")}`,
    );

  const choices = extractChoices(schema);
  /* a picker with no options is not a schema change anybody made; it is a read
     that half worked, and writing it would empty a command's choices */
  const empty = CHOICE_PROPERTIES.filter(
    (property) => !choices.some((choice) => choice.property === property),
  );
  if (empty.length > 0)
    return failed(`no options came back for ${empty.join(", ")}`);

  try {
    const client = drizzle(env.DB!);

    /*
      one batch, so a delete that lands without its insert is not an empty
      picker — and chunked, because d1 binds at most a hundred variables to a
      query and a choice is three of them. thirty-four options across the three
      pickers is enough to break an unchunked insert, which is a club adding
      one section away. the identical bug was fixed in `store.ts` and the fix
      was not carried across
    */
    await client.batch([
      client.delete(choiceOptions),
      ...chunk(choices, CHOICE_CHUNK).map((part) =>
        client.insert(choiceOptions).values(part),
      ),
    ]);
  } catch (error) {
    console.error("[articles] could not store the choices", error);
    return failed("could not store the article choices");
  }

  return ok(
    `stored ${choices.length} choices for ${CHOICE_PROPERTIES.length} pickers`,
  );
}

/**
 * the stored options, in the order a picker should show them.
 *
 * grouped by property and ordered by notion's own position within each. an
 * unreachable index answers with nothing, the same as a refresh that has never
 * run — the caller has a registration to build either way and both mean "we do
 * not know what to offer"
 */
export async function readChoices(db: D1Database): Promise<ChoiceOption[]> {
  try {
    return await drizzle(db)
      .select()
      .from(choiceOptions)
      .orderBy(asc(choiceOptions.property), asc(choiceOptions.position));
  } catch (error) {
    console.error("[articles] could not read the choices", error);
    return [];
  }
}
