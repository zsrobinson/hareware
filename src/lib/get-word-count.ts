import { scrapeArticle } from "./scrape-article";

export async function getWordCount(article: string) {
  const { content } = await scrapeArticle(article);
  const words = content
    .filter(
      (el) =>
        !el.textContent.includes("Article by:") &&
        !el.textContent.includes("Image Credits:"),
    )
    .map((el) => el.textContent)
    .join(" ")
    .split(" ")
    .filter((word) => word !== "");
  return words.length;
}
