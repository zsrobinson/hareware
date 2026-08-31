/**
 * maps over items with at most `limit` of them in flight at once
 *
 * wordpress.com throttles on bursts of cache misses, and asking for ten
 * articles in one go — which is exactly what /email and a full page of links
 * do — is enough to start collecting 429s
 */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await fn(items[index]);
      }
    },
  );

  await Promise.all(workers);
  return results;
}
