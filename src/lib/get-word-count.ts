/**
 * the number of words in an article
 * @param body the body elements from `scrapeArticle`, already trimmed of the
 * byline and image credits
 */
export function getWordCount(body: Element[]) {
  const words = body
    .map((el) => el.textContent)
    .join(" ")
    .split(" ")
    .filter((word) => word !== "");
  return words.length;
}
