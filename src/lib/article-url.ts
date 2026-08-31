const ORIGIN = "https://theumdhare.com";
const HOSTNAMES = ["theumdhare.com", "www.theumdhare.com"];

/** the year/month/day folders wordpress nests its permalinks under */
const DATE_FOLDERS = /^\d{4}\/\d{2}\/\d{2}\//;

/**
 * shortens a permalink into the slug we pass around in search params, dropping
 * both the origin and the year/month/day folders
 */
export function toArticleSlug(link: string): string {
  return trimSlashes(pathOf(link) ?? link).replace(DATE_FOLDERS, "");
}

/**
 * expands a search param back into a full link, accepting a bare slug, a path
 * that still has its date folders, or a full url. wordpress redirects a bare
 * slug to its dated permalink, so fetch lands on the article either way.
 * @returns undefined for anything that isn't on theumdhare.com
 */
export function toArticleLink(param: string): string | undefined {
  const path = pathOf(param);
  if (path === undefined) return undefined;

  const slug = trimSlashes(path);
  return slug === "" ? undefined : `${ORIGIN}/${slug}/`;
}

/**
 * the pathname of a hare link, or of a bare slug or path
 * @returns undefined if the input points somewhere other than the hare
 */
function pathOf(input: string): string | undefined {
  const trimmed = input.trim();
  if (trimmed === "") return undefined;

  // only absolute inputs carry a host worth vetting
  if (/^[a-z][a-z\d+.-]*:/i.test(trimmed) || trimmed.startsWith("//")) {
    try {
      const url = new URL(trimmed, `${ORIGIN}/`);
      return HOSTNAMES.includes(url.hostname) ? url.pathname : undefined;
    } catch {
      return undefined;
    }
  }

  // a scheme-less paste of the domain has nothing for URL to latch onto, so
  // strip it off and treat whatever is left as a plain path
  try {
    const path = trimmed.replace(/^(?:www\.)?theumdhare\.com/i, "");
    return new URL(path, `${ORIGIN}/`).pathname;
  } catch {
    return undefined;
  }
}

function trimSlashes(path: string): string {
  return path.replace(/^\/+/, "").replace(/\/+$/, "");
}
