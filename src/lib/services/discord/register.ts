/*
  putting the command surface on discord.

  guild-scoped rather than global: guild commands are live the moment the PUT
  returns, while a global registration takes up to an hour to propagate — and
  there is one guild, so the slower option buys nothing.

  PUT *replaces* the surface, so this file is the only thing that decides what
  exists: a subcommand removed from `commands.ts` disappears from discord on the
  next registration rather than lingering as an orphan nobody can find the
  definition of
*/

import type { Result } from "~/lib/result";
import type { CommandPayload } from "./commands";
import { DISCORD_APPLICATION_ID, GUILD_ID } from "./config";

/** what a registration attempt reports */
export type RegisterResult = Result;

/**
 * puts the payload on discord, every time it is asked.
 *
 * discord allows two hundred guild registrations a day and the hourly cron
 * spends twenty-four of them, so there is nothing to be saved by remembering
 * what was last sent — and a remembered hash can disagree with what is
 * actually up there.
 *
 * never throws. this is called from a cron tick that also posts the reminders,
 * and a stale command surface must not take the morning's reminders down
 */
export async function registerCommands(
  env: Env,
  payload: CommandPayload,
): Promise<RegisterResult> {
  const token = env.DISCORD_BOT_TOKEN;
  if (!token) {
    return {
      outcome: "misconfigured",
      summary: "DISCORD_BOT_TOKEN is not set; commands were not registered.",
    };
  }

  try {
    const response = await fetch(
      `https://discord.com/api/v10/applications/${DISCORD_APPLICATION_ID}/guilds/${GUILD_ID}/commands`,
      {
        method: "PUT",
        headers: {
          authorization: `Bot ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );

    /*
      the body is read either way. a refusal here is the silent kind — the
      worker is fine, the reminders still post, and the only symptom is a
      command surface that quietly stopped reflecting notion — so whatever
      discord said about it goes in the log rather than being dropped
    */
    const said = await response.text();

    if (!response.ok) {
      return {
        outcome: "failed",
        summary: `Discord refused the commands: ${response.status} ${said.slice(0, 300)}`,
      };
    }

    return {
      outcome: "ok",
      summary: `Registered ${payload.length} ${payload.length === 1 ? "command" : "commands"} on the guild.`,
    };
  } catch (error) {
    return {
      outcome: "failed",
      summary: `Could not reach Discord to register commands: ${String(error)}`,
    };
  }
}
