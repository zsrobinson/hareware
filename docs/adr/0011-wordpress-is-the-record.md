# 11. WordPress is the record; the Sheet holds only what it cannot

**Status:** Accepted — 2026-11-07. Revised the same day: HareWare writes the
Sheet and people are counted in contributions; folded in below. How a pen name
is recorded was changed by ADR 0013, the open panel's address by ADR 0014,
and the Sheet holds the board's views too since ADR 0015.

Supersedes ADRs 0001, 0002, 0004, 0006, 0009 and 0010, which were deleted with
the code they described; they are in the history before this commit.

## Context

HareWare spent two months as an extension of a Notion tracker: Notion held every
Article, its Status, its credits and the roster, and HareWare read and wrote it
from Discord commands and membership pages. The tracker drifted anyway. Every
"Scheduled" row was already live, two dozen "Approved" rows from the semester
were stale, and Image Status was barely used. The writing process never
mentions Notion, so the tracker was an after-the-fact copy that only editors
kept up, and only some of the time.

Meanwhile the questions people actually ask — how did articles split across
sections this year, who wrote or drew what last semester — are about published
work, and everything about published work is already in WordPress: title, body,
date, section, and the printed byline and image credit as text in the body.

## Decision

**WordPress is the record of what the club published.** HareWare reads it live
from the public REST API and keeps no copy on the server; a reader's browser
keeps its read up to a day (ADR 0012). There is no sync and no database of
articles.

**Credits are read from the post itself.** The byline and image credit are
paragraphs with a label and a colon. 417 of 418 posts follow that, and the
parser handles co-authors, "as told to" and "translated by". Spelling drift is
fixed in WordPress, not with an alias table.

**A Google Sheet holds the one fact WordPress lacks**: who is really behind a
pen name, one row per article (ADR 0013). An article with no rows is credited
as printed. The Sheet also holds the credit labels, so a new label
("Puzzle by") needs no deploy, and the problems someone decided are fine.

**HareWare writes the Sheet, and nobody needs to open it.** Every correction
is made from the signed-in pages; a save rewrites only the rows it means to.
The Sheet is owned by the club's account and reached by a service account; the
mapping never reaches WordPress, the repository, the log or a public page.
A real name may sit in a signed-in page's address (`?people=`, `?open=`):
those links and the files the pages download are for the board, and stay
inside it.

**People are counted in contributions**: one person in one role on one
article. The editors settled that writing and illustrating an article is two
contributions, and it is the only count of people the pages offer.

**Notion is not a concept here.** The membership pages, `/article`, and the
meeting reminder went with it. The club may keep using Notion by hand; nothing
here reads it.

**D1 stays for the invocation log only**, as ADR 0007 set out. It is not for
domain data.

**The Sheet also holds the board's views of the archive** (ADR 0015). They
are not a copy of anything WordPress has, so the rule above stands: no
record of an article is kept anywhere but WordPress.

## Considered

- **Custom taxonomies or Co-Authors Plus for credits.** Most bylines are one-off
  joke names, and the printed byline is part of the joke, so it stays text
  either way. The real-person mapping must stay private, so it lives off-site
  regardless. Co-Authors Plus has also exposed guest-author emails through a
  public REST endpoint before.
- **Recording every credit in the Sheet.** That is a copy of WordPress, and the
  thing that rotted in Notion. Overrides only.
- **Two counts of people**, credits and articles credited on. They disagreed
  about whether writing and illustrating is one or two; the editors chose two,
  and one count avoids explaining the difference.
- **Flagging every name that appears once as a possible pseudonym.** Sixty-five
  names appear once, most of them real one-time contributors or deliberate
  jokes. A flag that fires sixty-five times is ignored. The People page can hide
  one-off names instead.
- **WordPress "Update Services" pings as the reminder's trigger.** They carry
  only the site name, likely do not fire for edits, and fail silently. The
  reminder asks WordPress what published since the previous run.

## Consequences

- A post whose credit line is malformed is counted wrong until someone fixes the
  post. The Problems page lists them with an edit link, which is the point: the
  fix belongs in WordPress, where readers see it too.
- Answering a question costs five WordPress requests at most every ten minutes.
  WordPress.com throttles quick bursts, so they are made one at a time and
  retried on 429.
- Without the Sheet, everything still works and pseudonyms count as their own
  people. A Sheet that cannot be read says so on every page rather than looking
  like a Sheet with no rows.
