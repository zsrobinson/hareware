# 4. The Byline is text; the Member behind it is a relation

**Status:** Accepted — 2026-09-02

## Context

An Article's Byline is not reliably the name of the person who wrote it. A
writer may publish under a pseudonym, and so may an image creator. Notion has to
hold both the printed name and the real Member behind it.

Today the Articles database holds a single free-text `Author` column, and it has
already drifted: the same people appear as "Matthew Gray" and "Mathew Gray", as
"Zach", "Zachary Robinson" and "Matt G.". The Writers and Imagers views group on
that column, so they are already wrong. Free text alone cannot answer "how many
Articles has this person written".

## Decision

Two properties per credit, not one:

| Property | Type | |
| --- | --- | --- |
| Author Byline | text | the printed name — **always filled** |
| Author | relation → Members | who that actually was; may be empty or multiple |
| Image Byline | text | the printed image credit |
| Image Crew | relation → Members | may be empty or multiple |

The text is authoritative for what gets printed. The relation is additive
metadata. The text is **not** an override that is only filled when a Byline is
pseudonymous.

## Consequences

Storing the printed name on every Article, rather than deriving it from the
Member, is a deliberate denormalisation. Three things pay for it.

**ADR 0001 stops working otherwise.** That ADR buys Notion, at a real daily
cost, so that a club member can open the Articles table during an outage and keep
working. If the Byline text were only filled for pseudonymous Articles, that
table would show a blank column for most rows and be readable only by resolving a
relation per row. A filled text column keeps the table legible on its own.

**A published Byline should be frozen.** Once an Article is on WordPress its
printed name is baked into the post body. A derived Byline would mean someone
changing their default name silently rewrites what HareWare claims older
Articles said. Storing the string as printed is the correct semantics, not
merely the convenient one.

**Co-Bylines.** Relations are naturally multi-valued; printed Bylines are prose
("X and Y", "X, with reporting by Y"). The text holds the printed form and the
relation holds both people, with neither derived from the other.

It is also the cheaper read: deriving the Byline would put a Members join on
every Article render, against a three-request-per-second budget.

The privacy rule falls out for free. The WordPress-bound field is the Byline
text; the relation is never sent. The real name behind a pseudonymous Byline
cannot reach WordPress by accident.

The cost is dual-write drift — someone edits the relation and forgets the text.
HareWare writes both together, and hand-editing is the outage path, so this is
accepted. The status quo is worse: a single text column is drifting already.

### Historical rows are not backported

The relation stays empty on existing Articles. For anything already on
WordPress the Byline is frozen in the post body and a Member link buys nothing
retroactively; the link exists to serve future work — who to ping in Discord,
credit counts, the roster. Fill it going forward and opportunistically on rows
people touch anyway.

No stub Member rows for alumni, either. Members is keyed by Discord user ID and
that ID cannot be obtained for someone who has left the server, so stubs would
either collide on empty or weaken the key. A legacy row carrying only its Byline
text is the honest state.

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

Which pseudonyms belong to a Member is still recorded on the Members row, as a
plain list. That is enough for the app to offer a dropdown when setting a
Byline, and for an editor to answer "who is Gale de Silva?", without any
per-Article structure.
