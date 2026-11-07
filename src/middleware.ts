/*
  Headers for the routes the Worker serves (/api, /auth): defence in depth
  behind `~/lib/services/wordpress/scrub-html`. The static pages get the same
  ones from public/_headers, since serving them never reaches this. No
  `script-src`: Astro inlines its island scripts, so it would need nonces first.

  There is no page guard: the admin pages are static shells, and the gate is
  on the APIs that hold the data (ADR 0012).
*/

import { defineMiddleware } from "astro:middleware";

const POLICY = [
  /* an injected <base> would repoint every relative url */
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
  /* clickjacking an admin page could press a button that writes or posts */
  "frame-ancestors 'none'",
].join("; ");

const headers = defineMiddleware(async (_context, next) => {
  const response = await next();

  response.headers.set("content-security-policy", POLICY);

  response.headers.set("x-content-type-options", "nosniff");

  response.headers.set("referrer-policy", "strict-origin-when-cross-origin");

  return response;
});

export const onRequest = headers;
