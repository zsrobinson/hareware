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
import { failed, ok, skipped, type Result } from "~/lib/result";
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
 * what a `data_source.schema_updated` event means, in one place.
 *
 * the pickers are read from the schema and then *baked into* the command
 * registration, so a status added in notion reaches an editor only once the
 * surface is registered again — two steps that are one fact. the webhook route
 * assembled them by hand beside this file's own sequence, which is how a third
 * step would have reached one caller and not the other.
 */
export async function onSchemaChanged(
  env: Env,
  refreshChoices: (env: Env) => Promise<Result>,
): Promise<Result> {
  return combine(await schemaSteps(env, refreshChoices));
}

/**
 * the two steps a schema change needs, named, so that both callers report the
 * same words and a third step reaches both of them
 */
async function schemaSteps(
  env: Env,
  refreshChoices: (env: Env) => Promise<Result>,
): Promise<[string, Result][]> {
  const choices = await refreshChoices(env);
  const commands = await refreshCommands(env);

  return [
    ["choices", choices],
    ["commands", commands],
  ];
}

/**
 * one line naming every step and its outcome, and `failed` if any of them was.
 *
 * a summary reading `ok` while one step did not run is the shape ADR 0007
 * exists to prevent, and naming which step is what makes it actionable
 */
function combine(steps: [string, Result][]): Result {
  const parts = steps.map(([name, result]) => `${name} ${result.outcome}`);
  const broken = steps
    .map(([, result]) => result)
    .filter((r) => r.outcome === "failed" || r.outcome === "misconfigured");

  if (broken.length > 0) {
    return failed(
      `${parts.join(", ")} — ${broken.map((r) => r.summary).join("; ")}`,
    );
  }

  return ok(parts.join(", "));
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

  /* the index in front of the steps the webhook also runs, flattened rather
     than nested so both callers say the same words and a fourth step reaches
     both of them */
  return combine([
    ["index", index],
    ...(await schemaSteps(env, work.refreshChoices)),
  ]);
}
