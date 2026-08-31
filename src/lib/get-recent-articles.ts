import { XMLParser } from "fast-xml-parser";
import { ORIGIN } from "./article-url";

/**
 * gets recent articles from wordpress, paginated by groups of 10
 * @param page defaults to 1, most recent
 */
export async function getRecentArticles(
  page = 1,
): Promise<{ title: string; link: string; date: string }[] | undefined> {
  try {
    // wordpress canonicalises this url — /feed?paged=n becomes /feed/?paged=n,
    // and the parameter is dropped entirely for the first page. asking for the
    // settled form saves a 301 on every request
    const res = await fetch(
      page > 1 ? `${ORIGIN}/feed/?paged=${page}` : `${ORIGIN}/feed/`,
    );
    const text = await res.text();

    const parser = new XMLParser();
    const data = parser.parse(text);

    return data.rss.channel.item.map((item: any) => ({
      title: item.title as string,
      link: item.link as string,
      date: new Date(item.pubDate).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
    }));
  } catch (e) {
    return undefined;
  }
}
