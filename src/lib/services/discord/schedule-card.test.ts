import { expect, test } from "vitest";
import { scheduleCard } from "./schedule-card";
import { toArticle, type ArticlePage } from "~/lib/articles/page";
import type { Upcoming, UpcomingGroup } from "~/lib/articles/upcoming";

const page = (
  headline: string,
  section: string | null,
  date: string | null,
): ArticlePage => ({
  id: "3d1be415-e24c-80c8-a14f-cf1fd9b7e48c",
  properties: {
    Headline: { title: [{ plain_text: headline }] },
    Section: { select: section ? { name: section } : null },
    "Publication Date": { date: date ? { start: date } : null },
  },
});

const article = (
  headline: string,
  section: string | null = "News",
  date: string | null = "2026-09-12",
) => toArticle(page(headline, section, date));

const group = (status: string, ...articles: ReturnType<typeof article>[]) =>
  ({ status, articles }) as UpcomingGroup;

const upcoming = (over: Partial<Upcoming> = {}): Upcoming => ({
  groups: [group("Scheduled", article("Terps lose again"))],
  missing: [],
  truncated: false,
  ...over,
});

const body = (card: ReturnType<typeof scheduleCard>) => {
  const text = card.components[0];
  return text && text.type === 10 ? text.content : "";
};

test("the schedule is a container accented with Notion's Scheduled green", () => {
  const card = scheduleCard(upcoming());

  expect(card.type).toBe(17);
  expect(card.accent_color).toBe(0x448361);
});

/* "no link to notion necessary" — so there is no accessory to hang one on */
test("the card carries no Notion link", () => {
  expect(JSON.stringify(scheduleCard(upcoming()))).not.toContain("notion.so");
});

test("each line is the section, its date and the headline", () => {
  expect(body(scheduleCard(upcoming()))).toContain(
    "- **News** (2026-09-12) | Terps lose again",
  );
});

test("a heading names the status and counts it", () => {
  const card = scheduleCard(
    upcoming({
      groups: [
        group("Scheduled", article("One"), article("Two")),
        group("Managing Edited", article("Three", "Sports", null)),
      ],
    }),
  );

  expect(body(card)).toContain("## Upcoming Articles");
  expect(body(card)).toContain("### Scheduled (2)");
  expect(body(card)).toContain("### Managing Edited (1)");
});

/* an article still being edited usually has no date, and the parens would be
   empty rather than informative */
test("a line with no date drops the parentheses", () => {
  const card = scheduleCard(
    upcoming({
      groups: [group("Section Edited", article("No date", "News", null))],
    }),
  );

  expect(body(card)).toContain("- **News** | No date");
  expect(body(card)).not.toContain("()");
});

test("an article with no section says so rather than leaving a gap", () => {
  const card = scheduleCard(
    upcoming({ groups: [group("Scheduled", article("Orphan", null))] }),
  );

  expect(body(card)).toContain("- **No section** (2026-09-12) | Orphan");
});

test("a status nothing holds gets no heading at all", () => {
  const card = scheduleCard(
    upcoming({
      groups: [group("Scheduled", article("One")), group("Managing Edited")],
    }),
  );

  expect(body(card)).toContain("### Scheduled (1)");
  expect(body(card)).not.toContain("Managing Edited");
});

test("an empty pipeline says so rather than showing an empty box", () => {
  expect(body(scheduleCard(upcoming({ groups: [] })))).toContain(
    "Nothing is scheduled or in editing",
  );
});

/* a renamed status is not an empty one, and the card is where that is said */
test("a status Notion no longer has is named", () => {
  const said = body(scheduleCard(upcoming({ missing: ["managing edited"] })));

  expect(said).toContain("managing edited");
});

test("a truncated read says notion holds more", () => {
  expect(body(scheduleCard(upcoming({ truncated: true })))).toContain(
    "Notion holds more",
  );
});

/*
  discord refuses a container over four thousand characters outright, which the
  editor sees as the command failing. the list is cut here instead, and the cut
  is stated
*/
test("a pipeline too long for discord is cut, and says how much was cut", () => {
  const many = Array.from({ length: 200 }, (_, i) =>
    article(`Headline number ${i}`.padEnd(90, "x")),
  );

  const card = scheduleCard(
    upcoming({ groups: [group("Scheduled", ...many)] }),
  );

  expect(JSON.stringify(card).length).toBeLessThan(4000);
  expect(body(card)).toContain("did not fit");
});

/*
  the three ways the reply falls short of the truth are independent, and a
  ternary picking one is the "four outcomes flattened into ok" shape in
  docs/agents/silent-failures.md
*/
test("cut, truncated and missing are all said together", () => {
  const many = Array.from({ length: 200 }, (_, i) =>
    article(`Headline number ${i}`.padEnd(90, "x")),
  );

  const said = body(
    scheduleCard(
      upcoming({
        groups: [group("Scheduled", ...many)],
        truncated: true,
        missing: ["section edited"],
      }),
    ),
  );

  expect(said).toContain("did not fit");
  expect(said).toContain("Notion holds more");
  expect(said).toContain("section edited");
});

/* the club's bot must not ping a channel because somebody typed a headline */
test("a headline or section cannot carry markup or a mention into the list", () => {
  const card = scheduleCard(
    upcoming({
      groups: [
        group(
          "Scheduled",
          article("@everyone <@&123> [click](https://example.com)", "@here"),
        ),
      ],
    }),
  );

  const rendered = JSON.stringify(card);
  expect(rendered).not.toContain("@everyone");
  expect(rendered).not.toContain("<@&123>");
  expect(rendered).not.toContain("[click](https://example.com)");
  expect(rendered).not.toContain("@here");
});
