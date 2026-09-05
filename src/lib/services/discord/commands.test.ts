import { expect, test } from "vitest";
import { HANDLED } from "./interactions";
import { buildCommands, choicesFor, hashCommands } from "./commands";

const article = () => buildCommands([])[0]!;

const sub = (name: string) =>
  article().options.find((option) => option.name === name);

test("registers one command, /article", () => {
  const payload = buildCommands([]);

  expect(payload).toHaveLength(1);
  expect(payload[0]!.name).toBe("article");
});

/*
  a command visible to everyone is a command everyone tries. "0" hides it until
  a server admin grants it to a role under Integrations — which is also why the
  role is checked again at runtime: that override is editable by any admin, so
  the registration is a default and not a security boundary
*/
test("registers hidden, granted to a role in server settings", () => {
  expect(article().default_member_permissions).toBe("0");
});

test("ping is a subcommand and takes no options", () => {
  const ping = sub("ping");

  expect(ping).toBeDefined();
  // 1 is SUB_COMMAND; a group would be 2 and would nest differently
  expect(ping!.type).toBe(1);
  expect(ping!.options).toEqual([]);
});

test("every subcommand carries a description discord will accept", () => {
  for (const option of article().options) {
    expect(option.description.length).toBeGreaterThan(0);
    expect(option.description.length).toBeLessThanOrEqual(100);
  }
});

/*
  notion is the source of truth for the interface, not just the data (ADR
  0009), so a choice's value is the option name verbatim — casing included.
  "Not Started" is not a status; "Not started" is
*/
test("a choice's value is the notion option name, verbatim", () => {
  expect(
    choicesFor(
      [{ property: "Article Status", name: "Not started", position: 0 }],
      "Article Status",
    ),
  ).toEqual([{ name: "Not started", value: "Not started" }]);
});

test("choices come back in notion's own order", () => {
  const choices = choicesFor(
    [
      { property: "Article Status", name: "Published", position: 2 },
      { property: "Article Status", name: "Not started", position: 0 },
      { property: "Article Status", name: "Drafting", position: 1 },
    ],
    "Article Status",
  );

  expect(choices.map((choice) => choice.name)).toEqual([
    "Not started",
    "Drafting",
    "Published",
  ]);
});

test("choices for one property never include another's", () => {
  const choices = choicesFor(
    [
      { property: "Article Status", name: "Drafting", position: 0 },
      { property: "Image Status", name: "Drafting", position: 0 },
      { property: "Section", name: "News", position: 0 },
    ],
    "Image Status",
  );

  expect(choices).toEqual([{ name: "Drafting", value: "Drafting" }]);
});

/*
  discord rejects the whole registration over a 26th choice, which would take
  the command surface down until somebody deleted a notion option
*/
test("stops at discord's 25 choice limit rather than being refused", () => {
  const many = Array.from({ length: 40 }, (_, i) => ({
    property: "Section",
    name: `Section ${i}`,
    position: i,
  }));

  expect(choicesFor(many, "Section")).toHaveLength(25);
});

test("a property notion did not send has no choices", () => {
  expect(choicesFor([], "Article Status")).toEqual([]);
});

test("the same payload always hashes the same", async () => {
  expect(await hashCommands(buildCommands([]))).toBe(
    await hashCommands(buildCommands([])),
  );
});

/*
  the hash exists to skip a re-registration, and discord allows 200 guild
  registrations a day. a hash that changed with key order would burn them on
  every tick; one that ignored a real change would leave the stale surface up
*/
test("key order does not change the hash", async () => {
  const one = [{ name: "article", description: "a", options: [] }];
  const other = [{ description: "a", options: [], name: "article" }];

  expect(await hashCommands(one as never)).toBe(
    await hashCommands(other as never),
  );
});

test("a changed choice changes the hash", async () => {
  const before = await hashCommands([
    { name: "article", description: "a", options: [], x: ["Drafting"] },
  ] as never);
  const after = await hashCommands([
    { name: "article", description: "a", options: [], x: ["Published"] },
  ] as never);

  expect(after).not.toBe(before);
});

test("the hash is a sha-256 hex digest", async () => {
  expect(await hashCommands(buildCommands([]))).toMatch(/^[0-9a-f]{64}$/);
});

/*
  the drift this exists for: `find` and `show` were implemented, tested and
  merged into the handler while `SUBCOMMANDS` here still listed only `ping`, so
  discord never offered them. nothing failed — the commands simply did not
  exist, and no test looked at both halves at once
*/
test("every subcommand the handler answers to is registered", () => {
  const registered = buildCommands([])[0]!.options!.map((o) => o.name);

  expect([...registered].sort()).toEqual([...HANDLED].sort());
});

test("the article picker is autocompleted, not a choice list", () => {
  /*
    138 articles against discord's cap of 25 choices: listing them is not an
    option, and a picker that silently truncated to the first 25 would look
    like the rest had been deleted
  */
  const show = buildCommands([])[0]!.options!.find((o) => o.name === "show");
  const article = show!.options!.find((o) => o.name === "article");

  expect(article!.autocomplete).toBe(true);
  expect(article!.choices).toBeUndefined();
  expect(article!.required).toBe(true);
});
