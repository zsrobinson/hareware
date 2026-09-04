import {
  buttons,
  postToWebhook,
  separator,
  text,
  type Block,
} from "~/lib/discord/post-message";
import { easternNow, type EasternNow } from "~/lib/eastern";
import { toArticleSlug } from "~/lib/article-url";
import { getRecentArticles } from "~/lib/get-recent-articles";
import { HAREWARE_ORIGIN, SOCIAL_ROLE_IDS } from "./config";

/*
  each article gets its own line and its own row of buttons, so the whole
  message is three components per article plus a divider. components v2 caps a
  message at forty, and the feed only hands back ten articles a page anyway
*/
const MAX_ARTICLES = 10;

/** discord rejects a button label over 80 characters, and headlines run long */
const MAX_LABEL = 80;

export async function sendSocialPing(
  env: Env,
  eastern: EasternNow,
): Promise<string> {
  // the code must stay inert until the club actually sets these up — see ADR
  // 0006's "setup outside the repo"
  const roleId = SOCIAL_ROLE_IDS[eastern.weekday];
  const missing = [
    !env.DISCORD_SOCIAL_WEBHOOK_URL && "DISCORD_SOCIAL_WEBHOOK_URL",
    !roleId && `SOCIAL_ROLE_IDS.${eastern.weekday}`,
  ].filter(Boolean);
  if (missing.length > 0) return `social ping unset: ${missing.join(", ")}`;

  const articles = await getRecentArticles();
  if (!articles) return "could not read the wordpress feed";

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
  if (today.length === 0)
    return `no articles published today (${eastern.date})`;

  const posted = today.slice(0, MAX_ARTICLES);

  const blocks: Block[] = posted.flatMap((article, index) => [
    // the mention repeats per article rather than heading the message, so each
    // one reads as its own item — discord pings once however often it appears
    ...(index > 0 ? [separator()] : []),
    text(`<@&${roleId}> **${article.title}**`),
    ...(HAREWARE_ORIGIN
      ? [
          buttons({
            label: truncate("Open Post Generator", MAX_LABEL),
            url: `${HAREWARE_ORIGIN}/generate?article=${toArticleSlug(article.link)}`,
          }),
        ]
      : []),
  ]);

  await postToWebhook(
    env.DISCORD_SOCIAL_WEBHOOK_URL!,
    { blocks, mentionRoleIds: [roleId!] },
    {
      dryRun: Boolean(env.REMINDERS_DRY_RUN),
      silent: Boolean(env.REMINDERS_NO_PING),
    },
  );

  return `posted ${posted.length} article(s) for ${eastern.date}`;
}

function truncate(text: string, limit: number) {
  return text.length <= limit ? text : `${text.slice(0, limit - 1).trimEnd()}…`;
}
