/*
  keeping discord's picture of notion current: the article index, the picker
  options, and the command surface those options are baked into.

  two callers, deliberately identical in what they do. the webhook is the fast
  path and the hourly cron is the honest one — notion delivers events
  at-most-once and out of order, so the cron is not a backstop for a rare
  failure, it is the thing that makes the index eventually right at all. see
  ADR 0009
*/

import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { syncMeta } from "~/lib/db/schema";
import { failed, ok, skipped, type Result } from "~/lib/automations/registry";
import { buildCommands } from "~/lib/services/discord/commands";
import { registerCommands } from "~/lib/services/discord/register";
import { readChoices } from "./choices";

/** the key the registered surface's hash is stored under */
const COMMAND_HASH = "discord:command-hash";

/**
 * a value from sync_meta, or undefined.
 *
 * undefined for "not stored" and for "the read failed" alike, and both are
 * safe: a missing hash means the surface registers again, which costs one of
 * discord's 200 daily registrations and nothing else
 */
async function meta(db: D1Database, key: string): Promise<string | undefined> {
  try {
    const [row] = await drizzle(db)
      .select()
      .from(syncMeta)
      .where(eq(syncMeta.key, key))
      .limit(1);

    return row?.value;
  } catch (error) {
    console.error("[refresh] could not read sync_meta", error);
    return undefined;
  }
}

async function setMeta(db: D1Database, key: string, value: string) {
  try {
    await drizzle(db)
      .insert(syncMeta)
      .values({ key, value })
      .onConflictDoUpdate({ target: syncMeta.key, set: { value } });
  } catch (error) {
    console.error("[refresh] could not write sync_meta", error);
  }
}

/**
 * puts the current picker options on discord, if they are not there already.
 *
 * the options live in the *registration* rather than being resolved when
 * somebody opens the picker, so a status added in notion reaches an editor only
 * by re-registering — which is why this exists and why it runs hourly.
 *
 * the hash is stored only after discord accepted the payload, so a failed
 * registration is retried next hour rather than remembered as done
 */
export async function refreshCommands(env: Env): Promise<Result> {
  if (!env.DB) return skipped("no database; command surface not refreshed");

  const choices = await readChoices(env.DB);

  /*
    an empty set is not a surface worth publishing. it means the picker options
    never synced, or synced and were refused — and registering it would replace
    working pickers with empty ones, which reads to an editor as the command
    being broken
  */
  if (choices.length === 0) {
    return skipped("no picker options stored; keeping the registered surface");
  }

  const payload = buildCommands(choices);
  const previous = await meta(env.DB, COMMAND_HASH);
  const result = await registerCommands(env, payload, previous);

  if (result.outcome === "ok") await setMeta(env.DB, COMMAND_HASH, result.hash);

  return { outcome: result.outcome, summary: result.summary };
}

/**
 * everything discord needs to know about notion, refreshed in order.
 *
 * order matters once and only here: the pickers are read from the schema
 * before the surface that embeds them is registered, so a status added in
 * notion reaches discord in this tick rather than the next one
 */
export async function refreshFromNotion(
  env: Env,
  work: {
    rebuild: (env: Env) => Promise<Result>;
    refreshChoices: (env: Env) => Promise<Result>;
  },
): Promise<Result> {
  const index = await work.rebuild(env);
  const choices = await work.refreshChoices(env);
  const commands = await refreshCommands(env);

  const parts = [
    `index ${index.outcome}`,
    `choices ${choices.outcome}`,
    `commands ${commands.outcome}`,
  ];

  /*
    one failing step is the whole thing failing. a summary reading `ok` while
    the index did not rebuild is the exact shape ADR 0007 exists to prevent —
    and the detail of which step, because "the sync failed" is not actionable
  */
  const broken = [index, choices, commands].filter(
    (r) => r.outcome === "failed" || r.outcome === "misconfigured",
  );

  if (broken.length > 0) {
    return failed(
      `${parts.join(", ")} — ${broken.map((r) => r.summary).join("; ")}`,
    );
  }

  return ok(parts.join(", "));
}
