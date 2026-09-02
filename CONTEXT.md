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

## Publish Date

The single date an Article carries: the day it goes live on the website.

There is no separate planned or target date. An Article's date is not meaningful
until it is **on WordPress**; before then it is simply unscheduled, because
timing depends on when editing and images actually get finished.

The club aims to put an Article on Instagram the same day it publishes.

## Duty Roster

Who is responsible for posting to Instagram on a given day of the week.

Set once per semester and changes rarely. Lives in Notion so that whoever runs
social can edit it without going through a developer.

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

How far an Article has moved through the writing process. One value at a time,
and it only ever moves forward, except when an Article is bounced.

- **Backlog** — an idea, not yet approved to be written
- **Approved** — a Section Editor has approved the idea
- **Written** — a draft exists and has gone to the Section Editor
- **Section Edited** — the Section Editor has approved the writing
- **Managing Edited** — the Managing Editor has passed it for grammar and brand

Being **scheduled** and being **published** are not Status values: they are facts
about the Article's WordPress Post, and are read from WordPress rather than
tracked by hand.

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

WordPress has no idea about any of this: on the website a Byline is simply text
inside the article body. Notion holds both the Byline and the real member behind
it.

The real name behind a pseudonymous Byline never reaches WordPress.

## Member

A person in the club, identified by their Discord account.

Members carry the things the club needs to remember about a person: their real
name, the Byline they publish under, and which pseudonyms are theirs. What a
Member is allowed to *do* is not recorded here — that is read live from their
Discord roles (@Editor-in-Chief, @Managing Editor, @Section Editor, @Media
Editor), so that a promotion in Discord takes effect without anyone updating a
second list.
