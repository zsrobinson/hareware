import { afterEach, expect, test, vi } from "vitest";
import { buttons, inert, postMessage, separator, text } from "./post-message";

const TOKEN = "bot-token";
const CHANNEL = "1155994296219091014";

function mockDiscord(_stored: unknown[] = [], ok = true) {
  const fetchMock = vi.fn(
    async (_input: string | URL, _init?: RequestInit) =>
      new Response("{}", { status: ok ? 200 : 400 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const sentBody = (fetchMock: ReturnType<typeof mockDiscord>) =>
  JSON.parse(fetchMock.mock.calls[0]![1]!.body as string);

afterEach(() => vi.unstubAllGlobals());

test("sends components v2 and renders each block", async () => {
  const fetchMock = mockDiscord([{}, {}, {}]);

  await postMessage(TOKEN, CHANNEL, {
    blocks: [
      text("hello"),
      buttons({ label: "Go", url: "https://example.com" }),
      separator(),
    ],
  });

  const body = sentBody(fetchMock);
  expect(body.flags).toBe(1 << 15);
  expect(body.components).toEqual([
    { type: 10, content: "hello" },
    {
      type: 1,
      components: [
        { type: 2, style: 5, label: "Go", url: "https://example.com" },
      ],
    },
    { type: 14, spacing: 1, divider: false },
  ]);
});

test("posts to the channel as the bot", async () => {
  const fetchMock = mockDiscord();
  await postMessage(TOKEN, CHANNEL, { blocks: [text("hi")] });

  const [url, init] = fetchMock.mock.calls[0]!;
  expect(String(url)).toBe(
    `https://discord.com/api/v10/channels/${CHANNEL}/messages`,
  );
  expect((init!.headers as Record<string, string>).authorization).toBe(
    `Bot ${TOKEN}`,
  );
});

test("only the named roles may be pinged, never @everyone", async () => {
  const fetchMock = mockDiscord([{}]);
  await postMessage(TOKEN, CHANNEL, {
    blocks: [text("<@&123> @everyone")],
    mentionRoleIds: ["123"],
  });

  expect(sentBody(fetchMock).allowed_mentions).toEqual({
    parse: [],
    roles: ["123"],
  });
});

test("mentions nothing when no roles are named", async () => {
  const fetchMock = mockDiscord([{}]);
  await postMessage(TOKEN, CHANNEL, { blocks: [text("<@&123>")] });
  expect(sentBody(fetchMock).allowed_mentions).toEqual({
    parse: [],
    roles: [],
  });
});

/*
  allowed_mentions does not gate a mention inside a components v2 text display:
  an empty roles array notifies the role exactly as though the field were
  absent. this cost two real pings to the editorial board before it was found,
  so the test asserts the markup is gone rather than that the field is empty
*/
test("silent writes no mention markup at all", async () => {
  const fetchMock = mockDiscord([{}]);

  await postMessage(
    TOKEN,
    CHANNEL,
    {
      blocks: [text("<@&669611068938780673> **Meeting Tonight**")],
      mentionRoleIds: ["669611068938780673"],
    },
    { silent: true },
  );

  const content = sentBody(fetchMock).components[0].content;
  expect(content).not.toContain("<@&");
  expect(content).toBe("@Editorial Board **Meeting Tonight**");
});

test("silent leaves an unknown role id recognisable rather than blank", async () => {
  const fetchMock = mockDiscord([{}]);

  await postMessage(
    TOKEN,
    CHANNEL,
    { blocks: [text("<@&999> hello")] },
    { silent: true },
  );

  expect(sentBody(fetchMock).components[0].content).toBe("@<@&999> hello");
});

test("silent defuses every mention in a message, not just the first", async () => {
  const fetchMock = mockDiscord([{}, {}]);

  await postMessage(
    TOKEN,
    CHANNEL,
    {
      blocks: [
        text("<@&669611068938780673> one"),
        text("<@&1545245612310794310> two"),
      ],
    },
    { silent: true },
  );

  const body = sentBody(fetchMock);
  expect(body.components[0].content).toBe("@Editorial Board one");
  expect(body.components[1].content).toBe("@Friday Poster two");
});

test("a normal send keeps the mention markup", async () => {
  const fetchMock = mockDiscord([{}]);

  await postMessage(TOKEN, CHANNEL, {
    blocks: [text("<@&669611068938780673> meeting today")],
    mentionRoleIds: ["669611068938780673"],
  });

  const body = sentBody(fetchMock);
  expect(body.components[0].content).toContain("<@&669611068938780673>");
  expect(body.allowed_mentions.roles).toEqual(["669611068938780673"]);
});

test("throws when discord refuses the message", async () => {
  mockDiscord([], false);
  await expect(
    postMessage(TOKEN, CHANNEL, { blocks: [text("x")] }),
  ).rejects.toThrow(/discord returned 400/);
});

test("a dry run sends nothing", async () => {
  const fetchMock = mockDiscord();
  vi.spyOn(console, "log").mockImplementation(() => {});

  await postMessage(TOKEN, CHANNEL, { blocks: [text("x")] }, { dryRun: true });

  expect(fetchMock).not.toHaveBeenCalled();
});

/*
  the channels are constants now, so without this a local run would post to the
  club's real ones rather than a test channel
*/
test("REMINDERS_TEST_CHANNEL redirects the message", async () => {
  const fetchMock = mockDiscord();

  await postMessage(
    TOKEN,
    CHANNEL,
    { blocks: [text("hi")] },
    { testChannelId: "1029929430652555364" },
  );

  expect(String(fetchMock.mock.calls[0]![0])).toContain("1029929430652555364");
});

test("posts to the real channel when no redirect is set", async () => {
  const fetchMock = mockDiscord();
  await postMessage(TOKEN, CHANNEL, { blocks: [text("hi")] });
  expect(String(fetchMock.mock.calls[0]![0])).toContain(CHANNEL);
});

/*
  remote text sharing a line with a real role mention. `allowed_mentions` does
  not gate a mention inside a components v2 text display, so a headline is the
  one thing between a wordpress contributor and pinging the whole server
*/
test("makes @everyone in remote text unable to ping", () => {
  expect(inert("Council votes @everyone out")).not.toContain("@everyone");
  expect(inert("@HERE we go")).not.toMatch(/@here/i);
});

test("makes a role, user or channel reference inert", () => {
  expect(inert("A win for <@&669611068938780673>")).not.toContain(
    "<@&669611068938780673>",
  );
  expect(inert("<@123> spoke")).not.toContain("<@123>");
  expect(inert("see <#456>")).not.toContain("<#456>");
});

test("leaves an ordinary headline exactly as written", () => {
  const headline = "Terps win 3–2 in overtime: a report";
  expect(inert(headline)).toBe(headline);
});

test("changes only what the parser sees, not what a reader sees", () => {
  // the break is a zero-width space, so the line still reads the same
  expect(inert("@everyone").replace(/\u200b/g, "")).toBe("@everyone");
});

test("a headline cannot become a clickable link", () => {
  // a masked link posted by the club's own bot is more convincing than
  // anything an attacker could send from their own account
  const out = inert("[Read the story](https://elsewhere.example)");

  expect(out).not.toContain("](https");
  expect(out).toContain("Read the story");
});
