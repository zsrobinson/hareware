/*
  keeping discord's command surface in step with notion's schema.

  the options a picker offers — Article Status, Image Status, Section — are
  read from notion and then *baked into the registration*, because discord
  resolves choices when a command is registered rather than when somebody opens
  it. so a status added in notion reaches an editor only once the surface is
  registered again, and that is what this is for. see ADR 0009.

  it runs hourly and registers unconditionally. there used to be a hash stored
  in D1 so an unchanged schema registered nothing, which guarded discord's
  limit of two hundred registrations a day — a limit that twenty-four uses
  fourteen per cent of. the hash cost a table, a read, a write and a way for
  the stored hash to disagree with what was actually up there.
*/

import { buildCommands } from "./commands";
import { registerCommands } from "./register";
import { failed, misconfigured, type Result } from "~/lib/result";
import {
  assertProperties,
  extractChoices,
  fetchSchema,
} from "~/lib/articles/choices";
import { CHOICE_PROPERTIES } from "~/lib/articles/config";

/**
 * reads the schema and puts the surface it implies on discord.
 *
 * never throws: this is called from a cron tick that also posts the reminders,
 * and a stale picker must not take the morning's reminders down with it
 */
export async function refreshCommands(env: Env): Promise<Result> {
  if (!env.NOTION_TOKEN)
    return misconfigured(
      "NOTION_TOKEN is not set; commands were not refreshed.",
    );

  let schema;
  try {
    schema = await fetchSchema(env.NOTION_TOKEN);
  } catch (error) {
    console.error("[articles] could not read the schema", error);
    return failed(`Notion refused the schema: ${String(error)}`);
  }

  /*
    the hourly alarm for notion quietly stopping sharing something. the write
    paths check this too and refuse rather than write a relation they cannot
    read back — but that only speaks when somebody tries to credit a Member,
    which could be weeks. this says so the same day
  */
  const missing = assertProperties(schema);
  if (missing.length > 0) {
    return misconfigured(
      `Notion is not sharing ${missing
        .map((miss) => `${miss.name} (${miss.found ?? "absent"})`)
        .join(", ")}.`,
    );
  }

  const choices = extractChoices(schema);

  /*
    an empty set is not a surface worth publishing: it would replace working
    pickers with empty ones, which reads to an editor as the command being
    broken. keeping yesterday's is the better failure
  */
  /*
    per picker, not in aggregate. a read that half worked — `Image Status`
    renamed, or converted from a status to a select — still returns options for
    the other two, and registering that publishes a required picker with no
    choices in it. an editor opens an empty dropdown, or types free text that
    notion then refuses
  */
  const empty = CHOICE_PROPERTIES.filter(
    (property) => !choices.some((choice) => choice.property === property),
  );
  if (empty.length > 0) {
    return failed(
      `No options came back for ${empty.join(", ")}; kept the existing command surface.`,
    );
  }

  const result = await registerCommands(env, buildCommands(choices));

  return { outcome: result.outcome, summary: result.summary };
}
