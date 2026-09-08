# 10. Standing is computed, not maintained

**Status:** Proposed — 2026-09-07

Amends [ADR 0006](0006-hareware-is-a-reminder-bot.md). Amends
[ADR 0009](0009-editor-commands-in-discord.md). Reaffirms
[ADR 0001](0001-notion-as-the-store.md).

## Context

Membership lives in five places, and the club maintains all five by hand.

- **Discord**, where people apply through the server's member verification form
  — full name, email, graduation year, and a paragraph about why they want to
  join. This is where joining actually happens.
- **Google Groups**, where emails are copied from Discord so announcements reach
  people who have their Discord notifications off, which most students do.
- **TerpLink**, the university's platform, which nobody uses for anything except
  the headcount that registration and funding require. The threshold is 25 and
  the club is far past it.
- **Notion `Members`**, one row per person, related to the Articles they wrote
  and the Images they shot, so a byline resolves to a human.
- **Photographs of the attendance whiteboard**, pasted into the body of the
  relevant page in the Meetings database.

The obvious reading is that these are five copies of one roster that have drifted
apart, and that the fix is to reconcile them. Measured, that reading is wrong.

### They are not five copies of one thing

As of 2026-09-07, against the live sources:

- The Discord form has **51 approved applications**, the oldest dated
  2025-12-04. All 51 carry a usable name, a syntactically valid email — 44
  terpmail, 3 `umd.edu`, 4 elsewhere — and an exact Discord user id. 40 of the
  51 gave a bare four-digit graduation year; the other 11 answered in prose.
- Notion `Members` has **49 rows**, of which 13 carry a Discord ID and 38 are
  related to at least one Article.
- The guild has roughly **258 members**.

The overlap between the first two is **zero by Discord ID and five by
normalised name**. Not a drift to be reconciled — two populations that barely
intersect. `Members` is a record of everyone who has ever had a byline, most of
whom predate the application form. The form is a record of everyone who has
joined since it went up, most of whom have not yet written anything.

So there is no single roster hiding behind these sources, and building one by
merging them would produce a list whose meaning nobody could state.

### What is actually manual is standing, not membership

Membership at The Hare is not a status anyone holds. Anyone can join, write, and
attend, and nothing is required to remain. There are no quotas and nothing to
revoke.

What the club does need, twice a year and painfully, is to answer a question
about a **window of activity**:

- **Voting eligibility.** The constitution puts elections in the spring and
  makes a member eligible if, within the past year, they attended 3 meetings, or
  made 2 contributions, or volunteered once for something like tabling.
- **The masthead.** Who to print in the magazine, which in practice means
  anyone who contributed over the past year, though the rule is the editors' to
  set.

Both are the same query with different numbers: given a date range and a set of
thresholds, who qualifies? Today that query is answered by a person reading
Notion, scrolling Discord, and squinting at photographs of a whiteboard.

### The sources can be read, and one of them cannot be written

Two findings decided the shape of everything below.

**Discord's application answers are readable over the REST API.**
`GET /guilds/{id}/requests?status=APPROVED` returns the full history with
answers attached, with no gateway connection and no privileged intent. The trap
is that each entry in `form_responses` carries **both** a `values` array and a
`response` string; `values` echoes the question's configured options and is an
empty string for every free-text field, while `response` holds what the
applicant actually typed. Reading `values` yields a plausible-looking result in
which every answer is blank.

Separately, `GET /guilds/{id}/members` returns 403 until the Server Members
privileged intent is enabled on the application. Nothing here needs it, but its
absence is worth knowing before someone spends an afternoon on it.

**Google Groups cannot be written programmatically.** The Admin SDK Directory
API requires Workspace administrator credentials on the domain that owns the
group. The club's group is owned by a consumer Gmail account, which has no
domain and no admin console, so there is no supported path — and a Q2 2026
change to how Google classifies external members restricts non-admin additions
further. The group can be maintained by hand or not at all.

### This crosses ADR 0006's line, deliberately

ADR 0006 rejected integrating with the Article tracker on the strength of one
distinction:

> A coordination tool has to be accurate or it is dangerous — someone acts on it
> and gets it wrong. A planning tool can be 80% accurate and still be worth
> having.

Election eligibility is the most coordination-shaped thing a student
organisation has. Someone acts on it, and being wrong means an improper vote.
This is squarely the dangerous category, and pretending otherwise would be
dishonest.

But the argument that made the tracker dangerous does not transfer. The tracker
is hand-maintained, so its accuracy decays with every busy week, and integrating
with it would have demanded more editorial discipline rather than less.
Standing is **derived** — counted from attendance records and Article dates that
nobody curates. There is no discipline to maintain and nothing to decay. The
records feeding it are append-only facts about things that happened, not a
hand-kept model of the present.

That is the difference, and it is the reason this is allowable where the tracker
was not.

## Decision

**HareWare computes membership standing from records it collects, and never
stores the answer.**

### One person, one row

Notion `Members` stays the single person model. There is no separate
"applicants" database: the distinction between someone who applied and someone
who contributed is an accident of which source saw them first, and encoding it
would give one human two models.

The row gains `Email` and `Status`. `Status` is `Undergrad` / `Grad` / `Alum`,
because alumni are not eligible to vote and nothing else distinguishes them —
people do not leave the server, and the existing `@boomer` role is applied when
someone happens to remember.

**Graduation year is deliberately not recorded.** The application asks for it
and HareWare reads it, but it is not copied into Notion. People change their
graduation year without telling the club, so a stored one is wrong more often
than it is useful, and the measured answers make the point on their own: real
responses include `"2029-2030 most likely. I'm a transfer."`, `"Dec 2027"` and
`"It depends"`. Distinguishing a winter graduation from a spring one is not
something the club wants to track.

The cost of that is accepted rather than mitigated: `Status` cannot be nagged
about, because there is no date to compare it against. It is the one field in
this design a human must remember to change, and it changes at most once per
person.

### Standing is a query, not a property

There is no _Eligible_ checkbox. HareWare answers, on demand:

> Who satisfies these thresholds between these two dates?

Voting is a saved preset — the last twelve months, `meetings ≥ 3 OR
contributions ≥ 2 OR volunteer ≥ 1`. The masthead is another — the last twelve
months, `contributions ≥ 1`. Editors can change the window and the numbers
without a deployment, and the constitution's rule is written down in one place
instead of being recalled each spring.

An image credit counts the same as an article. The query reports the two
separately so an editor can see the split, and sums them for the threshold.

A contribution falls in the window by the Article's **`Publication Date`**.
Articles approved but never written therefore count for nothing, which is
correct, and an article written in April and published in September counts
toward the later year, which is a known consequence rather than a bug.

The existing `Articles Count` and `Images Count` rollups cannot answer any of
this — they are all-time counts with no window — so they remain a board
convenience and are not the eligibility source.

### Meetings gain a kind, and volunteering is a meeting

`Meetings` gains `Type`, a select over `Editorial Board`, `General Body` and
`Volunteer Event`, and `Attendees`, a relation to `Members` whose other side is
`Attendance`.

Volunteer shifts such as tabling are Meetings rows with `Type = Volunteer
Event`.
They are the same shape — a date, a place, a list of people who showed up — and
a second event model would buy nothing.

**Editorial Board meetings do not count** toward the constitution's three. The
board attends them constantly, and counting them would make every officer
eligible by a route the rule plainly did not intend.

`Type` also retires a hack. `MEETING_TITLE_PREFIX` in
`~/lib/automations/config` matches the start of a meeting's title because the
database has no property distinguishing its kinds, and the constant carries a
note that a select property would be more robust and that this is the constant
to delete on the day someone adds one. This is that day — almost.

The reminder now reads `Type`, and the prefix survives as a **fallback for
untyped rows only**. Every Meetings row that existed when `Type` was added has
it empty, so deleting the prefix match outright would have stopped the reminder
finding anything, silently, on the first morning after deploy. `Type` wins
wherever it is set, including when it says no — a General Body meeting titled
"Editorial Board social" no longer pings the board. Once every row carries a
`Type`, the fallback and the constant can both go.

Magazine design sessions are left without a type of their own; they are not a
kind of meeting anyone counts.

### Attendance is entered on a kiosk, and the kiosk creates people

At a meeting, a laptop already signed in to HareWare sits at the front of the
room with the sidebar collapsed, and people enter their own names. It is beside
an officer, so it needs no locked mode, no per-meeting token and no public
route. It defaults to today's meeting and allows picking another.

The consequence that matters: **the kiosk is an identity source, not only an
event source.** Someone attends their first general body meeting before they
ever apply on Discord, so the kiosk must be able to create a `Members` row from
a name alone, with no Discord ID.

This amends ADR 0009's account of `Members` as keyed by Discord user. That
remains true of every row the _slash commands_ touch — they resolve a Discord
user first and fall back to a normalised name — but rows will now be born
without an id and acquire one later, or never.

New entries supply a name and an email; returning people autocomplete against
existing rows and supply nothing. The email is not bureaucracy. It is the merge
key: when an application later arrives for the same human, an email match plus
name agreement is confident enough to backfill the Discord ID automatically,
where a name match alone would be a guess.

### Applications are polled in full, not pushed

There is no webhook, no gateway connection and nothing that fires when an
editor presses approve. The hourly cron that already runs the reminders also
reads the approved applications and compares them against `Members`.

It reads **all** of them rather than only the new ones. The endpoint does
support `before` and `after` snowflake cursors, so incremental reads are
possible, but the list is not reliably ordered by id — two entries on the first
page measured out of sequence — and a cursor implies stored state that can drift
past a gap it will then never revisit. Fifty-one applications is one request,
and five hundred would be five. Statelessness is worth more than the saved
round trip, and it means the same code answers "what is new" and "what did we
ever miss".

The cron only handles the boring case. It creates a `Members` row when the
application's Discord ID, email and normalised name all match nothing that
already exists. Any collision at all — an id that matches, an email that
matches a row with no id, a name that nearly matches — is left untouched for
the reconciler, because those are exactly the cases where a wrong guess makes
two people out of one. This mirrors ADR 0009's rule that an ambiguous match
asks rather than guesses; the cron simply has nobody to ask, so it defers.

"Nearly matches" is its own outcome, `similar`, and it is deliberately not a
link. `normaliseName` keeps "Matthew" and "Mathew" apart on purpose, because a
matcher loose enough to join them joins real members too — but it is equally
not safe to _create_ over one, since that makes the duplicate the reconciler
exists to catch. So a name within one keystroke of an existing row stops the
cron and asks a person. The asymmetry is the point: a false positive costs one
click, and a false negative costs somebody their vote.

Creating rows unattended is what keeps the kiosk useful: a person who applies on
Monday autocompletes at Wednesday's meeting without anyone having opened the
reconciler in between. Every such create is an Invocation, so `/admin/log`
answers where a row came from.

### Duplicates deny eligibility, so the reconciler runs before the vote

A duplicated person is not a cosmetic problem. Someone who attends three general
body meetings, typo'd once, holds two attendances on one row and one on
another — and fails a threshold they met. The error runs toward
disenfranchisement, and it does so during an election.

So the reconciler groups near-matching rows and offers to merge them, and
**the standing page refuses to present itself as final while unresolved
near-matches could change who qualifies.** The reconciler is run before the
vote, not after it.

Autocomplete reduces typos but introduces the worse error, which is tapping the
wrong existing person. Two members sharing a name are disambiguated rather than
guessed between — the same refusal ADR 0009 already makes for the same reason.

### Google Groups is a comparison, not a watermark

Since the group cannot be read or written by software, HareWare does not try to
sync it. An editor opens the group's member list, exports the CSV, and hands the
file to the reconciler, which says which people on the roster are not in it and
offers their addresses to paste into the bulk-add field.

The file is read in the browser and never uploaded. The comparison is two lists
of strings and a server would add nothing to it except a log holding every
member's address. Addresses are matched case-insensitively, and every address in
the file is found by shape rather than by column name — Google has changed those
columns before, and a reader that looks for a column and finds none reports an
empty group, which reads as "add everyone again" rather than as a failure.

Four answers come back rather than one, because each needs something different
done about it: people to add, people with **no address at all** (nothing reaches
them and no paste will fix it), addresses in the group matching nobody on the
roster, and people who asked not to be added. That third group is mostly alumni,
and is reported rather than acted on because a typo in a Notion email looks
exactly the same from here.

**Leaving the group has to be recordable, or the comparison undoes it.** Someone
who leaves a mailing list on purpose is invisible to a diff: they look exactly
like someone who was never added, so every export would offer them again and one
paste would put them back. `Members` gains a **No Announcements** checkbox, set
from a button beside their name on the reconciler, and they are then counted
separately rather than silently skipped — a silent exclusion is how the numbers
stop adding up with nothing on screen to explain why. Unticking it offers them
again, because someone asking to come back is the other half of the same
conversation.

The list flags addresses outside `terpmail.umd.edu` and `umd.edu` — 7 of the 51
today — because those do not auto-add and may need an invitation.

**This replaced a watermark**: a day in D1 recording when the additions were
last done, and a list of everyone approved since. Two things were wrong with it.
It answered "who arrived since we last remembered" rather than "who is missing",
so anything that fell through — a paste half done, a watermark advanced for a
list nobody actually pasted — was invisible and permanent. And it was fed by
Discord applications, so somebody who joined by walking into a meeting and
signing the kiosk never appeared in it at all. That is the flow the kiosk exists
for, and those people simply never got the announcements.

The comparison answers the real question every time and remembers nothing, which
is why the `group_watermark` table is gone and this feature now touches D1 not
at all.

### The three ways somebody arrives, and what each needs

The reconciler's sections are not a list of everything that could be checked.
They are what the join flows actually produce:

**They come to a meeting first.** The kiosk writes a row with a name, an email
and a status, and no Discord ID. If they later fill in the Discord form, the
sync matches the application to that row and stops, because linking is a
decision: the **Applications** section offers it with one button.

**They join Discord first.** The sync creates the row itself from the
application. They turn up at a meeting, autocomplete finds them, and nothing
needs reconciling — unless they type a different name than they applied under,
and the kiosk makes a second row. That is what **Rows that look like the same
person twice** is for. Rows made this way carry no status, which is why
**Members with no status** is a standing queue rather than one-time cleanup: an
applicant may be an alum, the constitution turns on the answer, and nothing here
guesses at it.

**They are already in the server, unlinked.** Applications only carry people who
went through the join form, so anybody who joined before member verification, or
was invited straight in, has a Discord account and a Members row that have never
met. Nothing else on the page reaches them, so **Discord accounts nobody is
linked to** suggests the pairing where one row and one account share a name.

Exact on the normalised name, and never fuzzy. `nearName` exists to withhold a
create, not to propose a link: writing a snowflake onto the wrong row moves that
person's whole contribution history onto somebody else, and a suggestion a tired
officer clicks through is not meaningfully safer than an automatic link. Where
two rows could be one account, or two accounts one row, nothing is offered.

### Notion truncates a relation at 25

A relation inside any page object — a `pages/{id}` read and a data source query
alike — carries at most 25 entries, with `has_more` the only sign there are
more. A general body meeting is thirty people.

Read for standing, the twenty-sixth onward were never counted. Read before a
write, they were merged against and deleted: the kiosk sends the whole attendee
list, the merge preserved what it could see, and what it could not see went. The
back half of a room disappeared on the next tap, silently.

Both paths follow the **retrieve a page property item** endpoint when Notion says
there is more, and only then, so an ordinary meeting costs no extra request.

### TerpLink stays manual

It answers one question, once a year, and the club is far past the threshold it
gates. A CSV of names and emails out of the standing page is the whole
integration.

## Consequences

**HareWare acquires a coordination tool, and ADR 0006's inventory is out of
date.** That document's decision section listed no sign-in, no database and no
application; 0007 and 0009 already retired those, and this retires "the reminder
bot is the whole product." What survives 0006 intact is its actual argument —
the tracker stays hand-maintained and unread by software — and this design does
not touch the tracker except to read publication dates that WordPress and Notion
already agree on.

**Notion holds every record that matters.** Attendance is a relation on a
Meeting page, mirrored onto the member as `Attendance`; identity is a `Members` row. If HareWare is deleted tomorrow, the
club opens Notion and counts by hand, exactly as it does today, which is ADR
0001's test and the reason the alternative below was rejected.

**The application sync is an Automation like any other.** It is an entry in the
same registry the two reminders live in, so it appears on `/admin/automations`
with a description and a button, and every run lands in the invocation log —
which is the rule for anything on the hourly cron: if it runs unattended, the
club can see that it ran. It is the first automation that posts nothing, so
`channelId` on the registry entry becomes optional.

**One thing in the design is still maintained by a person**, and it is
`Status`. Everything else is a fact about something that happened.

**The 51 applications are worth backfilling once.** They are clean, they carry
emails and Discord IDs that nothing else has, and they populate the merge key
that makes future kiosk entries resolve themselves.

**The roughly 200 members who predate the form are not backfilled**, and mostly
should not be. Anyone still active acquires a row the first time they attend a
meeting or take a byline; anyone who is not active is an alum the club does not
need a record of.

**Attendance before the kiosk exists is not recoverable.** The whiteboard
photographs stay photographs. Nobody is going to transcribe them, and the first
election this serves is the first one after the kiosk ships.

**A generic table already exists.** `~/components/data-table.tsx` is TanStack
Table with sorting, search, faceted filters, column visibility and pagination,
and its header says it was built so the next thing worth listing would not need
a second one. Every surface here is a table, so CSV export is added to that
component once and all of them inherit it.

**The club's constitution becomes executable, and that cuts both ways.** Writing
the rule down as thresholds makes it consistent and auditable, and it also
means a disagreement about what the constitution means becomes a disagreement
about a number in a form. That is an improvement, but the form must remain
editable by the people who own the rule, which is why the thresholds are inputs
rather than constants.

## Alternatives considered

### D1 as the person store, with Notion mirroring for bylines

The nicer engineering. Attendance is a join table, queries are cheap and
correct, and Notion's three-requests-per-second budget stops mattering.

Rejected on ADR 0007's rule that nothing in D1 is authoritative, which this
would break for election-grade records. The deeper reason is ADR 0006's: every
maintainer graduates. A Notion row can be read and repaired by whoever inherits
the club; a D1 row cannot be reached without this repository and someone who
understands it. If attendance writes ever genuinely hurt, the answer is a cache
in front of Notion, not a move of the record.

### Two databases — applicants and contributors

Considered first, because it maps exactly onto the measured near-disjointness of
the two populations. Rejected because that disjointness is a historical
accident, not a distinction about people, and it would give one human two rows
and two meanings.

### Attendance typed into the Notion Meeting page directly

Zero code: share the page, let the room fill in the `Attendees` relation.

Rejected because Notion's relation picker offers to create a new page for
anything it does not match, so every typo becomes a person, silently — which is
precisely the failure that denies someone their vote. It also cannot require an
email and needs edit access to the workspace handed to a room of people.

### A public kiosk URL gated by a per-meeting token

Designed and dropped. The meeting reminder already posts to the board channel on
the morning of a meeting and could carry the link, which was elegant. It is also
a public route, a token to generate, and a spoofing surface on an input to
elections, in exchange for not walking a laptop to the front of the room. An
officer's already-authenticated session is simpler and strictly safer.

### `/here <code>` in Discord

Attendance keyed by Discord ID with no matching problem, no hardware, and the
slash-command infrastructure from ADR 0009 already in place.

Rejected because it only reaches people who have Discord open at the meeting,
misses exactly the first-time attendee this design most needs to capture, and is
spoofable by anyone who can see the projector.
