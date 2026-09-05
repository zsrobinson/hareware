import { changesSummary } from "./write";
import { expect, test } from "vitest";
import { plan, planCreate, planCredit } from "./write";
import type { Schema } from "./choices";
import type { ArticlePage } from "./page";

/*
  a schema notion is sharing fully. built from the real property names rather
  than a literal so a rename in `config.ts` cannot leave these tests asserting
  against a schema nobody has
*/
const fullSchema: Schema = {
  properties: {
    Headline: { type: "title" },
    "Article Status": { type: "status" },
    "Image Status": { type: "status" },
    Section: { type: "select" },
    "Author Byline": { type: "rich_text" },
    "Image Byline": { type: "rich_text" },
    "Publication Date": { type: "date" },
    Author: { type: "relation" },
    "Image Crew": { type: "relation" },
  },
};

/** the same schema with Members unshared, which is how notion reports it */
const withoutAuthor: Schema = {
  properties: Object.fromEntries(
    Object.entries(fullSchema.properties).filter(([name]) => name !== "Author"),
  ),
};

const page = (properties: ArticlePage["properties"] = {}): ArticlePage => ({
  id: "page-1",
  last_edited_time: "2026-09-04T10:05:00.000Z",
  properties: {
    Headline: { type: "title", title: [{ plain_text: "Looney's line" }] },
    ...properties,
  },
});

const planned = (result: ReturnType<typeof plan>) => {
  if (result.status !== "planned")
    throw new Error(`expected a plan, got ${result.status}: ${result.reason}`);
  return result.plan;
};

/* ---- planning a change -------------------------------------------------- */

test("a status change patches only its own property", () => {
  const { properties } = planned(
    plan(fullSchema, page(), { property: "status", option: "Section Edited" }),
  );

  expect(properties).toEqual({
    "Article Status": { status: { name: "Section Edited" } },
  });
});

test("Section is a select, so it is patched as one", () => {
  const { properties } = planned(
    plan(fullSchema, page(), { property: "section", option: "Rabbithole" }),
  );

  expect(properties).toEqual({ Section: { select: { name: "Rabbithole" } } });
});

test("the sentence says what the value changed from as well as to", () => {
  const { changes } = planned(
    plan(
      fullSchema,
      page({
        "Article Status": { type: "status", status: { name: "Written" } },
      }),
      { property: "status", option: "Section Edited" },
    ),
  );

  expect(changesSummary(changes)).toBe(
    'Article Status: "Written" → "Section Edited"',
  );
});

test("an empty previous value is named rather than left blank", () => {
  const { changes } = planned(
    plan(fullSchema, page(), {
      property: "publicationDate",
      date: "2026-09-10",
    }),
  );

  expect(changesSummary(changes)).toBe(
    'Publication Date: nothing → "2026-09-10"',
  );
});

test("clearing a date reads as a clear, not as an empty string", () => {
  const result = planned(
    plan(
      fullSchema,
      page({
        "Publication Date": { type: "date", date: { start: "2026-09-10" } },
      }),
      { property: "publicationDate", date: null },
    ),
  );

  expect(result.properties).toEqual({ "Publication Date": { date: null } });
  expect(changesSummary(result.changes)).toBe(
    'Publication Date: "2026-09-10" → nothing',
  );
});

test("clearing a byline empties the rich_text rather than nulling it", () => {
  /* notion refuses `{ rich_text: null }` with a 400; an empty list is the clear */
  const result = planned(
    plan(
      fullSchema,
      page({
        "Author Byline": {
          type: "rich_text",
          rich_text: [{ plain_text: "Zachary Robinson" }],
        },
      }),
      { property: "authorByline", text: null },
    ),
  );

  expect(result.properties).toEqual({ "Author Byline": { rich_text: [] } });
  expect(changesSummary(result.changes)).toBe(
    'Author Byline: "Zachary Robinson" → nothing',
  );
});

test("dropping the last credit writes an empty relation, not a null one", () => {
  /* the same trap as a byline: notion clears a relation with `[]` */
  const result = planned(
    plan(
      fullSchema,
      page({ Author: { type: "relation", relation: [{ id: "member-1" }] } }),
      { property: "author", ids: [] },
    ),
  );

  expect(result.properties).toEqual({ Author: { relation: [] } });
});

/* ---- the data-loss guard ------------------------------------------------ */

test("a relation notion is not sharing is refused rather than written", () => {
  const result = plan(withoutAuthor, page(), {
    property: "author",
    ids: ["member-1"],
  });

  expect(result.status).toBe("refused");
  if (result.status !== "refused") return;
  expect(result.reason).toContain("Author");
});

test("an absent relation reads back as [] on the page, and is still refused", () => {
  /*
    this is the whole point: notion omits a relation whose target the
    integration cannot reach, and every page then reports it as empty. an
    append built on that read deletes co-authors nobody could see
  */
  const result = plan(
    withoutAuthor,
    page({ Author: { type: "relation", relation: [] } }),
    {
      property: "author",
      ids: ["member-1"],
    },
  );

  expect(result.status).toBe("refused");
});

test("a relation notion is sharing is planned", () => {
  const { properties } = planned(
    plan(fullSchema, page(), { property: "author", ids: ["member-1"] }),
  );

  expect(properties).toEqual({ Author: { relation: [{ id: "member-1" }] } });
});

test("a write to a property notion has as the wrong type is refused", () => {
  const wrongType: Schema = {
    properties: { ...fullSchema.properties, Section: { type: "status" } },
  };

  const result = plan(wrongType, page(), {
    property: "section",
    option: "Rabbithole",
  });

  expect(result.status).toBe("refused");
});

test("a healthy property is not refused because a different one is missing", () => {
  // Members being unshared must not stop an editor setting a status
  const result = plan(withoutAuthor, page(), {
    property: "status",
    option: "Written",
  });

  expect(result.status).toBe("planned");
});

/* ---- ADR 0004's dual write ---------------------------------------------- */

test("crediting an author writes the Byline and the relation in one body", () => {
  const { properties } = planned(
    planCredit(fullSchema, page(), {
      credit: "author",
      byline: "Gale de Silva",
      memberIds: ["member-1"],
    }),
  );

  // one patch body, both properties — never one without the other
  expect(properties).toEqual({
    "Author Byline": { rich_text: [{ text: { content: "Gale de Silva" } }] },
    Author: { relation: [{ id: "member-1" }] },
  });
});

test("a credit with no member is refused", () => {
  expect(
    planCredit(fullSchema, page(), {
      credit: "author",
      byline: "Gale de Silva",
      memberIds: [],
    }).status,
  ).toBe("refused");
});

test("an image credit uses the image pair, not the author pair", () => {
  const { properties } = planned(
    planCredit(fullSchema, page(), {
      credit: "image",
      byline: "Matthew Gray",
      memberIds: ["member-2"],
    }),
  );

  expect(Object.keys(properties).sort()).toEqual([
    "Image Byline",
    "Image Crew",
  ]);
});

test("a credit is refused entirely when the relation half cannot be written", () => {
  /*
    refusing the pair rather than writing the text alone: half a dual write is
    the drift ADR 0004 accepts the denormalisation to avoid
  */
  const result = planCredit(withoutAuthor, page(), {
    credit: "author",
    byline: "Gale de Silva",
    memberIds: ["member-1"],
  });

  expect(result.status).toBe("refused");
});

test("a credit's sentence names both halves and where each came from", () => {
  const { changes } = planned(
    planCredit(
      fullSchema,
      page({
        "Author Byline": {
          type: "rich_text",
          rich_text: [{ plain_text: "Zach" }],
        },
        Author: { type: "relation", relation: [{ id: "member-9" }] },
      }),
      { credit: "author", byline: "Zachary Robinson", memberIds: ["member-1"] },
    ),
  );

  expect(changesSummary(changes)).toContain(
    'Author Byline: "Zach" → "Zachary Robinson"',
  );
  expect(changesSummary(changes)).toContain("member-9");
  expect(changesSummary(changes)).toContain("member-1");
});

/* ---- creating one ------------------------------------------------------- */

test("a new article carries a headline, a byline and whatever else was given", () => {
  const { properties, changes } = planned(
    planCreate(fullSchema, {
      headline: "Looney's line",
      byline: "Zachary Robinson",
      authorIds: ["member-1"],
      status: "Approved",
      section: "Rabbithole",
    }),
  );

  expect(properties).toEqual({
    Headline: { title: [{ text: { content: "Looney's line" } }] },
    "Author Byline": {
      rich_text: [{ text: { content: "Zachary Robinson" } }],
    },
    Author: { relation: [{ id: "member-1" }] },
    "Article Status": { status: { name: "Approved" } },
    Section: { select: { name: "Rabbithole" } },
  });
  expect(changesSummary(changes)).toContain("Looney's line");
  expect(changesSummary(changes)).toContain("Approved");
});

test("a new article always writes its section", () => {
  const { properties } = planned(
    planCreate(fullSchema, {
      headline: "Untitled thought",
      byline: "Zachary Robinson",
      authorIds: ["member-1"],
      status: null,
      section: "News",
    }),
  );

  expect(Object.keys(properties).sort()).toEqual([
    "Author",
    "Author Byline",
    "Headline",
    "Section",
  ]);
});

test("a new article crediting a member is refused when Author is unshared", () => {
  /* the pair ADR 0004 keeps together: a create that knows the member writes
     the relation, so an unreadable relation refuses the whole create rather
     than writing a Byline with nothing behind it */
  expect(
    planCreate(withoutAuthor, {
      headline: "Looney's line",
      byline: "Zachary Robinson",
      authorIds: ["member-1"],
      status: null,
      section: "Rabbithole",
    }).status,
  ).toBe("refused");
});

test("a new article is refused when notion is not sharing what it would write", () => {
  const withoutHeadline: Schema = {
    properties: Object.fromEntries(
      Object.entries(fullSchema.properties).filter(
        ([name]) => name !== "Headline",
      ),
    ),
  };

  expect(
    planCreate(withoutHeadline, {
      headline: "Looney's line",
      byline: "Zachary Robinson",
      authorIds: ["member-1"],
      status: null,
      section: "Rabbithole",
    }).status,
  ).toBe("refused");
});
