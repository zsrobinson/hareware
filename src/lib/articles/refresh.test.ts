import { expect, test } from "vitest";
import { refreshFromNotion } from "./refresh";
import { failed, misconfigured, ok, skipped } from "~/lib/automations/registry";

/*
  `refreshCommands` reaches D1 and discord, so these exercise
  `refreshFromNotion`'s reporting through injected steps. what is being tested
  is the thing that has burned this codebase before: whether a run in which
  something broke can still describe itself as fine
*/
function steps(index = ok("138 rows"), choices = ok("3 properties")) {
  return {
    rebuild: () => Promise.resolve(index),
    refreshChoices: () => Promise.resolve(choices),
  };
}

/* no DB, so `refreshCommands` returns `skipped` without touching discord */
const env = {} as Env;

test("reports every step, not just the last one", async () => {
  const result = await refreshFromNotion(env, steps());

  expect(result.outcome).toBe("ok");
  expect(result.summary).toContain("index ok");
  expect(result.summary).toContain("choices ok");
  expect(result.summary).toContain("commands skipped");
});

test("a skipped step is not a failure", async () => {
  const result = await refreshFromNotion(
    env,
    steps(ok("138 rows"), skipped("nothing to do")),
  );

  expect(result.outcome).toBe("ok");
});

test("fails the whole run when the index did not rebuild", async () => {
  /*
    the bug this exists for: a summary reading `ok` while the index is a day
    stale. the picker still works, so nothing looks wrong — which is exactly
    the shape ADR 0007 exists to prevent
  */
  const result = await refreshFromNotion(env, steps(failed("notion 502")));

  expect(result.outcome).toBe("failed");
  expect(result.summary).toContain("index failed");
  expect(result.summary).toContain("notion 502");
});

test("counts a misconfigured step as broken, not as quiet", async () => {
  const result = await refreshFromNotion(
    env,
    steps(ok("138 rows"), misconfigured("NOTION_TOKEN unset")),
  );

  expect(result.outcome).toBe("failed");
  expect(result.summary).toContain("NOTION_TOKEN unset");
});

test("names every broken step when more than one broke", async () => {
  const result = await refreshFromNotion(
    env,
    steps(failed("notion 502"), failed("schema unreadable")),
  );

  expect(result.summary).toContain("notion 502");
  expect(result.summary).toContain("schema unreadable");
});

test("refuses to register a command surface with no picker options", async () => {
  /*
    an empty `choice_options` means the pickers never synced, or synced and
    were refused. registering that would replace working pickers with empty
    ones, which an editor reads as the command being broken
  */
  const result = await refreshFromNotion({ DB: undefined } as Env, steps());

  expect(result.summary).toContain("commands skipped");
});
