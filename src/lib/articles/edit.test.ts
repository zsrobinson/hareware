import { expect, test } from "vitest";
import { runEdit, type EditIO, type EditRequest } from "./edit";
import type { Schema } from "./choices";
import type { ArticlePage } from "./sync";
import type { Result } from "~/lib/automations/registry";
import type { MemberMatch } from "./member";

/*
  the whole outside world, hand-written, so every refusal below is reachable —
  which is the point of testing here at all. the guards are the paths an
  integration test would never take on purpose, and each of them is the
  difference between a wrong reply and a member's articles being reattributed
*/

const fullSchema: Schema = {
  properties: {
    Headline: { type: "title" },
    "Article Status": {
      type: "status",
      status: { options: [{ name: "Backlog" }, { name: "Approved" }] },
    },
    "Image Status": { type: "status", status: { options: [{ name: "Done" }] } },
    Section: { type: "select", select: { options: [{ name: "Rabbithole" }] } },
    "Author Byline": { type: "rich_text" },
    "Image Byline": { type: "rich_text" },
    "Publication Date": { type: "date" },
    Author: { type: "relation" },
    "Image Crew": { type: "relation" },
  },
};

/** the same schema with Members unshared — notion drops the property entirely */
const withoutAuthor: Schema = {
  properties: Object.fromEntries(
    Object.entries(fullSchema.properties).filter(([name]) => name !== "Author"),
  ),
};

const article = (properties: ArticlePage["properties"] = {}): ArticlePage => ({
  id: "page-1",
  last_edited_time: "2026-09-04T10:05:00.000Z",
  properties: {
    Headline: { type: "title", title: [{ plain_text: "Looney's line" }] },
    ...properties,
  },
});

const actor = { id: "111", name: "Zachary Robinson" };

type Recorded = {
  patched: { pageId: string; body: unknown }[];
  created: unknown[];
  indexed: ArticlePage[];
  linked: { pageId: string; patch: unknown }[];
  made: { name: string; discordId: string }[];
  logged: { result: Result; actor: string }[];
};

/** an `EditIO` that records everything, with each piece overridable */
function spy(over: Partial<EditIO> = {}) {
  const seen: Recorded = {
    patched: [],
    created: [],
    indexed: [],
    linked: [],
    made: [],
    logged: [],
  };

  const io: EditIO = {
    schema: async () => fullSchema,
    page: async () => article(),
    patch: async (pageId, body) => {
      seen.patched.push({ pageId, body });
      return article();
    },
    create: async (body) => {
      seen.created.push(body);
      return { ...article(), id: "page-new" };
    },
    members: async () => ({ status: "absent" }) as MemberMatch,
    link: async (pageId, patch) => {
      seen.linked.push({ pageId, patch });
    },
    addMember: async (name, discordId) => {
      seen.made.push({ name, discordId });
      return { pageId: "member-new", name, discordId };
    },
    index: async (page) => {
      seen.indexed.push(page);
    },
    log: async (result, who) => {
      seen.logged.push({ result, actor: who.id });
    },
    ...over,
  };

  return { io, seen };
}

const setStatus: EditRequest = {
  kind: "property",
  pageId: "page-1",
  intent: { property: "status", option: "Approved" },
};

/* ---- a plain property change -------------------------------------------- */

test("a property change patches notion, indexes what came back, and logs it", async () => {
  const { io, seen } = spy({
    page: async () =>
      article({
        "Article Status": { type: "status", status: { name: "Backlog" } },
      }),
    patch: async (pageId, body) => {
      expect(pageId).toBe("page-1");
      expect(body).toEqual({
        properties: { "Article Status": { status: { name: "Approved" } } },
      });
      return {
        ...article({
          "Article Status": { type: "status", status: { name: "Approved" } },
        }),
        last_edited_time: "2026-09-04T10:09:00.000Z",
      };
    },
  });

  const said = await runEdit(io, setStatus, actor);

  // the reply says what it changed *from*, which is what makes it undoable
  expect(said).toContain('"Backlog"');
  expect(said).toContain('"Approved"');

  // the index is written from the page the PATCH answered with, not the read
  expect(seen.indexed).toHaveLength(1);
  expect(seen.indexed[0]!.last_edited_time).toBe("2026-09-04T10:09:00.000Z");

  expect(seen.logged).toEqual([
    { result: { outcome: "ok", summary: said }, actor: "111" },
  ]);
});

test("notion refusing a write is words rather than a thrown promise", async () => {
  const { io, seen } = spy({
    patch: async () => {
      throw new Error("notion returned 409");
    },
  });

  const said = await runEdit(io, setStatus, actor);

  expect(said).toContain("409");
  expect(seen.indexed).toEqual([]);
  expect(seen.logged[0]!.result.outcome).toBe("failed");
});

test("notion refusing the schema still answers the editor", async () => {
  const { io, seen } = spy({
    schema: async () => {
      throw new Error("notion returned 502");
    },
  });

  const said = await runEdit(io, setStatus, actor);

  expect(said).toContain("502");
  expect(seen.patched).toEqual([]);
  expect(seen.logged[0]!.result.outcome).toBe("failed");
});

/* ---- creating one ------------------------------------------------------- */

test("a new article is created at the schema's own spelling of approved", async () => {
  const { io, seen } = spy();

  const said = await runEdit(
    io,
    {
      kind: "create",
      headline: "Looney's line",
      section: "Rabbithole",
      byline: "Zachary Robinson",
    },
    actor,
  );

  expect(seen.created).toEqual([
    {
      properties: {
        Headline: { title: [{ text: { content: "Looney's line" } }] },
        "Author Byline": {
          rich_text: [{ text: { content: "Zachary Robinson" } }],
        },
        "Article Status": { status: { name: "Approved" } },
        Section: { select: { name: "Rabbithole" } },
      },
    },
  ]);
  expect(said).toContain("Created **Looney's line**");
  expect(seen.indexed).toHaveLength(1);
});

test("a renamed approved option is said out loud rather than sent to notion", async () => {
  /* ADR 0009: no notion value is typed into this repo, so the option is looked
     up — and a lookup that misses has to be reported, not guessed at */
  const { io, seen } = spy({
    schema: async () => ({
      properties: {
        ...fullSchema.properties,
        "Article Status": {
          type: "status",
          status: { options: [{ name: "Backlog" }] },
        },
      },
    }),
  });

  const said = await runEdit(
    io,
    {
      kind: "create",
      headline: "Looney's line",
      section: null,
      byline: "Zachary Robinson",
    },
    actor,
  );

  expect(said).toContain("approved");
  expect(
    (seen.created[0] as { properties: Record<string, unknown> }).properties,
  ).not.toHaveProperty("Article Status");
});

/* ---- credits, and the guards on them ------------------------------------ */

const creditRequest = (
  over: Partial<Extract<EditRequest, { kind: "credit" }>> = {},
): EditRequest => ({
  kind: "credit",
  pageId: "page-1",
  credit: "author",
  member: { discordId: "222", displayName: "Bay Hoffman" },
  byline: null,
  also: false,
  ...over,
});

test("a relation notion is not sharing is refused rather than overwritten", async () => {
  /*
    the data-loss guard. notion omits a relation whose target the integration
    cannot reach, and the value then reads back as `[]` on every page — so an
    append built on that read deletes co-authors nobody can see
  */
  const { io, seen } = spy({ schema: async () => withoutAuthor });

  const said = await runEdit(io, creditRequest(), actor);

  expect(said).toContain("not sharing");
  expect(said).toContain("Author");
  expect(seen.patched).toEqual([]);
  expect(seen.made).toEqual([]);
  expect(seen.logged[0]!.result.outcome).toBe("failed");
});

test("two Members sharing a Discord ID is refused, naming both", async () => {
  const { io, seen } = spy({
    members: async () => ({
      status: "conflicted",
      members: [
        { pageId: "member-1", name: "Bay Hoffman", discordId: "222" },
        { pageId: "member-2", name: "Bay H", discordId: "222" },
      ],
    }),
  });

  const said = await runEdit(io, creditRequest(), actor);

  expect(said).toContain("member-1");
  expect(said).toContain("member-2");
  expect(seen.patched).toEqual([]);
  expect(seen.logged[0]!.result.outcome).toBe("failed");
});

test("two Members answering to one name is refused rather than picked between", async () => {
  const { io, seen } = spy({
    members: async () => ({
      status: "ambiguous",
      members: [
        { pageId: "member-1", name: "Bay Hoffman", discordId: null },
        { pageId: "member-2", name: "Bay Hoffman", discordId: null },
      ],
    }),
  });

  const said = await runEdit(io, creditRequest(), actor);

  expect(said).toContain("member-1");
  expect(seen.patched).toEqual([]);
});

test("Members being unreadable writes nothing and says so", async () => {
  const { io, seen } = spy({
    members: async () => ({ status: "unavailable", reason: "no token" }),
  });

  const said = await runEdit(io, creditRequest(), actor);

  expect(said).toContain("no token");
  expect(seen.patched).toEqual([]);
});

test("a name match links the Discord ID onto that row and says so", async () => {
  /* the common path: 39 of 48 Members carry no id, so the roster backfills
     itself as editors credit people */
  const { io, seen } = spy({
    members: async () => ({
      status: "linkable",
      member: { pageId: "member-7", name: "Bay Hoffman", discordId: null },
      patch: { properties: { "Discord ID": { rich_text: [] } } },
    }),
  });

  const said = await runEdit(io, creditRequest(), actor);

  expect(seen.linked).toHaveLength(1);
  expect(seen.linked[0]!.pageId).toBe("member-7");
  expect(said).toContain("linked");
  expect(said).toContain("Bay Hoffman");
});

test("nobody matching creates a Members row, and the reply names it", async () => {
  const { io, seen } = spy();

  const said = await runEdit(io, creditRequest(), actor);

  expect(seen.made).toEqual([{ name: "Bay Hoffman", discordId: "222" }]);
  expect(said).toContain("created **Bay Hoffman** in Members");
});

test("a credit writes the printed Byline and the relation in one patch", async () => {
  const { io, seen } = spy({
    members: async () => ({
      status: "matched",
      member: { pageId: "member-7", name: "Bay Hoffman", discordId: "222" },
    }),
  });

  await runEdit(io, creditRequest(), actor);

  // ADR 0004: never one without the other
  expect(seen.patched[0]!.body).toEqual({
    properties: {
      "Author Byline": { rich_text: [{ text: { content: "Bay Hoffman" } }] },
      Author: { relation: [{ id: "member-7" }] },
    },
  });
});

test("`also` adds to the credit that is there rather than replacing it", async () => {
  const { io, seen } = spy({
    page: async () =>
      article({
        "Author Byline": {
          type: "rich_text",
          rich_text: [{ plain_text: "Zachary Robinson" }],
        },
        Author: { type: "relation", relation: [{ id: "member-1" }] },
      }),
    members: async () => ({
      status: "matched",
      member: { pageId: "member-7", name: "Bay Hoffman", discordId: "222" },
    }),
  });

  await runEdit(io, creditRequest({ also: true }), actor);

  expect(seen.patched[0]!.body).toEqual({
    properties: {
      "Author Byline": {
        rich_text: [{ text: { content: "Zachary Robinson and Bay Hoffman" } }],
      },
      Author: { relation: [{ id: "member-1" }, { id: "member-7" }] },
    },
  });
});

test("without `also` the credit is replaced outright", async () => {
  const { io, seen } = spy({
    page: async () =>
      article({
        Author: { type: "relation", relation: [{ id: "member-1" }] },
      }),
    members: async () => ({
      status: "matched",
      member: { pageId: "member-7", name: "Bay Hoffman", discordId: "222" },
    }),
  });

  await runEdit(io, creditRequest(), actor);

  expect(seen.patched[0]!.body).toMatchObject({
    properties: { Author: { relation: [{ id: "member-7" }] } },
  });
});

test("a pseudonym changes the printed name without unlinking the member", async () => {
  /* ADR 0004: the text is authoritative for what gets printed and the relation
     is who it actually was. setting one must not silently clear the other */
  const { io, seen } = spy({
    page: async () =>
      article({
        Author: { type: "relation", relation: [{ id: "member-1" }] },
      }),
  });

  await runEdit(
    io,
    creditRequest({ member: null, byline: "Gale de Silva" }),
    actor,
  );

  expect(seen.patched[0]!.body).toEqual({
    properties: {
      "Author Byline": { rich_text: [{ text: { content: "Gale de Silva" } }] },
      Author: { relation: [{ id: "member-1" }] },
    },
  });
  expect(seen.made).toEqual([]);
});

test("a credit with neither a member nor a byline is a question, not a write", async () => {
  const { io, seen } = spy();

  const said = await runEdit(
    io,
    creditRequest({ member: null, byline: null }),
    actor,
  );

  expect(said).toContain("member");
  expect(seen.patched).toEqual([]);
});

test("an image credit writes the image pair, not the author pair", async () => {
  const { io, seen } = spy({
    members: async () => ({
      status: "matched",
      member: { pageId: "member-7", name: "Bay Hoffman", discordId: "222" },
    }),
  });

  await runEdit(io, creditRequest({ credit: "image" }), actor);

  expect(seen.patched[0]!.body).toEqual({
    properties: {
      "Image Byline": { rich_text: [{ text: { content: "Bay Hoffman" } }] },
      "Image Crew": { relation: [{ id: "member-7" }] },
    },
  });
});

/* ---- the log ------------------------------------------------------------ */

test("every attempt is logged against the editor who made it", async () => {
  const { io, seen } = spy();

  await runEdit(io, setStatus, actor);
  await runEdit(io, { ...setStatus, pageId: "page-2" }, actor);

  expect(seen.logged).toHaveLength(2);
  expect(seen.logged.every((row) => row.actor === "111")).toBe(true);
});
