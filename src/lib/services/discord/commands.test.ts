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

/* "0" hides the command until an admin grants it to a role */
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

test("every registered command and option has a Discord-safe description", () => {
  const command = article();
  const descriptions = [
    command.description,
    ...command.options.flatMap((subcommand) => [
      subcommand.description,
      ...subcommand.options.map((option) => option.description),
    ]),
  ];

  for (const description of descriptions) {
    expect(description.length).toBeGreaterThan(0);
    expect(description.length).toBeLessThanOrEqual(100);
  }
});

test("required arguments precede optional ones as Discord requires", () => {
  for (const subcommand of article().options) {
    const firstOptional = subcommand.options.findIndex(
      (option) => !option.required,
    );
    if (firstOptional === -1) continue;

    expect(
      subcommand.options
        .slice(firstOptional)
        .every((option) => !option.required),
      subcommand.name,
    ).toBe(true);
  }
});

/* a choice's value is Notion's option name verbatim, casing included (ADR 0009) */
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

/* Discord rejects the whole registration over a 26th choice */
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
  /* there are more Articles than Discord's 25 choices */
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
    "delete",
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

/* a status added in Notion reaches Discord with no code change (ADR 0009) */
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

  expect(named("member").required).toBe(true);
  for (const name of ["byline", "also"])
    expect(named(name).required, name).toBeUndefined();
});

test("a new article requires a headline, Discord member and section", () => {
  const created = buildCommands([])[0]!.options!.find((o) => o.name === "new");
  const required = created!
    .options!.filter((option) => option.required)
    .map((option) => option.name);

  expect(required).toEqual(["headline", "member", "section"]);
  // no article picker: there is nothing to pick yet
  expect(created!.options!.some((o) => o.autocomplete)).toBe(false);
});
