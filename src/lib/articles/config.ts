/*
  the Articles and Members databases, as they actually are.

  written down rather than discovered, unlike the Meetings reminder, which asks
  the schema which property holds its date. that works there because a meetings
  database has exactly one date. Articles has several properties of most types,
  so discovery would be a guess — and these names are what the editor commands
  mirror, so they have to be stable enough to name a subcommand after.

  none of it is secret: a notion id is not a credential, and the token that
  reads them is.
*/

/** the database container; `data_sources/{id}` is what actually holds rows */
export const ARTICLES_DATABASE_ID = "22cbe415-e24c-80aa-9043-e851d9ed4534";

/**
 * the data source inside it.
 *
 * pinned rather than resolved through `dataSource()` on every call: that is an
 * extra request in front of every autocomplete, and this id changes only if
 * somebody deletes the database
 */
export const ARTICLES_DATA_SOURCE_ID = "22cbe415-e24c-8078-8349-000b6844d0d7";

/** the Members data source — one row per person, keyed by their discord id */
export const MEMBERS_DATA_SOURCE_ID = "3cfbe415-e24c-8002-8e93-000b3e37e6c3";

/**
 * every Articles property we read or write, and the type it must be.
 *
 * the type is here so a refresh can assert it rather than discover a mismatch
 * mid-write. two of these have bitten already: `Article Status` is a `status`,
 * not a `select`, and they take different write shapes — and a `relation` whose
 * target the integration cannot reach is omitted from the schema entirely and
 * reads back as `[]`, which is indistinguishable from empty unless you check
 * for the property itself
 */
export const ARTICLE_PROPERTIES = {
  headline: { name: "Headline", type: "title" },
  status: { name: "Article Status", type: "status" },
  imageStatus: { name: "Image Status", type: "status" },
  section: { name: "Section", type: "select" },
  authorByline: { name: "Author Byline", type: "rich_text" },
  imageByline: { name: "Image Byline", type: "rich_text" },
  publicationDate: { name: "Publication Date", type: "date" },
  author: { name: "Author", type: "relation" },
  imageCrew: { name: "Image Crew", type: "relation" },
} as const;

/** the Members properties, same contract */
export const MEMBER_PROPERTIES = {
  name: { name: "Name", type: "title" },
  /* text, not number: a discord snowflake is 19 digits and loses its low
     digits to a float, silently, on every read */
  discordId: { name: "Discord ID", type: "rich_text" },
} as const;

/**
 * the properties whose options the slash commands offer.
 *
 * the options themselves are deliberately absent — they are read from notion
 * and re-registered when they change, so adding a status needs no code change.
 * see ADR 0009
 */
export const CHOICE_PROPERTIES = [
  ARTICLE_PROPERTIES.status.name,
  ARTICLE_PROPERTIES.imageStatus.name,
  ARTICLE_PROPERTIES.section.name,
] as const;
