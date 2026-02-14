import { JSDOM } from "jsdom";

/**
 * scrapes the article content from wordpress
 * @param article the full link, including schema and domain
 */
export async function scrapeArticle(article: string) {
  const res = await fetch(article);
  const buffer = await res.arrayBuffer();
  const dom = new JSDOM(buffer);

  dom.window.document
    .querySelector(".entry-content")
    ?.querySelectorAll("*")
    .forEach((el) => {
      // remove all empty elements inside of the posts
      if (el.innerHTML.trim() === "" && el.tagName !== "BR") {
        el.remove();
      }
    });

  const title = dom.window.document
    .querySelector(".wp-block-post-title")!
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
    ?.getAttribute("content")
    ?.split("?")[0]!;

  const date = dom.window.document
    .querySelector(".wp-block-post-date.has-text-align-right time")
    ?.innerHTML.trim();

  const section = dom.window.document
    .querySelector(".taxonomy-category > a")
    ?.innerHTML.trim();

  const content = [
    ...dom.window.document.querySelectorAll(
      ".entry-content p, .entry-content h2, .entry-content h3, .entry-content ol, .entry-content ul",
    ),
  ].filter((el) => el.innerHTML !== "");

  return {
    title,
    author,
    imageCredits,
    image,
    date,
    content,
    link: article,
    section,
  };
}
