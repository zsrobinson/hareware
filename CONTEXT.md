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

## Section

Which desk an Article belongs to: News, Features, Sports, Entertainment or
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

A byline that stands for someone else. The Sheet says who, once, and from then
on every Article printing that byline counts as them, including future ones. A
pen name two people share counts as both.

## Contribution

One person in one role on one Article. Someone who writes an Article and also
draws its image has made two contributions. It is the only unit people are
counted in: never "credits", never "articles" for a person.

## The Sheet

The club's Google Sheet, owned by the club's account, holding the only facts
WordPress does not:

- **Overrides**: who a byline really is, on every Article or one.
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
image credit, a line shaped like a credit that no label matches, a credit line
with no readable name, a "name" that reads like a sentence, or no Section. The
fix is almost always in WordPress, where readers see it too. Two names a letter
apart, like "Clare Dombroksy" and "Clare Dombrosky", are pointed out alongside.

## Duty Roster

Who posts to Instagram on a given day of the week: seven Discord roles, set once
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
