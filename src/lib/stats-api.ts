/*
  /api/stats/: Jetpack's view counts for the board, answered in src/worker.ts
  ahead of Astro, as /api/wordpress is, since all it does is forward a GET
  (ADR 0012). The gate's own Discord lookup is the one thing it asks first.
*/

import { env } from "cloudflare:workers";
import { refusal } from "./admin-api";
import { adminAccess } from "./admin";
import { passStats } from "./services/wordpress/stats";

export async function answerStats(request: Request): Promise<Response> {
  const access = await adminAccess(request);
  if (!access.allowed) return refusal(access.denial, access.who?.profile);

  const user = env.WORDPRESS_STATS_USER?.trim();
  const password = env.WORDPRESS_STATS_PASSWORD?.trim();
  if (!user || !password)
    return new Response(
      `WordPress stats aren't set up: ${!user ? "WORDPRESS_STATS_USER" : "WORDPRESS_STATS_PASSWORD"} is missing`,
      { status: 503, headers: { "cache-control": "no-store" } },
    );

  return passStats(new URL(request.url), { user, password });
}
