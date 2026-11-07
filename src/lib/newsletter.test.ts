import { expect, test } from "vitest";
import { newsletterHtml } from "./newsletter";

const article = {
  title: "Testudo <em>wins</em>",
  link: "https://theumdhare.com/2026/11/05/testudo/",
  image: "https://i0.wp.com/theumdhare.com/a.jpg?w=300",
  author: "Riley Real",
  imageCredits: "Cleo Drawer",
};

test("fills in the meeting and the note, escaping what was typed", () => {
  const html = newsletterHtml({
    meeting: "Thursday at 7 pm in <Tawes>",
    note: "First line\nsame paragraph\n\nSecond paragraph",
    articles: [article],
  });

  expect(html).toContain("will be Thursday at 7 pm in &lt;Tawes&gt;.");
  expect(html).toContain("<p>First line<br />same paragraph</p>");
  expect(html).toContain("<p>Second paragraph</p>");
  expect(html).toContain("Testudo <em>wins</em>");
  expect(html).toContain("Article by Riley Real");
});

test("leaves placeholders where nothing was typed", () => {
  const html = newsletterHtml({ meeting: " ", note: "", articles: [] });
  expect(html).toContain("will be [when and where].");
  expect(html).toContain("<p>[Your note]</p>");
});

test("leaves out a credit the article does not print", () => {
  const html = newsletterHtml({
    meeting: "",
    note: "",
    articles: [{ ...article, author: undefined, imageCredits: "" }],
  });
  expect(html).not.toContain("Article by");
  expect(html).not.toContain("Image by");
});
