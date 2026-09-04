import { postToWebhook } from "~/lib/discord/post-message";
import { easternNow, type EasternNow } from "~/lib/eastern";
import { toArticleSlug } from "~/lib/article-url";
import { getRecentArticles } from "~/lib/get-recent-articles";
import { HAREWARE_ORIGIN, SOCIAL_ROLE_IDS } from "./config";

// discord's own limits, not ours: one action row of link buttons and up to
// ten embeds per message. see `postToWebhook`, which renders exactly one row
const MAX_BUTTONS = 5;
const MAX_EMBEDS = 10;

/** discord rejects a button label over 80 characters, and headlines run long */
const MAX_LABEL = 80;

export async function sendSocialPing(
  env: Env,
  eastern: EasternNow,
): Promise<string> {
  // the code must stay inert until the club actually sets these up — see ADR
  // 0006's "setup outside the repo". every role id is undefined right now
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

  /*
    the feed itself only hands back ten articles a page, so a day busier than
    that is already truncated before we see it — this cap is the second line of
    defence rather than the first. the hare has never come close
  */
  const posted = today.slice(0, MAX_EMBEDS);
  const overflow = today.length - posted.length;

  const lines = [
    `<@&${roleId}> these went up today — get them on Instagram:`,
    overflow > 0 && `(and ${overflow} more — check the site)`,
  ].filter(Boolean);

  await postToWebhook(env.DISCORD_SOCIAL_WEBHOOK_URL!, {
    content: lines.join("\n"),
    mentionRoleIds: [roleId!],
    embeds: posted.map((article) => ({
      title: article.title,
      url: article.link,
    })),
    /*
      discord renders every button in one row under the whole message rather
      than beside the embed it belongs to, so the label has to name its own
      article — five buttons all saying "open in hareware" would be a guess.
      capped at five separately from the ten embeds, because that is the row
    */
    buttons: HAREWARE_ORIGIN
      ? posted.slice(0, MAX_BUTTONS).map((article) => ({
          label: truncate(article.title, MAX_LABEL),
          url: `${HAREWARE_ORIGIN}/generate?article=${toArticleSlug(article.link)}`,
        }))
      : undefined,
  });

  return `posted ${today.length} article(s) for ${eastern.date}`;
}

function truncate(text: string, limit: number) {
  return text.length <= limit ? text : `${text.slice(0, limit - 1).trimEnd()}…`;
}
