import { clearSessionCookie, createSessionCookie } from "./session";
import { requestCookie } from "./request-cookie";
import { seal, unseal } from "./sealed-value";

export type AuthConfig = {
  clientId: string;
  clientSecret: string;
  sessionSecret: string;
};

export type DiscordOAuth = {
  exchangeCode(input: {
    code: string;
    redirectUri: string;
    clientId: string;
    clientSecret: string;
  }): Promise<string>;
  getCurrentUser(accessToken: string): Promise<{ id: string }>;
};

export function createDiscordOAuth(fetcher: typeof fetch): DiscordOAuth {
  return {
    async exchangeCode({ code, redirectUri, clientId, clientSecret }) {
      const response = await fetcher(
        "https://discord.com/api/v10/oauth2/token",
        {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: "authorization_code",
            code,
            redirect_uri: redirectUri,
          }).toString(),
        },
      );
      const body = (await response.json()) as { access_token?: unknown };

      if (!response.ok || typeof body.access_token !== "string") {
        throw new Error(`Discord token exchange failed (${response.status})`);
      }

      return body.access_token;
    },

    async getCurrentUser(accessToken) {
      const response = await fetcher("https://discord.com/api/v10/users/@me", {
        headers: { authorization: `Bearer ${accessToken}` },
      });
      const body = (await response.json()) as { id?: unknown };

      if (!response.ok || typeof body.id !== "string" || !body.id) {
        throw new Error(`Discord identity lookup failed (${response.status})`);
      }

      return { id: body.id };
    },
  };
}

const AUTH_STATE_COOKIE = "__Host-hareware-oauth-state";
const STATE_LIFETIME_SECONDS = 10 * 60;

type OAuthState = {
  state: string;
  returnTo: string;
  expiresAt: number;
};

async function readOAuthState(
  request: Request,
  secret: string,
): Promise<OAuthState | null> {
  const value = requestCookie(request, AUTH_STATE_COOKIE);
  if (!value) return null;

  try {
    const payload = await unseal(value, secret);
    if (!payload) return null;

    const state = JSON.parse(payload) as Partial<OAuthState>;

    return typeof state.state === "string" &&
      typeof state.returnTo === "string" &&
      typeof state.expiresAt === "number"
      ? {
          state: state.state,
          returnTo: state.returnTo,
          expiresAt: state.expiresAt,
        }
      : null;
  } catch {
    return null;
  }
}

function clearOAuthStateCookie() {
  return `${AUTH_STATE_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function safeReturnTo(value: string) {
  const base = "https://hareware.invalid";

  try {
    const url = new URL(value, base);
    return value.startsWith("/") &&
      !value.startsWith("//") &&
      url.origin === base
      ? `${url.pathname}${url.search}${url.hash}`
      : "/generate";
  } catch {
    return "/generate";
  }
}

function redirect(location: string, cookies: string[] = []) {
  const headers = new Headers({
    location,
    "cache-control": "private, no-store",
  });
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  return new Response(null, { status: 302, headers });
}

async function oauthStateCookie(
  state: string,
  returnTo: string,
  secret: string,
) {
  const value = await seal(
    JSON.stringify({
      state,
      returnTo,
      expiresAt: Date.now() + STATE_LIFETIME_SECONDS * 1000,
    }),
    secret,
  );

  return `${AUTH_STATE_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${STATE_LIFETIME_SECONDS}`;
}

export async function beginDiscordSignIn(request: Request, config: AuthConfig) {
  const requestUrl = new URL(request.url);
  const callbackUrl = new URL("/auth/discord/callback", requestUrl.origin);
  const state = crypto.randomUUID();
  const returnTo = requestUrl.searchParams.get("returnTo") ?? "/generate";
  const destination = new URL("https://discord.com/oauth2/authorize");

  destination.search = new URLSearchParams({
    client_id: config.clientId,
    response_type: "code",
    redirect_uri: callbackUrl.toString(),
    scope: "identify",
    state,
  }).toString();

  return redirect(destination.toString(), [
    await oauthStateCookie(state, returnTo, config.sessionSecret),
  ]);
}

export async function completeDiscordSignIn(
  request: Request,
  config: AuthConfig,
  discord: DiscordOAuth,
) {
  const requestUrl = new URL(request.url);
  const storedState = await readOAuthState(request, config.sessionSecret);
  const returnedState = requestUrl.searchParams.get("state");
  const code = requestUrl.searchParams.get("code");

  if (
    !storedState ||
    !returnedState ||
    storedState.state !== returnedState ||
    storedState.expiresAt < Date.now()
  ) {
    return redirect("/sign-in?error=invalid_state", [clearOAuthStateCookie()]);
  }

  const providerError = requestUrl.searchParams.get("error");

  if (providerError === "access_denied") {
    return redirect("/sign-in?error=cancelled", [clearOAuthStateCookie()]);
  }

  if (providerError) {
    console.error("Discord OAuth authorization failed", providerError);
    return redirect("/sign-in?error=discord", [clearOAuthStateCookie()]);
  }

  if (!code) {
    return redirect("/sign-in?error=invalid_state", [clearOAuthStateCookie()]);
  }

  const redirectUri = new URL(
    "/auth/discord/callback",
    requestUrl.origin,
  ).toString();
  try {
    const accessToken = await discord.exchangeCode({
      code,
      redirectUri,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
    });
    const user = await discord.getCurrentUser(accessToken);

    return redirect(safeReturnTo(storedState.returnTo), [
      clearOAuthStateCookie(),
      await createSessionCookie(
        { discordUserId: user.id },
        config.sessionSecret,
      ),
    ]);
  } catch (error) {
    console.error("Discord OAuth callback failed", error);
    return redirect("/sign-in?error=discord", [clearOAuthStateCookie()]);
  }
}

export async function completeDiscordSignOut(request: Request) {
  const form = await request.formData();
  const returnTo = form.get("returnTo");

  return redirect(
    safeReturnTo(typeof returnTo === "string" ? returnTo : "/generate"),
    [clearSessionCookie()],
  );
}
