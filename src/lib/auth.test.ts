import { describe, expect, it, vi } from "vitest";
import {
  beginDiscordSignIn,
  completeDiscordSignIn,
  completeDiscordSignOut,
  createDiscordOAuth,
  type AuthConfig,
  type DiscordOAuth,
} from "./auth";
import { getSession } from "./session";

const config: AuthConfig = {
  clientId: "public-client-id",
  clientSecret: "discord-client-secret",
  sessionSecret: "a-test-secret-long-enough-to-sign-oauth-state",
};

const discord: DiscordOAuth = {
  exchangeCode: async () => "one-use-access-token",
  getCurrentUser: async () => ({ id: "123456789" }),
};

function cookieHeader(setCookie: string) {
  return setCookie.split(";", 1)[0];
}

describe("Discord OAuth", () => {
  it("exchanges the callback code through Discord's OAuth token endpoint", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        access_token: "one-use-access-token",
        refresh_token: "discarded-refresh-token",
      }),
    );
    const oauth = createDiscordOAuth(fetcher);

    await expect(
      oauth.exchangeCode({
        code: "authorization-code",
        redirectUri: "https://hareware.example/auth/discord/callback",
        clientId: "public-client-id",
        clientSecret: "discord-client-secret",
      }),
    ).resolves.toBe("one-use-access-token");

    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://discord.com/api/v10/oauth2/token");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({
      "content-type": "application/x-www-form-urlencoded",
    });
    expect(new URLSearchParams(init?.body as string)).toEqual(
      new URLSearchParams({
        client_id: "public-client-id",
        client_secret: "discord-client-secret",
        grant_type: "authorization_code",
        code: "authorization-code",
        redirect_uri: "https://hareware.example/auth/discord/callback",
      }),
    );
  });

  it("reads only the Discord user ID from the current-user endpoint", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        id: "123456789",
        username: "not-session-data",
        avatar: "also-not-session-data",
      }),
    );
    const oauth = createDiscordOAuth(fetcher);

    await expect(oauth.getCurrentUser("one-use-access-token")).resolves.toEqual(
      {
        id: "123456789",
      },
    );
    expect(fetcher).toHaveBeenCalledWith(
      "https://discord.com/api/v10/users/@me",
      { headers: { authorization: "Bearer one-use-access-token" } },
    );
  });

  it("starts an identify-only flow with protected callback state", async () => {
    const response = await beginDiscordSignIn(
      new Request(
        "https://hareware.example/auth/discord?returnTo=%2Fgenerate%3Farticle%3Dhare",
      ),
      config,
    );
    const destination = new URL(response.headers.get("location") ?? "");

    expect(response.status).toBe(302);
    expect(destination.origin + destination.pathname).toBe(
      "https://discord.com/oauth2/authorize",
    );
    expect(destination.searchParams.get("client_id")).toBe("public-client-id");
    expect(destination.searchParams.get("response_type")).toBe("code");
    expect(destination.searchParams.get("scope")).toBe("identify");
    expect(destination.searchParams.get("redirect_uri")).toBe(
      "https://hareware.example/auth/discord/callback",
    );
    expect(destination.searchParams.get("state")).toMatch(/^[\w-]{20,}$/);
    expect(response.headers.get("set-cookie")).toContain(
      "; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600",
    );
  });

  it("establishes an ID-only session and returns to the originating path", async () => {
    const start = await beginDiscordSignIn(
      new Request(
        "https://hareware.example/auth/discord?returnTo=%2Fgenerate%3Farticle%3Dhare",
      ),
      config,
    );
    const state = new URL(start.headers.get("location") ?? "").searchParams.get(
      "state",
    );
    const stateCookie = start.headers.get("set-cookie") ?? "";
    const callbackRequest = new Request(
      `https://hareware.example/auth/discord/callback?code=authorization-code&state=${state}`,
      { headers: { cookie: cookieHeader(stateCookie) } },
    );

    const response = await completeDiscordSignIn(
      callbackRequest,
      config,
      discord,
    );
    const cookies = response.headers.getSetCookie();
    const sessionCookie = cookies.find((cookie) =>
      cookie.startsWith("__Host-hareware-session="),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/generate?article=hare");
    expect(sessionCookie).toBeDefined();
    await expect(
      getSession(
        new Request("https://hareware.example/generate", {
          headers: { cookie: cookieHeader(sessionCookie ?? "") },
        }),
        config.sessionSecret,
      ),
    ).resolves.toEqual({ discordUserId: "123456789" });
    expect(cookies).toContain(
      "__Host-hareware-oauth-state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
    );
  });

  it("returns a declined authorization to sign-in with a readable error code", async () => {
    const start = await beginDiscordSignIn(
      new Request("https://hareware.example/auth/discord"),
      config,
    );
    const state = new URL(start.headers.get("location") ?? "").searchParams.get(
      "state",
    );
    const stateCookie = start.headers.get("set-cookie") ?? "";
    const response = await completeDiscordSignIn(
      new Request(
        `https://hareware.example/auth/discord/callback?error=access_denied&state=${state}`,
        { headers: { cookie: cookieHeader(stateCookie) } },
      ),
      config,
      discord,
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/sign-in?error=cancelled");
    expect(response.headers.getSetCookie()).toContain(
      "__Host-hareware-oauth-state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
    );
  });

  it("treats a Discord authorization error as a provider failure", async () => {
    const start = await beginDiscordSignIn(
      new Request("https://hareware.example/auth/discord"),
      config,
    );
    const state = new URL(start.headers.get("location") ?? "").searchParams.get(
      "state",
    );
    const response = await completeDiscordSignIn(
      new Request(
        `https://hareware.example/auth/discord/callback?error=temporarily_unavailable&state=${state}`,
        {
          headers: {
            cookie: cookieHeader(start.headers.get("set-cookie") ?? ""),
          },
        },
      ),
      config,
      discord,
    );

    expect(response.headers.get("location")).toBe("/sign-in?error=discord");
  });

  it("turns a Discord exchange failure into a safe retryable error", async () => {
    const start = await beginDiscordSignIn(
      new Request("https://hareware.example/auth/discord"),
      config,
    );
    const state = new URL(start.headers.get("location") ?? "").searchParams.get(
      "state",
    );
    const stateCookie = start.headers.get("set-cookie") ?? "";
    const unavailableDiscord: DiscordOAuth = {
      exchangeCode: async () => {
        throw new Error("provider response containing sensitive detail");
      },
      getCurrentUser: async () => ({ id: "unreachable" }),
    };

    const response = await completeDiscordSignIn(
      new Request(
        `https://hareware.example/auth/discord/callback?code=authorization-code&state=${state}`,
        { headers: { cookie: cookieHeader(stateCookie) } },
      ),
      config,
      unavailableDiscord,
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/sign-in?error=discord");
    expect(response.headers.get("location")).not.toContain("sensitive");
  });

  it("signs out through POST and returns to an internal path", async () => {
    const response = await completeDiscordSignOut(
      new Request("https://hareware.example/auth/logout", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ returnTo: "/generate" }),
      }),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/generate");
    expect(response.headers.getSetCookie()).toContain(
      "__Host-hareware-session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
    );
  });

  it("defaults an external return target to the article board", async () => {
    const start = await beginDiscordSignIn(
      new Request(
        "https://hareware.example/auth/discord?returnTo=https%3A%2F%2Fevil.example%2Fsteal",
      ),
      config,
    );
    const state = new URL(start.headers.get("location") ?? "").searchParams.get(
      "state",
    );
    const response = await completeDiscordSignIn(
      new Request(
        `https://hareware.example/auth/discord/callback?code=authorization-code&state=${state}`,
        {
          headers: {
            cookie: cookieHeader(start.headers.get("set-cookie") ?? ""),
          },
        },
      ),
      config,
      discord,
    );

    expect(response.headers.get("location")).toBe("/articles");
  });

  it("rejects OAuth state after its ten-minute lifetime", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-03T12:00:00Z"));

    try {
      const start = await beginDiscordSignIn(
        new Request("https://hareware.example/auth/discord"),
        config,
      );
      const state = new URL(
        start.headers.get("location") ?? "",
      ).searchParams.get("state");
      vi.advanceTimersByTime(10 * 60 * 1000 + 1);

      const response = await completeDiscordSignIn(
        new Request(
          `https://hareware.example/auth/discord/callback?code=authorization-code&state=${state}`,
          {
            headers: {
              cookie: cookieHeader(start.headers.get("set-cookie") ?? ""),
            },
          },
        ),
        config,
        discord,
      );

      expect(response.headers.get("location")).toBe(
        "/sign-in?error=invalid_state",
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects a repeated callback after its state cookie was cleared", async () => {
    const response = await completeDiscordSignIn(
      new Request(
        "https://hareware.example/auth/discord/callback?code=used-code&state=used-state",
      ),
      config,
      discord,
    );

    expect(response.headers.get("location")).toBe(
      "/sign-in?error=invalid_state",
    );
  });
});
