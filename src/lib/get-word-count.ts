/**
 * the number of words in an article, ignoring the byline and image credits
 * @param content the content elements from `scrapeArticle`
 */
export function getWordCount(content: Element[]) {
  const words = content
    .filter(
      (el) =>
        !el.textContent?.includes("Article by:") &&
        !el.textContent?.includes("Image Credits:"),
    )
    .map((el) => el.textContent)
    .join(" ")
    .split(" ")
    .filter((word) => word !== "");
  return words.length;
}
