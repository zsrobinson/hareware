/*
  Asking a gated API from the browser (ADR 0012). The admin pages are static
  shells; what makes one private is its data, which only a gated API hands
  out, and when it says no it says which of the four refusals it is.
  ~/components/gated draws that refusal.
*/

import type { RefusalBody } from "~/lib/admin-api";
import { DENIALS } from "~/lib/denial";
import { takeEarly } from "~/lib/early-requests";

/** a gated API's refusal, carried as an error so a query can hold it */
export class Refused extends Error {
  constructor(readonly body: RefusalBody) {
    super(DENIALS[body.denial].title);
  }
}

/**
 * what an answer that was not a success means: a `Refused` when the gate said
 * no, otherwise an error worded for a person. A route's own short answer is
 * kept; anything else, such as Cloudflare's HTML error page, is not
 */
export async function failureOf(response: Response): Promise<Error> {
  const text = await response.text();
  try {
    const body = JSON.parse(text) as Partial<RefusalBody>;
    if (body.denial && body.denial in DENIALS)
      return new Refused(body as RefusalBody);
  } catch {
    /* not JSON: a route's plain words, or a page */
  }
  const plain = text.length > 0 && text.length <= 200 && !text.includes("<");
  return new Error(plain ? text : `HareWare answered ${response.status}`);
}

/**
 * a gated API's answer, `null` when it answers with no body, or a throw: a
 * `Refused`, or an error saying what went wrong
 */
export async function fetchGated<T>(url: string): Promise<T> {
  /* the page may have sent it already: ~/lib/early */
  const response = await (takeEarly(url) ?? fetch(url, { cache: "no-store" }));
  if (response.status === 204) return null as T;
  if (response.ok) return (await response.json()) as T;
  throw await failureOf(response);
}
