/*
  the guard over the admin tools, as a function rather than a line each page
  remembers to write.

  it used to be `if (!who?.admin) return notFound()` at the top of every admin
  page — three of them by the time this was written, each a copy of the thing
  that must never be missing. here the route decides, from the list in
  `~/lib/admin-routes`, so a tool in the sidebar is a tool that is guarded —
  and a refused request never reaches the page at all, so nobody being turned
  away costs a d1 query.

  it lives apart from `~/middleware` so it can be tested: this file imports
  nothing from `astro:middleware`, and takes `next` as an argument, so a test
  can hand it a fake one and watch what it does with the answer.
*/

/*
  types only. `~/lib/admin` reaches `cloudflare:workers` for the session secret
  and the bot token, and middleware is in the module graph of every route —
  including the prerendered /custom, which node builds with its own loader and
  which fails outright on a `cloudflare:` url. the import that needs it is
  inside `guardAdmin`, past the path check, so a build and a public page never
  reach for it. `npm run build` is what catches this: it prerenders /custom
*/
import type { Access, Viewer } from "./admin";

/* both of these are plain data and reach nothing, so they are safe to hold
   statically — it is only `~/lib/admin` that must stay behind the route check */
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

/*
  the only part of `App.Locals` anything here touches. naming it that way
  rather than taking the whole thing keeps this file out of the adapter's
  business — the cloudflare adapter puts its own required field in there
*/
type HasAdmission = { admission?: Admission };

/**
 * the member an admin page is rendering for, from what the guard left behind.
 *
 * it throws rather than refusing, because by the time a page runs the guard
 * has already decided: no admission means the guard did not run, and a page
 * under /admin that nothing guarded is a fault to be seen rather than a
 * visitor to be turned away
 */
export function admitted(locals: HasAdmission): Viewer {
  const { admission } = locals;

  if (!admission) {
    throw new Error(
      "no admission on an admin page: is it under /admin, and is the guard in " +
        "~/middleware still first in the sequence?",
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

/**
 * astro's `next`, including the rewrite it takes a path for.
 *
 * a rewrite rather than a redirect: the address bar keeps the page they asked
 * for, so a refusal can be re-read by reloading, and the url in the discord
 * message somebody was sent still means something
 */
type Next = (rewrite?: string) => Promise<Response>;

export async function guardAdmin(context: GuardContext, next: Next) {
  if (!isAdminPath(context.url.pathname)) return next();

  /* deferred on purpose — see the note on the import at the top of this file */
  const { adminAccess } = await import("./admin");

  const access = await adminAccess(context.request);

  context.locals.admission = {
    access,
    returnTo: `${context.url.pathname}${context.url.search}`,
  };

  if (access.allowed) return next();

  /*
    the refusal page reads the admission above, so it says which of the four
    things happened rather than guessing. the status has to be set out here:
    the rewritten page renders a body, and this is what decides that a browser,
    a crawler and `curl -i` all agree it was refused
  */
  const response = await next(REFUSAL_PATH);

  /*
    the status below is stamped onto whatever came back. if the refusal page
    ever goes missing or throws, that would ship astro's error body wearing a
    401 — a broken page reported as a refusal, which is the same class of lie
    the rest of this file exists to stop
  */
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
