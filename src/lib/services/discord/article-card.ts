/* Draws an Article snapshot as a components v2 container. No reads or writes. */
import {
  displayText,
  textDisplay,
  type Container,
} from "~/lib/services/discord/message";
import { UNTITLED } from "~/lib/articles/config";
import { snapshot } from "~/lib/articles/snapshot";
import type { ArticlePage } from "~/lib/articles/page";
import { palette } from "./palette";

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
