import { expect, test } from "vitest";
import { parseHTML } from "linkedom";
import { scrub, scrubFragment } from "./scrub-html";

/* the production helper, so these test the function that scrubs every article
   title rather than a copy of it */
const clean = scrubFragment;

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

/*
  mutation XSS. linkedom does not implement the HTML comment-end-bang state, so
  it reads `<!-- --!><img …> -->` as one inert comment while every browser reads
  it as a comment followed by a live image. an allow-list of elements is not an
  allow-list of nodes: the scrubber was approving a string it never examined.
*/
test("removes comments, which the element walk never visited", () => {
  const out = clean(`<p><!-- --!><img src=x onerror="alert(1)"> --></p>`);

  expect(out).not.toContain("onerror");
  expect(out).not.toContain("--!>");
  expect(out).toBe("<p></p>");
});

test("removes a plain comment too, wherever it sits", () => {
  expect(clean(`<p>before<!-- hi -->after</p>`)).toBe("<p>beforeafter</p>");
  expect(clean(`<!-- top --><p>x</p>`)).toBe("<p>x</p>");
});

test("removes a comment nested inside an element that survives", () => {
  const out = clean(
    `<blockquote><p>quoted<!-- --!><script>alert(1)</script> --></p></blockquote>`,
  );

  expect(out).not.toContain("alert");
  expect(out).not.toContain("--!>");
});

test("strips attributes from structural tags rather than skipping them", () => {
  // <body> is never unwrapped — that would delete the document — but skipping
  // the whole loop for it let an event handler through untouched
  const { document } = parseHTML(`<body onload="alert(1)"><p>x</p></body>`);
  scrub(document);

  expect(document.querySelector("body")?.getAttribute("onload")).toBeFalsy();
});

test("refuses a protocol-relative url, which is a different origin", () => {
  expect(clean(`<a href="//evil.example/x">x</a>`)).not.toContain("evil");
});

test("keeps an ordinary relative link", () => {
  // requiring a leading slash silently deleted a link wordpress can emit
  expect(clean(`<a href="article-name">x</a>`)).toContain(
    'href="article-name"',
  );
});

test("checks every candidate in a srcset, not just the first", () => {
  expect(
    clean(`<img srcset="/a.png 1x, javascript:alert(1) 2x">`),
  ).not.toContain("javascript:");
});
