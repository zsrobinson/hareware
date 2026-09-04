/*
  the invariant ADR 0005 rests on, as a function rather than a tripwire.

  a response that renders who you are must never be one a shared cache can hand
  to somebody else. this lived inline in the dashboard layout, where it checked
  only `session` and only ran under DEV — so a page passing `admin` while
  setting `s-maxage` said nothing, and a page written by somebody who never
  signs in locally shipped clean. here it is pure, total, and tested.
*/

/** whatever a page passed about the viewer, in the shape the layout sees it */
export type Rendered = {
  session?: unknown;
  profile?: unknown;
  admin?: boolean;
} | null;

/** whether these props would put one member's details into the html */
export function personal(viewer: Rendered) {
  if (!viewer) return false;

  /*
    `admin` counts. it draws the editorial nav, so a page passing only that
    would leak which visitors are on the board — and the old guard, keyed on
    `session` alone, would have said nothing
  */
  return Boolean(viewer.session ?? viewer.profile ?? viewer.admin);
}

/** whether a cache that is not the visitor's own may hold this response */
export function shared(cacheControl: string | null) {
  return /public|s-maxage/.test(cacheControl ?? "");
}

/** the message, so a test can assert the reason rather than the wording */
export function anonymityError(pathname: string, cacheControl: string | null) {
  return (
    `${pathname} renders a viewer but sets "cache-control: ${cacheControl ?? ""}". ` +
    "Either drop `viewer` and pass `cached` so the nav is revealed client-side, " +
    "or make the response private."
  );
}

/**
 * throws when a response would serve one member's sidebar to everybody.
 *
 * in production it refuses rather than throwing: a page that would leak is
 * downgraded to `private, no-store` and logged, because a 500 for everyone is
 * worse than a page that merely stops being cached
 */
export function assertAnonymous({
  pathname,
  headers,
  viewer,
  dev,
}: {
  pathname: string;
  headers: Headers;
  viewer: Rendered;
  dev: boolean;
}) {
  const cacheControl = headers.get("cache-control");
  if (!personal(viewer) || !shared(cacheControl)) return;

  if (dev) throw new Error(anonymityError(pathname, cacheControl));

  console.error(`[cache] ${anonymityError(pathname, cacheControl)}`);
  headers.set("cache-control", "private, no-store");
}
