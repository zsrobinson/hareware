import { expect, test } from "vitest";
import { deferEphemeral, handleInteraction, postedId } from "./interactions";
import { EDITORIAL_BOARD_ROLE_ID } from "./config";

const IS_COMPONENTS_V2 = 1 << 15;

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

test("answers discord's ping with a pong", () => {
  expect(handleInteraction({ type: 1 })).toEqual({ type: 1 });
});

test("marks the pressed button posted, crediting whoever pressed it", () => {
  const reply = handleInteraction(press(postedId("first")))!;

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
test("pressing a posted button un-posts it", () => {
  const posted = press(postedId("first"));
  posted.message.components[1]!.components![0] = {
    type: 2,
    style: 3,
    label: "Posted by someone else",
    custom_id: postedId("first"),
  };

  const button = handleInteraction(posted)!.data!.components[1].components![0];

  expect(button.style).toBe(4);
  expect(button.label).toBe("Not posted");
});

test("nothing is ever disabled", () => {
  const reply = handleInteraction(press(postedId("first")))!;

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
test("keeps the custom_id, without which the reply is invalid", () => {
  const reply = handleInteraction(press(postedId("first")))!;

  expect(reply.data!.components[1].components![0].custom_id).toBe(
    postedId("first"),
  );
});

test("every interactive button in the reply still has a custom_id", () => {
  const reply = handleInteraction(press(postedId("first")))!;

  for (const row of reply.data!.components) {
    for (const child of row.components ?? []) {
      const isLink = child.style === 5;
      expect(isLink || typeof child.custom_id === "string").toBe(true);
    }
  }
});

test("leaves the other article's button alone", () => {
  const reply = handleInteraction(press(postedId("first")))!;

  const other = reply.data!.components[4].components![0];
  expect(other.label).toBe("Not posted");
  expect(other.style).toBe(4);
  expect(other.custom_id).toBe(postedId("second"));
});

test("leaves link buttons alone", () => {
  const reply = handleInteraction(press(postedId("first")))!;

  const link = reply.data!.components[1].components![1];
  expect(link.url).toBe("https://x.test/1");
  expect(link.style).toBe(5);
});

test("keeps the text and dividers exactly as they were", () => {
  const reply = handleInteraction(press(postedId("first")))!;

  expect(reply.data!.components[0]).toEqual(message().components[0]);
  expect(reply.data!.components[2]).toEqual(message().components[2]);
});

test("prefers a member's display name over their username", () => {
  const reply = handleInteraction({
    ...press(postedId("first")),
    member: { user: { username: "zsrobinson", global_name: "Zachary" } },
  })!;

  expect(reply.data!.components[1].components![0].label).toBe(
    "Posted by Zachary",
  );
});

test("ignores a component it did not put there", () => {
  expect(handleInteraction(press("something_else"))).toBeUndefined();
});

/* 4 is APPLICATION_COMMAND_AUTOCOMPLETE, which nothing here registers yet */
test("ignores an interaction type it does not handle", () => {
  expect(handleInteraction({ type: 4 })).toBeUndefined();
});

test("a custom_id stays inside discord's 100 character limit", () => {
  expect(postedId("a".repeat(200)).length).toBe(100);
});

/* ---- slash commands ----------------------------------------------------- */

const EPHEMERAL = 64;

const command = (
  subcommand: string,
  roles: string[] = [EDITORIAL_BOARD_ROLE_ID],
) => ({
  type: 2,
  data: { name: "article", options: [{ name: subcommand }] },
  member: {
    roles,
    user: { username: "zsrobinson", global_name: "Zachary" },
  },
});

test("/article ping answers inline, crediting whoever ran it", () => {
  const reply = handleInteraction(command("ping"))!;

  expect(reply.type).toBe(4);
  expect(JSON.stringify(reply.data!.components)).toContain("Zachary");
});

/*
  ADR 0009: the editor sees the result, the channel sees nothing. and both
  flags together — the ephemeral bit alone with a components body is a response
  discord refuses outright
*/
test("a command reply is ephemeral, and says so in components v2", () => {
  const reply = handleInteraction(command("ping"))!;

  expect(reply.data!.flags).toBe(EPHEMERAL | IS_COMPONENTS_V2);
});

/*
  the registration hides the command with default_member_permissions "0", but
  that override is editable by any admin under Integrations — so it is a
  default, and this is the access check
*/
test("refuses somebody without the editorial board role", () => {
  const reply = handleInteraction(command("ping", ["some-other-role"]))!;

  expect(JSON.stringify(reply.data!.components)).not.toContain("listening");
  expect(JSON.stringify(reply.data!.components)).toContain("Editorial Board");
  expect(reply.data!.flags).toBe(EPHEMERAL | IS_COMPONENTS_V2);
});

/* absent roles is not an empty role list: a DM carries no member at all */
test("refuses a command with no member on it", () => {
  const reply = handleInteraction({
    type: 2,
    data: { name: "article", options: [{ name: "ping" }] },
    user: { username: "zsrobinson", global_name: "Zachary" },
  })!;

  expect(JSON.stringify(reply.data!.components)).toContain("Editorial Board");
});

/*
  discord shows an unanswered command as "HareWare didn't respond in time",
  which reads as a broken bot rather than a command that no longer exists
*/
test("answers a subcommand it does not know rather than going quiet", () => {
  const reply = handleInteraction(command("nonexistent"))!;

  expect(reply.type).toBe(4);
  expect(JSON.stringify(reply.data!.components)).toContain("does not know");
});

test("answers /article with no subcommand at all", () => {
  const reply = handleInteraction({
    type: 2,
    data: { name: "article" },
    member: { roles: [EDITORIAL_BOARD_ROLE_ID], user: { username: "z" } },
  })!;

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
