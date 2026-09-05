import { afterEach, expect, test, vi } from "vitest";
import { runEdit, type EditIO } from "~/lib/articles/edit";
import type { ArticlePage } from "~/lib/articles/page";
import type { Schema } from "~/lib/articles/choices";
import { handleInteraction, type InteractionDeps } from "./interactions";
import { followUp } from "./follow-up";

afterEach(() => vi.unstubAllGlobals());

const schema: Schema = {
  properties: {
    Headline: { type: "title" },
    "Article Status": {
      type: "status",
      status: { options: [{ name: "Managing Edited" }, { name: "Scheduled" }] },
    },
    "Image Status": { type: "status", status: { options: [] } },
    Section: { type: "select", select: { options: [] } },
    "Author Byline": { type: "rich_text" },
    "Image Byline": { type: "rich_text" },
    "Publication Date": { type: "date" },
    Author: { type: "relation" },
    "Image Crew": { type: "relation" },
  },
};

function article(status: string, color: string, headline: string): ArticlePage {
  return {
    id: "3d1be415-e24c-80c8-a14f-cf1fd9b7e48c",
    url: "https://www.notion.so/3d1be415e24c80c8a14fcf1fd9b7e48c",
    properties: {
      Headline: { title: [{ plain_text: headline }] },
      "Author Byline": { rich_text: [{ plain_text: "Jamie Example" }] },
      "Article Status": { status: { name: status, color } },
      Section: { select: { name: "News", color: "default" } },
      "Image Status": { status: { name: "Done", color: "green" } },
      "Image Byline": { rich_text: [] },
      "Publication Date": { date: null },
    },
  };
}

test("a deferred edit renders the confirmed Notion page through the real response path", async () => {
  const before = article("Managing Edited", "yellow", "Old headline");
  const confirmed = article(
    "Scheduled",
    "green",
    "Returned headline @everyone <@&123>",
  );
  let patches = 0;
  const io: EditIO = {
    schema: async () => schema,
    page: async () => before,
    patch: async () => {
      patches += 1;
      return confirmed;
    },
    create: async () => confirmed,
    trash: async () => ({ ...confirmed, in_trash: true }),
    members: async () => ({ status: "absent" }),
    link: async () => undefined,
    addMember: async (name, discordId) => ({
      pageId: "member",
      name,
      discordId,
    }),
    log: async () => undefined,
  };
  const requests: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      if (typeof init?.body !== "string") throw new Error("expected JSON body");
      requests.push(JSON.parse(init.body));
      return Response.json({ id: "reply" });
    }),
  );
  const work: Promise<void>[] = [];
  const deps: InteractionDeps = {
    edit: (request, actor) => runEdit(io, request, actor),
    reply: followUp,
    defer: (run) => work.push(run()),
  };

  const acknowledgement = await handleInteraction(
    {
      type: 2,
      application_id: "app",
      token: "token",
      data: {
        name: "article",
        options: [
          {
            name: "status",
            options: [
              { name: "article", value: before.id },
              { name: "status", value: "Scheduled" },
            ],
          },
        ],
      },
      member: {
        roles: ["669611068938780673"],
        user: { id: "editor", username: "editor" },
      },
    },
    deps,
  );

  expect(acknowledgement).toEqual({ type: 5, data: { flags: 64 } });
  await Promise.all(work);
  expect(patches).toBe(1);
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({
    flags: 32768,
    allowed_mentions: { parse: [] },
    components: [
      {
        type: 10,
        content:
          "Updated **Article Status** from **Managing Edited** to **Scheduled**.",
      },
      { type: 17, accent_color: 0x448361 },
    ],
  });
  const posted = JSON.stringify(requests[0]);
  expect(posted).toContain("Returned headline");
  expect(posted).not.toContain("Old headline");
  expect(posted).not.toContain("@everyone");
  expect(posted).not.toContain("<@&123>");
  expect(posted).toContain("Open in Notion");
});
