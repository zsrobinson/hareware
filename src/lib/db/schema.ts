import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

/*
  one row per thing HareWare did: a cron tick, a manual trigger, a button.

  the schema lives here rather than only in a migration so that the table and
  the type it produces cannot drift — the row shape is inferred from this, not
  asserted by hand at the call site
*/
export const invocations = sqliteTable(
  "invocations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** unix seconds; sqlite has no date type worth the name */
    at: integer("at").notNull(),
    source: text("source", {
      enum: ["cron", "manual", "button", "command"],
    }).notNull(),
    action: text("action", {
      enum: [
        "meeting-reminder",
        "social-ping",
        "mark-posted",
        "article-edit",
        "notion-sync",
      ],
    }).notNull(),
    /*
      four, not two. "did it throw" is the wrong question: the reminders return
      rather than throw on their most important failures, so a week of wordpress
      refusing the feed used to write seven rows saying `ok`. a quiet morning and
      a broken one have to differ by more than prose nobody reads past the badge
    */
    outcome: text("outcome", {
      enum: ["ok", "skipped", "misconfigured", "failed"],
    }).notNull(),
    /** the plain line the log page shows. kept indefinitely */
    summary: text("summary").notNull(),
    /** the discord user behind it, where a person was */
    actor: text("actor"),
  },
  // the log page reads newest-first
  (table) => [index("invocations_at").on(table.at)],
);

export type Invocation = typeof invocations.$inferInsert;
export type Row = typeof invocations.$inferSelect;

/*
  a copy of the Articles database, for one job: filling in the article picker on
  a slash command without asking notion on every keystroke.

  nothing reads this to decide what to write — every command re-reads its page
  from notion first — so the worst a stale row can do is show a stale label. see
  ADR 0009
*/
export const articleIndex = sqliteTable(
  "article_index",
  {
    pageId: text("page_id").primaryKey(),
    headline: text("headline").notNull(),
    /* every one of these is nullable in notion: a row can exist with nothing
       but a headline, and often does while somebody is still typing it */
    section: text("section"),
    status: text("status"),
    imageStatus: text("image_status"),
    authorByline: text("author_byline"),
    publicationDate: text("publication_date"),
    /**
     * notion's own `last_edited_time`, iso 8601 in UTC.
     *
     * kept as text because that sorts chronologically as a string, which is
     * what lets the version guard be a plain `>` comparison in sql. it has
     * minute resolution — see `upsert`
     */
    lastEdited: text("last_edited").notNull(),
    /** unix seconds, ours not notion's, so a rebuild can spot what it missed */
    syncedAt: integer("synced_at").notNull(),
  },
  (table) => [index("article_index_headline").on(table.headline)],
);

/*
  what the pickers offer for Article Status, Image Status and Section.

  read from notion's schema rather than written down, so adding a status is
  something the club does in notion and nothing here has to know about
*/
export const choiceOptions = sqliteTable(
  "choice_options",
  {
    /** the notion property name, verbatim: "Article Status" */
    property: text("property").notNull(),
    /** the option name, verbatim: "Not started" — casing included */
    name: text("name").notNull(),
    /** notion's own ordering, which is the order the picker shows */
    position: integer("position").notNull(),
  },
  (table) => [primaryKey({ columns: [table.property, table.name] })],
);

/** small bookkeeping the sync keeps: the hash of the registered commands */
export const syncMeta = sqliteTable("sync_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export type ArticleRow = typeof articleIndex.$inferSelect;
export type ArticleIndexEntry = typeof articleIndex.$inferInsert;
export type ChoiceOption = typeof choiceOptions.$inferSelect;
