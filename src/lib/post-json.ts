/*
  how an island calls one of our POST routes. The content-type is required:
  astro refuses a cross-site POST that looks like a form, which a request with
  none does, so forgetting it works in dev and 403s in production.
*/

/** what `rosterRoute` answers, whatever else a route adds */
type Said = { summary?: string; error?: string };

/** posts json and returns the body, throwing the route's own `error` message on failure */
export async function postJson<T = unknown>(
  path: string,
  body?: Record<string, unknown>,
): Promise<T & Said> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });

  /* a failure that never reached a route may have no json body */
  const said = (await response.json().catch(() => ({}))) as T & Said;

  if (!response.ok) {
    throw new Error(said.error ?? `${response.status} ${response.statusText}`);
  }

  return said;
}
