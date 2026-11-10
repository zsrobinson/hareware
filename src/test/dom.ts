/* The browser parses WordPress markup with its own DOMParser; node has none,
   so the tests borrow linkedom's, which is why linkedom is a dev dependency
   and never reaches the Worker's bundle. */
import { DOMParser } from "linkedom";

globalThis.DOMParser ??= DOMParser as unknown as typeof globalThis.DOMParser;

/* jsdom has no pointer capture, which a dialog's controls ask for as they
   are pressed; unanswered, the press throws outside any test */
if (
  typeof Element !== "undefined" &&
  !("setPointerCapture" in Element.prototype)
)
  Object.assign(Element.prototype, {
    setPointerCapture() {},
    releasePointerCapture() {},
    hasPointerCapture: () => false,
  });
