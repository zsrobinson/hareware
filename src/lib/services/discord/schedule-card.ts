/* Draws the schedule as a components v2 container. No reads or writes. */
import {
  displayText,
  textDisplay,
  type Container,
} from "~/lib/services/discord/message";
import type { Article } from "~/lib/articles/page";
import { publicationDay, type Upcoming } from "~/lib/articles/upcoming";
import { palette } from "./palette";

/**
 * how much of discord's four thousand characters one schedule may spend.
 *
 * a container over that budget is refused whole rather than trimmed, so going
 * over shows the editor a failed command and not a shorter list. the headroom
 * left is for the headings and the line saying what was cut
 */
const SCHEDULE_BUDGET = 3500;

/** enough of a headline to recognise it beside a section */
const HEADLINE = 100;

/** what a row with no Section reads as; every Article is supposed to have one */
const NO_SECTION = "No section";

/** `**Section** (Date) | Headline`, with the date dropped when there isn't one */
function line(article: Article): string {
  const section = displayText(article.section ?? "", 40) || NO_SECTION;
  const day = publicationDay(article);

  return `- **${section}**${day ? ` (${day})` : ""} | ${displayText(article.headline, HEADLINE)}`;
}

/** The schedule as one container: a section per status, each counted. */
export function scheduleCard(upcoming: Upcoming): Container {
  /* a status nothing holds is not a section worth a heading, so it is left out
     rather than drawn as a zero */
  const sections = upcoming.groups
    .filter((group) => group.articles.length > 0)
    .map((group) => ({
      heading: `### ${displayText(group.status, 40)} (${group.articles.length})`,
      lines: group.articles.map(line),
    }));

  const body: string[] = [];
  let spent = 0;
  let drawn = 0;
  for (const section of sections) {
    const cost =
      section.heading.length +
      section.lines.reduce((total, text) => total + text.length + 1, 0);
    if (spent + cost > SCHEDULE_BUDGET) break;

    body.push(section.heading, ...section.lines);
    spent += cost;
    drawn += section.lines.length;
  }

  /*
    three different ways the reply can be short of the truth, and they can be
    true at once — so they are said additively rather than as a ternary picking
    one. flattening them is the shape `docs/agents/silent-failures.md` calls
    four outcomes collapsed into `ok`
  */
  const dropped = sections.reduce((n, s) => n + s.lines.length, 0) - drawn;
  const notes = [
    dropped > 0 ? `…and ${dropped} more that did not fit.` : "",
    upcoming.truncated ? "Notion holds more than one query returns." : "",
    upcoming.missing.length
      ? `Notion has no ${upcoming.missing.join(" or ")} status any more.`
      : "",
  ].filter(Boolean);

  return {
    type: 17,
    /* notion draws the Scheduled status green, and `card()` accents a
       scheduled Article out of the same palette */
    accent_color: palette("green").accent,
    components: [
      textDisplay(
        [
          "## Upcoming Articles",
          ...(body.length ? body : ["_Nothing is scheduled or in editing._"]),
          ...(notes.length ? [`_${notes.join(" ")}_`] : []),
        ].join("\n"),
      ),
    ],
  };
}
