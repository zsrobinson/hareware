import { easternNow, easternTime, type EasternNow } from "~/lib/eastern";
import { buttons, inert, postMessage, text } from "~/lib/discord/post-message";
import {
  BOARD_CHANNEL_ID,
  MEETING_DATE_PROPERTY,
  MEETING_MENTION_ROLE_ID,
  MEETING_TITLE_PREFIX,
  MEETINGS_DATABASE_ID,
} from "./config";

// https://developers.notion.com/reference/versioning — pin it explicitly
// rather than omitting the header, since an unpinned request rides whatever
// the account's default happens to be and can change shape without warning
const NOTION_VERSION = "2026-03-11";

type NotionPage = {
  url: string;
  properties: Record<string, NotionProperty>;
};

/** a page property can be almost anything; these are the shapes we read */
type NotionProperty = {
  type: string;
  title?: { plain_text: string }[];
  rich_text?: { plain_text: string }[];
  date?: { start: string } | null;
};

export async function sendMeetingReminder(
  env: Env,
  eastern: EasternNow,
): Promise<string> {
  // the code must stay inert until the club actually sets these up — see ADR
  // 0006's "setup outside the repo"
  const missing = [
    !env.NOTION_TOKEN && "NOTION_TOKEN",
    !env.DISCORD_BOT_TOKEN && "DISCORD_BOT_TOKEN",
    !MEETINGS_DATABASE_ID && "MEETINGS_DATABASE_ID",
  ].filter(Boolean);
  if (missing.length > 0)
    return `meeting reminder unset: ${missing.join(", ")}`;

  const token = env.NOTION_TOKEN!;
  const source = await dataSource(token);
  const property = await dateProperty(token, source);
  const page = await findTodaysMeeting(token, source, property, eastern.date);

  if (!page)
    return `no ${MEETING_TITLE_PREFIX} meeting today (${eastern.date})`;

  const title = readTitle(page);

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
  return `${verb} meeting reminder for "${title}"`;
}

/** every notion request wants the same headers, and none may echo the token */
async function notion(path: string, token: string, body?: unknown) {
  const response = await fetch(`https://api.notion.com/v1/${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      authorization: `Bearer ${token}`,
      "notion-version": NOTION_VERSION,
      "content-type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    // the status and body are safe to surface; the request headers are not
    throw new Error(
      `notion returned ${response.status} for ${path}: ${await response.text()}`,
    );
  }

  return response.json();
}

/**
 * the data source inside the meetings database.
 *
 * a database is a container in the current api and holds no properties of its
 * own — the schema and the rows both live on a data source inside it, so
 * `databases/{id}/query` is not the endpoint and `databases/{id}` comes back
 * with an empty `properties`. ours has exactly one data source
 */
async function dataSource(token: string): Promise<string> {
  const database = (await notion(
    `databases/${MEETINGS_DATABASE_ID}`,
    token,
  )) as { data_sources: { id: string }[] };

  const source = database.data_sources[0]?.id;
  if (!source) throw new Error("the meetings database has no data source");

  return source;
}

/**
 * the name of the property holding a meeting's day.
 *
 * asked of the schema rather than hardcoded, so renaming the column in notion
 * does not break this quietly. `MEETING_DATE_PROPERTY` overrides it if a second
 * date property ever makes the guess ambiguous
 */
async function dateProperty(token: string, source: string): Promise<string> {
  if (MEETING_DATE_PROPERTY) return MEETING_DATE_PROPERTY;

  const schema = (await notion(`data_sources/${source}`, token)) as {
    properties: Record<string, { type: string }>;
  };

  const found = Object.entries(schema.properties).find(
    ([, property]) => property.type === "date",
  );
  if (!found) throw new Error("the meetings data source has no date property");

  return found[0];
}

/** the same calendar date, shifted by whole days, still as `YYYY-MM-DD` */
function shiftDate(date: string, days: number) {
  const shifted = new Date(`${date}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

/**
 * today's meeting of the kind we care about, if there is one.
 *
 * notion compares dates to millisecond precision and assumes utc when a value
 * carries no offset, so `equals: "2026-09-10"` means *midnight* and matches
 * nothing once a meeting has a time on it — and this database holds both kinds,
 * so that would have failed silently on half the rows.
 *
 * a utc day window is wrong in the other direction: an 8pm eastern meeting is
 * already tomorrow in utc. so ask for a window wide enough to hold the eastern
 * day under any offset, and pick the right row here
 */
async function findTodaysMeeting(
  token: string,
  source: string,
  property: string,
  date: string,
): Promise<NotionPage | undefined> {
  const data = (await notion(`data_sources/${source}/query`, token, {
    filter: {
      and: [
        { property, date: { on_or_after: shiftDate(date, -1) } },
        { property, date: { before: shiftDate(date, 2) } },
      ],
    },
    page_size: 25,
  })) as { results: NotionPage[] };

  return data.results.find((page) => {
    const start = page.properties[property]?.date?.start;
    if (start === undefined || !startsOn(start, date)) return false;

    // titles carry stray trailing spaces, so compare a trimmed lowercase form
    return readTitle(page)
      .toLowerCase()
      .startsWith(MEETING_TITLE_PREFIX.toLowerCase());
  });
}

/**
 * whether a notion date value falls on the given eastern calendar day.
 *
 * notion writes a date with no time as a bare `YYYY-MM-DD`, which means that
 * calendar day and carries no instant to convert — running it through a
 * timezone would parse it as utc midnight and land it on the evening before, so
 * a meeting with no time set would be missed every time. this database has both
 * shapes in it, so both paths matter
 */
function startsOn(start: string, date: string) {
  if (!start.includes("T")) return start === date;
  return easternNow(new Date(start)).date === date;
}

/**
 * every database has exactly one property of type "title" but it can be called
 * anything, so find it by type rather than by a name like "Name"
 */
function readTitle(page: NotionPage): string {
  const title = Object.values(page.properties).find((p) => p.type === "title");
  return (title?.title ?? [])
    .map((t) => t.plain_text)
    .join("")
    .trim();
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
  const location = readLocation(page);

  return [
    `${mention}**Meeting Tonight**`,
    time && ` at ${time}`,
    /* notion text, on a line that mentions @Editorial Board — see `inert` */
    location && ` in ${inert(location)}`,
  ]
    .filter(Boolean)
    .join("");
}

function readLocation(page: NotionPage): string {
  const text = Object.values(page.properties).find(
    (p) => p.type === "rich_text",
  );
  return (text?.rich_text ?? [])
    .map((t) => t.plain_text)
    .join("")
    .trim();
}
