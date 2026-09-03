import { env } from "cloudflare:workers";
import type { AuthConfig } from "./auth";

export function getAuthConfig(): AuthConfig | null {
  const clientId = env.DISCORD_CLIENT_ID?.trim() ?? "";
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
