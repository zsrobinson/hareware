import type { APIRoute } from "astro";
import { completeDiscordSignOut } from "~/lib/auth";

export const POST: APIRoute = ({ request }) => completeDiscordSignOut(request);
