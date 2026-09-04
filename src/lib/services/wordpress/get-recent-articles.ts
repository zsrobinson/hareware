import { XMLParser } from "fast-xml-parser";
import { scrubFragment } from "./scrub-html";
import { ORIGIN } from "./article-url";

/**
 * gets recent articles from wordpress, paginated by groups of 10
 * @param page defaults to 1, most recent
 */
/** the three fields we read off a <item>, of the many wordpress writes */
type FeedItem = { title: string; link: string; pubDate: string };

export async function getRecentArticles(
  page = 1,
): Promise<
  { title: string; link: string; date: string; pubDate: string }[] | undefined
> {
  try {
    // wordpress canonicalises this url — /feed?paged=n becomes /feed/?paged=n,
    // and the parameter is dropped entirely for the first page. asking for the
    // settled form saves a 301 on every request
    const res = await fetch(
      page > 1 ? `${ORIGIN}/feed/?paged=${page}` : `${ORIGIN}/feed/`,
    );
    /* a throttled or erroring wordpress still returns a body, and parsing it
       would look like an empty feed rather than a refusal */
    if (!res.ok) return undefined;

    const text = await res.text();

    const parser = new XMLParser();
    /*
      the parser is typed `any` all the way down, so nothing below would be
      checked at all without saying what we expect back. this is the only
      claim about the feed in the file, and it is one place to correct if
      wordpress ever changes it
    */
    const data = parser.parse(text) as {
      rss?: { channel?: { item?: FeedItem | FeedItem[] } };
    };

    /*
      fast-xml-parser gives back a bare object rather than a one-element array
      when the feed carries a single <item>, and mapping over that throws into
      the catch below — turning a thin feed into "no articles at all"
    */
    /*
      an empty feed and an unreadable one are different answers, and collapsing
      them means a working-but-quiet day gets logged as a wordpress failure.
      a throttled request answers with html, which parses to no <rss> at all —
      that is the unreadable case. a <channel> with no <item> is simply empty
    */
    /*
      the presence of <rss> is what says this is a feed at all. an empty
      <channel></channel> parses to the empty string, so testing it for
      truthiness reported a working-but-quiet day as a wordpress failure
    */
    if (data.rss === undefined) return undefined;

    /* a truncated response can carry <rss> with no <channel>, which is
       unreadable rather than quiet — the same conflation, mirrored */
    if (data.rss.channel === undefined) return undefined;

    const items = data.rss.channel.item;
    if (!items) return [];

    return (Array.isArray(items) ? items : [items]).map((item) => ({
      /* the feed is the one markup path into the dom that the scrubber did not
         cover — /generate renders these with set:html. scrubbing here rather
         than at the call site makes "already safe" part of this function's
         contract, so no caller has to remember */
      title: scrubFragment(String(item.title)),
      link: item.link,
      date: new Date(item.pubDate).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      // the raw feed value, kept alongside the display string above because
      // that one has thrown away the year and the exact instant — callers
      // that need to compare "is this today" (the social ping) need the
      // original to run through `easternNow` themselves
      pubDate: item.pubDate,
    }));
  } catch {
    // a feed we cannot read is the same to every caller as no feed
    return undefined;
  }
}
