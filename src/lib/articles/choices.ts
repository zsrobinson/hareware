/*
  The Articles schema: what the pickers offer, and whether Notion is sharing
  what the writes need. No option name is written down in this repo (ADR 0009).
*/

import { notion } from "~/lib/services/notion/client";
import {
  ARTICLES_DATA_SOURCE_ID,
  ARTICLE_PROPERTIES,
  CHOICE_PROPERTIES,
} from "./config";

/** as much of a data source's schema as we read */
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

export type ChoiceOption = { property: string; name: string; position: number };

export type MissingProperty = {
  name: string;
  expected: string;
  /** `null` when the property is absent */
  found: string | null;
};

/**
 * Every Articles property the schema lacks or types differently. The data-loss
 * guard: a relation the integration cannot reach is dropped from the schema
 * and reads as `[]` on every page, so appending to it deletes co-authors.
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
 * "Notion is not sharing …" for the properties the schema is missing, among
 * `names` when given, or null when it has them all
 */
export function notSharing(
  schema: Schema,
  names?: readonly string[],
): string | null {
  const missing = assertProperties(schema).filter(
    (miss) => !names || names.includes(miss.name),
  );
  if (missing.length === 0) return null;

  return `Notion is not sharing ${missing
    .map((miss) => `${miss.name} (${miss.found ?? "absent"})`)
    .join(", ")}`;
}

/** the options for each picker, in the order the club put them in Notion */
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
 * One option, spelled as the schema spells it, matched case-insensitively —
 * the way to name an option without typing Notion's casing (ADR 0009). `null`
 * when the club renamed or removed it.
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

export function fetchSchema(token: string): Promise<Schema> {
  return notion(
    `data_sources/${ARTICLES_DATA_SOURCE_ID}`,
    token,
  ) as Promise<Schema>;
}
