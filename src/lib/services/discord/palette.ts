/* Notion's colour names, as discord draws them. No reads or writes. */

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

/** One colour name for both cards, so the same status is drawn the same way. */
export const palette = (color?: string | null) =>
  PALETTE[color ?? "default"] ?? PALETTE.default!;
