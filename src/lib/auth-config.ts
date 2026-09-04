import { env } from "cloudflare:workers";
import { DISCORD_APPLICATION_ID } from "./services/discord/config";
import type { AuthConfig } from "./auth";

export function getAuthConfig(): AuthConfig | null {
  // the oauth client id is the application id — one application does both
  const clientId = DISCORD_APPLICATION_ID;
  const clientSecret = env.DISCORD_CLIENT_SECRET?.trim() ?? "";
  const sessionSecret = env.SESSION_SECRET?.trim() ?? "";

  return clientId && clientSecret && sessionSecret
    ? { clientId, clientSecret, sessionSecret }
    : null;
}

export function getSessionSecret() {
  return env.SESSION_SECRET?.trim() ?? "";
}

export function authNotConfiguredResponse() {
  return new Response(null, {
    status: 302,
    headers: {
      location: "/sign-in?error=not_configured",
      "cache-control": "private, no-store",
    },
  });
}
