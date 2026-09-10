/*
  the Articles database, as it actually is.

  written down rather than discovered, unlike the Meetings reminder, which asks
  the schema which property holds its date. that works there because a meetings
  database has exactly one date. Articles has several properties of most types,
  so discovery would be a guess — and these names are what the editor commands
  mirror, so they have to be stable enough to name a subcommand after.

  none of it is secret: a notion id is not a credential, and the token that
  reads them is.
*/

/*
  Members moved to `~/lib/members/config` when ADR 0010 made it a domain of its
  own — it now carries emails, a student status and an attendance history, none
  of which Articles has an opinion about. Re-exported rather than repointed
  everywhere, because a byline resolving to a person is still an Articles
  concern and this is the file that concern reads its names from.
*/
export {
  MEMBERS_DATA_SOURCE_ID,
  MEMBER_PROPERTIES,
} from "~/lib/members/config";

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

/**
 * what an Article with no Headline is called.
 *
 * one word, in one place, because discord rejects an entire autocomplete
 * response when any choice name is empty — so this is load-bearing rather than
 * cosmetic, and three copies of it could disagree
 */
export const UNTITLED = "Untitled";
