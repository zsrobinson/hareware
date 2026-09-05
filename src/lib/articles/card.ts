/* The same Article snapshot for show, creation and edits. No reads or writes. */
import { notion, plainText } from "~/lib/services/notion/client";
import {
  displayText,
  textDisplay,
  type Container,
} from "~/lib/services/discord/message";
import { ARTICLE_PROPERTIES, UNTITLED } from "./config";
import { optionName, type ArticlePage } from "./page";

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

// The existing card fields, in the All Articles view's relative order.
const PROPERTIES = [
  "authorByline",
  "status",
  "section",
  "imageStatus",
  "imageByline",
  "publicationDate",
] as const;

/** Never turn remote text into an arbitrary link posted by the club's bot. */
export function articleUrl(
  page: Pick<ArticlePage, "id" | "url">,
): string | undefined {
  if (page.url) {
    try {
      const url = new URL(page.url);
      if (
        url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        /^(?:www\.|app\.)?notion\.so$|^(?:www\.|app\.)?notion\.com$/.test(
          url.hostname,
        ) &&
        url.href.length <= 512
      )
        return url.href;
    } catch {
      /* Fall back to the canonical page id. */
    }
  }
  const id = page.id.replaceAll("-", "");
  return /^[a-f0-9]{32}$/i.test(id) ? `https://www.notion.so/${id}` : undefined;
}

export function card(page: ArticlePage): Container {
  const property = (key: keyof typeof ARTICLE_PROPERTIES) =>
    page.properties?.[ARTICLE_PROPERTIES[key].name];
  const url = articleUrl(page);
  if (!url) throw new Error("Article has no valid Notion link");
  const title =
    displayText(plainText(property("headline")?.title), 200) || UNTITLED;
  const rows = PROPERTIES.map((key) => {
    const value = property(key);
    const raw =
      key === "publicationDate"
        ? value?.date?.start
        : key === "authorByline" || key === "imageByline"
          ? plainText(value?.rich_text)
          : optionName(value);
    const marker =
      (key === "status" || key === "imageStatus") && raw
        ? `${palette(value?.status?.color).emoji} `
        : "";
    return `**${ARTICLE_PROPERTIES[key].name}**: ${marker}${displayText(raw ?? "", 160) || "Not set"}`;
  });
  return {
    type: 17,
    accent_color: palette(property("status")?.status?.color).accent,
    components: [
      {
        type: 9,
        components: [textDisplay(`### ${title}`)],
        accessory: { type: 2, style: 5, label: "Open in Notion", url },
      },
      textDisplay(rows.join("\n")),
    ],
  };
}

export async function readArticle(
  pageId: string,
  token: string,
): Promise<ArticlePage> {
  return (await notion(`pages/${pageId}`, token)) as ArticlePage;
}
