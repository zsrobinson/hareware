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

import { buildCommands } from "~/lib/services/discord/commands";
import { registerCommands } from "~/lib/services/discord/register";
import { failed, misconfigured, type Result } from "~/lib/result";
import { extractChoices, fetchSchema } from "./choices";

/**
 * reads the schema and puts the surface it implies on discord.
 *
 * never throws: this is called from a cron tick that also posts the reminders,
 * and a stale picker must not take the morning's reminders down with it
 */
export async function refreshCommands(env: Env): Promise<Result> {
  if (!env.NOTION_TOKEN) return misconfigured("NOTION_TOKEN unset");

  let choices;
  try {
    choices = extractChoices(await fetchSchema(env.NOTION_TOKEN));
  } catch (error) {
    console.error("[articles] could not read the schema", error);
    return failed(`notion refused the schema: ${String(error)}`);
  }

  /*
    an empty set is not a surface worth publishing: it would replace working
    pickers with empty ones, which reads to an editor as the command being
    broken. keeping yesterday's is the better failure
  */
  if (choices.length === 0) {
    return failed("notion returned no picker options; kept the surface it had");
  }

  const result = await registerCommands(env, buildCommands(choices));

  return { outcome: result.outcome, summary: result.summary };
}
