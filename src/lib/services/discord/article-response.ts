/* One presentation for show and every edit. Edit facts stay independent of Discord. */
import {
  displayText,
  textDisplay,
  type CommandMessage,
} from "~/lib/services/discord/message";
import { card } from "./article-card";
import { articleUrl } from "~/lib/articles/snapshot";
import { ARTICLE_PROPERTIES } from "~/lib/articles/config";
import {
  editSentence,
  type ArticleChange,
  type EditResult,
} from "~/lib/articles/edit";
import type { ArticlePage } from "~/lib/articles/page";

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

/** `/article show`: the card alone */
export function articleResponse(page: ArticlePage): CommandMessage {
  return withCard([], page, "Could not display the article.", []);
}

/** the reply to an edit: what it did, then the card */
export function editResponse(result: EditResult): CommandMessage {
  const notes = result.notes.map((note) => displayText(note, 200));
  if (result.status === "failed")
    return fallback(
      [displayText(result.explanation, 700), ...notes].join("\n"),
      result.pageId ? { id: result.pageId } : undefined,
    );
  const said =
    result.status === "created" || result.status === "deleted"
      ? [editSentence(result.status)]
      : result.changes.map(receipt);
  return withCard(
    [...said, ...notes],
    result.page,
    editSentence(result.status),
    notes,
  );
}

function withCard(
  lines: string[],
  page: ArticlePage,
  confirmation: string,
  notes: string[],
): CommandMessage {
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
    return fallback(
      [
        `${confirmation} Open it in Notion to see its properties.`,
        ...notes,
      ].join("\n"),
      page,
    );
  }
}
