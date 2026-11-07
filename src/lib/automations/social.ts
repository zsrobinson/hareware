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

/* three components per article, under Components V2's forty per message */
const MAX_ARTICLES = 10;

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
      summary: `SOCIAL_ROLE_IDS.${weekday} is unset`,
    };

  const since = windowStart(now);
  let posts: Post[];
  try {
    posts = await postsPublishedAfter(since);
  } catch (error) {
    return {
      status: "failed",
      summary: `could not read wordpress: ${String(error)}`,
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
    return misconfigured("social ping unset: DISCORD_BOT_TOKEN");

  const plan = await planSocialPing(now);
  if (plan.status === "misconfigured")
    return misconfigured(`social ping unset: ${plan.summary}`);
  if (plan.status === "failed") return failed(plan.summary);

  if (plan.articles.length === 0)
    return skipped(`nothing published since ${plan.since}`);

  const posted = plan.articles.slice(0, MAX_ARTICLES);
  const blocks: Block[] = posted.flatMap((article, index) => [
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

  const verb = env.REMINDERS_DRY_RUN ? "would post" : "posted";
  const extra =
    plan.articles.length > posted.length
      ? ` (${plan.articles.length - posted.length} more left out)`
      : "";
  return ok(
    `${verb} ${posted.length} article(s) published since ${plan.since}${extra}`,
  );
}
