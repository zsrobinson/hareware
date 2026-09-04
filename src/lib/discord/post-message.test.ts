import { afterEach, expect, test, vi } from "vitest";
import { buttons, postToWebhook, separator, text } from "./post-message";

const WEBHOOK = "https://discord.com/api/webhooks/1/abc";

function mockDiscord(stored: unknown[] = [], ok = true) {
  const fetchMock = vi.fn(
    async (_input: string | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ components: stored }), {
        status: ok ? 200 : 400,
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const sentBody = (fetchMock: ReturnType<typeof mockDiscord>) =>
  JSON.parse(fetchMock.mock.calls[0]![1]!.body as string);

afterEach(() => vi.unstubAllGlobals());

test("sends components v2 and renders each block", async () => {
  const fetchMock = mockDiscord([{}, {}, {}]);

  await postToWebhook(WEBHOOK, {
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

test("a webhook that is not application-owned needs with_components", async () => {
  const fetchMock = mockDiscord([{}]);
  await postToWebhook(WEBHOOK, { blocks: [text("hi")] });

  const url = new URL(fetchMock.mock.calls[0]![0] as string | URL);
  expect(url.searchParams.get("with_components")).toBe("true");
  // wait=true is what makes the dropped-block check below possible at all
  expect(url.searchParams.get("wait")).toBe("true");
});

test("only the named roles may be pinged, never @everyone", async () => {
  const fetchMock = mockDiscord([{}]);
  await postToWebhook(WEBHOOK, {
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
  await postToWebhook(WEBHOOK, { blocks: [text("<@&123>")] });
  expect(sentBody(fetchMock).allowed_mentions).toEqual({
    parse: [],
    roles: [],
  });
});

test("says so when discord drops blocks it will not render", async () => {
  // discord answers 200 having stored fewer components than we sent
  mockDiscord([{}]);
  const error = vi.spyOn(console, "error").mockImplementation(() => {});

  await postToWebhook(WEBHOOK, {
    blocks: [text("one"), buttons({ label: "Go", url: "https://example.com" })],
  });

  expect(error).toHaveBeenCalledWith(expect.stringContaining("dropped"));
  error.mockRestore();
});

test("stays quiet when everything survived", async () => {
  mockDiscord([{}, {}]);
  const error = vi.spyOn(console, "error").mockImplementation(() => {});

  await postToWebhook(WEBHOOK, {
    blocks: [text("one"), buttons({ label: "Go", url: "https://example.com" })],
  });

  expect(error).not.toHaveBeenCalled();
  error.mockRestore();
});

test("silent keeps the mention visible but notifies nobody", async () => {
  const fetchMock = mockDiscord([{}]);

  await postToWebhook(
    WEBHOOK,
    { blocks: [text("<@&123> meeting today")], mentionRoleIds: ["123"] },
    { silent: true },
  );

  const body = sentBody(fetchMock);
  // the text is untouched, so the message looks exactly as it will in the end
  expect(body.components[0].content).toContain("<@&123>");
  expect(body.allowed_mentions.roles).toEqual([]);
});

test("throws when discord refuses the message", async () => {
  mockDiscord([], false);
  await expect(postToWebhook(WEBHOOK, { blocks: [text("x")] })).rejects.toThrow(
    /discord returned 400/,
  );
});

test("a dry run sends nothing", async () => {
  const fetchMock = mockDiscord();
  vi.spyOn(console, "log").mockImplementation(() => {});

  await postToWebhook(WEBHOOK, { blocks: [text("x")] }, { dryRun: true });

  expect(fetchMock).not.toHaveBeenCalled();
});
