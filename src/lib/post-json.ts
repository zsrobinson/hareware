/*
  the one way an island calls one of our own POST routes.

  written out four times before this existed — twice in the kiosk, once in the
  reconciler, once in the automation triggers — and each copy carried the same
  two-line comment about astro's cross-site rule, which is the tell that it was
  one thing rather than four. The content-type is not decoration: astro refuses
  a cross-site POST that looks like a form submission, and a request carrying no
  content type counts as one, so a route that works in dev and 403s in
  production is what forgetting it looks like.

  every route under `~/pages/api/members` answers in the shape `rosterRoute`
  gives it — `{ summary }` on success, `{ error }` on failure — so unwrapping
  that belongs here too rather than in each caller's catch.
*/

/** what every mutation route says back, whatever else it adds */
export type Said = { summary?: string; error?: string };

/**
 * posts json and returns the parsed body.
 *
 * throws on failure with the route's own message where there is one. Those
 * messages are written for a person — notion's refusals say useful things, and
 * everybody who can reach these routes holds @Editorial Board — so passing one
 * through beats replacing it with a status code.
 *
 * the whole body rather than only `summary`, because two callers need a field
 * the route invented — the kiosk wants the `pageId` of the member it just
 * created. `summary` is typed here so the common caller does not have to say
 * what shape it expects
 *
 * a body of `undefined` sends the header and nothing else, for the routes that
 * take none
 */
export async function postJson<T = unknown>(
  path: string,
  body?: Record<string, unknown>,
): Promise<T & Said> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });

  /* a route that failed before it could answer json — a 404 from the gate, say
     — leaves nothing to parse, and the status is then the only thing to say */
  const said = (await response.json().catch(() => ({}))) as T & Said;

  if (!response.ok) {
    throw new Error(said.error ?? `${response.status} ${response.statusText}`);
  }

  return said;
}
