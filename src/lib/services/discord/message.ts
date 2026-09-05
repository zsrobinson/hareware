/* Outbound command messages. The transport owns flags; callers supply layout. */
import { inert } from "./post-message";

export type TextDisplay = { type: 10; content: string };
export type LinkButton = { type: 2; style: 5; label: string; url: string };
export type Section = {
  type: 9;
  components: TextDisplay[];
  accessory: LinkButton;
};
export type Container = {
  type: 17;
  accent_color: number;
  components: (TextDisplay | Section)[];
};
/** One recursive representation for every component Discord sends or receives. */
export type Component = {
  type: number;
  custom_id?: string;
  components?: Component[];
  [key: string]: unknown;
};
export type CommandMessage = { components: Component[] };

export const IS_COMPONENTS_V2 = 1 << 15;
export const textDisplay = (content: string): TextDisplay => ({
  type: 10,
  content,
});

/** Bound before escaping, so truncation cannot leave half of a Markdown escape. */
export function displayText(value: string, limit = 240): string {
  const singleLine = value.replace(/[\r\n\t]+/g, " ").trim();
  const chars = Array.from(singleLine);
  const short =
    chars.length > limit
      ? `${chars.slice(0, limit - 1).join("")}…`
      : singleLine;
  return inert(short).replace(/[\\`*_{}[\]()<>#|~]/g, "\\$&");
}

/** Plain fallback text also uses V2, including after a deferred reply. */
export function textMessage(content: string): CommandMessage {
  return {
    components: [
      textDisplay(
        displayText(content, 900) ||
          "HareWare could not describe the result. Check the Article in Notion.",
      ),
    ],
  };
}
