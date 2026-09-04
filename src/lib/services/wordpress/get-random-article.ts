import { ORIGIN } from "./article-url";

/*
  a link to some published article, for /random.

  this had no error handling at all: no status check, and `x-wp-total` missing
  made `total` NaN, `offset` NaN, and `data[0].link` throw on an empty array —
  so any WordPress hiccup was a 500 on a page whose whole job is to redirect.
  every other helper here answers "value or nothing"; this one now does too.
*/
export async function getRandomArticle(): Promise<string | undefined> {
  try {
    const res = await fetch(`${ORIGIN}/wp-json/wp/v2/posts?per_page=1`);
    if (!res.ok) return undefined;

    /* the header is how many posts exist. without it there is no range to pick
       from, and guessing would just move the failure one line down */
    const total = Number(res.headers.get("x-wp-total"));
    if (!Number.isFinite(total) || total < 1) return undefined;

    const offset = Math.floor(Math.random() * total);
    const page = await fetch(
      `${ORIGIN}/wp-json/wp/v2/posts?per_page=1&offset=${offset}`,
    );
    if (!page.ok) return undefined;

    const data = (await page.json()) as { link?: unknown }[];
    const link = data[0]?.link;

    return typeof link === "string" ? link : undefined;
  } catch {
    // unreachable wordpress is the same to the caller as no article
    return undefined;
  }
}
