import {
  buttons,
  inert,
  postMessage,
  separator,
  text,
  type Block,
} from "~/lib/services/discord/post-message";
import { easternNow, type EasternNow } from "~/lib/eastern";
import { failed, misconfigured, ok, skipped, type Result } from "./registry";
import { postedId } from "~/lib/services/discord/posted-button";
import { toArticleSlug } from "~/lib/services/wordpress/article-url";
import { getRecentArticles } from "~/lib/services/wordpress/get-recent-articles";
import { HAREWARE_ORIGIN, SOCIAL_CHANNEL_ID, SOCIAL_ROLE_IDS } from "./config";

/*
  each article gets its own line and its own row of buttons, so the whole
  message is three components per article plus a divider. components v2 caps a
  message at forty, and the feed only hands back ten articles a page anyway
*/
const MAX_ARTICLES = 10;

export async function sendSocialPing(
  env: Env,
  eastern: EasternNow,
): Promise<Result> {
  // the code must stay inert until the club actually sets these up — see ADR
  // 0006's "setup outside the repo"
  const roleId = SOCIAL_ROLE_IDS[eastern.weekday];
  const missing = [
    !env.DISCORD_BOT_TOKEN && "DISCORD_BOT_TOKEN",
    !roleId && `SOCIAL_ROLE_IDS.${eastern.weekday}`,
  ].filter(Boolean);
  if (missing.length > 0)
    return misconfigured(
      `Social ping is not configured: ${missing.join(", ")}.`,
    );

  const articles = await getRecentArticles();
  /*
    this is the one that mattered most: an unreadable feed used to be recorded
    as `ok`, so a week of wordpress rate-limiting produced seven green rows
  */
  if (!articles) return failed("Could not read the WordPress feed.");

  /*
    the feed's `date` field is a display string with the year thrown away, so
    it can't be compared to eastern.date. `pubDate` is the raw feed value —
    run it back through `easternNow` so "today" means eastern midnight to
    midnight, not whatever the utc calendar day happens to be, which would
    mislabel anything published in the early morning eastern
  */
  const today = articles.filter(
    (article) => easternNow(new Date(article.pubDate)).date === eastern.date,
  );
  // a genuinely quiet day, which is a different thing from a broken one
  if (today.length === 0)
    return skipped(`No articles published today (${eastern.date}).`);

  const posted = today.slice(0, MAX_ARTICLES);

  const blocks: Block[] = posted.flatMap((article, index) => [
    // the mention repeats per article rather than heading the message, so each
    // one reads as its own item — discord pings once however often it appears
    ...(index > 0 ? [separator()] : []),
    /* the headline comes from wordpress, so it is somebody else's text sharing
       a line with a real role mention — see `inert` */
    text(`<@&${roleId}> **${inert(article.title)}**`),
    buttons(
      /*
        a checkbox that discord makes us draw as a button: the label carries
        the state rather than the action, because the message is read to see
        what is left to do. pressing it toggles, and the message is the only
        record of what has been posted
      */
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

  const verb = env.REMINDERS_DRY_RUN ? "Would post" : "Posted";
  const noun = posted.length === 1 ? "article" : "articles";
  return ok(`${verb} ${posted.length} ${noun} for ${eastern.date}.`);
}
