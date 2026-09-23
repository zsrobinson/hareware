/* If Meetings has an Editorial Board meeting today, say so in #editorial-board. */

import {
  buttons,
  inert,
  postMessage,
  text,
} from "~/lib/services/discord/post-message";
import {
  propertyOfType,
  query,
  richText,
  title,
  type NotionPage,
} from "~/lib/services/notion/client";
import { easternDayWindow, startsOn } from "~/lib/services/notion/dates";
import { easternTime, type EasternNow } from "~/lib/eastern";
import {
  MEETINGS_DATA_SOURCE_ID,
  MEETING_PROPERTIES,
  MEETING_TYPE,
} from "~/lib/members/config";
import { misconfigured, ok, skipped, type Result } from "~/lib/result";
import {
  BOARD_CHANNEL_ID,
  MEETING_DATE_PROPERTY,
  MEETING_MENTION_ROLE_ID,
  MEETING_TITLE_PREFIX,
} from "./config";

export async function sendMeetingReminder(
  env: Env,
  eastern: EasternNow,
): Promise<Result> {
  const missing = [
    !env.NOTION_TOKEN && "NOTION_TOKEN",
    !env.DISCORD_BOT_TOKEN && "DISCORD_BOT_TOKEN",
  ].filter(Boolean);
  if (missing.length > 0)
    return misconfigured(`meeting reminder unset: ${missing.join(", ")}`);

  const token = env.NOTION_TOKEN!;
  const source = MEETINGS_DATA_SOURCE_ID;
  const property = await propertyOfType(
    source,
    token,
    "date",
    MEETING_DATE_PROPERTY,
  );
  const page = await findTodaysMeeting(token, source, property, eastern.date);

  if (!page)
    return skipped(
      `no ${MEETING_TITLE_PREFIX} meeting today (${eastern.date})`,
    );

  const name = title(page).trim();

  await postMessage(
    env.DISCORD_BOT_TOKEN!,
    BOARD_CHANNEL_ID,
    {
      blocks: [
        text(meetingLine(page, property)),
        buttons({ label: "View Agenda", url: page.url }),
      ],
      mentionRoleIds: MEETING_MENTION_ROLE_ID ? [MEETING_MENTION_ROLE_ID] : [],
    },
    {
      dryRun: Boolean(env.REMINDERS_DRY_RUN),
      silent: Boolean(env.REMINDERS_NO_PING),
      testChannelId: env.REMINDERS_TEST_CHANNEL,
    },
  );

  const verb = env.REMINDERS_DRY_RUN ? "would post" : "posted";

  /* says when the title fallback matched, so it can be retired */
  const untyped = meetingType(page)
    ? ""
    : " (matched on its title: this row has no Type set)";

  return ok(`${verb} meeting reminder for "${name}"${untyped}`);
}

/**
 * Today's board meeting. A window plus a filter, since Notion's date equality
 * fails (`easternDayWindow`).
 */
async function findTodaysMeeting(
  token: string,
  source: string,
  property: string,
  date: string,
): Promise<NotionPage | undefined> {
  const pages = await query(source, token, easternDayWindow(property, date));

  return pages.find((page) => {
    const start = page.properties[property]?.date?.start;
    if (start === undefined || !startsOn(start, date)) return false;

    return isBoardMeeting(page);
  });
}

/**
 * By `Type` (ADR 0010), falling back to the title prefix for rows with no Type
 * yet. The fallback and `MEETING_TITLE_PREFIX` go once every row has a Type.
 */
function isBoardMeeting(page: NotionPage): boolean {
  const type = meetingType(page);

  /* a typed row is answered by its Type, even against its title */
  if (type) return type === MEETING_TYPE.editorialBoard;

  return title(page)
    .trim()
    .toLowerCase()
    .startsWith(MEETING_TITLE_PREFIX.toLowerCase());
}

function meetingType(page: NotionPage): string | undefined {
  return (
    page.properties[MEETING_PROPERTIES.type.name]?.select?.name ?? undefined
  );
}

/** the reminder's line; a missing time or location drops its clause */
function meetingLine(page: NotionPage, property: string): string {
  const mention = MEETING_MENTION_ROLE_ID
    ? `<@&${MEETING_MENTION_ROLE_ID}> `
    : "";
  const time = easternTime(page.properties[property]?.date?.start ?? "");
  const location = richText(page);

  return [
    `${mention}**Meeting Tonight**`,
    time && ` at ${time}`,
    location && ` in ${inert(location)}`,
  ]
    .filter(Boolean)
    .join("");
}
