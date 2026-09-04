#!/usr/bin/env node
/*
  Manages the Discord webhooks the reminders post through.

  They must be owned by the application: a webhook created by hand in Discord's
  UI cannot carry an interactive component, and Discord rejects the whole
  message rather than dropping the button. Creating them through the API with
  the bot token is what makes them application-owned.

    node scripts/discord-webhooks.mjs list
    node scripts/discord-webhooks.mjs create <channel-id>
    node scripts/discord-webhooks.mjs avatar

  Reads DISCORD_BOT_TOKEN from .dev.vars. The bot needs View Channel and Manage
  Webhooks in the channel; a 403 straight after granting those usually means
  Discord has not propagated yet, so wait a moment and try again.
*/

import { readFileSync } from "node:fs";

const API = "https://discord.com/api/v10";
const AVATAR = "public/bot-logo.jpg";
const NAME = "HareWare";

/*
  Discord answers 403 to requests carrying some clients' default User-Agent,
  in a way that reads exactly like a permissions failure. Send a real one.
*/
const USER_AGENT = "HareWare (https://github.com/zsrobinson/hareware, 1.0)";

function token() {
  const line = readFileSync(".dev.vars", "utf8")
    .split("\n")
    .find((l) => l.startsWith("DISCORD_BOT_TOKEN="));

  if (!line) {
    console.error("DISCORD_BOT_TOKEN is not in .dev.vars");
    process.exit(1);
  }

  return line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}

async function discord(path, init = {}) {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      authorization: `Bot ${token()}`,
      "content-type": "application/json",
      "user-agent": USER_AGENT,
      ...init.headers,
    },
  });

  if (!response.ok) {
    console.error(`${init.method ?? "GET"} ${path} -> ${response.status}`);
    console.error(await response.text());
    process.exit(1);
  }

  return response.status === 204 ? null : response.json();
}

/** the avatar as Discord wants it: a base64 data uri */
function avatarData() {
  const bytes = readFileSync(AVATAR);
  return `data:image/jpeg;base64,${bytes.toString("base64")}`;
}

/** every webhook this application owns, across the guild */
async function ours() {
  const guilds = await discord("/users/@me/guilds");
  const found = [];

  for (const guild of guilds) {
    const hooks = await discord(`/guilds/${guild.id}/webhooks`);
    for (const hook of hooks) {
      if (hook.application_id) found.push({ ...hook, guild: guild.name });
    }
  }

  return found;
}

const [command, argument] = process.argv.slice(2);

if (command === "list") {
  for (const hook of await ours()) {
    console.log(
      `${hook.id}  channel ${hook.channel_id}  ${hook.name}  avatar=${hook.avatar ? "set" : "NOT SET"}`,
    );
  }
} else if (command === "create") {
  if (!argument) {
    console.error("usage: create <channel-id>");
    process.exit(1);
  }

  const hook = await discord(`/channels/${argument}/webhooks`, {
    method: "POST",
    body: JSON.stringify({ name: NAME, avatar: avatarData() }),
  });

  console.log(`created ${hook.id} in channel ${hook.channel_id}`);
  console.log("");
  console.log("Put this in the matching secret. It is a credential:");
  console.log("");
  console.log(`  https://discord.com/api/webhooks/${hook.id}/${hook.token}`);
  console.log("");
  console.log("  npx wrangler versions secret put DISCORD_SOCIAL_WEBHOOK_URL");
} else if (command === "avatar") {
  const data = avatarData();

  for (const hook of await ours()) {
    await discord(`/webhooks/${hook.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: NAME, avatar: data }),
    });
    console.log(`updated ${hook.id} (channel ${hook.channel_id})`);
  }
} else {
  console.error("usage: discord-webhooks.mjs <list|create <channel-id>|avatar>");
  process.exit(1);
}
