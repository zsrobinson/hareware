import type { APIRoute } from "astro";
import { authNotConfiguredResponse, getAuthConfig } from "~/lib/auth-config";
import { completeDiscordSignIn, createDiscordOAuth } from "~/lib/auth";

export const GET: APIRoute = async ({ request }) => {
  const config = getAuthConfig();
  return config
    ? completeDiscordSignIn(request, config, createDiscordOAuth(fetch))
    : authNotConfiguredResponse();
};
