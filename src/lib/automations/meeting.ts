/*
  the meeting reminder: if there is an Editorial Board meeting in Notion today,
  say so in #editorial-board before anyone has to ask.

  everything about *how* to talk to Notion lives in ~/lib/services/notion. What
  is left here is what makes this reminder this reminder — which database, which
  rows count, and what the message says.
*/

import {
  buttons,
  inert,
  postMessage,
  text,
} from "~/lib/services/discord/post-message";
import {
  dataSource,
  propertyOfType,
  query,
  richText,
  title,
  type NotionPage,
} from "~/lib/services/notion/client";
import { easternDayWindow, startsOn } from "~/lib/services/notion/dates";
import { easternTime, type EasternNow } from "~/lib/eastern";
import { misconfigured, ok, skipped, type Result } from "./registry";
import {
  BOARD_CHANNEL_ID,
  MEETING_DATE_PROPERTY,
  MEETING_MENTION_ROLE_ID,
  MEETING_TITLE_PREFIX,
  MEETINGS_DATABASE_ID,
} from "./config";

export async function sendMeetingReminder(
  env: Env,
  eastern: EasternNow,
): Promise<Result> {
  // the code must stay inert until the club actually sets these up — see ADR
  // 0006's "setup outside the repo"
  const missing = [
    !env.NOTION_TOKEN && "NOTION_TOKEN",
    !env.DISCORD_BOT_TOKEN && "DISCORD_BOT_TOKEN",
    !MEETINGS_DATABASE_ID && "MEETINGS_DATABASE_ID",
  ].filter(Boolean);
  /* not `ok`: nothing ran, and a row saying otherwise is the failure ADR 0007
     exists to prevent */
  if (missing.length > 0)
    return misconfigured(`meeting reminder unset: ${missing.join(", ")}`);

  const token = env.NOTION_TOKEN!;
  const source = await dataSource(MEETINGS_DATABASE_ID!, token);
  const property = await propertyOfType(
    source,
    token,
    "date",
    MEETING_DATE_PROPERTY,
  );
  const page = await findTodaysMeeting(token, source, property, eastern.date);

  // a genuinely quiet day, which is a different thing from a broken one
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

  // a dry run posts nothing, and saying "posted" made a message that never
  // went out indistinguishable from one that did
  const verb = env.REMINDERS_DRY_RUN ? "would post" : "posted";
  return ok(`${verb} meeting reminder for "${name}"`);
}

/**
 * today's meeting of the kind we care about, if there is one.
 *
 * the window-plus-predicate shape is not optional — `easternDayWindow` explains
 * why asking Notion for one day does not work
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

    // titles carry stray trailing spaces, so compare a trimmed lowercase form
    return title(page)
      .trim()
      .toLowerCase()
      .startsWith(MEETING_TITLE_PREFIX.toLowerCase());
  });
}

/**
 * the one line the reminder says, assembled from what the row actually has —
 * a meeting with no time or no location set simply loses that clause rather
 * than announcing itself as "at undefined"
 */
function meetingLine(page: NotionPage, property: string): string {
  const mention = MEETING_MENTION_ROLE_ID
    ? `<@&${MEETING_MENTION_ROLE_ID}> `
    : "";
  const time = easternTime(page.properties[property]?.date?.start ?? "");
  const location = richText(page);

  return [
    `${mention}**Meeting Tonight**`,
    time && ` at ${time}`,
    /* notion text, on a line that mentions @Editorial Board — see `inert` */
    location && ` in ${inert(location)}`,
  ]
    .filter(Boolean)
    .join("");
}
