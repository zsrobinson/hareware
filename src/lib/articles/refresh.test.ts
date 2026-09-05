import { afterEach, expect, test, vi } from "vitest";
import { refreshCommands } from "./refresh";
import { ARTICLE_PROPERTIES } from "./config";

afterEach(() => vi.restoreAllMocks());

const options = (names: string[]) => names.map((name) => ({ name }));

/** a schema notion would return, with every property the code expects */
function schema(over: Record<string, unknown> = {}) {
  const properties: Record<string, unknown> = {};
  for (const [, property] of Object.entries(ARTICLE_PROPERTIES)) {
    properties[property.name] = { type: property.type };
  }

  properties[ARTICLE_PROPERTIES.status.name] = {
    type: "status",
    status: { options: options(["Backlog", "Approved"]) },
  };
  properties[ARTICLE_PROPERTIES.imageStatus.name] = {
    type: "status",
    status: { options: options(["Not started", "Done"]) },
  };
  properties[ARTICLE_PROPERTIES.section.name] = {
    type: "select",
    select: { options: options(["News", "Features"]) },
  };

  return { properties: { ...properties, ...over } };
}

const answering = (body: unknown) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body))),
  );

const env = { NOTION_TOKEN: "token" } as Env;

test("says which secret is missing rather than trying", async () => {
  expect((await refreshCommands({} as Env)).outcome).toBe("misconfigured");
});

test("a schema notion refused is a failure, not a silent skip", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("nope", { status: 500 })),
  );

  expect((await refreshCommands(env)).outcome).toBe("failed");
});

/*
  the alarm for notion quietly stopping sharing something. the write paths
  refuse too, but only when somebody tries to credit a Member — which could be
  weeks away. this says so the same day
*/
test("reports a property notion has stopped sharing", async () => {
  const without = schema();
  delete (without.properties as Record<string, unknown>)[
    ARTICLE_PROPERTIES.author.name
  ];
  answering(without);

  const result = await refreshCommands(env);

  expect(result.outcome).toBe("misconfigured");
  expect(result.summary).toContain(ARTICLE_PROPERTIES.author.name);
});

/*
  a read that half worked. registering it publishes a required picker with no
  choices in it, and an editor opens an empty dropdown
*/
test("refuses when one picker came back with no options", async () => {
  answering(
    schema({
      [ARTICLE_PROPERTIES.imageStatus.name]: {
        type: "status",
        status: { options: [] },
      },
    }),
  );

  const result = await refreshCommands(env);

  expect(result.outcome).toBe("failed");
  expect(result.summary).toContain(ARTICLE_PROPERTIES.imageStatus.name);
});
