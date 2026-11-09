/*
  Credit lines out of a post's markup. A credit is a paragraph that starts
  with a known label and a colon: "Article by: …", "*Image Credits: …*". The
  names after it are what gets counted; the printed line is kept as it is,
  because the joke is in it.
*/

import { countWords } from "~/lib/get-word-count";
import { parseDocument } from "~/lib/services/wordpress/parse-document";
import { decodeEntities } from "~/lib/services/wordpress/posts";
import type { Label, Role } from "./labels";

export type CreditLine = {
  label: string;
  role: Role;
  /** everything after the colon, as printed */
  printed: string;
  /** the people credited, in order. Empty when nothing in `printed` parsed */
  names: string[];
  /** parts of `printed` read as description rather than a name */
  asides: string[];
};

/** a credit paragraph is short; a body paragraph mentioning "By:" is not */
const MAX_CREDIT_LENGTH = 300;

/** the credits among a post's paragraphs, as `paragraphs()` returns them */
export function creditLines(texts: string[], labels: Label[]): CreditLine[] {
  const matcher = labelMatcher(labels);
  if (!matcher) return [];

  const lines: CreditLine[] = [];
  for (const paragraph of texts) {
    const match = matcher.pattern.exec(paragraph);
    if (!match) continue;

    const label = matcher.byKey.get(match[1]!.toLowerCase())!;
    const printed = match[2]!.trim();
    lines.push({
      label: label.label,
      role: label.role,
      printed,
      ...names(printed),
    });
  }
  return lines;
}

/* a label-shaped start: a few title-case words, then "by" or "credit(s)",
   then a capitalised name. "Article Image by Kenlynn Ingham" and "Squirrel
   Photos and Videos by: …" match; a body sentence with "by" in it does not */
const LOOKS_LIKE_CREDIT =
  /^((?:[A-Z][\w’'-]*|and|&|of|the)(?:\s+(?:[A-Z][\w’'-]*|and|&|of|the)){0,5})\s+(by|credits?)\b\s*:?\s*[A-Z0-9“"]/;

/** the label an unrecognised line starts with, to offer as a new one */
export function labelOf(line: string): string | undefined {
  const match = LOOKS_LIKE_CREDIT.exec(line);
  return match ? `${match[1]} ${match[2]}` : undefined;
}

/**
 * paragraphs shaped like a credit line that no label in force matched: an
 * unknown label, or a known one missing its colon. They are where credits go
 * uncounted without any line looking wrong
 */
export function unrecognisedLines(texts: string[], labels: Label[]): string[] {
  const matcher = labelMatcher(labels);
  return texts.filter(
    (text) =>
      text.length <= 160 &&
      LOOKS_LIKE_CREDIT.test(text) &&
      !matcher?.pattern.test(text),
  );
}

/**
 * the text of each `<p>` short enough to be a credit, tags dropped and
 * whitespace collapsed
 */
export function paragraphs(html: string): string[] {
  return [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) =>
      decodeEntities(
        match[1]!.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, ""),
      )
        .replace(/[\s\u00a0]+/g, " ")
        .trim(),
    )
    .filter((text) => text && text.length <= MAX_CREDIT_LENGTH);
}

/* the elements whose text is prose: the blocks the Word Counter counts */
const PROSE = new Set(["P", "H2", "H3", "LI"]);
/* where one run of text ends and the next begins; any other element is
   inline, and "wo<em>r</em>d" is one word */
/* not the article's prose, whatever paragraphs they hold: captions, the
   classic editor's and the block editor's, and what a figure frames (an
   image, a pull quote repeating the text, a table) or an embed shows */
const NOT_PROSE = [
  "figure",
  "figcaption",
  ".wp-caption",
  ".wp-caption-text",
  ".wp-block-embed",
  "iframe",
  "object",
  "video",
  "audio",
  "svg",
  "script",
  "style",
  "noscript",
  "template",
].join(", ");
const BLOCK =
  /^(ADDRESS|ARTICLE|ASIDE|BLOCKQUOTE|DD|DIV|DL|DT|FIGCAPTION|FIGURE|FOOTER|H[1-6]|HEADER|HR|LI|OL|P|PRE|SECTION|TABLE|TBODY|TD|TH|THEAD|TR|UL)$/;

/**
 * the words of a post's prose: the text of its paragraphs, subheadings and
 * list items, each run of text ending where a block does, and a block inside
 * another counted once. Captions and embeds are not prose, even in a `<p>`. Credit lines are counted here, since which lines are
 * credits depends on the labels: `creditParagraphs()` is what to take off.
 * In the browser, with its own parser (~/lib/services/wordpress/parse-document)
 */
export function bodyWords(html: string): number {
  const document = parseDocument(
    `<!doctype html><html><body>${html}</body></html>`,
  );
  let words = 0;
  let run = "";
  const end = () => {
    words += countWords(run);
    run = "";
  };
  const walk = (node: Node, prose: boolean) => {
    for (const child of node.childNodes) {
      if (child.nodeType === child.TEXT_NODE) {
        if (prose) run += child.textContent ?? "";
        continue;
      }
      if (child.nodeType !== child.ELEMENT_NODE) continue;
      if ((child as Element).matches(NOT_PROSE)) continue;
      const tag = (child as Element).tagName.toUpperCase();
      if (tag === "BR") {
        run += " ";
        continue;
      }
      const block = BLOCK.test(tag);
      if (block) end();
      walk(child, prose || PROSE.has(tag));
      if (block) end();
    }
  };
  walk(document.body, false);
  end();
  return words;
}

/**
 * the paragraphs that say who made the article rather than being part of it:
 * credit lines, and lines shaped like one that no label matched
 */
export function creditParagraphs(texts: string[], labels: Label[]): string[] {
  const matcher = labelMatcher(labels);
  const unrecognised = new Set(unrecognisedLines(texts, labels));
  return texts.filter(
    (text) => matcher?.pattern.test(text) || unrecognised.has(text),
  );
}

/* one build reads every post with the same labels, so the pattern is compiled
   once per list rather than twice per post */
const compiled = new WeakMap<Label[], ReturnType<typeof compileMatcher>>();

function labelMatcher(labels: Label[]) {
  let matcher = compiled.get(labels);
  if (matcher === undefined && !compiled.has(labels)) {
    matcher = compileMatcher(labels);
    compiled.set(labels, matcher);
  }
  return matcher;
}

function compileMatcher(labels: Label[]) {
  const byKey = new Map(
    labels.map((label) => [label.label.trim().toLowerCase(), label]),
  );
  if (byKey.size === 0) return undefined;

  /* longest first, so "Image Credits" is not read as "Credits" */
  const alternatives = [...byKey.keys()]
    .sort((a, b) => b.length - a.length)
    .map((key) =>
      key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+"),
    );

  return {
    byKey,
    pattern: new RegExp(`^(${alternatives.join("|")})\\s*:\\s*(.+)$`, "i"),
  };
}

/**
 * The people in a printed credit. "Testudo, as told to Seth Buus" credits Seth
 * Buus; "Godzilla (Translated by Joseph Kleinman)" credits Joseph Kleinman;
 * any other parenthesis, and any piece starting in lower case ("cover image"),
 * is an aside.
 */
export function names(printed: string): { names: string[]; asides: string[] } {
  const asides: string[] = [];
  let text = printed;

  const toldTo = /^(.*?),?\s+as told to\s+(.+)$/i.exec(text);
  if (toldTo) {
    asides.push(`${toldTo[1]!.trim()}, as told to`);
    text = toldTo[2]!;
  }

  const translated = /^(.*?)\(\s*translated by\s+([^)]+)\)(.*)$/i.exec(text);
  if (translated) {
    asides.push(`${translated[1]!.trim()} (translated)`);
    text = `${translated[2]}${translated[3]}`;
  }

  text = text.replace(/\(([^)]*)\)/g, (_, inside: string) => {
    asides.push(inside.trim());
    return "";
  });

  const found: string[] = [];
  for (const piece of text.split(/;|,|\s+&\s+|\s+and\s+/i)) {
    const name = piece
      .replace(/^\s*and\s+/i, "")
      .replace(/[\s.:*]+$/, "")
      .trim();
    if (!name) continue;

    /* a name starts with a capital or a digit (7 Orange Crushes); "cover
       image" and "in memoriam for …" do not */
    if (/^[\p{Ll}]/u.test(name)) asides.push(name);
    else found.push(name);
  }

  return { names: found, asides };
}
