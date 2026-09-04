import { expect, test } from "vitest";
import { parseHTML } from "linkedom";
import { scrub } from "./scrub-html";

/*
  scrub a fragment and hand back what would be rendered.

  wrapped in a div: linkedom builds an odd tree for a bare `<body>` — two body
  elements, and `document.body` empty — which made the first run of these tests
  look like the scrubber was deleting everything
*/
function clean(html: string) {
  const { document } = parseHTML(`<div id="fragment">${html}</div>`);
  scrub(document);

  return document.querySelector("#fragment")?.innerHTML ?? "";
}

test("removes a script outright, text and all", () => {
  expect(clean(`<p>hi</p><script>alert(1)</script>`)).toBe("<p>hi</p>");
});

test("removes every event handler attribute", () => {
  const out = clean(`<img src="/a.png" onerror="alert(1)" onload="x()">`);

  expect(out).not.toContain("onerror");
  expect(out).not.toContain("onload");
  expect(out).toContain('src="/a.png"');
});

test("drops a javascript: url but keeps a real link", () => {
  expect(clean(`<a href="javascript:alert(1)">x</a>`)).not.toContain(
    "javascript:",
  );
  expect(clean(`<a href="https://theumdhare.com/a">x</a>`)).toContain(
    'href="https://theumdhare.com/a"',
  );
  expect(clean(`<a href="/relative">x</a>`)).toContain('href="/relative"');
});

test("drops a javascript: url hidden by the characters html ignores", () => {
  // a browser strips these before reading the scheme, so a checker that does
  // not is reading a different string than the parser will
  const out = clean(`<a href="java&#9;script:alert(1)">x</a>`);
  expect(out).not.toContain("script:");
});

test("drops a data: url, which can carry a document", () => {
  expect(clean(`<a href="data:text/html,<script>">x</a>`)).not.toContain(
    "data:",
  );
});

test("removes an iframe and a form", () => {
  expect(clean(`<iframe src="https://evil.example"></iframe>`)).toBe("");
  expect(clean(`<form action="/x"><input name="a"></form>`)).toBe("");
});

test("keeps the formatting an article actually uses", () => {
  const article = `<p>A <em>real</em> <strong>story</strong> with a <a href="/link">link</a>.</p><blockquote><p>quoted</p></blockquote><ul><li>one</li></ul>`;

  expect(clean(article)).toBe(article);
});

test("keeps an unknown tag's text rather than deleting the article", () => {
  // wordpress adding a block type should cost formatting, never content
  expect(clean(`<wp-block>the text survives</wp-block>`)).toBe(
    "the text survives",
  );
});

test("scrubs inside an unknown tag before unwrapping it", () => {
  const out = clean(`<wp-block><script>alert(1)</script>kept</wp-block>`);

  expect(out).not.toContain("alert");
  expect(out).toContain("kept");
});

test("removes an unlisted attribute such as style", () => {
  expect(clean(`<p style="position:fixed;inset:0">x</p>`)).toBe("<p>x</p>");
});
