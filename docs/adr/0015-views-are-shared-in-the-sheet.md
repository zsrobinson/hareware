# 15. Views are shared, in the Sheet

**Status:** Accepted — 2026-11-09. Amends ADR 0014: views are no longer
declarations in code, Custom and Copy as view are gone, and a changed view
is edited rather than carried between tabs. Amends ADR 0011: the Sheet holds
the board's views besides the facts WordPress lacks.

## Context

ADR 0014 made each table a page with views as its tabs, and kept the views
in `views.ts`: a new one was a declaration pasted from Copy as view into a
pull request. Nobody on the board writes pull requests. Someone who built a
recap question had a link to keep it by, and a button that copied
TypeScript. Once anything changed, the page could not say which view it was
in, what that view set, or what had been added; it had three resets that
each took back something different; and changes carried from one tab to
the next, so Most read could open sorted by title under its own question.

The owner asked for views the way Notion has them: shared, saved by anyone
on the board, a view marked as edited until it is saved or reset.

## Decision

**Views are data, kept in the Sheet's `Views` tab.** One row a view:
`id`, `page` (articles or people), `position`, `view`, `updated by` and
`updated at`. `view` is the declaration as `views.ts` shapes it, with
`"v": 1` and without its id and page, which are the row's own columns, so
the two can never disagree. Changing, adding, renaming, moving or deleting
a view needs no code. Any `@Editorial Board` member may, through
`/api/sheet` and its gate.

**The code holds only a starter set.** `views.ts` is what a page shows
while the tab has no rows for it. The first change anyone makes on a page
writes that page's starter views with it; from then on the tab is the only
source. A read never writes, and Settings says which pages are still on
their starter set, and can restore one.

**The browser reads the rows; the Worker passes them on.** The tab comes
with the rest of the Sheet in the gated `/api/archive.json`, each `view`
cell as the text it is: the Worker parses no declaration (ADR 0012). The
browser checks every row with the code that reads a view from a link,
`readChart` and `readPivot`, so a row is something the builder could make or
it is not read. A row that cannot be read is listed in Settings, with why,
and the page shows the views that could be; never dropped quietly. A page
none of whose rows can be read, or a Sheet that cannot be read, shows the
starter set with saving off and says why.

**Every write is checked against the copy it was based on.** A save,
rename or delete carries the row's `updated at` as the editor opened it, a
move the order it saw, and the first write the starter set it saw. If the
row has changed since, the write is refused as a conflict (409), and the
page offers Reload and Overwrite. A move changes positions alone and leaves
every view's `updated at` as it was, so moving a tab never makes someone
else's save a conflict. Two writes in the same second are still
last-writer-wins.

**Saved means read back.** After a write the page reads the Sheet again
through the same gated read it draws from, and says Saved only when that
read shows the change with the `updated at` the write answered with.
Otherwise it says "Not confirmed yet", with Recheck.

**The log records the change, not its words.** A change to views is logged
by kind, page and view id. The view's name and question are the board's,
like the rest of the Sheet; `updated by` holds the member's name in the
Sheet, and never reaches the log. A new view's id is random rather than a
slug of its name, so a name cannot reach the log through its id.

**A view on screen is either as saved or edited.** Any change makes it
edited: a filter, a chip, the search, the sort, the columns, Show, the
legend, anything in Customize. The tab gets a dot; every control that
differs, and each changed row in Customize with what it was, gets the one
accent, HareWare's maroon, which is never used on data. One Reset takes
everything back, replacing the three there were. Save for everyone keeps
it, the only solid maroon on the page, and Save as new view keeps it as
another tab. What a view cannot hold (a range of dates, a search, the
articles a mark chose) is said, and stays an edit.

**Edits belong to their tab.** Choosing another view opens it as saved,
dropping the edits with an Undo that brings them back. The `+` starts a new
view from the page's first, edited until saved. A link names its view by
id and only what differs from it, so it opens edited for whoever follows
it, on that view as it is by then. A link to a view the page no longer has
says so and opens the page's first view as saved; an old Custom link is
its base view with its changes.

**What a mark sends says where it came from.** "See in Articles" and "See
the people" are an edit of the other page's first view, and their link
carries the mark's name (`via=`), so the articles and people it sent are one
chip, "From Retention · Joined Fall 2025, +1 · 33 articles", whose people
open out to a chip each.

## Considered

- **Saved views in the browser.** A view one browser keeps is invisible to
  the rest of the board, which is who the views are for.
- **A table in D1.** D1 is the invocation log alone (ADR 0007); the Sheet is
  already the club's, private to the board, and editable by hand when
  HareWare is not there.
- **Keeping the defaults in code with the board's own views beside them.**
  Two kinds of view would need two answers to "can I change this one", and
  a default nobody may change is exactly what the owner did not want.
- **Writing the starter set on first read.** A read that writes is a write
  nobody asked for, by whoever happened to open the page.
- **Carrying changes between tabs, with a toast**, as ADR 0014 had it. Each
  tab's question is its own; a change carried to the next quietly answers
  that one on other terms.

## Consequences

- A page's views are whatever the board last saved. `views.ts` changes
  only the starter set, which a page with rows never shows again unless
  Settings restores it.
- The Sheet holds views as JSON a person can read and edit; one edited into
  something HareWare cannot read is listed, not lost.
- `/api/sheet` writes more than corrections now, so the ADR 0011 line that
  the Sheet holds only what WordPress lacks has an exception: the board's
  views, which are not a copy of anything.
