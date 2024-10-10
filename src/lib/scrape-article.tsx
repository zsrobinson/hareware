import { JSDOM } from "jsdom";

export async function scrapeArticle(article: string) {
  const res = await fetch(article);
  const buffer = await res.arrayBuffer();
  const dom = new JSDOM(buffer);

  const title = dom.window.document
    .querySelector(".entry-title")!
    .innerHTML.trim();

  const author = dom.window.document
    .querySelector(".entry-content p:first-of-type")
    ?.textContent?.trim()
    .split(": ")[1];

  const imageCredits = dom.window.document
    .querySelector(".entry-content p:last-of-type em")
    ?.innerHTML.trim()
    .split(": ")[1];

  const image = dom.window.document
    .querySelector(`meta[property="og:image"]`)
    ?.getAttribute("content")!;

  const date = dom.window.document
    .querySelector(".wp-block-post-date time")
    ?.innerHTML.trim();

  const content = [
    ...dom.window.document.querySelectorAll(
      ".entry-content p, .entry-content h2, .entry-content ol, .entry-content ul",
    ),
  ] as Element[];

  return { title, author, imageCredits, image, date, content };
}
