# Context

The shared vocabulary for HareWare: what each word means to the club, and which
word to use. The reasons behind the design live in `docs/adr/`.

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
authority on everything. After: WordPress is the authority on the writing itself
— title, body, publish date, section, image — and Notion remains the authority
on everything WordPress has no concept of.

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
tracker integration. The daily reminder in `#instagram-posting` is where the
social team sees what needs posting, and where they mark each one posted.

## Publish Date

The single date an Article carries: the day it goes live on the website.

There is no separate planned or target date. An Article's date is not meaningful
until it is **on WordPress**; before then it is simply unscheduled, because
timing depends on when editing and images actually get finished.

The club aims to put an Article on Instagram the same day it publishes.

## Duty Roster

Who is responsible for posting to Instagram on a given day of the week.

Not a database at all: it is seven Discord roles, `@Social Sunday` through
`@Social Saturday`. Set once per semester and changes rarely. Anyone with Manage
Roles can edit it without going through a developer, and the reminder bot pings
the role for the day rather than resolving a person.

It used to be a **Social Media Day** property on Members; ADR 0006 moved it to
Discord roles, which a non-developer can change just as easily.

## Section

Which desk an Article belongs to: News, Features, Entertainment, Sports,
Rabbithole, or Social Media. Every Article has exactly one.

Social Media is the odd one out — it is not a desk with a Section Editor, and it
covers writing made for the club's own accounts rather than the website.

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

How far an Article has moved through the writing process, plus — once it is **on
WordPress** — its publication state. One value at a time, and it only ever moves
forward, except when an Article is bounced.

- **Backlog** — an idea, not yet approved to be written
- **Approved** — a Section Editor has approved the idea
- **Written** — a draft exists and has gone to the Section Editor
- **Section Edited** — the Section Editor has approved the writing
- **Managing Edited** — the Managing Editor has passed it for grammar and brand
- **Scheduled**, **Published** — facts about the Article's WordPress Post

Status is always set by a person, in Notion or through `/article` (ADR 0009).
Nothing sets it automatically from WordPress, so WordPress remains the authority
on whether an Article is really published — Notion's Status is a description of
that, maintained by people.

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

An Article carries the Byline as text, filled on every Article rather than only
pseudonymous ones, plus a separate relation to the Member who actually wrote it,
which may be empty or hold several Members for co-Bylines. The text is
authoritative for what gets printed and is its own column rather than derived
from the Member, so a published Byline stays frozen and the Articles table stays
readable without resolving a relation per row. See ADR 0004. Image credits have
the same split, as Image Byline text and an Image Crew relation.

WordPress has no idea about any of this: on the website a Byline is simply text
inside the article body. Notion holds both the Byline and the real member behind
it.

The real name behind a pseudonymous Byline never reaches WordPress.

## Member

A person in the club. One row per human, ever.

Members carry the things the club needs to remember about a person: their real
name, their email, whether they are an Undergrad, a Grad or an Alum, which
Articles and images are theirs, and which meetings they attended.

A Member is usually identified by their Discord account, but not always. Rows
created at the **Kiosk** by people who have not applied on Discord yet carry a
name and an email and no Discord ID until an **Application** is linked to them.

There is no such thing as joining or leaving. Anyone may write, attend and vote
subject to **Standing**; nothing is revoked, and nobody is removed.

Pseudonyms are not recorded. A pseudonymous Byline is **detected** rather than
stored — an Article whose printed Byline differs from the linked Member's name
is one, and Notion computes that. So "who is Gale de Silva?" is answered by
opening the Article, not by looking the name up on a Member.

What a Member is allowed to _do_ is not recorded on the row. It is read live
from their Discord roles — HareWare's admin tools and `/article` check
`@Editorial Board` — so a promotion in Discord takes effect without anyone
updating a second list.

Historical Articles were linked to a Member by hand where one could be
identified (ADR 0004). Alumni do have rows — they keep contributing and never
leave the server — and are marked `Alum` by hand, which is the one field in the
roster a person has to maintain.

Graduation year is deliberately not recorded. People change it without telling
the club, and winter versus spring is not a distinction anyone here needs. See
ADR 0010.

## Standing

What a person has done in a window of time, and whether it was enough.

Standing is **computed, never stored**. There is no eligible flag and nothing to
tick: HareWare counts general body meetings, volunteer events and contributions
over a date range and compares them against thresholds. The constitution's rule
— within the past year, 3 meetings or 2 contributions or 1 volunteer event,
alumni excluded — is a preset on that query rather than something the code
enforces, because the rule belongs to the club.

The masthead is the same question with different numbers, which is why there is
one page and not two. See ADR 0010.

Standing is the club's one **coordination** tool: people act on it during
elections, so unlike the Article tracker it has to be right. Say "who has
standing to vote", not "who is a member" — membership is not the question.

## Application

What somebody fills in to join the Discord server: their full name, email,
graduation year and a paragraph about why. An editor approves it by hand.

Applications are read, never written. They are the cleanest identity data the
club has, and the origin of most Members — but they only reach back to December
2025, so most of the server predates them.

## Attendance

Who was in the room. A relation between a Member and a **Meeting**, recorded at
the **Kiosk** and stored on the Meeting page in Notion.

Attendance at an Editorial Board meeting counts toward nothing. Only General
Body meetings and Volunteer Events feed Standing.

## Kiosk

The laptop at the front of the room at a meeting, showing `/attendance`, where
people enter their own names.

It is signed in as an officer and sits beside one. It creates Members as well as
recording Attendance, which is why a new person is asked for an email: that
address is what later ties them to their Application.

## Reconciler

The page holding everything about the roster that needs a person to decide:
Applications the hourly sync would not act on, rows that look like the same
person twice, Members missing a Status, Discord ID or email, addresses outside
the university's domains, and the comparison against the Google Group.

Nothing on it happens automatically. A duplicate Member splits somebody's
Attendance across two rows and can cost them a vote they earned, so the
reconciler is run _before_ an election, and the Standing page says so while
anything is outstanding.

## Automation

Something HareWare does on a schedule without being asked: today, the two
morning reminders and the application sync.

"Automation" is the word the interface uses (`/automations`, the sidebar, the
trigger buttons) and the word to use in code and in issues. It is broader than
**Reminder** on purpose: a reminder is an automation that posts a message, and
the application sync is one that posts nothing.

Say "the social ping did not run", never "the social job failed".

## Invocation

One thing HareWare did, as recorded in the log at `/log`: an automation's run, a
manual trigger, a button press, an `/article` edit or a roster change. Each
records what happened and, where there was one, the Discord user behind it. The
log records Invocations; an automation is one of the things that produces them.
