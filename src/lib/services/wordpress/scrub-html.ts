import { parseHTML } from "linkedom";
/*
  making scraped markup safe to render.

  the article body reaches the page through `set:html` and
  `dangerouslySetInnerHTML`, because it carries the formatting the club wrote —
  italics, links, block quotes. that means wordpress decides what executes on
  hareware's origin, and "wordpress" is every contributor account plus whatever
  a compromised one could publish.

  the session cookie is HttpOnly, so script here cannot read it. it can do
  something worse: issue a same-origin `POST /api/automations/run` with the
  reader's cookies attached, and if that reader holds @Editorial Board it fires
  real reminders into the club's channels. astro's cross-origin check does not
  apply to a request from our own page. so the CMS is a trust boundary, and
  this is where it gets crossed.

  an allow-list rather than a block-list: the set of dangerous markup grows over
  time and the set of things an article needs does not.
*/

/** the tags an article legitimately uses. everything else is unwrapped */
const ALLOWED = new Set([
  "p",
  "br",
  "hr",
  "span",
  "div",
  "section",
  "article",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "a",
  "em",
  "i",
  "strong",
  "b",
  "u",
  "s",
  "sub",
  "sup",
  "mark",
  "small",
  "ul",
  "ol",
  "li",
  "dl",
  "dt",
  "dd",
  "blockquote",
  "cite",
  "q",
  "pre",
  "code",
  "time",
  "figure",
  "figcaption",
  "img",
  "picture",
  "source",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "caption",
  "col",
  "colgroup",
]);

/*
  the document's own scaffolding. left in place: unwrapping <body> deletes the
  document, which is what the first run of the tests did
*/
const STRUCTURAL = new Set(["html", "head", "body"]);

/** removed outright rather than unwrapped: their text content is not content */
const DROPPED = new Set([
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "link",
  "meta",
  "form",
  "input",
  "button",
  "select",
  "textarea",
  "template",
  "noscript",
  "svg",
  "math",
]);

/** attributes worth keeping. `on*` is absent by construction, not by listing */
const ALLOWED_ATTRIBUTES = new Set([
  "href",
  "src",
  "srcset",
  "sizes",
  "alt",
  "title",
  "class",
  "id",
  "width",
  "height",
  "loading",
  "colspan",
  "rowspan",
  "datetime",
  "cite",
]);

/*
  what may begin an href or src. anything with a scheme must have one of ours;
  anything without a scheme is relative and fine — `article-name` is a link
  wordpress can legitimately emit, and requiring a leading slash silently
  deleted it
*/
const SAFE_SCHEME = /^(?:https?:|mailto:)/i;
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/** whitespace html ignores inside an attribute, which hides a scheme */
// eslint-disable-next-line no-control-regex
const IGNORED = /[\u0000-\u0020\u007f]/g;

function safeUrl(value: string) {
  const cleaned = value.replace(IGNORED, "");

  /*
    `//evil.example/x` reads as relative to this pattern and as a different
    origin to a browser — the same confusion `safeReturnTo` closes in auth.ts,
    and the two halves of this codebase should not disagree about what
    "relative" means
  */
  if (cleaned.startsWith("//")) return false;

  /*
    `java\tscript:alert(1)` is a working javascript url in a browser, because
    the parser strips control characters before reading the scheme. strip them
    the same way before deciding, or the check reads a different string than
    the browser will
  */
  return HAS_SCHEME.test(cleaned) ? SAFE_SCHEME.test(cleaned) : true;
}

const URL_ATTRIBUTES = new Set(["href", "src", "srcset"]);

/** srcset holds a comma-separated list, so every candidate needs checking */
function safeUrls(attribute: string, value: string) {
  if (attribute !== "srcset") return safeUrl(value);

  return value
    .split(",")
    .every((candidate) => safeUrl(candidate.trim().split(/\s+/)[0] ?? ""));
}

type Elementish = {
  tagName?: string;
  attributes: { name: string; value: string }[];
  childNodes: unknown[];
  remove: () => void;
  removeAttribute: (name: string) => void;
  replaceWith: (...nodes: unknown[]) => void;
};

/**
 * strips anything executable out of a parsed document, in place.
 *
 * takes the document rather than a string so it runs on the tree both scraping
 * paths already build, and so there is one place to correct if wordpress starts
 * emitting something new
 */
/** the DOM's number for a comment node */
const COMMENT_NODE = 8;

/**
 * every comment, gone.
 *
 * an allow-list of *elements* is not an allow-list of *nodes*, and anything
 * the walk does not visit is unreviewed by construction. comments are the gap:
 * linkedom does not implement the comment-end-bang state, so it reads
 * `<!-- --!><img onerror=…> -->` as one inert comment and hands it back
 * untouched — while every browser reads the same bytes as a comment followed by
 * a live image. the scrubber would be approving a string it never examined.
 *
 * nothing here needs comments, so the safe move is to delete rather than parse
 */
function removeComments(node: { childNodes?: unknown[] }) {
  for (const child of [...(node.childNodes ?? [])] as {
    nodeType?: number;
    remove?: () => void;
    childNodes?: unknown[];
  }[]) {
    if (child.nodeType === COMMENT_NODE) child.remove?.();
    else removeComments(child);
  }
}

export function scrub<T>(root: T): T {
  /*
    linkedom's Document and Element both satisfy this, but neither exposes a
    named type worth importing — so the walk is typed structurally here and the
    caller keeps whatever it passed in
  */
  const tree = root as {
    querySelectorAll: (s: string) => Elementish[];
    childNodes?: unknown[];
  };

  removeComments(tree);

  for (const element of [...tree.querySelectorAll("*")]) {
    const tag = element.tagName?.toLowerCase() ?? "";

    if (DROPPED.has(tag)) {
      element.remove();
      continue;
    }

    for (const { name, value } of [...element.attributes]) {
      const attribute = name.toLowerCase();

      const keep =
        ALLOWED_ATTRIBUTES.has(attribute) &&
        !attribute.startsWith("on") &&
        (!URL_ATTRIBUTES.has(attribute) || safeUrls(attribute, value));

      if (!keep) element.removeAttribute(name);
    }

    /*
      an unknown tag keeps its text but loses itself. dropping the subtree
      instead would silently empty an article the day wordpress adds a block
      type, and a silent failure is the thing this codebase has already paid
      for more than once
    */
    /*
      structural tags keep their attributes stripped like everything else but
      are never unwrapped — removing <body> deletes the document. skipping the
      whole loop for them let `<body onload=…>` through untouched
    */
    if (!ALLOWED.has(tag) && !STRUCTURAL.has(tag)) {
      element.replaceWith(...element.childNodes);
    }
  }

  return root;
}

/**
 * the same treatment for a bare markup string rather than a whole document.
 *
 * wrapped in a div rather than a body: linkedom builds an odd tree for a bare
 * `<body>` and `document.body` comes back empty, which looked exactly like the
 * scrubber deleting everything
 */
export function scrubFragment(html: string) {
  const { document } = parseHTML(`<div id="fragment">${html}</div>`);
  scrub(document);

  return document.querySelector("#fragment")?.innerHTML.trim() ?? "";
}
