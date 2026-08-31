import { parseHTML } from "linkedom";

/**
 * scrapes the article content from wordpress
 * @param article the full link, including schema and domain
 */
export async function scrapeArticle(article: string) {
  const res = await fetch(article);
  const { document } = parseHTML(await res.text());

  // linkedom splits text at entity boundaries (`a&nbsp;b` becomes three text
  // nodes), which makes getTaggedText emit redundant typeface tags
  document.querySelector(".entry-content")?.normalize();

  document
    .querySelector(".entry-content")
    ?.querySelectorAll("*")
    .forEach((el) => {
      // remove all empty elements inside of the posts
      if (el.innerHTML.trim() === "" && el.tagName !== "BR") {
        el.remove();
      }
    });

  const title = document
    .querySelector(".wp-block-post-title")!
    .innerHTML.trim();

  const author = document
    .querySelector(".entry-content p:first-of-type")
    ?.textContent?.trim()
    .split(": ")[1];

  const imageCredits = document
    .querySelector(".entry-content p:last-of-type em")
    ?.innerHTML.trim()
    .split(": ")[1];

  const image = document
    .querySelector(`meta[property="og:image"]`)
    ?.getAttribute("content")
    ?.split("?")[0]!;

  const date = document
    .querySelector(".wp-block-post-date.has-text-align-right time")
    ?.innerHTML.trim();

  const section = document
    .querySelector(".taxonomy-category > a")
    ?.innerHTML.trim();

  const content = [
    ...document.querySelectorAll(
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
