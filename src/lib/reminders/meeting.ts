import type { EasternNow } from "~/lib/eastern";
import { postToWebhook } from "~/lib/discord/post-message";
import { MEETING_DATE_PROPERTY, MEETINGS_DATABASE_ID } from "./config";

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

/** a page property can be almost anything; title is the only shape we need */
type NotionProperty = {
  type: string;
  title?: { plain_text: string }[];
};

type NotionQueryResponse = {
  results: NotionPage[];
};

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

  const page = await findTodaysMeeting(env.NOTION_TOKEN!, eastern.date);
  if (!page) return `no meeting today (${eastern.date})`;

  const title = readTitle(page);

  await postToWebhook(env.DISCORD_BOARD_WEBHOOK_URL!, {
    embeds: [{ title, url: page.url }],
    buttons: [{ label: "Open agenda", url: page.url }],
  });

  return `posted meeting reminder for "${title}"`;
}

/** queries the meetings database for the one page dated today, if any */
async function findTodaysMeeting(
  token: string,
  date: string,
): Promise<NotionPage | undefined> {
  const response = await fetch(
    `https://api.notion.com/v1/databases/${MEETINGS_DATABASE_ID}/query`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "notion-version": NOTION_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        filter: {
          property: MEETING_DATE_PROPERTY,
          date: { equals: date },
        },
        page_size: 1,
      }),
    },
  );

  if (!response.ok) {
    // never echo the token; the status and body are safe, the request headers
    // are not
    throw new Error(
      `notion returned ${response.status}: ${await response.text()}`,
    );
  }

  const data = (await response.json()) as NotionQueryResponse;
  return data.results[0];
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
