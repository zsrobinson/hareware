import { afterEach, expect, test, vi } from "vitest";
import { scrapeArticle } from "./scrape-article";

afterEach(() => vi.unstubAllGlobals());

test("scrubs WordPress markup before returning an article", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json([
        {
          title: { rendered: `<img src=x onerror="alert(1)">Safe title` },
          content: {
            rendered: `<p>Article by: Jamie</p><script>alert(1)</script><p onclick="alert(2)">Body</p>`,
          },
          date: "2026-09-05T12:00:00",
          link: "https://theumdhare.com/2026/09/05/example/",
          _embedded: {
            "wp:term": [[{ name: "News", taxonomy: "category" }]],
          },
        },
      ]),
    ),
  );

  const article = await scrapeArticle("example");

  expect(article.title).toBe(`<img src="x">Safe title`);
  expect(article.author).toBe("Jamie");
  expect(article.body.map((element) => element.outerHTML)).toEqual([
    "<p>Body</p>",
  ]);
  expect(JSON.stringify(article)).not.toContain("alert(");
});
