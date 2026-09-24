import {
  buttons,
  inert,
  postMessage,
  separator,
  text,
  type Block,
} from "~/lib/services/discord/post-message";
import { easternNow, type EasternNow } from "~/lib/eastern";
import { failed, misconfigured, ok, skipped, type Result } from "~/lib/result";
import { postedId } from "~/lib/services/discord/posted-button";
import { toArticleSlug } from "~/lib/services/wordpress/article-url";
import { getRecentArticles } from "~/lib/services/wordpress/get-recent-articles";
import { HAREWARE_ORIGIN, SOCIAL_CHANNEL_ID, SOCIAL_ROLE_IDS } from "./config";

/* three components per article, under Components V2's forty per message */
const MAX_ARTICLES = 10;

export async function sendSocialPing(
  env: Env,
  eastern: EasternNow,
): Promise<Result> {
  const roleId = SOCIAL_ROLE_IDS[eastern.weekday];
  const missing = [
    !env.DISCORD_BOT_TOKEN && "DISCORD_BOT_TOKEN",
    !roleId && `SOCIAL_ROLE_IDS.${eastern.weekday}`,
  ].filter(Boolean);
  if (missing.length > 0)
    return misconfigured(`social ping unset: ${missing.join(", ")}`);

  const articles = await getRecentArticles();
  if (!articles) return failed("could not read the wordpress feed");

  /* `pubDate`, not the feed's `date`, which drops the year; "today" is Eastern */
  const today = articles.filter(
    (article) => easternNow(new Date(article.pubDate)).date === eastern.date,
  );
  if (today.length === 0)
    return skipped(`no articles published today (${eastern.date})`);

  const posted = today.slice(0, MAX_ARTICLES);

  const blocks: Block[] = posted.flatMap((article, index) => [
    // Discord pings once however often the mention appears
    ...(index > 0 ? [separator()] : []),
    text(`<@&${roleId}> **${inert(article.title)}**`),
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
    env.DISCORD_BOT_TOKEN!,
    SOCIAL_CHANNEL_ID,
    { blocks, mentionRoleIds: [roleId!] },
    {
      dryRun: Boolean(env.REMINDERS_DRY_RUN),
      silent: Boolean(env.REMINDERS_NO_PING),
      testChannelId: env.REMINDERS_TEST_CHANNEL,
    },
  );

  const verb = env.REMINDERS_DRY_RUN ? "would post" : "posted";
  return ok(`${verb} ${posted.length} article(s) for ${eastern.date}`);
}
