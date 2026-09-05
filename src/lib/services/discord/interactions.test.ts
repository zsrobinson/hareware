import { expect, test } from "vitest";
import {
  deferEphemeral,
  handleInteraction,
  postedId,
  type InteractionDeps,
  type InteractionResponse,
  type BodyResponse,
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
function asMessage(reply: InteractionResponse | undefined): BodyResponse {
  if (!reply?.data || !("components" in reply.data))
    throw new Error("expected a message reply, got " + JSON.stringify(reply));

  return reply as BodyResponse;
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
  index: () => Promise.resolve([row()]),
  page: () => Promise.resolve(notionPage()),
  ...over,
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
        index: () => {
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
  /* the headline and nothing else: the status and byline that used to be
     crammed in front of it were noise an editor already knows */
  expect(asChoices(reply)).toEqual([
    { name: "Terps lose again", value: "page-1" },
  ]);
});

test("autocomplete matches what was typed, against what it read", async () => {
  /* the query never reaches d1 any more — the whole index comes back and the
     ranking happens here, which is what buys a fuzzy match */
  const choices = asChoices(
    await handleInteraction(
      typing("looney"),
      deps({
        index: () =>
          Promise.resolve([
            row({ pageId: "hit", headline: "Looney's patrons banned" }),
            row({ pageId: "miss", headline: "Terps lose again" }),
          ]),
      }),
    ),
  );

  expect(choices.map((choice) => choice.value)).toEqual(["hit"]);
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
        index: () => {
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
    deps({ index: () => new Promise<ArticleRow[]>(() => {}), timeoutMs: 1 }),
  );

  expect(reply!.type).toBe(AUTOCOMPLETE_RESULT);
  expect(asChoices(reply)).toEqual([]);
});

test("an index that throws becomes an empty dropdown", async () => {
  const reply = await handleInteraction(
    typing("terps"),
    deps({ index: () => Promise.reject(new Error("d1 is unreachable")) }),
  );

  expect(reply!.type).toBe(AUTOCOMPLETE_RESULT);
  expect(asChoices(reply)).toEqual([]);
});

test("autocomplete with no reads wired up still answers", async () => {
  const reply = await handleInteraction(typing("terps"));

  expect(reply!.type).toBe(AUTOCOMPLETE_RESULT);
  expect(asChoices(reply)).toEqual([]);
});

/* ---- the write commands ------------------------------------------------- */

const DEFERRED = 5;

/**
 * deps that run the deferred work inline and await it.
 *
 * this is the whole reason `defer` is a dependency rather than a `waitUntil`
 * call inside the handler: with it, every branch of a deferred write — the
 * refusal, the throw, the follow-up discord rejected — is reachable in a test
 * with no worker, no notion and no discord
 */
function writing(over: Partial<InteractionDeps> = {}) {
  const seen = {
    requests: [] as unknown[],
    actors: [] as { id: string; name: string }[],
    followed: [] as { applicationId: string; token: string; content: string }[],
  };
  const work: Promise<void>[] = [];

  const deps: InteractionDeps = {
    edit: async (request, actor) => {
      seen.requests.push(request);
      seen.actors.push(actor);
      return "did the thing";
    },
    reply: async (applicationId, token, content) => {
      seen.followed.push({ applicationId, token, content });
      return { outcome: "ok", summary: "sent" };
    },
    defer: (run) => work.push(run()),
    ...over,
  };

  return { deps, seen, settle: () => Promise.all(work) };
}

/** a command carrying the two things a follow-up needs */
const writeCommand = (
  subcommand: string,
  options: Parameters<typeof command>[1] = [],
  resolved?: {
    members?: Record<string, { nick?: string | null }>;
    users?: Record<
      string,
      { id?: string; username?: string; global_name?: string | null }
    >;
  },
) => ({
  ...command(subcommand, options),
  application_id: "app-1",
  token: "tok-1",
  data: { ...command(subcommand, options).data, resolved },
});

test("a write defers, then follows up with what the edit said", async () => {
  const { deps, seen, settle } = writing();

  const reply = await handleInteraction(
    writeCommand("status", [
      { name: "article", value: "page-1" },
      { name: "status", value: "Approved" },
    ]),
    deps,
  );

  // no body on a deferral, and the plain ephemeral flag rather than the v2 pair
  expect(reply).toEqual({ type: DEFERRED, data: { flags: EPHEMERAL } });

  await settle();

  expect(seen.requests).toEqual([
    {
      kind: "property",
      pageId: "page-1",
      intent: { property: "status", option: "Approved" },
    },
  ]);
  expect(seen.followed).toEqual([
    { applicationId: "app-1", token: "tok-1", content: "did the thing" },
  ]);
});

/*
  the exact silent failure `docs/agents/silent-failures.md` names: an
  acknowledged interaction left silent shows the editor "HareWare is thinking…"
  forever, and they cannot tell a refused write from a slow one
*/
test("an edit that throws still follows up", async () => {
  const { deps, seen, settle } = writing({
    edit: async () => {
      throw new Error("notion fell over");
    },
  });

  await handleInteraction(
    writeCommand("headline", [
      { name: "article", value: "page-1" },
      { name: "headline", value: "Looney's line" },
    ]),
    deps,
  );
  await settle();

  expect(seen.followed).toHaveLength(1);
  expect(seen.followed[0]!.content).toContain("error");
});

test("nowhere to run the work is refused inline rather than deferred", async () => {
  const { deps } = writing({ defer: undefined });

  const reply = asMessage(
    await handleInteraction(
      writeCommand("status", [
        { name: "article", value: "page-1" },
        { name: "status", value: "Approved" },
      ]),
      deps,
    ),
  );

  expect(reply.type).toBe(4);
  expect(text(reply)).toContain("Nothing was changed");
});

test("a headline the picker did not fill in is answered before deferring", async () => {
  const { deps, seen } = writing();

  const reply = asMessage(
    await handleInteraction(
      writeCommand("status", [{ name: "status", value: "Approved" }]),
      deps,
    ),
  );

  expect(reply.type).toBe(4);
  expect(text(reply)).toContain("Pick an Article");
  expect(seen.requests).toEqual([]);
});

/* ---- the date ----------------------------------------------------------- */

test("a publication date that is not one is refused rather than written", async () => {
  const { deps, seen } = writing();

  for (const bad of [
    "next tuesday",
    "09/10/2026",
    "2026-13-01",
    "2026-02-31",
  ]) {
    const reply = asMessage(
      await handleInteraction(
        writeCommand("publication-date", [
          { name: "article", value: "page-1" },
          { name: "date", value: bad },
        ]),
        deps,
      ),
    );

    expect(text(reply)).toContain("YYYY-MM-DD");
  }

  expect(seen.requests).toEqual([]);
});

test("a publication date with no date clears it", async () => {
  const { deps, seen, settle } = writing();

  await handleInteraction(
    writeCommand("publication-date", [{ name: "article", value: "page-1" }]),
    deps,
  );
  await settle();

  expect(seen.requests).toEqual([
    {
      kind: "property",
      pageId: "page-1",
      intent: { property: "publicationDate", date: null },
    },
  ]);
});

test("a real date is passed through as notion writes it", async () => {
  const { deps, seen, settle } = writing();

  await handleInteraction(
    writeCommand("publication-date", [
      { name: "article", value: "page-1" },
      { name: "date", value: "2026-09-10" },
    ]),
    deps,
  );
  await settle();

  expect(seen.requests[0]).toMatchObject({
    intent: { property: "publicationDate", date: "2026-09-10" },
  });
});

/* ---- credits ------------------------------------------------------------ */

test("the picked member's name comes out of the payload, nickname first", async () => {
  /* ADR 0009: the interaction resolves the user, so crediting somebody costs
     no discord request at all */
  const { deps, seen, settle } = writing();

  await handleInteraction(
    writeCommand(
      "author",
      [
        { name: "article", value: "page-1" },
        { name: "member", value: "222" },
        { name: "also", value: true },
      ],
      {
        members: { "222": { nick: "Bay" } },
        users: { "222": { username: "bayh", global_name: "Bay Hoffman" } },
      },
    ),
    deps,
  );
  await settle();

  expect(seen.requests).toEqual([
    {
      kind: "credit",
      pageId: "page-1",
      credit: "author",
      member: { discordId: "222", displayName: "Bay" },
      byline: null,
      also: true,
    },
  ]);
});

test("no nickname falls back to the display name, then the handle", async () => {
  const { deps, seen, settle } = writing();

  await handleInteraction(
    writeCommand(
      "image-crew",
      [
        { name: "article", value: "page-1" },
        { name: "member", value: "222" },
      ],
      { users: { "222": { username: "bayh", global_name: null } } },
    ),
    deps,
  );
  await settle();

  expect(seen.requests[0]).toMatchObject({
    credit: "image",
    member: { displayName: "bayh" },
    also: false,
  });
});

test("a byline with no member is a credit request all the same", async () => {
  const { deps, seen, settle } = writing();

  await handleInteraction(
    writeCommand("author", [
      { name: "article", value: "page-1" },
      { name: "byline", value: "Gale de Silva" },
    ]),
    deps,
  );
  await settle();

  expect(seen.requests[0]).toMatchObject({
    member: null,
    byline: "Gale de Silva",
  });
});

/* ---- creating ----------------------------------------------------------- */

test("a new article takes the caller's name as its byline by default", async () => {
  const { deps, seen, settle } = writing();

  await handleInteraction(
    writeCommand("new", [{ name: "headline", value: "Looney's line" }]),
    deps,
  );
  await settle();

  // ADR 0004: the printed Byline is always filled
  expect(seen.requests).toEqual([
    {
      kind: "create",
      headline: "Looney's line",
      section: null,
      byline: "Zachary",
    },
  ]);
  expect(seen.actors).toEqual([{ id: "", name: "Zachary" }]);
});

test("a new article with no headline is refused before anything is written", async () => {
  const { deps, seen } = writing();

  const reply = asMessage(await handleInteraction(writeCommand("new"), deps));

  expect(text(reply)).toContain("Headline");
  expect(seen.requests).toEqual([]);
});
