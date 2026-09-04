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
    source: text("source", { enum: ["cron", "manual", "button"] }).notNull(),
    action: text("action", {
      enum: ["meeting-reminder", "social-ping", "mark-posted"],
    }).notNull(),
    /** the summary says the rest */
    outcome: text("outcome", { enum: ["ok", "failed"] }).notNull(),
    /** the plain line the log page shows. kept indefinitely */
    summary: text("summary").notNull(),
    /** the discord user behind it, where a person was */
    actor: text("actor"),
    /**
     * whatever is worth keeping to debug this later. carries the
     * byline-to-member mapping in some cases, so it is pruned after thirty days
     * rather than kept — see ADR 0007
     */
    payload: text("payload", { mode: "json" }),
  },
  // the log page reads newest-first, and the prune job reads oldest-first
  (table) => [index("invocations_at").on(table.at)],
);

export type Invocation = typeof invocations.$inferInsert;
export type Row = typeof invocations.$inferSelect;
