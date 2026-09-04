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

import type { Result } from "~/lib/automations/registry";
import { hashCommands, type CommandPayload } from "./commands";
import { DISCORD_APPLICATION_ID, GUILD_ID } from "./config";

/**
 * what a registration attempt reports.
 *
 * `hash` exists only on the branch that actually registered, so a caller
 * cannot store the hash of a surface discord never received — which would
 * suppress every later attempt and leave the stale commands up for good
 */
export type RegisterResult =
  | (Result & { outcome: "ok"; hash: string })
  | (Result & { outcome: "skipped" | "misconfigured" | "failed" });

/**
 * registers the payload unless it is the one already up there.
 *
 * discord allows 200 guild command registrations a day and the hourly cron
 * re-registers whether or not the notion schema moved, so `previousHash` — the
 * hash stored the last time this succeeded — is what keeps a quiet week from
 * spending the budget.
 *
 * never throws. this is called from a cron tick that also posts the reminders,
 * and a stale command surface must not take the morning's reminders down
 */
export async function registerCommands(
  env: Env,
  payload: CommandPayload,
  previousHash?: string,
): Promise<RegisterResult> {
  const hash = await hashCommands(payload);

  if (previousHash === hash) {
    return {
      outcome: "skipped",
      summary: "commands unchanged; nothing registered",
    };
  }

  const token = env.DISCORD_BOT_TOKEN;
  if (!token) {
    return {
      outcome: "misconfigured",
      summary: "DISCORD_BOT_TOKEN is not set; commands were not registered",
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
        summary: `discord refused the commands: ${response.status} ${said.slice(0, 300)}`,
      };
    }

    return {
      outcome: "ok",
      summary: `registered ${payload.length} command(s) on the guild`,
      hash,
    };
  } catch (error) {
    return {
      outcome: "failed",
      summary: `could not reach discord to register commands: ${String(error)}`,
    };
  }
}
