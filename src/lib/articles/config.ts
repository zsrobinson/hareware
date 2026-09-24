/*
  The Articles database, written down rather than discovered: it has several
  properties of most types. None of this is secret.
*/

/** the data source, not the database: `data_sources/{id}` holds the rows */
export const ARTICLES_DATA_SOURCE_ID = "22cbe415-e24c-8078-8349-000b6844d0d7";

/** every property we read or write, with the type `assertProperties` checks */
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
 * the properties whose options the commands offer, read from Notion (ADR 0009)
 */
export const CHOICE_PROPERTIES = [
  ARTICLE_PROPERTIES.status.name,
  ARTICLE_PROPERTIES.imageStatus.name,
  ARTICLE_PROPERTIES.section.name,
] as const;

/** an Article with no Headline; Discord rejects an empty choice name */
export const UNTITLED = "Untitled";
