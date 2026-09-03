import type { APIRoute } from "astro";
import {
  authNotConfiguredResponse,
  getAuthConfig,
} from "~/lib/auth-config";
import { beginDiscordSignIn } from "~/lib/auth";

export const GET: APIRoute = async ({ request }) => {
  const config = getAuthConfig();
  return config
    ? beginDiscordSignIn(request, config)
    : authNotConfiguredResponse();
};
