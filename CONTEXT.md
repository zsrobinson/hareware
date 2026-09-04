# Context

The shared vocabulary for HareWare. This file is a glossary and nothing else:
no schemas, no endpoints, no implementation decisions. Those live in
`docs/adr/`.

## Article

The central entity: one piece of writing, tracked from the moment the club
decides to run it until long after it is published.

"Article" is the club's own word and is the only noun used in the interface.
Every Article has a record in Notion for its whole life. An Article may or may
not be **on WordPress** yet.

Not to be confused with **WordPress Post** — the same writing as WordPress
represents it. "Post" is a WordPress word: it is fine in code that talks to the
WordPress API, and never appears in language a club member reads.

## On WordPress

The property of an Article having a WordPress Post linked to it.

An Article starts off **not on WordPress**: it exists only as a Notion record
while it is being written, edited, and illustrated. An editor later creates the
WordPress Post and copies the content across, at which point the Article is **on
WordPress** and stays that way.

This is the single most important thing to know about an Article, because it
determines where each of its details is authoritative. Before: Notion is the
authority on everything. After: WordPress is the authority on the writing
itself — title, body, publish date, section, image — and Notion remains the
authority on everything WordPress has no concept of.

Interface language says "this article isn't on WordPress yet", never "phase one"
or "unlinked".

## Instagram Post

The image or images the club puts on Instagram for an Article — the thing the
post generator draws.

A third meaning of "post", and the only one a club member reads in the
interface. The interface always says **Instagram Post** in full where it could
be mistaken for a **WordPress Post**, and never shortens it to "post" outside a
screen that is already about Instagram.

An Instagram Post is not a record anywhere. It is generated from an Article on
demand, downloaded, and posted by hand, and Notion does not track whether one
went out — the _Posted to Instagram_ property was removed with the rest of the
tracker integration. The daily reminder in `#instagram-posting` is where the social
team sees what still needs posting, and eventually where they mark it done.

## Publish Date

The single date an Article carries: the day it goes live on the website.

There is no separate planned or target date. An Article's date is not meaningful
until it is **on WordPress**; before then it is simply unscheduled, because
timing depends on when editing and images actually get finished.

The club aims to put an Article on Instagram the same day it publishes.

## Duty Roster

Who is responsible for posting to Instagram on a given day of the week.

Not a database at all: it is seven Discord roles, `@Social Sunday` through
`@Social Saturday`. Set once per semester and changes rarely. Anyone with
Manage Roles can edit it without going through a developer, and the reminder bot
pings the role for the day rather than resolving a person.

It lived in Notion as a **Social Media Day** property on Members until ADR 0006.
Discord roles clear the same bar — a non-developer can change them — while
keeping the bot's only job a mention.

## Section

Which desk an Article belongs to: News, Features, Entertainment, Sports, or
Rabbithole. Every Article has exactly one.

A Section has a **Section Editor** who approves ideas, edits drafts, and decides
when an Article is ready to move on. Each Section has its own Discord channel,
where drafts and images are handed back and forth.

## Bouncing

Moving an Article from one Section to another, because its content turned out to
suit a different desk — a News piece that got absurd enough to belong in
Rabbithole.

Bouncing is a normal editorial outcome, not a correction. It re-points the
Article at a new Section Editor, who picks the Article up where the previous one
left off.

## Status

How far an Article has moved through the writing process, plus — once it is
**on WordPress** — its publication state. One value at a time, and it only ever
moves forward, except when an Article is bounced.

- **Backlog** — an idea, not yet approved to be written
- **Approved** — a Section Editor has approved the idea
- **Written** — a draft exists and has gone to the Section Editor
- **Section Edited** — the Section Editor has approved the writing
- **Managing Edited** — the Managing Editor has passed it for grammar and brand
- **Scheduled**, **Published** — facts about the Article's WordPress Post

All seven are set by hand. An earlier design had the last two mirrored in from
WordPress by a scheduled job; ADR 0006 retired it, and no software writes to the
Articles database at all. WordPress remains the authority on whether an Article
is really published — Notion is a description of that, maintained by people.

## Image Status

How far an Article's image has got, tracked apart from Status because image work
runs alongside the writing rather than after it.

- **Not Started**, **N/A** (the Article needs no image)
- **Unclaimed** — requested from the **Image Crew**, nobody has taken it yet
- **In Progress** — a member of the Image Crew has claimed it
- **Done**

## Byline

The name printed on a published Article — which is not necessarily the name of
the person who wrote it. A writer may publish under a pseudonym, and so may an
image creator.

An Article carries the Byline as text, always filled, plus a separate relation
to the Member who actually wrote it — the relation may be empty or hold more
than one Member, for co-Bylines. The text is not merely a pseudonym override:
it is authoritative for what gets printed, kept as its own column rather than
derived from the Member, so a published Byline stays frozen and the Articles
table stays readable without resolving a relation per row. See ADR 0004. The
same split applies to image credits, as Image Byline text and an Image Crew
relation.

WordPress has no idea about any of this: on the website a Byline is simply text
inside the article body. Notion holds both the Byline and the real member behind
it.

The real name behind a pseudonymous Byline never reaches WordPress.

## Member

A person in the club, identified by their Discord account.

Members carry the things the club needs to remember about a person: their real
name and the pseudonyms that are theirs, so an editor can answer "who is Gale de
Silva?" without asking around. What a Member is allowed to _do_ is not recorded here —
that is read live from their Discord roles (@Editor-in-Chief, @Managing Editor,
@Section Editor, @Media Editor), so that a promotion in Discord takes effect
without anyone updating a second list.

Historical Articles were backported to link a Member where one could be
identified. Alumni still get no stub row — Members is keyed by Discord user ID,
which alumni can no longer supply, so a legacy row carrying only its Byline text
is the honest state. See ADR 0004.

## Automation

Something HareWare does on a schedule without being asked: today, the two
morning reminders.

"Automation" is the word the interface uses — `/admin/automations`, the sidebar,
the trigger buttons — and the word to use in code and in issues. It is broader
than **Reminder** on purpose: a reminder is an automation that posts a message,
and the shape also takes a watcher on a Notion database or a Discord slash
command without becoming a second system.

Say "the social ping did not run", never "the social job failed" — **Invocation**
is what the log records, and an automation is the thing that produced it.
