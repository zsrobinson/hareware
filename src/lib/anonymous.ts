/*
  The invariant ADR 0005 rests on: a response that renders who you are must
  never be one a shared cache can hand to somebody else. Pure and total rather
  than a tripwire in the layout, so it holds in production and not only DEV.
*/

/** whatever a page passed about the viewer, in the shape the layout sees it */
export type Rendered = Record<string, unknown> | null;

/**
 * Whether these props would put one member's details into the html. Any field
 * with a value counts, rather than a list of the fields there happen to be
 * today, so a shape that grows a field grows the guard with it.
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
