export async function getRandomArticle(): Promise<string> {
  const res = await fetch(
    "https://theumdhare.com/wp-json/wp/v2/posts?per_page=1",
  );
  const total = Number(res.headers.get("x-wp-total"));
  const offset = Math.floor(Math.random() * total);
  const res2 = await fetch(
    `https://theumdhare.com/wp-json/wp/v2/posts?per_page=1&offset=${offset}`,
  );
  const data = await res2.json();
  return data[0].link;
}
