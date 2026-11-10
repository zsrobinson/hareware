/*
  Where a sign-in may send somebody afterwards: a path on this site, never
  another origin. Pure, so the static sign-in page uses it in the browser too.
*/

export function safeReturnTo(value: string) {
  const base = "https://hareware.invalid";

  try {
    const url = new URL(value, base);
    if (url.origin !== base) return "/generate";

    /* the path that will go into the Location header is what is checked, not
       the input: `/..//evil.com` normalises to `//evil.com`, which a browser
       follows off-site */
    const path = `${url.pathname}${url.search}${url.hash}`;

    return path.startsWith("/") && !path.startsWith("//") ? path : "/generate";
  } catch {
    return "/generate";
  }
}

/** where a sign-in reached at this url may send somebody afterwards */
export function returnToOf(url: URL) {
  return safeReturnTo(url.searchParams.get("returnTo") ?? "/generate");
}
