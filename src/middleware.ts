/*
  The admin guard, and headers for every route: defence in depth behind
  `~/lib/services/wordpress/scrub-html`. No `script-src`: Astro inlines its
  island scripts, so it would need nonces first.
*/

import { defineMiddleware, sequence } from "astro:middleware";
import { guardAdmin } from "./lib/admin-guard";

const POLICY = [
  /* an injected <base> would repoint every relative url */
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
  /* clickjacking /automations would fire a real automation */
  "frame-ancestors 'none'",
].join("; ");

const admin = defineMiddleware(guardAdmin);

const headers = defineMiddleware(async (_context, next) => {
  const response = await next();

  response.headers.set("content-security-policy", POLICY);

  response.headers.set("x-content-type-options", "nosniff");

  response.headers.set("referrer-policy", "strict-origin-when-cross-origin");

  return response;
});

/* the guard first, so a refused request never reaches its route */
export const onRequest = sequence(admin, headers);
