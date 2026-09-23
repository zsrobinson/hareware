/**
 * a request refused for a reason the person can act on. Imports nothing, so
 * `write.ts` can throw it without reaching the Worker's bindings.
 */
export class BadRequest extends Error {}
