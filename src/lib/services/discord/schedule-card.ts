/* Draws the schedule as a components v2 container. No reads or writes. */
import {
  displayText,
  textDisplay,
  type Container,
} from "~/lib/services/discord/message";
import { ARTICLES_URL } from "~/lib/articles/snapshot";
import type { Article } from "~/lib/articles/page";
import { publicationDay } from "~/lib/articles/upcoming";
import { palette } from "./palette";

/**
 * how much of discord's four thousand characters one schedule may spend.
 *
 * a container over that budget is refused whole rather than trimmed, so going
 * over shows the editor a failed command and not a shorter list. the headroom
 * left is for the heading and the line saying what was cut
 */
const SCHEDULE_BUDGET = 3500;

/** enough of a headline to recognise it beside a date */
const HEADLINE = 100;

/** The schedule as one container: a line per Article, soonest first. */
export function scheduleCard(
  articles: Article[],
  truncated: boolean,
): Container {
  const lines = articles.map(
    (article) =>
      `- ${publicationDay(article) ?? "Undated"} **${displayText(article.headline, HEADLINE)}**`,
  );

  const shown: string[] = [];
  let spent = 0;
  for (const line of lines) {
    if (spent + line.length + 1 > SCHEDULE_BUDGET) break;
    shown.push(line);
    spent += line.length + 1;
  }

  /*
    two different ways the list can be short of the truth, and they can both be
    true at once — so they are told additively rather than as a ternary that
    picks one. flattening them is the shape `docs/agents/silent-failures.md`
    calls four outcomes collapsed into `ok`: the editor is told the list was
    cut here and never that notion held a tail beyond it
  */
  const dropped = lines.length - shown.length;
  const rest = [
    /* soonest first, so what falls off the end is the furthest out */
    dropped > 0 ? `…and ${dropped} more, further out.` : "",
    truncated ? "Notion holds more than one query returns." : "",
  ].filter(Boolean);

  return {
    type: 17,
    /* notion draws the Scheduled status green, and `card()` accents a
       scheduled Article out of the same palette */
    accent_color: palette("green").accent,
    components: [
      {
        type: 9,
        components: [textDisplay("### Upcoming articles")],
        accessory: {
          type: 2,
          style: 5,
          label: "Open in Notion",
          url: ARTICLES_URL,
        },
      },
      textDisplay(
        [
          ...(shown.length ? shown : ["_Nothing is scheduled._"]),
          ...(rest.length ? [`_${rest.join(" ")}_`] : []),
        ].join("\n"),
      ),
    ],
  };
}
