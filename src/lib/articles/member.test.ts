import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Person } from "~/lib/members/records";
import { MEMBERS_DATA_SOURCE_ID } from "~/lib/members/config";
import { matchMembers, resolveMember } from "./member";

const env = { NOTION_TOKEN: "notion-token" } as unknown as Env;

/** a Members row, as the roster reads it */
const member = (id: string, name: string, discordId?: string): Person => ({
  pageId: id,
  name,
  discordId: discordId ?? null,
  email: null,
  status: null,
  contributions: 0,
});

/* equal as doubles: a snowflake must never be compared as a number */
const ZACH = "1234567890123456789";
const NEIGHBOUR = "1234567890123456780";

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

/* ---- matching ----------------------------------------------------------- */

test("one row carrying the discord id is a match", () => {
  const result = matchMembers(
    [member("m1", "Zachary Robinson", ZACH), member("m2", "Matthew Gray")],
    ZACH,
    "someone else entirely",
  );

  expect(result.status).toBe("matched");
  if (result.status !== "matched") return;
  expect(result.member.pageId).toBe("m1");
});

test("a snowflake is compared as text, not as a number", () => {
  const result = matchMembers(
    [member("m1", "Zachary Robinson", ZACH)],
    NEIGHBOUR,
    "Nobody",
  );

  expect(result.status).toBe("absent");
});

test("no id match but one name match is linkable, and carries the patch", () => {
  const result = matchMembers(
    [member("m1", "Zachary Robinson"), member("m2", "Matthew Gray")],
    ZACH,
    "zachary  robinson",
  );

  expect(result.status).toBe("linkable");
  if (result.status !== "linkable") return;
  expect(result.member.pageId).toBe("m1");
  // the caller decides whether to link; this only says what linking would send
  expect(result.patch).toEqual({
    properties: {
      "Discord ID": { rich_text: [{ text: { content: ZACH } }] },
    },
  });
});

test("a row that already carries a different discord id is not linkable", () => {
  // writing our id over theirs would move every future credit onto them
  const result = matchMembers(
    [member("m1", "Zachary Robinson", NEIGHBOUR)],
    ZACH,
    "Zachary Robinson",
  );

  expect(result.status).toBe("absent");
});

test("several name matches are all returned rather than one picked", () => {
  const result = matchMembers(
    [member("m1", "Matthew Gray"), member("m2", "matthew gray")],
    ZACH,
    "Matthew Gray",
  );

  expect(result.status).toBe("ambiguous");
  if (result.status !== "ambiguous") return;
  expect(result.members.map((m) => m.pageId)).toEqual(["m1", "m2"]);
});

test("nothing matching at all is absent", () => {
  const result = matchMembers(
    [member("m1", "Matthew Gray")],
    ZACH,
    "Zachary Robinson",
  );

  expect(result.status).toBe("absent");
});

test("two rows sharing one discord id are refused, and both are named", () => {
  const result = matchMembers(
    [member("m1", "Zachary Robinson", ZACH), member("m2", "Zach R", ZACH)],
    ZACH,
    "Zachary Robinson",
  );

  expect(result.status).toBe("conflicted");
  if (result.status !== "conflicted") return;
  expect(result.members.map((m) => m.pageId)).toEqual(["m1", "m2"]);
  expect(result.members.map((m) => m.name)).toEqual([
    "Zachary Robinson",
    "Zach R",
  ]);
});

test("a conflict wins over a name match", () => {
  const result = matchMembers(
    [member("m1", "Zachary Robinson", ZACH), member("m2", "Zach R", ZACH)],
    ZACH,
    "Zachary Robinson",
  );

  expect(result.status).toBe("conflicted");
});

test("an empty Discord ID cell is absence, not a match on the empty string", () => {
  const result = matchMembers([member("m1", "Matthew Gray")], "", "Nobody");

  expect(result.status).toBe("absent");
});

/* ---- resolving ---------------------------------------------------------- */

test("resolving queries the Members data source and matches what came back", async () => {
  const fetchMock = vi.fn(async () =>
    Response.json({
      results: [
        {
          id: "m1",
          properties: {
            Name: {
              type: "title",
              title: [{ plain_text: "Zachary Robinson" }],
            },
          },
        },
      ],
    }),
  );
  vi.stubGlobal("fetch", fetchMock);

  const result = await resolveMember(env, ZACH, "Zachary Robinson");

  expect((fetchMock.mock.calls[0] as unknown as string[])?.[0]).toContain(
    `data_sources/${MEMBERS_DATA_SOURCE_ID}/query`,
  );
  expect(result.status).toBe("linkable");
});

test("a missing token is its own state rather than an absent member", async () => {
  const result = await resolveMember({} as Env, ZACH, "Zachary Robinson");

  expect(result.status).toBe("unavailable");
});

test("notion refusing the query is unavailable, never absent", async () => {
  // absent would send the editor off to create a member who already exists
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("nope", { status: 403 })),
  );

  const result = await resolveMember(env, ZACH, "Zachary Robinson");

  expect(result.status).toBe("unavailable");
  if (result.status !== "unavailable") return;
  expect(result.reason).toContain("403");
});
