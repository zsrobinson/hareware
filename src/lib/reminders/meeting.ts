import { easternNow, type EasternNow } from "~/lib/eastern";
import { postToWebhook } from "~/lib/discord/post-message";
import {
  MEETING_DATE_PROPERTY,
  MEETING_MENTION_ROLE_ID,
  MEETINGS_DATABASE_ID,
} from "./config";

// https://developers.notion.com/reference/versioning — 2026-03-11 is the
// latest documented version as of writing. pin it explicitly rather than
// omitting the header, since an unpinned request silently rides whatever the
// account's default happens to be and can change shape without warning
const NOTION_VERSION = "2026-03-11";

/** the properties of a database-query result page, narrowed to what we read */
type NotionPage = {
  url: string;
  properties: Record<string, NotionProperty>;
};

/** a page property can be almost anything; these are the shapes we read */
type NotionProperty = {
  type: string;
  title?: { plain_text: string }[];
  date?: { start: string } | null;
};

type NotionQueryResponse = {
  results: NotionPage[];
};

type NotionDatabase = {
  properties: Record<string, { type: string }>;
};

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
 * the name of the property holding a meeting's day.
 *
 * a meetings database has exactly one property of type `date`, so we ask the
 * schema rather than hardcoding a name that would break — loudly, with a 400 —
 * the day somebody renames the column. `MEETING_DATE_PROPERTY` overrides this
 * if a second date property ever makes the guess ambiguous
 */
async function dateProperty(token: string): Promise<string> {
  if (MEETING_DATE_PROPERTY) return MEETING_DATE_PROPERTY;

  const database = (await notion(
    `databases/${MEETINGS_DATABASE_ID}`,
    token,
  )) as NotionDatabase;

  const found = Object.entries(database.properties).find(
    ([, property]) => property.type === "date",
  );
  if (!found) throw new Error("the meetings database has no date property");

  return found[0];
}

export async function sendMeetingReminder(
  env: Env,
  eastern: EasternNow,
): Promise<string> {
  // the code must stay inert until the club actually sets these up — see ADR
  // 0006's "setup outside the repo"
  const missing = [
    !env.NOTION_TOKEN && "NOTION_TOKEN",
    !env.DISCORD_BOARD_WEBHOOK_URL && "DISCORD_BOARD_WEBHOOK_URL",
    !MEETINGS_DATABASE_ID && "MEETINGS_DATABASE_ID",
  ].filter(Boolean);
  if (missing.length > 0)
    return `meeting reminder unset: ${missing.join(", ")}`;

  const property = await dateProperty(env.NOTION_TOKEN!);
  const page = await findTodaysMeeting(
    env.NOTION_TOKEN!,
    property,
    eastern.date,
  );
  if (!page) return `no meeting today (${eastern.date})`;

  const title = readTitle(page);

  await postToWebhook(
    env.DISCORD_BOARD_WEBHOOK_URL!,
    {
      content: MEETING_MENTION_ROLE_ID
        ? `<@&${MEETING_MENTION_ROLE_ID}> meeting today — here's the agenda:`
        : undefined,
      mentionRoleIds: MEETING_MENTION_ROLE_ID ? [MEETING_MENTION_ROLE_ID] : [],
      embeds: [{ title, url: page.url }],
      buttons: [{ label: "Open agenda", url: page.url }],
    },
    { dryRun: Boolean(env.REMINDERS_DRY_RUN) },
  );

  return `posted meeting reminder for "${title}"`;
}

/** the same calendar date, shifted by whole days, still as `YYYY-MM-DD` */
function shiftDate(date: string, days: number) {
  const shifted = new Date(`${date}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

/**
 * the meetings dated today in eastern time, if any.
 *
 * notion compares dates to millisecond precision and assumes utc when a value
 * carries no offset, so `equals: "2026-09-10"` means *midnight* and matches
 * nothing at all once a meeting has a time on it — which is the normal case,
 * and it fails silently, looking exactly like a day with no meeting.
 *
 * a utc day window is wrong too: an 8pm eastern meeting is already tomorrow in
 * utc. so ask notion for a window wide enough to contain the eastern day under
 * any offset, and pick the right page here, where `easternNow` already knows
 * what "today" means
 */
async function findTodaysMeeting(
  token: string,
  property: string,
  date: string,
): Promise<NotionPage | undefined> {
  const data = (await notion(`databases/${MEETINGS_DATABASE_ID}/query`, token, {
    filter: {
      and: [
        { property, date: { on_or_after: shiftDate(date, -1) } },
        { property, date: { before: shiftDate(date, 2) } },
      ],
    },
    page_size: 25,
  })) as NotionQueryResponse;

  return data.results.find((page) => {
    const start = page.properties[property]?.date?.start;
    return start !== undefined && startsOn(start, date);
  });
}

/**
 * whether a notion date value falls on the given eastern calendar day.
 *
 * notion writes a date with no time as a bare `YYYY-MM-DD`, which means that
 * calendar day and carries no instant to convert — running it through a
 * timezone would parse it as utc midnight and land it on the evening before,
 * so a meeting with no time set would be missed every time. only a value with
 * a time is an actual instant worth resolving into eastern
 */
function startsOn(start: string, date: string) {
  if (!start.includes("T")) return start === date;
  return easternNow(new Date(start)).date === date;
}

/**
 * the title property's name isn't known ahead of time — every database has
 * exactly one property of type "title", but it can be called anything, so we
 * find it by type rather than by a hardcoded name like "Name"
 */
function readTitle(page: NotionPage): string {
  const title = Object.values(page.properties).find((p) => p.type === "title");
  return title?.title?.[0]?.plain_text.trim() || "Board meeting";
}
