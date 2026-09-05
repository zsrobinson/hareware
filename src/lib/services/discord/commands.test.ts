import { expect, test } from "vitest";
import { HANDLED } from "./interactions";
import { buildCommands, choicesFor } from "./commands";

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

/* the same picker, on every subcommand that names one Article */
test("every subcommand about one Article autocompletes the picker", () => {
  const picks = [
    "show",
    "headline",
    "status",
    "image-status",
    "section",
    "publication-date",
    "author",
    "image-crew",
  ];

  for (const name of picks) {
    const subcommand = buildCommands([])[0]!.options!.find(
      (option) => option.name === name,
    );
    const article = subcommand!.options!.find((o) => o.name === "article");

    expect(article, `${name} has no article picker`).toBeDefined();
    expect(article!.autocomplete, name).toBe(true);
  }
});

/*
  ADR 0009: adding a status in notion changes what discord offers without a
  code change, and no notion value is ever typed into this repo — which is what
  keeps `Not started` from becoming `Not Started` and being rejected with a 400
  that reads like a bad id
*/
test("the three pickers offer notion's own options, in notion's order", () => {
  const choices = [
    { property: "Article Status", name: "Approved", position: 1 },
    { property: "Article Status", name: "Backlog", position: 0 },
    { property: "Image Status", name: "Not started", position: 0 },
    { property: "Section", name: "Rabbithole", position: 0 },
  ];

  const options = (subcommand: string, option: string) =>
    buildCommands(choices)[0]!
      .options!.find((o) => o.name === subcommand)!
      .options!.find((o) => o.name === option)!;

  expect(options("status", "status").choices).toEqual([
    { name: "Backlog", value: "Backlog" },
    { name: "Approved", value: "Approved" },
  ]);
  expect(options("image-status", "image-status").choices).toEqual([
    { name: "Not started", value: "Not started" },
  ]);
  expect(options("section", "section").choices).toEqual([
    { name: "Rabbithole", value: "Rabbithole" },
  ]);
});

test("a credit takes discord's own user picker, and `also` is a boolean", () => {
  const author = buildCommands([])[0]!.options!.find(
    (o) => o.name === "author",
  );
  const named = (name: string) =>
    author!.options!.find((option) => option.name === name)!;

  // type 6 is USER: the payload resolves the name, so it costs no request
  expect(named("member").type).toBe(6);
  expect(named("also").type).toBe(5);
  expect(named("byline").type).toBe(3);

  /* all three optional: a pseudonym is text with no member, and a co-Byline is
     a member added to what is already there */
  for (const name of ["member", "byline", "also"])
    expect(named(name).required, name).toBeUndefined();
});

test("a new Article needs only a headline", () => {
  const created = buildCommands([])[0]!.options!.find((o) => o.name === "new");
  const required = created!
    .options!.filter((option) => option.required)
    .map((option) => option.name);

  expect(required).toEqual(["headline"]);
  // no article picker: there is nothing to pick yet
  expect(created!.options!.some((o) => o.autocomplete)).toBe(false);
});
