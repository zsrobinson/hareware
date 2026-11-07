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

## Instagram Post

The image or images the club puts on Instagram for an Article, which the post
generator draws. The interface always says **Instagram Post** in full where it
could be mistaken for a WordPress Post.

An Instagram Post is not a record anywhere. The **Social Reminder** is where
the social team sees what needs posting, and its "Not posted" button is where
they mark each one done.

## Section

Which desk an Article belongs to: News, Features, Sports, Entertainment or
Rabbithole. It is the post's WordPress category, and every Article has exactly
one. A post left in the default category, Uncategorized, has no Section and is
listed under **Problems**.

## Credit

A line in an Article's body that says who made it: "Article by: …", "Image
Credits: …". Each label belongs to a **role**: writing, images or other.

The credit is read from the post every time. It is the byline as printed, and
the printed byline is often part of the joke.

## Byline

The name printed in a credit, which is not necessarily the person behind it. A
writer may publish under a pseudonym, and many bylines are one-off jokes
written for a single Article.

A byline counts as a person as it is printed, unless the **Sheet** says who is
behind it.

## The Sheet

The club's Google Sheet, owned by the club's account, holding the only facts
WordPress does not:

- **Overrides**: who is really behind a byline, keyed by post id and role.
- **Labels**: which paragraph labels count as credits, and their roles.
- **Ignored**: posts whose problems are intended, such as an editor's note.

It holds overrides only, never a copy of WordPress, so nobody needs to edit it
in normal use. What is in it is private: it never appears on WordPress, in the
repository, or on a page anyone outside the Editorial Board can reach.

## Problem

Something about a published post that HareWare cannot read: no writing or image
credit, a credit with no readable name, a "name" that reads like a sentence, or
no Section. The fix is almost always in WordPress, where readers see it too.

## Duty Roster

Who posts to Instagram on a given day of the week: seven Discord roles, set once
a semester. Anyone with Manage Roles can change it, and the reminder pings the
role for the day rather than a person.

## Social Reminder

The one **Automation**: every morning at 8 Eastern it posts each Article
published since the previous morning's run to `#instagram-posting` and pings
that day's poster role.

## Automation

Something HareWare does on a schedule without being asked. Listed in
`src/lib/automations/registry.ts`, which also dispatches them. Say "the social
reminder did not run", never "the job failed".

## Invocation

One thing HareWare did, as recorded in the log: a run of an automation, a manual
trigger, a press of a "Not posted" button, or a change to the Sheet made from a
page. Each records what happened and, where there was one, the Discord user
behind it.
