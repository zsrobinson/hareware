import { describe, expect, it } from "vitest";
import { createSessionCookie, getSession } from "./session";

const signingSecret = "a-test-secret-long-enough-to-sign-a-session";

function requestWithCookie(setCookie: string) {
  return new Request("https://hareware.example/articles", {
    headers: { cookie: setCookie.split(";", 1)[0] },
  });
}

describe("Discord session", () => {
  it("recovers the Discord user ID from a secure signed cookie", async () => {
    const cookie = await createSessionCookie(
      { discordUserId: "123456789" },
      signingSecret,
    );

    await expect(
      getSession(requestWithCookie(cookie), signingSecret),
    ).resolves.toEqual({
      discordUserId: "123456789",
    });
    expect(cookie).toContain("; Path=/; HttpOnly; Secure; SameSite=Lax");
    expect(cookie).not.toContain("Max-Age");
  });

  it("rejects a session whose signed value was changed", async () => {
    const memberCookie = await createSessionCookie(
      { discordUserId: "123456789" },
      signingSecret,
    );
    const attackerCookie = await createSessionCookie(
      { discordUserId: "987654321" },
      signingSecret,
    );
    const [name, memberValue] = memberCookie.split(";", 1)[0].split("=");
    const attackerValue = attackerCookie.split(";", 1)[0].split("=")[1];
    const attackerPayload = attackerValue.slice(
      0,
      attackerValue.lastIndexOf("."),
    );
    const memberSignature = memberValue.slice(memberValue.lastIndexOf(".") + 1);
    const changedCookie = `${name}=${attackerPayload}.${memberSignature}`;

    await expect(
      getSession(requestWithCookie(changedCookie), signingSecret),
    ).resolves.toBeNull();
  });
});
