# Context

The shared vocabulary for HareWare: what each word means to the club, and which
word to use. The reasons behind the design live in `docs/adr/`.

## Article

One published piece of writing. "Article" is the club's own word and the only
noun used in the interface.

HareWare only knows about Articles once they are published on WordPress. Work
in progress lives in Discord and in people's drafts, and HareWare has no record
of it ([ADR 0011](docs/adr/0011-wordpress-is-the-record.md)).

Not to be confused with **WordPress Post**, the same writing as WordPress
represents it. "Post" is a WordPress word: it is fine in code that talks to the
WordPress API, and never appears in language a club member reads, except in
"post id", the number the Sheet is keyed by.

## Words and views

An Article's **words** are its prose: paragraphs, subheadings and list items,
less its credit lines. Captions are not counted.

Its **views** are how often Jetpack counted it read, by month, from January 2023. Views that could not be read are _unavailable_, never zero: zero means
Jetpack has counted nobody reading it.

## Section

Which desk an Article belongs to: News, Features, Entertainment, Sports or
Rabbithole. It is the post's WordPress category, and every Article has exactly
one. An Article left in the default category, Uncategorized, has no Section and
is listed under **Problems**.

## Credit line

A short paragraph in an Article's body that says who made it: "Article by: …",
"Image Credits: …". Its label sets the **role** it credits: writing, image or
other. Which labels count is in the Sheet's Labels tab, editable in Settings.

## Byline

A name as a credit line prints it. Often it is the person; sometimes it is a
**pen name** or a joke written for one Article, and the printed byline is part
of the joke, so it is never rewritten.

## Pen name

A byline that stands for someone else, said article by article: the Sheet
says who it is on that Article, and nowhere else. Most pen names are used once;
when one is printed again, the Article's panel offers whoever it was before and
Problems lists the Article until someone says. A series that changes hands is
just each part saying who wrote it.

## Contribution

One person in one role on one Article. Someone who writes an Article and also
draws its image has made two contributions. It is the only unit people are
counted in: never "credits", never "articles" for a person.

## Person

Everyone credited is a person, and two credits are one person when they count
as the same name exactly: the printed byline, or who the Sheet says it is on
that Article. Nothing joins two spellings; a misspelling is fixed in
WordPress, and Problems points out names a letter apart.

A person is **new** at their first contribution, in any role, whatever the
filters: someone who has written for a year is not new when they draw their
first image. A person is **active** in a period when they made at least one
contribution in it.

Where someone **joined in** is the period of their first contribution, cut
as finely as the period beside it (semesters, unless the view is by another
period): their intake. Everyone is in one intake, so people counted by it add
up, and an intake against the semesters its people were active in is
retention. It is no filter: an intake's people are named.

## View

One way of looking at a table, Articles or People: as a table, a chart or a
pivot, on a range and filters it opens on. Each table is a page, and its views are its
tabs; the defaults are declared in `src/components/archive/views.ts`
([ADR 0014](docs/adr/0014-views-are-declarations.md)). **Custom** is whatever
the builder made from one, and a view of one's own is its link. Say "view",
never "report", "dashboard" or "saved view": nothing is saved.

A **pivot** is rows by columns, each cut by a dimension (a period, a section,
a role, a person, or when they joined), every cell a number or a share of
its row, its column or the total, with totals of both. Say "pivot", never
"crosstab" or "matrix".

A **slice** is what one mark of a chart or one cell or total of a pivot
counts, which opens beside it and, as filters, on either table. Its list is
always as long as the number it was opened from.

To **compare** is to set what the range counts beside the same count over
an earlier range as long: **the period before**, just before it, or **a year
before**, the same dates a year back. A range that runs to today counts as
far as today, so it is set against as many days. Only a view of categories,
not of time, compares.

## The Sheet

The club's Google Sheet, owned by the club's account, holding the only facts
WordPress does not:

- **Overrides**: who a byline really is, on one Article per row.
- **Labels**: which credit line labels count, and their roles.
- **Ignored**: Articles whose problems are intended, and similar names that are
  different people.

HareWare reads it on every load and writes it from the signed-in pages, so
nobody needs to open it in normal use. It holds corrections only, never a copy
of WordPress. What is in it is private: it never appears on WordPress, in the
repository, in the log, or on a page anyone outside the Editorial Board can
reach.

## Problem

Something about a published Article that HareWare cannot read: no writing or
image credit, a line shaped like a credit that no label matches or that lacks
its colon, a credit line
with no readable name, a "name" that reads like a sentence, or no Section. The
fix for those is almost always in WordPress, where readers see it too. The one
answered in HareWare instead is a pen name printed again with nobody said for it
on this Article. Two names a letter apart, like "Cleo Dombroksy" and "Cleo
Dombrosky", are pointed out alongside, and so are names first credited in the
last 30 days, in case one is a pen name.

## Duty Roster

Who posts to Instagram on a given day of the week: six Discord roles, one per weekday and one for the weekend, set once
a semester. Anyone with Manage Roles can change it, and the reminder pings the
role for the day rather than a person.

## Social Reminder

The one **Automation**: every morning at 8 Eastern it **announces** each Article
published since the previous morning's run in `#instagram-posting` and pings
that day's poster role. "Posted" and "Not posted" belong to the Instagram button
on each announced Article, never to the run itself.

## Automation

Something HareWare does on a schedule without being asked. Listed in
`src/lib/automations/registry.ts`, which also dispatches them. Say "the social
reminder did not run", never "the job failed".

## Invocation

One thing HareWare did, as recorded in the log: a run of an automation, a manual
trigger, a press of a "Not posted" button, or a change to the Sheet. Each
records what happened and, where there was one, the Discord user behind it. A
Sheet change is logged by kind and post id only: the log never carries a real
name.
