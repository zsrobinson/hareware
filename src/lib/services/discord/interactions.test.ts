import { expect, test } from "vitest";
import { handleInteraction, type InteractionResponse } from "./interactions";
import { postedId } from "./posted-button";

const IS_COMPONENTS_V2 = 1 << 15;

/** the reply narrowed to a message, failing loudly if it is not one */
function asMessage(reply: InteractionResponse | undefined) {
  if (!reply?.data?.components)
    throw new Error("expected a message reply, got " + JSON.stringify(reply));

  return reply as InteractionResponse & {
    data: {
      flags: number;
      components: NonNullable<InteractionResponse["data"]>["components"] &
        object;
    };
  };
}

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
  expect(handleInteraction({ type: 1 })).toEqual({ type: 1 });
});

test("marks the pressed button posted, crediting whoever pressed it", async () => {
  const reply = asMessage(handleInteraction(press(postedId("first"))));

  expect(reply.type).toBe(7);
  expect(reply.data!.flags).toBe(IS_COMPONENTS_V2);

  const button = reply.data!.components[1].components![0];
  expect(button.label).toBe("Posted by zsrobinson");
  expect(button.style).toBe(3);
});

test("pressing a posted button un-posts it", async () => {
  const posted = press(postedId("first"));
  posted.message.components[1]!.components![0] = {
    type: 2,
    style: 3,
    label: "Posted by someone else",
    custom_id: postedId("first"),
  };

  const reply = asMessage(handleInteraction(posted));
  const button = reply.data!.components[1].components![0];

  expect(button.style).toBe(4);
  expect(button.label).toBe("Not posted");
});

test("nothing is ever disabled", async () => {
  const reply = asMessage(handleInteraction(press(postedId("first"))));

  for (const row of reply.data!.components) {
    for (const child of row.components ?? []) {
      expect(child.disabled).toBeUndefined();
    }
  }
});

/* without a custom_id Discord rejects the whole response (silent-failures.md) */
test("keeps the custom_id, without which the reply is invalid", async () => {
  const reply = asMessage(handleInteraction(press(postedId("first"))));

  expect(reply.data!.components[1].components![0].custom_id).toBe(
    postedId("first"),
  );
});

test("every interactive button in the reply still has a custom_id", async () => {
  const reply = asMessage(handleInteraction(press(postedId("first"))));

  for (const row of reply.data!.components) {
    for (const child of row.components ?? []) {
      const isLink = child.style === 5;
      expect(isLink || typeof child.custom_id === "string").toBe(true);
    }
  }
});

test("leaves the other article's button alone", async () => {
  const reply = asMessage(handleInteraction(press(postedId("first"))));

  const other = reply.data!.components[4].components![0];
  expect(other.label).toBe("Not posted");
  expect(other.style).toBe(4);
  expect(other.custom_id).toBe(postedId("second"));
});

test("leaves link buttons alone", async () => {
  const reply = asMessage(handleInteraction(press(postedId("first"))));

  const link = reply.data!.components[1].components![1];
  expect(link.url).toBe("https://x.test/1");
  expect(link.style).toBe(5);
});

test("keeps the text and dividers exactly as they were", async () => {
  const reply = asMessage(handleInteraction(press(postedId("first"))));

  expect(reply.data!.components[0]).toEqual(message().components[0]);
  expect(reply.data!.components[2]).toEqual(message().components[2]);
});

test("prefers a member's display name over their username", async () => {
  const reply = asMessage(
    handleInteraction({
      ...press(postedId("first")),
      member: { user: { username: "zsrobinson", global_name: "Zachary" } },
    }),
  );

  expect(reply.data!.components[1].components![0].label).toBe(
    "Posted by Zachary",
  );
});

test("ignores a component it did not put there", async () => {
  expect(handleInteraction(press("something_else"))).toBeUndefined();
});

test("ignores an interaction type it does not handle", async () => {
  expect(handleInteraction({ type: 99 })).toBeUndefined();
});

test("a custom_id stays inside discord's 100 character limit", () => {
  expect(postedId("a".repeat(200)).length).toBe(100);
});

test("answers a slash command left over from an older deploy", () => {
  const reply = handleInteraction({ type: 2, data: { name: "article" } });

  expect(reply?.type).toBe(4);
  expect(reply?.data?.content).toContain("/article");
});
