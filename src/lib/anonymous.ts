/* A response that renders who you are must not be shared-cacheable. ADR 0005. */

/** whatever a page passed about the viewer, in the shape the layout sees it */
export type Rendered = Record<string, unknown> | null;

/**
 * Whether these props put a member's details in the html. Any non-empty field
 * counts.
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
function anonymityError(pathname: string, cacheControl: string | null) {
  return (
    `${pathname} renders a viewer but sets "cache-control: ${cacheControl ?? ""}". ` +
    "Either drop `viewer` so the account panel is revealed client-side, " +
    "or make the response private."
  );
}

/**
 * Stops a shared cache serving one member's sidebar to everybody: throws in
 * dev, and in production makes the response private and logs it.
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
