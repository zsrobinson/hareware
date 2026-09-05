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
    message: text("message").notNull(),
    /** the discord user behind it, where a person was */
    actor: text("actor"),
  },
  // the log page reads newest-first
  (table) => [index("invocations_at").on(table.at)],
);

export type Invocation = typeof invocations.$inferInsert;
export type Row = typeof invocations.$inferSelect;
