/*
  WordPress markup, parsed. In the browser this is the browser's own parser,
  whose documents are inert: nothing in them runs or loads until it is put on
  the page, and the scrubber runs before that. Tests in node get linkedom's
  DOMParser from ~/test/dom. The Worker never parses article markup (ADR 0012).
*/
export function parseDocument(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}
