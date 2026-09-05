/* One presentation for show and every edit. Edit facts stay independent of Discord. */
import {
  displayText,
  textDisplay,
  type CommandMessage,
} from "~/lib/services/discord/message";
import { card, articleUrl } from "./card";
import { ARTICLE_PROPERTIES } from "./config";
import type { ArticleChange, EditResult } from "./edit";
import type { ArticlePage } from "./page";

const bold = (value: string) => `**${displayText(value, 100)}**`;

function receipt(change: ArticleChange): string {
  const name = `**${ARTICLE_PROPERTIES[change.property].name}**`;
  const { before, after } = change;
  if (Array.isArray(before) && Array.isArray(after)) {
    const added = after.filter((id) => !before.includes(id));
    const removed = before.filter((id) => !after.includes(id));
    if (!added.length && !removed.length) return `${name} is unchanged.`;
    const additions = added.length
      ? `added ${added.map((id) => (id === change.member?.id ? displayText(change.member.name, 100) : "a member")).join(", ")}`
      : "";
    const removals = removed.length
      ? `removed ${removed.length} ${removed.length === 1 ? "member" : "members"}`
      : "";
    return `Updated ${name}: ${[additions, removals].filter(Boolean).join(" and ")}.`;
  }
  if (Array.isArray(before) || Array.isArray(after)) return `Updated ${name}.`;
  if (before === after)
    return after === null
      ? `${name} is already unset.`
      : `${name} is already ${bold(after)}.`;
  if (after === null) return `Cleared ${name}.`;
  if (before === null) return `Set ${name} to ${bold(after)}.`;
  return `Updated ${name} from ${bold(before)} to ${bold(after)}.`;
}

/** Minimal reply still carries a real article link when a page is identifiable. */
function fallback(
  content: string,
  reference?: Pick<ArticlePage, "id" | "url">,
): CommandMessage {
  const url = reference && articleUrl(reference);
  return {
    components: [
      textDisplay(`${content}${url ? `\n[Open in Notion](${url})` : ""}`),
    ],
  };
}

export function articleResponse(
  result: ArticlePage | EditResult,
): CommandMessage {
  if ("status" in result && result.status === "failed") {
    const notes = result.notes.map((note) => displayText(note, 200));
    return fallback(
      [displayText(result.explanation, 700), ...notes].join("\n"),
      result.pageId ? { id: result.pageId } : undefined,
    );
  }
  const page = "status" in result ? result.page : result;
  const lines =
    "status" in result
      ? [
          ...(result.status === "created"
            ? ["Created article."]
            : result.changes.map(receipt)),
          ...result.notes.map((note) => displayText(note, 200)),
        ]
      : [];
  try {
    const snapshot = card(page);
    const message: CommandMessage = {
      components: [
        ...(lines.length ? [textDisplay(lines.join("\n"))] : []),
        snapshot,
      ],
    };
    // Limit all Text Displays together; never cut the link or Markdown in half.
    const textLength =
      lines.join("\n").length +
      snapshot.components.reduce(
        (total, child) =>
          total +
          (child.type === 10
            ? child.content.length
            : child.components.reduce((n, text) => n + text.content.length, 0)),
        0,
      );
    if (textLength > 4000)
      throw new Error("Article response exceeds Discord's text budget");
    return message;
  } catch (error) {
    console.error("[article] could not render the article snapshot", error);
    const confirmation =
      "status" in result
        ? result.status === "created"
          ? "Created article."
          : result.status === "unchanged"
            ? "Article is unchanged."
            : "Updated article."
        : "Could not display the article.";
    const notes =
      "status" in result
        ? result.notes.map((note) => displayText(note, 200))
        : [];
    return fallback(
      [
        `${confirmation} Open it in Notion to see its properties.`,
        ...notes,
      ].join("\n"),
      page,
    );
  }
}
