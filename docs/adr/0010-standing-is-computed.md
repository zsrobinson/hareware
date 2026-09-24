# 10. Standing is computed, not maintained

**Status:** Accepted — 2026-09-07

Amends [ADR 0006](0006-hareware-is-a-reminder-bot.md) (see the note at its top)
and [ADR 0009](0009-editor-commands-in-discord.md) (Members rows can now exist
without a Discord ID). Reaffirms [ADR 0001](0001-notion-as-the-store.md).

## Context

The club keeps membership records in five places, all by hand: Discord's join
form (name, email, graduation year, a paragraph), a Google Group for
announcements, TerpLink for the university's headcount, Notion `Members` (one
row per person, related to their Articles and images), and photographs of the
attendance whiteboard pasted into Meetings pages.

These are not five drifting copies of one roster. `Members` is everyone who has
had a byline, mostly from before the join form existed; the form is everyone who
joined since December 2025, mostly without a byline yet. The two barely overlap,
and merging them would produce a list nobody could define.

Membership itself is not the problem either: anyone can join, write and attend,
and nothing is revoked. What the club has to answer by hand is a question about
a window of activity. The constitution makes a member eligible to vote if,
within the past year, they attended 3 general body meetings, made 2
contributions, or worked 1 volunteer event. The magazine masthead is the same
question with different numbers.

Two findings shaped the design. Discord's approved applications, answers
included, are readable over plain REST (`GET /guilds/{id}/requests`); the traps
in reading them are in [silent-failures](../agents/silent-failures.md). The
Google Group cannot be read or written by software: the Admin SDK needs
Workspace administrator credentials on the owning domain, and the club's group
belongs to a consumer Gmail account.

ADR 0006 refused to build on the Article tracker because a coordination tool has
to be accurate and a hand-maintained tracker decays. Election eligibility is
coordination — a wrong answer means an improper vote. The difference is that
standing is derived from attendance and publication dates, which are records of
things that happened, not a hand-kept model of the present.

## Decision

HareWare computes standing from records it collects, and never stores the
answer.

### One person, one row

`Members` stays the only model of a person; there is no separate applicants
database. The row gains `Email` and `Status`. Status options are Notion's to
name; the code depends only on `Alum`, because alumni cannot vote and nothing
else distinguishes them.

Graduation year is not recorded. People change it without telling the club, and
real answers include "Dec 2027" and "It depends". So `Status` is the one field a
person has to maintain, and it changes at most once per member.

### Standing is a query

There is no _Eligible_ checkbox. The standing page answers "who meets these
thresholds between these two dates", with presets for voting and the masthead.
The window and thresholds are inputs, so the people who own the rule can change
it without a deploy.

- An image credit counts the same as an article; both are shown and summed.
- A contribution is dated by the Article's `Publication Date`. Unpublished work
  counts for nothing.
- `Members`' `Contributions` formula is all-time, so it is shown on the kiosk
  and is not the source for standing.

The page lists everyone and how they fall short, not only who qualifies; treats
an empty `Status` as unknown rather than disqualifying, since every older row
has one; and refuses to look final while possible duplicates are unresolved.

### Meetings gain a type, and volunteering is a meeting

`Meetings` gains `Type` (`Editorial Board`, `General Body`, `Volunteer Event`)
and `Attendees`, a relation to `Members` whose other side is `Attendance`.
Volunteer shifts are Meetings rows.

Only General Body meetings and Volunteer Events count. The board attends its own
meetings constantly, and counting them would make every officer eligible by a
route the constitution did not intend. An untyped meeting counts toward nothing,
and the kiosk says so. The board meeting reminder reads `Type` as well, falling
back to the old title prefix for rows that have none yet.

### A kiosk records attendance, and creates people

At a meeting, a laptop signed in as an officer sits at the front of the room and
people enter their own names. With an officer beside it, it needs no public
route or per-meeting token.

People come to meetings before they apply on Discord, so the kiosk creates
`Members` rows from a name and an email, with no Discord ID. Returning people
autocomplete; two people sharing a name are asked to choose. Anyone can correct
their own row's email, Discord account and status on the spot.

The email is what later ties an application to a kiosk-made row. When an
application's email and name agree with a row that has no Discord ID, the
reconciler offers the link as one button. A name match alone is a guess.

### Applications are synced hourly, and only the unambiguous ones

Discord sends nothing when an editor approves someone, so the hourly cron reads
the approved applications and compares them with `Members`. It reads the whole
list every time: the list is not reliably ordered by id, and a stored cursor
that slips past a gap never revisits it.

The sync creates a row only when the application's Discord ID, email and
normalised name match nothing. Every other case — an id already present, an
email or name matching an unlinked row, a name one edit from an existing one, a
form missing its name or email — is left for the reconciler, following ADR
0009's rule that an uncertain match asks rather than guesses. Hourly rather than
daily means somebody who applies on Monday autocompletes at Wednesday's meeting.

The form's questions are found by keyword (`name`, `email`, `year`) in their
text, so they can be reworded. Rewording one past its keyword makes every
application incomplete, and those go to the reconciler rather than being
created.

### The reconciler runs before the vote

A duplicate person costs a vote: somebody who attends three meetings and is
mistyped once holds two attendances on one row and one on another.

The reconciler collects what needs a person to decide: applications the sync
would not act on, rows that look like the same person, members missing a status,
Discord account or email, and the Google Group comparison. Nothing on it happens
automatically. A merge asks which row survives, because the survivor keeps its
own name and status and gains only what it lacked.

A Discord link for an existing row is suggested only when exactly one account
and one unlinked row share a normalised name. Near-name matching only stops the
sync creating a row; it never proposes a link, because a Discord ID on the wrong
row moves one person's history onto somebody else.

### The Google Group is compared by hand

An editor exports the group's members as CSV and gives the file to the
reconciler, which compares it in the browser without uploading it. Addresses are
found by shape rather than by column name, because a renamed column would
otherwise read as an empty group. It reports roster members missing from the
group, members with no address, and group addresses matching nobody. Someone who
left the group on purpose will be offered again; that is accepted rather than
tracked with another field.

TerpLink stays manual: a CSV export from the standing page is the whole
integration.

## Consequences

**ADR 0006's "the reminder bot is the whole product" no longer holds.** Its
argument about the tracker does: this reads only Articles' publication dates.

**Notion holds every record that matters.** If HareWare disappeared, the club
could count by hand in Notion, which is ADR 0001's test.

**The application sync is an ordinary Automation**: a registry entry that runs
every hour, posts nothing, and records every run.

**Members who predate the form are not backfilled.** Anyone still active gets a
row the first time they attend or take a byline. Attendance from before the
kiosk is not recovered.

**Every surface is a table**, so CSV export was added once to
`~/components/data-table.tsx`.

**The constitution becomes numbers in a form.** That makes it consistent and
auditable, and turns a disagreement about its meaning into a disagreement about
a number — which is why the numbers stay editable.

## Alternatives considered

**D1 as the person store.** Faster and free of Notion's rate limit, but ADR 0007
keeps D1 non-authoritative, and a Notion row can be repaired by whoever inherits
the club while a D1 row needs this repository.

**Separate applicant and contributor databases.** Matches today's data, but the
split is historical and gives one person two rows.

**Typing attendance into Notion directly.** Notion's relation picker offers to
create a page for anything it does not match, so every typo becomes a person. It
also cannot require an email.

**A public kiosk URL with a per-meeting token.** A public route and a spoofing
surface on an election input, to save walking a laptop to the front of the room.

**`/here <code>` in Discord.** Misses the first-time attendee this most needs to
capture, and anyone who can see the projector can use the code.
