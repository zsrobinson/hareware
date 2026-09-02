import { scrapeArticle } from "./scrape-article";

export async function getWordCount(link: string) {
  const { content } = await scrapeArticle(link);
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
