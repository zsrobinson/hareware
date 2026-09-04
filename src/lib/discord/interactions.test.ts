import { expect, test } from "vitest";
import { handleInteraction, postedId } from "./interactions";

const IS_COMPONENTS_V2 = 1 << 15;

/** a message like the social ping's: two articles, each with its own row */
const message = () => ({
  components: [
    { type: 10, content: "<@&1> **First article**" },
    {
      type: 1,
      components: [
        { type: 2, style: 1, label: "Mark as Posted", custom_id: postedId("first") },
        { type: 2, style: 5, label: "Open Post Generator", url: "https://x.test/1" },
      ],
    },
    { type: 14, spacing: 1, divider: false },
    { type: 10, content: "<@&1> **Second article**" },
    {
      type: 1,
      components: [
        { type: 2, style: 1, label: "Mark as Posted", custom_id: postedId("second") },
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
  expect(button.disabled).toBe(true);
});

test("spends the pressed button so it cannot be pressed again", () => {
  const reply = handleInteraction(press(postedId("first")))!;
  expect(reply.data!.components[1].components![0].custom_id).toBeUndefined();
});

test("leaves the other article's button alone", () => {
  const reply = handleInteraction(press(postedId("first")))!;

  const other = reply.data!.components[4].components![0];
  expect(other.label).toBe("Mark as Posted");
  expect(other.custom_id).toBe(postedId("second"));
  expect(other.disabled).toBeUndefined();
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

test("ignores an interaction type it does not handle", () => {
  expect(handleInteraction({ type: 2 })).toBeUndefined();
});

test("a custom_id stays inside discord's 100 character limit", () => {
  expect(postedId("a".repeat(200)).length).toBe(100);
});
