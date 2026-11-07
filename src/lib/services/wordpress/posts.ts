/*
  Published posts from the public REST API, which needs no sign-in and answers
  any origin: the cron reads it from the Worker, and the archive from the
  browser. WordPress.com answers 429 to a handful of quick requests, so pages
  are read one at a time and every read goes through `readWordPress`.
*/

import { ORIGIN } from "./article-url";
import { readWordPress } from "./request";

const API = `${ORIGIN}/wp-json/wp/v2`;
const PER_PAGE = 100;

/** a published post, as much of it as anything here reads */
export type Post = {
  id: number;
  /** an instant, ISO 8601 with a Z */
  publishedAt: string;
  link: string;
  /** plain text: the API sends `title.rendered` with entities in it */
  title: string;
  categoryIds: number[];
  /** `content.rendered`: markup as the site serves it, never shown here */
  html: string;
};

export type Category = { id: number; name: string };

type ApiPost = {
  id: number;
  date_gmt: string;
  link: string;
  title: { rendered: string };
  categories: number[];
  content?: { rendered: string };
};

/** every published post, newest first. Throws rather than answering short */
export async function allPosts(): Promise<Post[]> {
  const posts: Post[] = [];

  for (let page = 1; ; page++) {
    const { rows, totalPages } = await readPage(
      {
        page: String(page),
        _fields: "id,date_gmt,link,title,categories,content",
      },
      `posts page ${page}`,
    );
    posts.push(...rows);
    if (page >= totalPages) return posts;
  }
}

/**
 * posts published strictly after `instant`, without their bodies. Throws when
 * WordPress cannot be read, so a failure never looks like a quiet day
 */
export async function postsPublishedAfter(instant: Date): Promise<Post[]> {
  /* `after` is compared against the site's local `date`, whatever offset it is
     given, so ask for a day early and compare `date_gmt` here */
  const early = new Date(instant.getTime() - 24 * 60 * 60 * 1000);

  const { rows } = await readPage(
    {
      after: early.toISOString(),
      _fields: "id,date_gmt,link,title,categories",
      order: "asc",
    },
    "recent posts",
  );

  return rows.filter(
    (post) => Date.parse(post.publishedAt) > instant.getTime(),
  );
}

export async function categories(): Promise<Category[]> {
  const response = await readWordPress(
    `${API}/categories?per_page=100&_fields=id,name`,
    "wordpress categories",
  );
  if (!response.ok)
    throw new Error(`wordpress categories answered ${response.status}`);

  const rows = (await response.json()) as { id: number; name: string }[];
  return rows.map((row) => ({ id: row.id, name: decodeEntities(row.name) }));
}

async function readPage(
  query: Record<string, string>,
  describe: string,
): Promise<{ rows: Post[]; totalPages: number }> {
  const params = new URLSearchParams({
    per_page: String(PER_PAGE),
    status: "publish",
    ...query,
  });

  const response = await readWordPress(
    `${API}/posts?${params}`,
    `wordpress ${describe}`,
  );
  if (!response.ok)
    throw new Error(`wordpress ${describe} answered ${response.status}`);

  /* a throttled wordpress.com answers html with a 200 often enough that the
     body has to prove it is a list */
  const body: unknown = await response.json().catch(() => undefined);
  if (!Array.isArray(body))
    throw new Error(`wordpress ${describe} did not answer a list`);

  /* absent on an empty result; never let it become NaN (silent-failures.md) */
  const header = Number(response.headers.get("x-wp-totalpages"));
  const totalPages = Number.isFinite(header) && header > 0 ? header : 1;

  return { rows: (body as ApiPost[]).map(toPost), totalPages };
}

function toPost(row: ApiPost): Post {
  return {
    id: row.id,
    /* `date_gmt` carries no zone marker, and Date.parse would read it as local */
    publishedAt: `${row.date_gmt}Z`,
    link: row.link,
    title: decodeEntities(row.title.rendered.replace(/<[^>]+>/g, "")),
    categoryIds: row.categories,
    html: row.content?.rendered ?? "",
  };
}

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  ndash: "–",
  mdash: "—",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
};

/** what WordPress's texturizer writes: numeric entities and a few named ones */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === "#") {
      const point =
        code[1] === "x" || code[1] === "X"
          ? parseInt(code.slice(2), 16)
          : parseInt(code.slice(1), 10);
      return Number.isFinite(point) ? String.fromCodePoint(point) : whole;
    }
    return NAMED[code.toLowerCase()] ?? whole;
  });
}
