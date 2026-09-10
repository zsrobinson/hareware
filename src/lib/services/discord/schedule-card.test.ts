import { expect, test } from "vitest";
import { scheduleCard } from "./schedule-card";
import { ARTICLES_DATABASE_ID } from "~/lib/articles/config";
import { toArticle, type ArticlePage } from "~/lib/articles/page";

const page = (headline: string, date: string | null): ArticlePage => ({
  id: "3d1be415-e24c-80c8-a14f-cf1fd9b7e48c",
  properties: {
    Headline: { title: [{ plain_text: headline }] },
    "Publication Date": { date: date ? { start: date } : null },
  },
});

const article = (headline: string, date: string | null = "2026-09-12") =>
  toArticle(page(headline, date));

const body = (card: ReturnType<typeof scheduleCard>) => {
  const text = card.components[1];
  return text && text.type === 10 ? text.content : "";
};

test("the schedule is a container accented with Notion's Scheduled green", () => {
  const card = scheduleCard([article("Terps lose again")], false);

  expect(card.type).toBe(17);
  expect(card.accent_color).toBe(0x448361);
  expect(card.components).toHaveLength(2);
});

/* the whole database, because the reply is about more than one Article */
test("the link opens the Articles database rather than an article", () => {
  const card = scheduleCard([article("Terps lose again")], false);

  expect(card.components[0]).toMatchObject({
    type: 9,
    accessory: {
      type: 2,
      style: 5,
      label: "Open in Notion",
      url: `https://www.notion.so/${ARTICLES_DATABASE_ID.replaceAll("-", "")}`,
    },
  });
});

test("each line is a bulleted date and headline", () => {
  const card = scheduleCard(
    [article("Terps lose again", "2026-09-12T09:00:00.000-04:00")],
    false,
  );

  expect(body(card)).toBe("- 2026-09-12 **Terps lose again**");
});

test("an article with no date keeps its place in the list", () => {
  const card = scheduleCard([article("No date yet", null)], false);

  expect(body(card)).toBe("- Undated **No date yet**");
});

test("an empty schedule says so rather than showing an empty box", () => {
  expect(body(scheduleCard([], false))).toContain("Nothing is scheduled");
});

test("a truncated read says notion holds more", () => {
  expect(body(scheduleCard([article("One")], true))).toContain(
    "Notion holds more",
  );
});

/*
  discord refuses a container over four thousand characters outright, which the
  editor sees as the command failing. the list is cut here instead, and the cut
  is stated
*/
test("a schedule too long for discord is cut, and says how much was cut", () => {
  const many = Array.from({ length: 200 }, (_, i) =>
    article(`Headline number ${i}`.padEnd(90, "x"), "2026-09-12"),
  );

  const card = scheduleCard(many, false);

  expect(JSON.stringify(card).length).toBeLessThan(4000);
  expect(body(card)).toContain("more, further out");
});

/*
  the two ways the list falls short of the truth are independent, and a ternary
  picking one of them is the "four outcomes flattened into ok" shape in
  docs/agents/silent-failures.md — an editor told the list was cut here would
  never learn notion held a tail beyond it
*/
test("a list both cut here and short in Notion says both", () => {
  const many = Array.from({ length: 200 }, (_, i) =>
    article(`Headline number ${i}`.padEnd(90, "x"), "2026-09-12"),
  );

  const said = body(scheduleCard(many, true));

  expect(said).toContain("more, further out");
  expect(said).toContain("Notion holds more");
});

/* the club's bot must not ping a channel because somebody typed a headline */
test("a headline cannot carry markup or a mention into the list", () => {
  const card = scheduleCard(
    [article("@everyone <@&123> [click](https://example.com)")],
    false,
  );

  const rendered = JSON.stringify(card);
  expect(rendered).not.toContain("@everyone");
  expect(rendered).not.toContain("<@&123>");
  expect(rendered).not.toContain("[click](https://example.com)");
});
