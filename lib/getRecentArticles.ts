import { XMLParser } from "fast-xml-parser";

export async function getRecentArticles(): Promise<
  { title: string; link: string }[] | undefined
> {
  try {
    const res = await fetch("https://theumdhare.com/feed");
    const buffer = Buffer.from(await res.arrayBuffer());

    const parser = new XMLParser();
    const data = parser.parse(buffer);

    return data.rss.channel.item.map((item: any) => ({
      title: item.title as string,
      link: item.link as string,
    }));
  } catch (e) {
    return undefined;
  }
}
