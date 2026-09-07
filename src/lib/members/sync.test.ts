import { afterEach, expect, test, vi } from "vitest";
import { syncApplications } from "./sync";

const env = {
  NOTION_TOKEN: "secret",
  DISCORD_BOT_TOKEN: "bot-token",
} as unknown as Env;

const today = { date: "2026-09-08", hour: 8, weekday: "Tuesday" };

/** one entry as discord's join request endpoint actually returns it */
const request = (id: string, name: string, email: string) => ({
  id,
  user_id: id,
  created_at: "2026-09-04T18:20:00.000000+00:00",
  user: { username: name.toLowerCase().replace(" ", "") },
  form_responses: [
    { label: "Full name", response: name, values: [""] },
    { label: "Email address", response: email, values: [""] },
    { label: "Graduation year", response: "2028", values: [""] },
  ],
});

/** one Members row as notion returns it */
const member = (
  id: string,
  name: string,
  over: { discordId?: string; email?: string } = {},
) => ({
  id,
  properties: {
    Name: { type: "title", title: [{ plain_text: name }] },
    "Discord ID": {
      type: "rich_text",
      rich_text: over.discordId ? [{ plain_text: over.discordId }] : [],
    },
    Email: { type: "email", email: over.email ?? null },
    Status: { type: "select", select: null },
  },
});

/**
 * stands in for discord's one read, notion's one query and each create.
 *
 * returns the spy on creates, because "what did it write" is the question every
 * test here asks — a summary that says three and a roster that grew by five is
 * the failure mode worth catching
 */
function mockSources(requests: unknown[], members: unknown[]) {
  const created = vi.fn();

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.includes("discord.com"))
        return new Response(JSON.stringify({ guild_join_requests: requests }));

      if (url.includes("/query"))
        return new Response(JSON.stringify({ results: members }));

      created(JSON.parse(init!.body as string));
      return new Response(JSON.stringify({ id: "new-page" }));
    }),
  );

  return created;
}

afterEach(() => vi.unstubAllGlobals());

test("a missing NOTION_TOKEN is misconfigured, and names the secret", async () => {
  const result = await syncApplications(
    { DISCORD_BOT_TOKEN: "bot-token" } as unknown as Env,
    today,
  );

  expect(result.outcome).toBe("misconfigured");
  expect(result.summary).toContain("NOTION_TOKEN");
});

test("a missing DISCORD_BOT_TOKEN is misconfigured, and names the secret", async () => {
  const result = await syncApplications(
    { NOTION_TOKEN: "secret" } as unknown as Env,
    today,
  );

  expect(result.outcome).toBe("misconfigured");
  expect(result.summary).toContain("DISCORD_BOT_TOKEN");
});

test("no secrets at all names both of them rather than the first", async () => {
  const result = await syncApplications({} as unknown as Env, today);

  expect(result.summary).toContain("NOTION_TOKEN");
  expect(result.summary).toContain("DISCORD_BOT_TOKEN");
});

test("an applicant nobody on the roster matches gets a row", async () => {
  const created = mockSources(
    [request("1", "Bay Hoffman", "bay@terpmail.umd.edu")],
    [member("p1", "Someone Else")],
  );

  const result = await syncApplications(env, today);

  expect(result.outcome).toBe("ok");
  expect(created).toHaveBeenCalledTimes(1);

  const body = created.mock.calls[0]![0];
  expect(body.properties.Name.title[0].text.content).toBe("Bay Hoffman");
  expect(body.properties["Discord ID"].rich_text[0].text.content).toBe("1");
  expect(body.properties.Email.email).toBe("bay@terpmail.umd.edu");
});

test("only the applications matching nothing are created", async () => {
  const created = mockSources(
    [
      request("1", "Bay Hoffman", "bay@terpmail.umd.edu"),
      request("2", "Ana Reyes", "ana@terpmail.umd.edu"),
      request("3", "Jo Park", "jo@terpmail.umd.edu"),
    ],
    [
      // already carries the snowflake: linked, and finished business
      member("p1", "Bay Hoffman", { discordId: "1" }),
      // an id-less row on the same email: linkable, and the reconciler's
      member("p2", "Ana R", { email: "ana@terpmail.umd.edu" }),
    ],
  );

  const result = await syncApplications(env, today);

  expect(created).toHaveBeenCalledTimes(1);
  expect(created.mock.calls[0]![0].properties.Name.title[0].text.content).toBe(
    "Jo Park",
  );
  expect(result.summary).toContain("Created 1 member");
});

test("the summary counts what was left for the reconciler, and why", async () => {
  const created = mockSources(
    [
      request("1", "Jo Park", "jo@terpmail.umd.edu"),
      request("2", "Ana Reyes", "ana@terpmail.umd.edu"),
      request("3", "Sam Diaz", "sam@terpmail.umd.edu"),
    ],
    [
      member("p1", "Ana Reyes"),
      // two id-less rows answering to one name: ambiguous, never guessed at
      member("p2", "Sam Diaz"),
      member("p3", "Sam Diaz"),
    ],
  );

  const result = await syncApplications(env, today);

  expect(created).toHaveBeenCalledTimes(1);
  expect(result.summary).toBe(
    "Created 1 member from applications. 2 need review on the reconciler (1 to link, 1 ambiguous).",
  );
});

test("nothing to create is skipped, not a green row", async () => {
  const created = mockSources(
    [request("1", "Bay Hoffman", "bay@terpmail.umd.edu")],
    [member("p1", "Bay Hoffman", { discordId: "1" })],
  );

  const result = await syncApplications(env, today);

  expect(result.outcome).toBe("skipped");
  expect(result.summary).toContain("No new applications out of 1");
  expect(result.summary).toContain("Nothing is waiting on the reconciler.");
  expect(created).not.toHaveBeenCalled();
});

test("a dry run writes nothing and reports what it would have done", async () => {
  const created = mockSources(
    [
      request("1", "Bay Hoffman", "bay@terpmail.umd.edu"),
      request("2", "Jo Park", "jo@terpmail.umd.edu"),
    ],
    [],
  );

  const result = await syncApplications(
    { ...env, REMINDERS_DRY_RUN: "1" } as unknown as Env,
    today,
  );

  expect(created).not.toHaveBeenCalled();
  expect(result.outcome).toBe("ok");
  expect(result.summary).toContain("Would create 2 members");
});

test("the creates go out one at a time, inside notion's budget", async () => {
  let open = 0;
  let most = 0;

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const url = String(input);

      if (url.includes("discord.com"))
        return new Response(
          JSON.stringify({
            guild_join_requests: [
              request("1", "Bay Hoffman", "bay@terpmail.umd.edu"),
              request("2", "Jo Park", "jo@terpmail.umd.edu"),
              request("3", "Ana Reyes", "ana@terpmail.umd.edu"),
            ],
          }),
        );

      if (url.includes("/query"))
        return new Response(JSON.stringify({ results: [] }));

      open += 1;
      most = Math.max(most, open);
      await new Promise((resolve) => setTimeout(resolve, 5));
      open -= 1;
      return new Response(JSON.stringify({ id: "new-page" }));
    }),
  );

  const result = await syncApplications(env, today);

  expect(most).toBe(1);
  expect(result.summary).toContain("Created 3 members");
});
