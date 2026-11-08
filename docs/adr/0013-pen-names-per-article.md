# 13. A pen name is answered on its article

**Status:** Accepted — 2026-11-08. Replaces the every-article rows of ADR 0011.

## Context

ADR 0011 let one Sheet row say a byline counts as a person on every article
that prints it, so a recurring pen name would be entered once. Pages grew around
that: adding a pen name to a person, handing one over when a series changed
writers, keeping published articles with the first writer, and two people
sharing one byline at once.

Filling the Sheet once from the old Notion tracker showed what pen names
actually are. From September 2025 to November 2026, 45 credits on 34 articles
used 33 pen names for 16 people. 31 of the 33 appear on one article; two appear
again, one on eight articles and one on two. One person used ten different pen
names in eleven credits. A pen name is usually part of one article's joke, not
an identity.

Several pen names look like ordinary names: a first name alone, or a famous
athlete's. A rule that one of them means a person on every article would
quietly claim anyone who later prints the same name, and nothing would show it.

## Decision

**Every Overrides row names an article.** A row says who a byline is on that
article, in one role or any, or adds someone the article does not print. It
never reaches another article. An article with no row is credited as printed.

**Reuse is suggested, never applied.** When an article prints a byline that was
someone on earlier articles, its panel offers that person as a one-click
answer, or "Not a pen name here" for a real person of the same name, and
Problems lists the article as "Pen name used before" until someone says. A
series that changes hands needs nothing special: each part has its own row.

**A new pen name is found by someone who knows.** A one-off pen name looks like
a new contributor, so HareWare cannot tell them apart. Problems lists names
first credited in the last 30 days, which is where to look.

**Old every-article rows stop counting.** A row with no post id is read apart:
it credits no one, but its name is still offered on the articles printing the
byline, and Problems says such rows exist. Settings shows the articles it would
fill (those printing the byline with no row of their own for it), sets it on
them in the roles they print it, or removes it; both can be undone.

## Considered

- **Keeping every-article rows as an option.** It saves one click per article
  for the few who reuse a pen name, and keeps the hand-over logic, the byline
  panel and the ambiguity about common names for everyone else.
- **Applying a pen name's history automatically** when every earlier use agrees.
  That is an every-article row with no row to look at, and it re-credits a
  series that changed hands to the first writer without saying so.
- **ADR 0011 rejected flagging every one-off name.** The New names list is a
  narrow version of that flag: thirty days holds a handful, needs no answer,
  and empties on its own.

## Consequences

- Eight articles under one reused pen name are eight rows. Settings pastes many
  at once in the Sheet's own columns, notes included.
- The Sheet holds only facts someone confirmed for a particular article.
- New rows always name a role. A row for any role, typed by hand or left by the
  old pages, is split into the article's other roles when one role is saved.
