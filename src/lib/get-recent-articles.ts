import { XMLParser } from "fast-xml-parser";

export async function getRecentArticles(
  page: number,
): Promise<{ title: string; link: string; date: string }[] | undefined> {
  try {
    const res = await fetch(`https://theumdhare.com/feed?paged=${page}`);
    const buffer = Buffer.from(await res.arrayBuffer());

    const parser = new XMLParser();
    const data = parser.parse(buffer);

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
