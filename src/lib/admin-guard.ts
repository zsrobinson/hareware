/* The gate over the admin tools, run from `~/middleware`. ADR 0007. */

/*
  Types only: `~/lib/admin` reaches `cloudflare:workers`, which node cannot load
  when it prerenders /custom, so it is imported inside `guardAdmin`. `npm run
  build` catches a regression.
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

type HasAdmission = { admission?: Admission };

/**
 * The member an admin page renders for. Throws if the guard did not admit them.
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

type GuardContext = {
  url: URL;
  request: Request;
  locals: HasAdmission;
};

type Next = (rewrite?: string) => Promise<Response>;

export async function guardAdmin(context: GuardContext, next: Next) {
  if (!isAdminPath(context.url.pathname)) return next();

  /* see the note on the import at the top */
  const { adminAccess } = await import("./admin");

  const access = await adminAccess(context.request);

  context.locals.admission = {
    access,
    returnTo: `${context.url.pathname}${context.url.search}`,
  };

  if (access.allowed) return next();

  /* a rewrite, so a reload re-asks for the page */
  const response = await next(REFUSAL_PATH);

  /* otherwise Astro's error page would ship with a 401 */
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
