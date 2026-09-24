/*
  Re-registers the commands from Notion's schema, hourly: Discord bakes choices
  into the registration (ADR 0009). Unconditional — 24 of Discord's 200 daily
  registrations.
*/

import { buildCommands, MAX_CHOICES } from "./commands";
import { registerCommands } from "./register";
import { failed, misconfigured, type Result } from "~/lib/result";
import {
  notSharing,
  extractChoices,
  fetchSchema,
} from "~/lib/articles/choices";
import { CHOICE_PROPERTIES } from "~/lib/articles/config";

/** Never throws: it shares a cron tick with the reminders. */
export async function refreshCommands(env: Env): Promise<Result> {
  if (!env.NOTION_TOKEN) return misconfigured("NOTION_TOKEN unset");

  let schema;
  try {
    schema = await fetchSchema(env.NOTION_TOKEN);
  } catch (error) {
    console.error("[articles] could not read the schema", error);
    return failed(`notion refused the schema: ${String(error)}`);
  }

  /* the write paths refuse too, but only when somebody next edits */
  const missing = notSharing(schema);
  if (missing) return misconfigured(missing);

  const choices = extractChoices(schema);

  /* per picker: a renamed property would register a required picker with
     no choices. Keep the surface already registered instead. */
  const empty = CHOICE_PROPERTIES.filter(
    (property) => !choices.some((choice) => choice.property === property),
  );
  if (empty.length > 0) {
    return failed(
      `no options came back for ${empty.join(", ")}; kept the surface it had`,
    );
  }

  const result = await registerCommands(env, buildCommands(choices));

  /* `choicesFor` registers the first MAX_CHOICES; the rest reach no picker */
  const cut = CHOICE_PROPERTIES.map((property) => ({
    property,
    count: choices.filter((choice) => choice.property === property).length,
  }))
    .filter(({ count }) => count > MAX_CHOICES)
    .map(
      ({ property, count }) =>
        `${property} has ${count} options and Discord takes ${MAX_CHOICES}, so ${count - MAX_CHOICES} are missing from its picker`,
    );
  if (result.outcome === "ok" && cut.length > 0)
    return misconfigured(`${result.summary}, but ${cut.join("; ")}`);

  return result;
}
