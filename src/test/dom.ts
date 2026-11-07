/* The browser parses WordPress markup with its own DOMParser; node has none,
   so the tests borrow linkedom's, which is why linkedom is a dev dependency
   and never reaches the Worker's bundle. */
import { DOMParser } from "linkedom";

globalThis.DOMParser ??= DOMParser as unknown as typeof globalThis.DOMParser;
