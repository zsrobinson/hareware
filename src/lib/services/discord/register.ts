/*
  Guild-scoped, because guild commands are live when the PUT returns. The PUT
  replaces every command, so `commands.ts` is the whole surface.
*/

import { failed, misconfigured, ok, type Result } from "~/lib/result";
import type { CommandPayload } from "./commands";
import { DISCORD_APPLICATION_ID, GUILD_ID } from "./config";

/** Never throws: it shares a cron tick with the reminders. */
export async function registerCommands(
  env: Env,
  payload: CommandPayload,
): Promise<Result> {
  const token = env.DISCORD_BOT_TOKEN;
  if (!token) {
    return misconfigured(
      "DISCORD_BOT_TOKEN is not set; commands were not registered",
    );
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

    /* a refusal's only symptom is a stale picker, so what Discord said is
       logged */
    const said = await response.text();

    if (!response.ok) {
      return failed(
        `discord refused the commands: ${response.status} ${said.slice(0, 300)}`,
      );
    }

    return ok(`registered ${payload.length} command(s) on the guild`);
  } catch (error) {
    return failed(
      `could not reach discord to register commands: ${String(error)}`,
    );
  }
}
