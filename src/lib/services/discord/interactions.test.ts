import { expect, test } from "vitest";
import {
  deferEphemeral,
  handleInteraction,
  postedId,
  type InteractionDeps,
  type InteractionResponse,
  type MessageResponse,
} from "./interactions";
import { EDITORIAL_BOARD_ROLE_ID } from "./config";
import type { ArticleRow } from "~/lib/db/schema";
import type { CardPage } from "~/lib/articles/card";

const IS_COMPONENTS_V2 = 1 << 15;

/**
 * the reply as a message reply.
 *
 * autocomplete answers with `choices` and no body, so the two shapes are a
 * union — this narrows it and fails loudly rather than reading `undefined`
 */
function asMessage(reply: InteractionResponse | undefined): MessageResponse {
  if (!reply?.data || !("components" in reply.data))
    throw new Error("expected a message reply, got " + JSON.stringify(reply));

  return reply as MessageResponse;
}

/** the choices of an autocomplete reply, same reason */
function asChoices(reply: InteractionResponse | undefined) {
  if (!reply?.data || !("choices" in reply.data))
    throw new Error("expected an autocomplete reply");

  return reply.data.choices;
}

const text = (reply: MessageResponse) => JSON.stringify(reply.data!.components);

/** a message like the social ping's: two articles, each with its own row */
const message = () => ({
  components: [
    { type: 10, content: "<@&1> **First article**" },
    {
      type: 1,
      components: [
        {
          type: 2,
          style: 4,
          label: "Not posted",
          custom_id: postedId("first"),
        },
        {
          type: 2,
          style: 5,
          label: "Open Post Generator",
          url: "https://x.test/1",
        },
      ],
    },
    { type: 14, spacing: 1, divider: false },
    { type: 10, content: "<@&1> **Second article**" },
    {
      type: 1,
      components: [
        {
          type: 2,
          style: 4,
          label: "Not posted",
          custom_id: postedId("second"),
        },
      ],
    },
  ],
});

const press = (customId: string, name = "zsrobinson") => ({
  type: 3,
  data: { custom_id: customId },
  message: message(),
  member: { user: { username: name, global_name: null } },
});

test("answers discord's ping with a pong", async () => {
  expect(await handleInteraction({ type: 1 })).toEqual({ type: 1 });
});

test("marks the pressed button posted, crediting whoever pressed it", async () => {
  const reply = asMessage(await handleInteraction(press(postedId("first"))));

  expect(reply.type).toBe(7);
  expect(reply.data!.flags).toBe(IS_COMPONENTS_V2);

  const button = reply.data!.components[1].components![0];
  expect(button.label).toBe("Posted by zsrobinson");
  expect(button.style).toBe(3);
});

/*
  a checkbox that cannot be unticked is a trap for whoever presses the wrong
  row, so nothing is ever disabled
*/
test("pressing a posted button un-posts it", async () => {
  const posted = press(postedId("first"));
  posted.message.components[1]!.components![0] = {
    type: 2,
    style: 3,
    label: "Posted by someone else",
    custom_id: postedId("first"),
  };

  const reply = asMessage(await handleInteraction(posted));
  const button = reply.data!.components[1].components![0];

  expect(button.style).toBe(4);
  expect(button.label).toBe("Not posted");
});

test("nothing is ever disabled", async () => {
  const reply = asMessage(await handleInteraction(press(postedId("first"))));

  for (const row of reply.data!.components) {
    for (const child of row.components ?? []) {
      expect(child.disabled).toBeUndefined();
    }
  }
});

/*
  an interactive button is invalid without a custom_id, and discord rejects the
  whole response rather than the one component — which reaches the person who
  pressed it as "HareWare didn't respond in time". `disabled` is what stops a
  second press; removing the id only breaks the reply
*/
test("keeps the custom_id, without which the reply is invalid", async () => {
  const reply = asMessage(await handleInteraction(press(postedId("first"))));

  expect(reply.data!.components[1].components![0].custom_id).toBe(
    postedId("first"),
  );
});

test("every interactive button in the reply still has a custom_id", async () => {
  const reply = asMessage(await handleInteraction(press(postedId("first"))));

  for (const row of reply.data!.components) {
    for (const child of row.components ?? []) {
      const isLink = child.style === 5;
      expect(isLink || typeof child.custom_id === "string").toBe(true);
    }
  }
});

test("leaves the other article's button alone", async () => {
  const reply = asMessage(await handleInteraction(press(postedId("first"))));

  const other = reply.data!.components[4].components![0];
  expect(other.label).toBe("Not posted");
  expect(other.style).toBe(4);
  expect(other.custom_id).toBe(postedId("second"));
});

test("leaves link buttons alone", async () => {
  const reply = asMessage(await handleInteraction(press(postedId("first"))));

  const link = reply.data!.components[1].components![1];
  expect(link.url).toBe("https://x.test/1");
  expect(link.style).toBe(5);
});

test("keeps the text and dividers exactly as they were", async () => {
  const reply = asMessage(await handleInteraction(press(postedId("first"))));

  expect(reply.data!.components[0]).toEqual(message().components[0]);
  expect(reply.data!.components[2]).toEqual(message().components[2]);
});

test("prefers a member's display name over their username", async () => {
  const reply = asMessage(
    await handleInteraction({
      ...press(postedId("first")),
      member: { user: { username: "zsrobinson", global_name: "Zachary" } },
    }),
  );

  expect(reply.data!.components[1].components![0].label).toBe(
    "Posted by Zachary",
  );
});

test("ignores a component it did not put there", async () => {
  expect(await handleInteraction(press("something_else"))).toBeUndefined();
});

test("ignores an interaction type it does not handle", async () => {
  expect(await handleInteraction({ type: 99 })).toBeUndefined();
});

test("a custom_id stays inside discord's 100 character limit", () => {
  expect(postedId("a".repeat(200)).length).toBe(100);
});

/* ---- slash commands ----------------------------------------------------- */

const EPHEMERAL = 64;

const command = (
  subcommand: string,
  options: {
    name: string;
    value?: string | number | boolean;
    focused?: boolean;
  }[] = [],
  roles: string[] = [EDITORIAL_BOARD_ROLE_ID],
) => ({
  type: 2,
  data: { name: "article", options: [{ name: subcommand, options }] },
  member: {
    roles,
    user: { username: "zsrobinson", global_name: "Zachary" },
  },
});

test("/article ping answers inline, crediting whoever ran it", async () => {
  const reply = asMessage(await handleInteraction(command("ping")));

  expect(reply.type).toBe(4);
  expect(text(reply)).toContain("Zachary");
});

/*
  ADR 0009: the editor sees the result, the channel sees nothing. and both
  flags together — the ephemeral bit alone with a components body is a response
  discord refuses outright
*/
test("a command reply is ephemeral, and says so in components v2", async () => {
  const reply = asMessage(await handleInteraction(command("ping")));

  expect(reply.data!.flags).toBe(EPHEMERAL | IS_COMPONENTS_V2);
});

/*
  the registration hides the command with default_member_permissions "0", but
  that override is editable by any admin under Integrations — so it is a
  default, and this is the access check
*/
test("refuses somebody without the editorial board role", async () => {
  const reply = asMessage(
    await handleInteraction(command("ping", [], ["some-other-role"])),
  );

  expect(text(reply)).not.toContain("listening");
  expect(text(reply)).toContain("Editorial Board");
  expect(reply.data!.flags).toBe(EPHEMERAL | IS_COMPONENTS_V2);
});

/* absent roles is not an empty role list: a DM carries no member at all */
test("refuses a command with no member on it", async () => {
  const reply = asMessage(
    await handleInteraction({
      type: 2,
      data: { name: "article", options: [{ name: "ping" }] },
      user: { username: "zsrobinson", global_name: "Zachary" },
    }),
  );

  expect(text(reply)).toContain("Editorial Board");
});

/*
  discord shows an unanswered command as "HareWare didn't respond in time",
  which reads as a broken bot rather than a command that no longer exists
*/
test("answers a subcommand it does not know rather than going quiet", async () => {
  const reply = asMessage(await handleInteraction(command("nonexistent")));

  expect(reply.type).toBe(4);
  expect(text(reply)).toContain("does not know");
});

test("answers /article with no subcommand at all", async () => {
  const reply = asMessage(
    await handleInteraction({
      type: 2,
      data: { name: "article" },
      member: { roles: [EDITORIAL_BOARD_ROLE_ID], user: { username: "z" } },
    }),
  );

  expect(reply.type).toBe(4);
});

/*
  the seam every write path leaves through: a notion read plus a PATCH will not
  fit inside discord's three seconds. no components on a deferred ack, so the
  plain ephemeral flag rather than the v2 pair
*/
test("a deferred acknowledgement is ephemeral and carries no body", () => {
  expect(deferEphemeral()).toEqual({ type: 5, data: { flags: EPHEMERAL } });
});

/* ---- the read commands --------------------------------------------------- */

/** an index row, with only what a test cares about spelled out */
const row = (over: Partial<ArticleRow> = {}): ArticleRow => ({
  pageId: "page-1",
  headline: "Terps lose again",
  section: "News",
  status: "Written",
  imageStatus: null,
  authorByline: "Zachary",
  publicationDate: null,
  lastEdited: "2026-09-01T00:00:00.000Z",
  syncedAt: 0,
  ...over,
});

/** a notion page as `/article show` reads one */
const notionPage = (): CardPage => ({
  id: "page-1",
  url: "https://notion.so/page-1",
  properties: {
    Headline: { type: "title", title: [{ plain_text: "Terps lose again" }] },
    "Article Status": { type: "status", status: { name: "Written" } },
  },
});

const deps = (over: InteractionDeps = {}): InteractionDeps => ({
  search: () => Promise.resolve([row()]),
  page: () => Promise.resolve(notionPage()),
  ...over,
});

test("/article find lists the Articles the index matched", async () => {
  const reply = asMessage(
    await handleInteraction(
      command("find", [{ name: "query", value: "terps" }]),
      deps(),
    ),
  );

  expect(reply.type).toBe(4);
  expect(text(reply)).toContain("Terps lose again");
  expect(reply.data!.flags).toBe(EPHEMERAL | IS_COMPONENTS_V2);
});

test("/article find says so when nothing matched", async () => {
  const reply = asMessage(
    await handleInteraction(
      command("find", [{ name: "query", value: "nothing" }]),
      deps({ search: () => Promise.resolve([]) }),
    ),
  );

  expect(text(reply)).toContain("No Article");
});

/*
  ADR 0009: the index serves autocomplete and nothing else, so what an editor
  is shown for one Article is re-read from notion
*/
test("/article show reads the page live rather than from the index", async () => {
  let asked: string | undefined;
  const reply = asMessage(
    await handleInteraction(
      command("show", [{ name: "article", value: "page-42" }]),
      deps({
        page: (id) => {
          asked = id;
          return Promise.resolve(notionPage());
        },
        search: () => {
          throw new Error("the index must not answer /article show");
        },
      }),
    ),
  );

  expect(asked).toBe("page-42");
  expect(text(reply)).toContain("Terps lose again");
});

/*
  an interaction acknowledged and then left silent is the failure
  docs/agents/silent-failures.md is about — a notion outage has to reach the
  editor as a sentence
*/
test("/article show says something when notion does not answer", async () => {
  const reply = asMessage(
    await handleInteraction(
      command("show", [{ name: "article", value: "page-42" }]),
      deps({ page: () => Promise.reject(new Error("notion is down")) }),
    ),
  );

  expect(reply.type).toBe(4);
  expect(text(reply)).toContain("Notion");
});

test("/article show asks for an Article when nobody picked one", async () => {
  const reply = asMessage(await handleInteraction(command("show", []), deps()));

  expect(text(reply)).toContain("Pick an Article");
});

test("the read commands are gated on the editorial board role too", async () => {
  const reply = asMessage(
    await handleInteraction(
      command("show", [{ name: "article", value: "page-1" }], ["nope"]),
      deps({
        page: () => {
          throw new Error("must not read notion for somebody off the board");
        },
      }),
    ),
  );

  expect(text(reply)).toContain("Editorial Board");
});

/* ---- autocomplete -------------------------------------------------------- */

const AUTOCOMPLETE_RESULT = 8;

const typing = (
  value: string,
  roles: string[] = [EDITORIAL_BOARD_ROLE_ID],
) => ({
  type: 4,
  data: {
    name: "article",
    options: [
      { name: "show", options: [{ name: "article", value, focused: true }] },
    ],
  },
  member: {
    roles,
    user: { username: "zsrobinson", global_name: "Zachary" },
  },
});

test("autocomplete answers with choices, not a message", async () => {
  const reply = await handleInteraction(typing("terps"), deps());

  expect(reply!.type).toBe(AUTOCOMPLETE_RESULT);
  expect(asChoices(reply)).toEqual([
    { name: 'Written · News · "Terps lose again" — Zachary', value: "page-1" },
  ]);
});

test("autocomplete searches for what was typed", async () => {
  let asked: string | undefined;
  await handleInteraction(
    typing("terps"),
    deps({
      search: (query) => {
        asked = query;
        return Promise.resolve([]);
      },
    }),
  );

  expect(asked).toBe("terps");
});

/*
  two characters match most of the 138 rows, so a short query is answered with
  the editor's own recent work instead of a wildcard search
*/
test("a query under two characters is not searched for", async () => {
  const queries: string[] = [];
  const choices = asChoices(
    await handleInteraction(
      typing("t"),
      deps({
        search: (query) => {
          queries.push(query);
          return Promise.resolve([
            row({ pageId: "theirs", authorByline: "Ada L." }),
            row({ pageId: "ours", authorByline: "Zachary" }),
          ]);
        },
      }),
    ),
  );

  expect(queries).toEqual([""]);
  expect(choices.map((choice) => choice.value)).toEqual(["ours"]);
});

/*
  an autocomplete response is a list of the club's unpublished Articles, and it
  is sent before the command is ever run — so it is gated exactly as the
  command is
*/
test("autocomplete tells somebody off the board nothing", async () => {
  const choices = asChoices(
    await handleInteraction(
      typing("terps", ["some-other-role"]),
      deps({
        search: () => {
          throw new Error("must not read the index for somebody off the board");
        },
      }),
    ),
  );

  expect(choices).toEqual([]);
});

test("autocomplete refuses a payload with no member on it", async () => {
  const choices = asChoices(
    await handleInteraction(
      {
        type: 4,
        data: {
          name: "article",
          options: [
            {
              name: "show",
              options: [{ name: "article", value: "t", focused: true }],
            },
          ],
        },
        user: { username: "zsrobinson" },
      },
      deps(),
    ),
  );

  expect(choices).toEqual([]);
});

/*
  there is no deferred autocomplete response and discord's three seconds are
  hard, so a slow index has to become an empty dropdown rather than a
  "HareWare didn't respond in time" on every keystroke
*/
test("an index that never answers becomes an empty dropdown", async () => {
  const reply = await handleInteraction(
    typing("terps"),
    deps({ search: () => new Promise<ArticleRow[]>(() => {}), timeoutMs: 1 }),
  );

  expect(reply!.type).toBe(AUTOCOMPLETE_RESULT);
  expect(asChoices(reply)).toEqual([]);
});

test("an index that throws becomes an empty dropdown", async () => {
  const reply = await handleInteraction(
    typing("terps"),
    deps({ search: () => Promise.reject(new Error("d1 is unreachable")) }),
  );

  expect(reply!.type).toBe(AUTOCOMPLETE_RESULT);
  expect(asChoices(reply)).toEqual([]);
});

test("autocomplete with no reads wired up still answers", async () => {
  const reply = await handleInteraction(typing("terps"));

  expect(reply!.type).toBe(AUTOCOMPLETE_RESULT);
  expect(asChoices(reply)).toEqual([]);
});
