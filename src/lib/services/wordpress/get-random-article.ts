import { jsonOf, readWordPress } from "./request";
import { POSTS } from "./urls";

/*
  a link to some published article, for /random. Two reads: how many posts
  there are, then the one at a random offset, each asking only for the link
  and going through readWordPress, so they come from WordPress's cache and
  wait out its refusals like every other read.

  answers "value or nothing": the page's whole job is to redirect, and it
  goes to the landing when there is nothing to go to.
*/

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
    const data = await jsonOf<{ link?: unknown }[]>(
      await readWordPress(
        `${POSTS}?per_page=1&offset=${offset}&_fields=link`,
        "a random post",
      ),
      "a random post",
    );
    const link = data[0]?.link;

    return typeof link === "string" ? link : undefined;
  } catch {
    // unreachable or throttled wordpress is the same to the caller as no article
    return undefined;
  }
}
