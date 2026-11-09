/** the words in some text: whatever whitespace separates */
export function countWords(text: string) {
  return text.split(/\s+/).filter((word) => word !== "").length;
}

/**
 * the number of words in an article
 * @param body the body elements from `scrapeArticle`, already trimmed of the
 * byline and image credits
 */
export function getWordCount(body: Element[]) {
  return countWords(body.map((el) => el.textContent).join(" "));
}
