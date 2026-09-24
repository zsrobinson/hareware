import { afterEach, expect, test, vi } from "vitest";
import { refreshCommands } from "./refresh-commands";
import { ARTICLE_PROPERTIES } from "~/lib/articles/config";

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

/* a half-worked read would register a required picker with no choices */
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

test("says how many options a picker lost to Discord's limit of 25", async () => {
  answering(
    schema({
      [ARTICLE_PROPERTIES.section.name]: {
        type: "select",
        select: {
          options: options(Array.from({ length: 27 }, (_, i) => `S${i}`)),
        },
      },
    }),
  );

  const result = await refreshCommands({
    ...env,
    DISCORD_BOT_TOKEN: "bot",
  } as Env);

  expect(result.outcome).toBe("misconfigured");
  expect(result.summary).toContain(
    `${ARTICLE_PROPERTIES.section.name} has 27 options`,
  );
  expect(result.summary).toContain("2 are missing");
});
