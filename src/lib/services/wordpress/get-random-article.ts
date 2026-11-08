import { ORIGIN } from "./article-url";
import { readWordPress } from "./request";

/*
  a link to some published article, for /random. Two reads: how many posts
  there are, then the one at a random offset, each asking only for the link
  and going through readWordPress, so they come from WordPress's cache and
  wait out its refusals like every other read.

  answers "value or nothing": no status check once made `total` NaN and threw
  on an empty array, so any WordPress hiccup broke a page whose whole job is
  to redirect.
*/
const POSTS = `${ORIGIN}/wp-json/wp/v2/posts`;

export async function getRandomArticle(): Promise<string | undefined> {
  try {
    const res = await readWordPress(
      `${POSTS}?per_page=1&_fields=link`,
      "the post count",
    );
    if (!res.ok) return undefined;

    /* the header is how many posts exist. without it there is no range to pick
       from, and guessing would just move the failure one line down */
    const total = Number(res.headers.get("x-wp-total"));
    if (!Number.isFinite(total) || total < 1) return undefined;

    const offset = Math.floor(Math.random() * total);
    const page = await readWordPress(
      `${POSTS}?per_page=1&offset=${offset}&_fields=link`,
      "a random post",
    );
    if (!page.ok) return undefined;

    const data = (await page.json()) as { link?: unknown }[];
    const link = data[0]?.link;

    return typeof link === "string" ? link : undefined;
  } catch {
    // unreachable or throttled wordpress is the same to the caller as no article
    return undefined;
  }
}
