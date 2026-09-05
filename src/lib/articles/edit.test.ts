import { expect, test } from "vitest";
import { editSummary, runEdit, type EditIO, type EditRequest } from "./edit";
import type { Schema } from "./choices";
import type { ArticlePage } from "./page";
import type { Result } from "~/lib/result";
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
    "Article Status": { status: null },
    "Image Status": { status: null },
    Section: { select: null },
    "Author Byline": { rich_text: [] },
    "Image Byline": { rich_text: [] },
    Author: { relation: [] },
    "Image Crew": { relation: [] },
    "Publication Date": { date: null },
    ...properties,
  },
});

const actor = { id: "111", name: "Zachary Robinson" };

type Recorded = {
  patched: { pageId: string; body: unknown }[];
  created: unknown[];
  trashed: string[];
  linked: { pageId: string; patch: unknown }[];
  made: { name: string; discordId: string }[];
  logged: { result: Result; actor: string }[];
};

/** Simulate Notion's response shape, including plain_text from write text. */
function returnedProperties(body: {
  properties: Record<string, Record<string, unknown>>;
}): ArticlePage {
  return article(
    Object.fromEntries(
      Object.entries(body.properties).map(([name, value]) => {
        const entry = { ...value };
        for (const key of ["title", "rich_text"])
          if (Array.isArray(entry[key]))
            entry[key] = (entry[key] as { text: { content: string } }[]).map(
              ({ text }) => ({ plain_text: text.content }),
            );
        return [name, entry];
      }),
    ),
  );
}

/** an `EditIO` that records everything, with each piece overridable */
function spy(over: Partial<EditIO> = {}) {
  const seen: Recorded = {
    patched: [],
    created: [],
    trashed: [],
    linked: [],
    made: [],
    logged: [],
  };

  const io: EditIO = {
    schema: async () => fullSchema,
    page: async () => article(),
    patch: async (pageId, body) => {
      seen.patched.push({ pageId, body });
      return returnedProperties(body);
    },
    create: async (body) => {
      seen.created.push(body);
      return { ...returnedProperties(body), id: "page-new" };
    },
    trash: async (pageId) => {
      seen.trashed.push(pageId);
      return { ...article(), in_trash: true };
    },
    members: async () => ({ status: "absent" }) as MemberMatch,
    link: async (pageId, patch) => {
      seen.linked.push({ pageId, patch });
    },
    addMember: async (name, discordId) => {
      seen.made.push({ name, discordId });
      return { pageId: "member-new", name, discordId };
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

test("deleting moves the Article to Notion's Trash and keeps its returned page", async () => {
  const returned = {
    ...article(),
    in_trash: true,
    url: "https://notion.so/page-1",
  };
  const { io, seen } = spy({
    trash: async (pageId) => {
      seen.trashed.push(pageId);
      return returned;
    },
  });

  const result = await runEdit(io, { kind: "delete", pageId: "page-1" }, actor);

  expect(result).toMatchObject({ status: "deleted", page: returned });
  expect(seen.trashed).toEqual(["page-1"]);
  expect(seen.logged[0]!.result).toMatchObject({
    outcome: "ok",
    summary: "Moved article to Notion's Trash.",
  });
});

test("a trash response that does not confirm in_trash is uncertain", async () => {
  const { io } = spy({ trash: async () => article() });
  const result = await runEdit(io, { kind: "delete", pageId: "page-1" }, actor);
  expect(result).toMatchObject({ status: "failed", pageId: "page-1" });
  expect(editSummary(result)).toContain("could not be confirmed");
});

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
  expect(editSummary(said)).toContain('"Backlog"');
  expect(editSummary(said)).toContain('"Approved"');

  expect(seen.logged).toEqual([
    { result: { outcome: "ok", summary: editSummary(said) }, actor: "111" },
  ]);
});

test("notion refusing a write is words rather than a thrown promise", async () => {
  const { io, seen } = spy({
    patch: async () => {
      throw new Error("notion returned 409");
    },
  });

  const said = await runEdit(io, setStatus, actor);

  expect(editSummary(said)).toContain("409");
  expect(seen.logged[0]!.result.outcome).toBe("failed");
});

test("notion refusing the schema still answers the editor", async () => {
  const { io, seen } = spy({
    schema: async () => {
      throw new Error("notion returned 502");
    },
  });

  const said = await runEdit(io, setStatus, actor);

  expect(editSummary(said)).toContain("502");
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
      member: null,
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
  expect(editSummary(said)).toContain("Created article.");
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
      member: null,
      byline: "Zachary Robinson",
    },
    actor,
  );

  expect(editSummary(said)).toContain("approved");
  expect(
    (seen.created[0] as { properties: Record<string, unknown> }).properties,
  ).not.toHaveProperty("Article Status");
});

test("a new article credits the member the picker returned, creating the row", async () => {
  /* the bug this covers: `/article new` took a free-text byline and no
     member, so an editor picking a writer got the mention markup printed as
     the Byline and an empty Author relation */
  const { io, seen } = spy({ members: async () => ({ status: "absent" }) });

  const said = await runEdit(
    io,
    {
      kind: "create",
      headline: "Looney's line",
      section: null,
      member: { discordId: "222", displayName: "Bay Hoffman" },
      byline: null,
    },
    actor,
  );

  expect(seen.made).toEqual([{ name: "Bay Hoffman", discordId: "222" }]);

  const properties = (
    seen.created[0] as { properties: Record<string, unknown> }
  ).properties;
  expect(properties["Author Byline"]).toEqual({
    rich_text: [{ text: { content: "Bay Hoffman" } }],
  });
  expect(properties.Author).toEqual({ relation: [{ id: "member-new" }] });
  expect(editSummary(said)).toContain("Created Bay Hoffman in Members");
});

test("a new article with no member and no byline is credited to whoever ran it", async () => {
  const { io, seen } = spy();

  await runEdit(
    io,
    {
      kind: "create",
      headline: "Looney's line",
      section: null,
      member: null,
      byline: null,
    },
    actor,
  );

  const properties = (
    seen.created[0] as { properties: Record<string, unknown> }
  ).properties;
  expect(properties["Author Byline"]).toEqual({
    rich_text: [{ text: { content: actor.name } }],
  });
  expect(properties).not.toHaveProperty("Author");
});

test("a typed byline on a new article beats the picked member's name", async () => {
  const { io, seen } = spy({ members: async () => ({ status: "absent" }) });

  await runEdit(
    io,
    {
      kind: "create",
      headline: "Looney's line",
      section: null,
      member: { discordId: "222", displayName: "Bay Hoffman" },
      byline: "A Concerned Terrapin",
    },
    actor,
  );

  const properties = (
    seen.created[0] as { properties: Record<string, unknown> }
  ).properties;
  expect(properties["Author Byline"]).toEqual({
    rich_text: [{ text: { content: "A Concerned Terrapin" } }],
  });
  // the pseudonym is printed, and the person behind it is still linked
  expect(properties.Author).toEqual({ relation: [{ id: "member-new" }] });
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

  expect(editSummary(said)).toContain("not sharing");
  expect(editSummary(said)).toContain("Author");
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

  expect(editSummary(said)).toContain("member-1");
  expect(editSummary(said)).toContain("member-2");
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

  expect(editSummary(said)).toContain("member-1");
  expect(seen.patched).toEqual([]);
});

test("Members being unreadable writes nothing and says so", async () => {
  const { io, seen } = spy({
    members: async () => ({ status: "unavailable", reason: "no token" }),
  });

  const said = await runEdit(io, creditRequest(), actor);

  expect(editSummary(said)).toContain("no token");
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
  expect(editSummary(said)).toContain("Linked");
  expect(editSummary(said)).toContain("Bay Hoffman");
});

test("nobody matching creates a Members row, and the reply names it", async () => {
  const { io, seen } = spy();

  const said = await runEdit(io, creditRequest(), actor);

  expect(seen.made).toEqual([{ name: "Bay Hoffman", discordId: "222" }]);
  expect(editSummary(said)).toContain("Created Bay Hoffman in Members");
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

  expect(editSummary(said)).toContain("member");
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

/*
  the bug this exists for: the relation deduped and the printed byline did not.
  running the same `also` twice — a slow follow-up, an editor who thought it had
  not landed — left the relation correct and the byline reading "Bob and Bob",
  which is exactly the pair ADR 0004 exists to keep in step coming apart
*/
test("crediting the same member twice does not print them twice", async () => {
  const { io, seen } = spy({
    page: async () =>
      article({
        "Author Byline": {
          type: "rich_text",
          rich_text: [{ plain_text: "Bay Hoffman" }],
        },
        Author: { type: "relation", relation: [{ id: "member-bay" }] },
      }),
    members: async (): Promise<MemberMatch> => ({
      status: "matched",
      member: { pageId: "member-bay", name: "Bay Hoffman", discordId: "222" },
    }),
  });

  await runEdit(io, creditRequest({ also: true }), actor);

  expect(seen.patched).toEqual([]);
});

test("a confirmed write survives a logging failure and preserves the returned page", async () => {
  const returned = article({
    "Article Status": { status: { name: "Approved" } },
  });
  const { io } = spy({
    patch: async () => returned,
    log: async () => {
      throw new Error("D1 unavailable");
    },
  });
  const result = await runEdit(io, setStatus, actor);
  expect(result).toMatchObject({
    status: "updated",
    page: returned,
    changes: [{ property: "status", before: null, after: "Approved" }],
  });
});

test("an unchanged validated property skips the write and keeps its page", async () => {
  const page = article({ "Article Status": { status: { name: "Approved" } } });
  const { io, seen } = spy({ page: async () => page });
  expect(await runEdit(io, setStatus, actor)).toMatchObject({
    status: "unchanged",
    page,
    changes: [{ before: "Approved", after: "Approved" }],
  });
  expect(seen.patched).toEqual([]);
});

test("a missing property in the write response cannot claim a clear", async () => {
  const { io } = spy({
    page: async () =>
      article({ "Article Status": { status: { name: "Backlog" } } }),
    patch: async () => ({ id: "page-1", properties: {} }),
  });
  expect(await runEdit(io, setStatus, actor)).toMatchObject({
    status: "failed",
    pageId: "page-1",
    explanation: expect.stringContaining("could not be confirmed"),
  });
});

test("the receipt reports the returned value, not the intended value", async () => {
  const { io } = spy({
    patch: async () =>
      article({ "Article Status": { status: { name: "Written" } } }),
  });
  expect(await runEdit(io, setStatus, actor)).toMatchObject({
    status: "updated",
    changes: [{ before: null, after: "Written" }],
  });
});

test("a created Member remains in the result and log when the article write fails", async () => {
  const { io, seen } = spy({
    patch: async () => {
      throw new Error("connection lost");
    },
  });
  const result = await runEdit(io, creditRequest(), actor);
  expect(result).toMatchObject({
    status: "failed",
    notes: ["Created Bay Hoffman in Members."],
  });
  expect(seen.logged[0]!.result.summary).toContain(
    "Created Bay Hoffman in Members.",
  );
});

test("a linked Member remains in the result when article creation fails", async () => {
  const { io } = spy({
    members: async () => ({
      status: "linkable",
      member: { pageId: "member-1", name: "Bay Hoffman", discordId: null },
      patch: { properties: {} },
    }),
    create: async () => {
      throw new Error("connection lost");
    },
  });
  const result = await runEdit(
    io,
    {
      kind: "create",
      headline: "A headline",
      section: null,
      member: { discordId: "222", displayName: "Bay Hoffman" },
      byline: null,
    },
    actor,
  );
  expect(result).toMatchObject({
    status: "failed",
    notes: ["Linked Bay Hoffman to their Discord account in Members."],
  });
});

test("a Member write timeout does not claim the mutation was refused", async () => {
  const { io } = spy({
    addMember: async () => {
      throw new Error("timeout");
    },
  });
  expect(await runEdit(io, creditRequest(), actor)).toMatchObject({
    status: "failed",
    explanation: expect.stringContaining(
      "Check Notion and Members before retrying",
    ),
  });
});

test("an incomplete creation response keeps the new article link without inventing values", async () => {
  const { io } = spy({
    create: async () => ({ id: "page-new", properties: {} }),
  });
  expect(
    await runEdit(
      io,
      {
        kind: "create",
        headline: "A headline",
        section: null,
        member: null,
        byline: null,
      },
      actor,
    ),
  ).toMatchObject({
    status: "failed",
    pageId: "page-new",
    explanation: expect.stringContaining("Notion created the article"),
  });
});

test("an explicitly null date is confirmed as a clear", async () => {
  const { io } = spy({
    page: async () =>
      article({ "Publication Date": { date: { start: "2026-09-10" } } }),
    patch: async () => article({ "Publication Date": { date: null } }),
  });
  expect(
    await runEdit(
      io,
      {
        kind: "property",
        pageId: "page-1",
        intent: { property: "publicationDate", date: null },
      },
      actor,
    ),
  ).toMatchObject({
    status: "updated",
    changes: [
      { property: "publicationDate", before: "2026-09-10", after: null },
    ],
  });
});

test("a missing before value cannot become an unchanged clear", async () => {
  const { io, seen } = spy({
    page: async () => ({ id: "page-1", properties: {} }),
  });
  expect(
    await runEdit(
      io,
      {
        kind: "property",
        pageId: "page-1",
        intent: { property: "publicationDate", date: null },
      },
      actor,
    ),
  ).toMatchObject({ status: "failed" });
  expect(seen.patched).toEqual([]);
});

test("a missing credit relation refuses before creating or linking a Member", async () => {
  const page = article();
  delete page.properties.Author;
  const { io, seen } = spy({ page: async () => page });
  expect(await runEdit(io, creditRequest({ also: true }), actor)).toMatchObject(
    { status: "failed" },
  );
  expect(seen.patched).toEqual([]);
  expect(seen.made).toEqual([]);
  expect(seen.linked).toEqual([]);
});
