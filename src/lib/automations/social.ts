import {
  buttons,
  inert,
  postMessage,
  separator,
  text,
  type Block,
} from "~/lib/services/discord/post-message";
import { dayBefore, easternInstant, easternNow } from "~/lib/eastern";
import { failed, misconfigured, ok, skipped, type Result } from "~/lib/result";
import { postedId } from "~/lib/services/discord/posted-button";
import { toArticleSlug } from "~/lib/services/wordpress/article-url";
import { postsPublishedAfter, type Post } from "~/lib/services/wordpress/posts";
import {
  HAREWARE_ORIGIN,
  REMINDER_HOUR,
  SOCIAL_CHANNEL_ID,
  SOCIAL_ROLE_IDS,
} from "./config";

/*
  Components V2 allows forty components in a message, counting the buttons
  inside a row. An article is four (its text, a row, two buttons) and every
  one after the first adds a separator: seven is 34, with room for "+N more".
  Over the limit Discord refuses the whole message.
*/
const MAX_ARTICLES = 7;

/** "Fri, Nov 6, 8:00 AM", Eastern: how a summary or the page names an instant */
export function easternLabel(date: Date | string | number) {
  return (
    new Date(date)
      .toLocaleString("en-US", {
        timeZone: "America/New_York",
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
      /* newer ICU puts a narrow no-break space before AM */
      .replace(/\u202f/g, " ")
  );
}

const articles = (count: number) =>
  `${count} ${count === 1 ? "article" : "articles"}`;

/** what the reminder would post at `now`, without posting it */
export type SocialPlan =
  | { status: "misconfigured"; summary: string }
  | { status: "failed"; summary: string }
  | {
      status: "ready";
      /** the previous run: everything published after it is announced */
      since: string;
      roleId: string;
      weekday: string;
      articles: Pick<Post, "id" | "title" | "link" | "publishedAt">[];
    };

/**
 * The reminder announces everything published since the run before: at 8am,
 * since 8am yesterday. A post scheduled for 9am is announced the next morning.
 */
export function windowStart(now: Date): Date {
  const eastern = easternNow(now);
  const lastRunDay =
    eastern.hour >= REMINDER_HOUR ? eastern.date : dayBefore(eastern.date);
  return easternInstant(dayBefore(lastRunDay), REMINDER_HOUR);
}

export async function planSocialPing(now: Date): Promise<SocialPlan> {
  const { weekday } = easternNow(now);
  const roleId = SOCIAL_ROLE_IDS[weekday];
  if (!roleId)
    return {
      status: "misconfigured",
      summary: `Not set up: no poster role for ${weekday}`,
    };

  const since = windowStart(now);
  let posts: Post[];
  try {
    posts = await postsPublishedAfter(since);
  } catch (error) {
    return {
      status: "failed",
      summary: `Could not read WordPress: ${String(error)}`,
    };
  }

  return {
    status: "ready",
    since: since.toISOString(),
    roleId,
    weekday,
    articles: posts
      .filter((post) => Date.parse(post.publishedAt) <= now.getTime())
      .map(({ id, title, link, publishedAt }) => ({
        id,
        title,
        link,
        publishedAt,
      })),
  };
}

export async function sendSocialPing(env: Env, now: Date): Promise<Result> {
  if (!env.DISCORD_BOT_TOKEN)
    return misconfigured("Not set up: DISCORD_BOT_TOKEN is unset");

  const plan = await planSocialPing(now);
  if (plan.status === "misconfigured") return misconfigured(plan.summary);
  if (plan.status === "failed") return failed(plan.summary);

  const since = easternLabel(plan.since);
  if (plan.articles.length === 0) return skipped(`Nothing new since ${since}`);

  const listed = plan.articles.slice(0, MAX_ARTICLES);
  const unlisted = plan.articles.length - listed.length;
  const blocks: Block[] = listed.flatMap((article, index) => [
    // Discord pings once however often the mention appears
    ...(index > 0 ? [separator()] : []),
    text(`<@&${plan.roleId}> **${inert(article.title)}**`),
    buttons(
      /* the label is the state, not the action; the message is the record */
      {
        label: "Not posted",
        id: postedId(toArticleSlug(article.link)),
        style: "danger",
      },
      ...(HAREWARE_ORIGIN
        ? [
            {
              label: "Open Post Generator",
              url: `${HAREWARE_ORIGIN}/generate?article=${toArticleSlug(article.link)}`,
            },
          ]
        : []),
    ),
  ]);
  /* without it, the articles past the limit are announced nowhere */
  if (unlisted > 0) blocks.push(text(`+${unlisted} more`));

  await postMessage(
    env.DISCORD_BOT_TOKEN,
    SOCIAL_CHANNEL_ID,
    { blocks, mentionRoleIds: [plan.roleId] },
    {
      dryRun: Boolean(env.REMINDERS_DRY_RUN),
      silent: Boolean(env.REMINDERS_NO_PING),
      testChannelId: env.REMINDERS_TEST_CHANNEL,
    },
  );

  const verb = env.REMINDERS_DRY_RUN ? "Would announce" : "Announced";
  const extra =
    unlisted > 0 ? ` (${listed.length} listed, +${unlisted} more)` : "";
  return ok(
    `${verb} ${articles(plan.articles.length)} published since ${since}${extra}`,
  );
}
