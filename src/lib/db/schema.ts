import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/* one row per thing HareWare did: a cron tick, a manual trigger, a button */
export const invocations = sqliteTable(
  "invocations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** unix seconds */
    at: integer("at").notNull(),
    source: text("source", {
      enum: ["cron", "manual", "button", "command"],
    }).notNull(),
    action: text("action", {
      enum: [
        "social-ping",
        "mark-posted",
        "sheet-setup",
        "sheet-ignore",
        /* written by earlier versions; rows of them may still be read */
        "meeting-reminder",
        "article-edit",
        "command-surface",
        "application-sync",
        "roster-edit",
      ],
    }).notNull(),
    outcome: text("outcome", {
      enum: ["ok", "skipped", "misconfigured", "failed"],
    }).notNull(),
    /** the line the log page shows */
    summary: text("summary").notNull(),
    /** the Discord user behind it, if any */
    actor: text("actor"),
  },
  // the log page reads newest-first
  (table) => [index("invocations_at").on(table.at)],
);

export type Invocation = typeof invocations.$inferInsert;
export type Row = typeof invocations.$inferSelect;
