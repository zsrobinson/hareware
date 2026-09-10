/* Draws Articles as components v2 containers. No reads or writes. */
import {
  displayText,
  textDisplay,
  type Container,
} from "~/lib/services/discord/message";
import { UNTITLED } from "~/lib/articles/config";
import { ARTICLES_URL, snapshot } from "~/lib/articles/snapshot";
import type { Article, ArticlePage } from "~/lib/articles/page";
import { publicationDay } from "~/lib/articles/upcoming";

/** Notion supplies color names. RGB and Unicode are display approximations. */
const PALETTE: Record<string, { accent: number; emoji: string }> = {
  default: { accent: 0x8a929e, emoji: "⚪" },
  gray: { accent: 0x9b9a97, emoji: "🔘" },
  brown: { accent: 0x9f6b53, emoji: "🟤" },
  orange: { accent: 0xd9730d, emoji: "🟠" },
  yellow: { accent: 0xcb912f, emoji: "🟡" },
  green: { accent: 0x448361, emoji: "🟢" },
  blue: { accent: 0x337ea9, emoji: "🔵" },
  purple: { accent: 0x9065b0, emoji: "🟣" },
  pink: { accent: 0xc14c8a, emoji: "🩷" },
  red: { accent: 0xd44c47, emoji: "🔴" },
};
const palette = (color?: string | null) =>
  PALETTE[color ?? "default"] ?? PALETTE.default!;

export function card(page: ArticlePage): Container {
  const view = snapshot(page);
  if (!view.url) throw new Error("Article has no valid Notion link");

  const title = displayText(view.title, 200) || UNTITLED;
  const rows = view.rows.map((row) => {
    const marker =
      row.status && row.value ? `${palette(row.status.color).emoji} ` : "";
    const value = displayText(row.value ?? "", 160) || "Not set";
    return `**${row.label}**: ${marker}${value}`;
  });

  return {
    type: 17,
    accent_color: palette(view.accentColor).accent,
    components: [
      {
        type: 9,
        components: [textDisplay(`### ${title}`)],
        accessory: {
          type: 2,
          style: 5,
          label: "Open in Notion",
          url: view.url,
        },
      },
      textDisplay(rows.join("\n")),
    ],
  };
}

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

  /* soonest first, so what falls off the end is the furthest out — and the
     editor is told it fell off rather than left to count the list */
  const dropped = lines.length - shown.length;
  const rest =
    dropped > 0
      ? `_…and ${dropped} more, further out._`
      : truncated
        ? "_Notion holds more than this. Open it to see the rest._"
        : "";

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
          ...(rest ? [rest] : []),
        ].join("\n"),
      ),
    ],
  };
}
