# 4. The Byline is text; the Member behind it is a relation

**Status:** Accepted — 2026-09-02. Backfill and pseudonym sections revised
2026-09-03 and 2026-09-04.

## Context

An Article's Byline is not reliably the name of the person who wrote it. A
writer may publish under a pseudonym, and so may an image creator. Notion has to
hold both the printed name and the real Member behind it.

The Articles database held a single free-text `Author` column, and it had
already drifted: the same people appear as "Matthew Gray" and "Mathew Gray", as
"Zach", "Zachary Robinson" and "Matt G.". The Writers and Imagers views grouped
on that column, so they were wrong. Free text alone cannot answer "how many
Articles has this person written".

## Decision

Two properties per credit, not one:

| Property      | Type               |                                                 |
| ------------- | ------------------ | ----------------------------------------------- |
| Author Byline | text               | the printed name — **always filled**            |
| Author        | relation → Members | who that actually was; may be empty or multiple |
| Image Byline  | text               | the printed image credit                        |
| Image Crew    | relation → Members | may be empty or multiple                        |

The text is authoritative for what gets printed. The relation is additive
metadata. The text is **not** an override that is only filled when a Byline is
pseudonymous.

## Consequences

Storing the printed name on every Article, rather than deriving it from the
Member, is a deliberate denormalisation. Three things pay for it.

**ADR 0001 stops working otherwise.** That ADR buys Notion, at a real daily
cost, so that a club member can open the Articles table during an outage and
keep working. If the Byline text were only filled for pseudonymous Articles,
that table would show a blank column for most rows and be readable only by
resolving a relation per row. A filled text column keeps the table legible on
its own.

**A published Byline should be frozen.** Once an Article is on WordPress its
printed name is baked into the post body. A derived Byline would mean someone
changing their default name silently rewrites what HareWare claims older
Articles said. The string as printed is what should be stored.

**Co-Bylines.** Relations are naturally multi-valued; printed Bylines are prose
("X and Y", "X, with reporting by Y"). The text holds the printed form and the
relation holds both people, with neither derived from the other.

It is also the cheaper read: deriving the Byline would put a Members join on
every Article render, against a three-request-per-second budget.

The privacy rule falls out for free. The WordPress-bound field is the Byline
text; the relation is never sent. The real name behind a pseudonymous Byline
cannot reach WordPress by accident.

The cost is dual-write drift: someone edits the relation and forgets the text.
HareWare's commands ([ADR 0009](0009-editor-commands-in-discord.md)) always
write both together, and hand-editing is the outage path, so this is accepted.

### Historical rows were backfilled

The relation was filled in by hand on existing Articles when the split was
built, so the Writers and Imagers views group correctly across the whole
history. (The original plan left old rows empty; the backfill turned out to take
one sitting.) No stub Members rows were made for alumni who had left: a legacy
row carrying only its Byline text is the accurate state.

### Pseudonyms are detected, not listed

Notion carries an `Author Pseudonym` formula,
`prop("Author").some(current.prop("Name") != prop("Author Byline"))`, which is
true exactly when the printed Byline is not the linked Member's name, and an
`Image Pseudonym` formula beside it. The original plan was a list of pseudonyms
on each Members row; the formula replaced it because it cannot disagree with the
data it reads. The cost is that "who is Gale de Silva?" is answered by opening
one of their Articles rather than searching Members.

## Alternatives considered

### One text column, as today

Rejected. It cannot answer who a Byline belongs to, and the drift above shows it
degrades without anyone noticing.

### Relation only, Byline derived from the Member

Rejected for the three reasons above: it breaks the outage-readability that ADR
0001 exists to buy, it lets present-day edits rewrite historical Bylines, and it
cannot express a co-Byline as printed.

### Per-Article pseudonym override, empty when not pseudonymous

Rejected — the same design as the above with an escape hatch, and it fails the
same outage test, since the common case still leaves the column blank.
