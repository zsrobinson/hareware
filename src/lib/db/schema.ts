import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
        "command-surface",
        "application-sync",
        /* every roster change an officer makes on the three ADR 0010 pages:
           attendance, a member created, an application linked, two rows
           merged, a status set. one value at the granularity `article-edit`
           already uses — the summary names which, and an election audit needs
           to find these without knowing what to look for */
        "roster-edit",
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
  when somebody last pasted the new emails into the Google Group.

  the group cannot be read or written by software — the Admin SDK wants
  Workspace admin credentials on the domain that owns the group, and the club's
  is owned by a consumer gmail account with no domain and no admin console. so
  ADR 0010 does not sync it. it records the day the additions were last done and
  lists everyone approved since, to paste into the bulk-add field.

  one row, always id 1, because there is one group and one watermark. a table
  with a fixed key rather than a `sync_meta` key/value store: this is the only
  thing of its kind, and a typed column beats parsing a string out of a bag.

  authoritative over nothing, which is what makes it allowed in D1 at all under
  ADR 0007. if it drifts, the club re-adds somebody who is already a member and
  google treats that as a no-op — a harmless failure, which is exactly why this
  beats an *In Group* checkbox somebody would eventually forget to tick
*/
export const groupWatermark = sqliteTable("group_watermark", {
  /** always 1; there is one group */
  id: integer("id").primaryKey(),
  /** an ISO day — `YYYY-MM-DD` — compared against an application's `applied` */
  at: text("at").notNull(),
});
