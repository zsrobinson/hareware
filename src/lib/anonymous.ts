/*
  the invariant ADR 0005 rests on, as a function rather than a tripwire.

  a response that renders who you are must never be one a shared cache can hand
  to somebody else. this lived inline in the dashboard layout, where it checked
  only `session` and only ran under DEV — so a page passing `admin` while
  setting `s-maxage` said nothing, and a page written by somebody who never
  signs in locally shipped clean. here it is pure, total, and tested.
*/

/** whatever a page passed about the viewer, in the shape the layout sees it */
export type Rendered = Record<string, unknown> | null;

/**
 * whether these props would put one member's details into the html.
 *
 * any field with a value counts, rather than a list of the fields there happen
 * to be today. the list version is how this got caught out once already: it
 * checked `session` while `admin` drew the editorial nav beside it. a shape
 * that grows a field grows the guard with it, and the field that comes back
 * one day — a role, a flag, whatever the nav needs next — is covered before
 * anybody remembers this file exists
 */
export function personal(viewer: Rendered) {
  if (!viewer) return false;

  return Object.values(viewer).some((value) => Boolean(value));
}

/** whether a cache that is not the visitor's own may hold this response */
export function shared(cacheControl: string | null) {
  return /public|s-maxage/.test(cacheControl ?? "");
}

/** the message, so a test can assert the reason rather than the wording */
export function anonymityError(pathname: string, cacheControl: string | null) {
  return (
    `${pathname} renders a viewer but sets "cache-control: ${cacheControl ?? ""}". ` +
    "Either drop `viewer` so the account panel is revealed client-side, " +
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
