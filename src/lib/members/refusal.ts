/**
 * a refusal whose message the person can act on; answered 400. Its own file so
 * `write.ts` can throw it without importing the Worker's bindings
 */
export class BadRequest extends Error {}
