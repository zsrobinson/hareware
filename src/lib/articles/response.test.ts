import { expect, test } from "vitest";
import { articleResponse } from "./response";
import type { ArticlePage } from "./page";

const page: ArticlePage = {
  id: "3d1be415-e24c-80c8-a14f-cf1fd9b7e48c",
  properties: {
    Headline: { title: [{ plain_text: "Sample article" }] },
    "Article Status": { status: { name: "Scheduled", color: "green" } },
  },
};

test("a successful edit leads with the B2c sentence and shares the show card", () => {
  const reply = articleResponse({
    status: "updated",
    page,
    changes: [
      { property: "status", before: "Managing Edited", after: "Scheduled" },
    ],
    notes: [],
  });
  expect(reply.components[0]).toEqual({
    type: 10,
    content:
      "Updated **Article Status** from **Managing Edited** to **Scheduled**.",
  });
  expect(reply.components[1]).toEqual(articleResponse(page).components[0]);
});

test.each([
  [null, "News", "Set **Section** to **News**."],
  ["News", null, "Cleared **Section**."],
  ["News", "News", "**Section** is already **News**."],
  [null, null, "**Section** is already unset."],
])("receipt handles %s → %s", (before, after, expected) => {
  expect(
    articleResponse({
      status: before === after ? "unchanged" : "updated",
      page,
      changes: [{ property: "section", before, after }],
      notes: [],
    }).components[0],
  ).toEqual({ type: 10, content: expected });
});

test("creation shares the card and preserves member notes", () => {
  const message = articleResponse({
    status: "created",
    page,
    changes: [],
    notes: ["Created Jamie Example in Members."],
  });
  expect(message.components[0]).toEqual({
    type: 10,
    content: "Created article.\nCreated Jamie Example in Members.",
  });
  expect(message.components[1]).toEqual(articleResponse(page).components[0]);
});

test("deletion says the Article moved to Notion's recoverable Trash", () => {
  const message = articleResponse({
    status: "deleted",
    page: { ...page, in_trash: true },
    changes: [],
    notes: [],
  });
  expect(message.components[0]).toEqual({
    type: 10,
    content: "Moved article to Notion's Trash.",
  });
  expect(message.components[1]).toEqual(articleResponse(page).components[0]);
});

test("relation changes use the resolved name and counts, never raw relation ids", () => {
  const message = JSON.stringify(
    articleResponse({
      status: "updated",
      page,
      changes: [
        { property: "authorByline", before: "Old byline", after: "Pseudonym" },
        {
          property: "author",
          before: ["member-old"],
          after: ["member-new"],
          member: { id: "member-new", name: "Jamie Example" },
        },
      ],
      notes: [],
    }),
  );
  expect(message).toContain(
    "Updated **Author**: added Jamie Example and removed 1 member.",
  );
  expect(message).not.toContain("member-new");
  expect(message).not.toContain("member-old");
});

test("a failed article write retains partial member notes and a Notion link", () => {
  const message = JSON.stringify(
    articleResponse({
      status: "failed",
      explanation: "The article update could not be confirmed.",
      pageId: page.id,
      notes: ["Created Jamie Example in Members."],
    }),
  );
  expect(message).toContain("could not be confirmed");
  expect(message).toContain("Created Jamie Example in Members.");
  expect(message).toContain("Open in Notion");
  expect(message).not.toContain("Updated article");
});

test("an oversized display still confirms the write, preserves notes and links to Notion", () => {
  const message = articleResponse({
    status: "updated",
    page,
    changes: Array.from({ length: 30 }, () => ({
      property: "headline" as const,
      before: "a".repeat(100),
      after: "b".repeat(100),
    })),
    notes: [
      "Created Jamie Example in Members.",
      "The invocation log could not be saved.",
    ],
  });
  const body = JSON.stringify(message);
  expect(body).toContain("Updated article.");
  expect(body).toContain("Created Jamie Example in Members.");
  expect(body).toContain("The invocation log could not be saved.");
  expect(body).toContain("Open in Notion");
  expect(body.length).toBeLessThan(4000);
});
