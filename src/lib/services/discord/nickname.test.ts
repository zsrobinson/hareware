import { afterEach, expect, test, vi } from "vitest";
import { GUILD_ID } from "./config";

const workers = vi.hoisted(() => ({ env: { DISCORD_BOT_TOKEN: "bot" } }));
vi.mock("cloudflare:workers", () => workers);
const { changeGuildNickname } = await import("./nickname");

afterEach(() => vi.unstubAllGlobals());

test("patches the guild member and surfaces role hierarchy refusal", async () => {
  const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchMock);
  await changeGuildNickname("42", "Bay");
  expect(fetchMock).toHaveBeenCalledWith(
    `https://discord.com/api/v10/guilds/${GUILD_ID}/members/42`,
    expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ nick: "Bay" }),
    }),
  );

  fetchMock.mockResolvedValueOnce(new Response("forbidden", { status: 403 }));
  await expect(changeGuildNickname("42", "Bay")).rejects.toThrow(
    "role hierarchy",
  );
});
