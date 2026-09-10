/** the same url with one search param set, or dropped when the value is empty */
export function withParam(url: string, key: string, value: string): string {
  const next = new URL(url);
  if (value) next.searchParams.set(key, value);
  else next.searchParams.delete(key);
  return `${next.pathname}${next.search}`;
}
