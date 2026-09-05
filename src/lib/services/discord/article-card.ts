/* Draws an Article snapshot as a components v2 container. No reads or writes. */
import {
  displayText,
  textDisplay,
  type Container,
} from "~/lib/services/discord/message";
import { UNTITLED } from "~/lib/articles/config";
import { snapshot } from "~/lib/articles/snapshot";
import type { ArticlePage } from "~/lib/articles/page";

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
