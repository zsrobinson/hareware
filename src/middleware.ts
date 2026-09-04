/*
  response headers that hold for every route.

  these are defence in depth behind `~/lib/services/wordpress/scrub-html`, which
  is the actual fix for scraped markup reaching the page. They exist because
  that scrubber is an allow-list somebody will one day widen, and because the
  escalation path the review found — script on our origin issuing a same-origin
  POST that fires real automations — deserves more than one thing standing in
  its way.

  What is deliberately NOT here: `script-src`. Astro inlines the scripts that
  hydrate its islands, so a strict policy breaks every interactive page and a
  policy carrying `unsafe-inline` is theatre — it would read as protection while
  permitting exactly the injection it claims to stop. Adding one means moving
  Astro to nonces first, which is its own piece of work. The directives below
  were each chosen because they block something real and break nothing.
*/

import { defineMiddleware } from "astro:middleware";

const POLICY = [
  /* a <base> tag injected into scraped markup would silently repoint every
     relative url on the page, including the form that signs you out */
  "base-uri 'self'",
  /* no plugin content, ever. `object` and `embed` are dropped by the scrubber
     and have no legitimate use here */
  "object-src 'none'",
  /* a form may only post back to us, so injected markup cannot exfiltrate what
     somebody types into it */
  "form-action 'self'",
  /* nothing embeds HareWare, so nothing may frame it — clickjacking on
     /admin/automations would be a way to make somebody fire a real automation */
  "frame-ancestors 'none'",
].join("; ");

export const onRequest = defineMiddleware(async (_context, next) => {
  const response = await next();

  response.headers.set("content-security-policy", POLICY);

  /* a scraped asset served with the wrong content type should not be sniffed
     into something executable */
  response.headers.set("x-content-type-options", "nosniff");

  /* the article being read is not something other sites need told about, and
     an admin path is nobody's business */
  response.headers.set("referrer-policy", "strict-origin-when-cross-origin");

  return response;
});
