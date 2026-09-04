import { env } from "cloudflare:workers";
import { DISCORD_APPLICATION_ID } from "./discord/config";
import type { AuthConfig } from "./auth";

export function getAuthConfig(): AuthConfig | null {
  // the oauth client id and the application id are the same value, and it is
  // already a constant — a second copy in the environment could only disagree
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
