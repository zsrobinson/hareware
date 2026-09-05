/*
  The gate over the admin tools, run from `~/middleware` before any page, so no
  page carries the check itself. Takes `next` as an argument and imports nothing
  from `astro:middleware`, which is what makes it testable. ADR 0007.
*/

/*
  Types only, and `~/lib/admin` stays behind the route check inside
  `guardAdmin`: it reaches `cloudflare:workers`, middleware is in every route's
  module graph, and node builds the prerendered /custom with a loader that fails
  on a `cloudflare:` url. `npm run build` is what catches a regression.
*/
import type { Access, Viewer } from "./admin";

import { isAdminPath } from "./admin-routes";
import { DENIALS } from "./denial";

/** the page a refused request is shown instead, without a redirect */
export const REFUSAL_PATH = "/access-denied";

/** what the guard leaves behind for the page that renders next */
export type Admission = {
  access: Access;
  /** where they were going, to come back to once they can */
  returnTo: string;
};

/* Only the part of `App.Locals` this touches, so the Cloudflare adapter's own
   required field stays out of this file's business. */
type HasAdmission = { admission?: Admission };

/**
 * The member an admin page is rendering for. Throws rather than refusing: the
 * guard has already decided by now, so no admission means an unguarded page,
 * which is a fault to see rather than a visitor to turn away.
 */
export function admitted(locals: HasAdmission): Viewer {
  const { admission } = locals;

  if (!admission) {
    throw new Error(
      "no admission on an admin page: is its route listed in ADMIN_ROUTES " +
        "(~/lib/admin-routes), and is the guard in ~/middleware still first " +
        "in the sequence?",
    );
  }

  if (!admission.access.allowed) {
    throw new Error(
      `the guard refused with "${admission.access.denial}" and the page rendered anyway`,
    );
  }

  return admission.access.who;
}

/** the part of astro's context this needs, so a test can build one */
type GuardContext = {
  url: URL;
  request: Request;
  locals: HasAdmission;
};

/** Astro's `next`, including the path its rewrite takes. */
type Next = (rewrite?: string) => Promise<Response>;

export async function guardAdmin(context: GuardContext, next: Next) {
  if (!isAdminPath(context.url.pathname)) return next();

  /* Deferred: see the note on the import at the top of this file. */
  const { adminAccess } = await import("./admin");

  const access = await adminAccess(context.request);

  context.locals.admission = {
    access,
    returnTo: `${context.url.pathname}${context.url.search}`,
  };

  if (access.allowed) return next();

  /* A rewrite, not a redirect, so the address bar keeps the page they asked
     for and a reload re-reads the answer. */
  const response = await next(REFUSAL_PATH);

  /* The status below is stamped onto whatever came back, so a refusal page
     that broke would ship Astro's error body wearing a 401. */
  if (!response.ok) {
    throw new Error(
      `${REFUSAL_PATH} answered ${response.status} while refusing ${context.url.pathname}`,
    );
  }

  return new Response(response.body, {
    status: DENIALS[access.denial].status,
    headers: response.headers,
  });
}
