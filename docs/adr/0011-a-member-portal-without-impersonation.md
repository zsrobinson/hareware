# 11. A Member Portal without impersonation

**Status:** Accepted — 2026-09-08

Amends [ADR 0006](0006-hareware-is-a-reminder-bot.md),
[ADR 0008](0008-sessions-with-nothing-stored.md), and
[ADR 0010](0010-standing-is-computed.md).

## Context

Discord sign-in already proves one useful identity: the Discord user behind a
request. Notion already holds one Member row per human, including their contact
details, Attendance and contributions. Restricting every signed-in page to the
Editorial Board leaves regular members unable to inspect or maintain the
record that is about them.

A member-facing surface creates two risks. Treating a selected Member as a new
session identity would make editor inspection indistinguishable from
impersonation. Letting a browser name the target of a self-service write would
let one member edit another. Copying Member data into D1 or the session would
also introduce a second roster whose identity and activity could drift from
Notion.

## Decision

**Every current member of the Discord server may use a private Member Portal.**
The session continues to hold only their Discord user id, and admission reads
their guild membership live as ADR 0008 requires. Their Member is the unique
Notion row carrying that Discord id.

When no row carries the signed-in id, the person may confirm a real name,
email and Status and create one. Similar names warn about a possible duplicate
but do not block creation: old members are the remaining audience for this
fallback, and the Reconciler already exists to combine records without asking
software to guess. More than one row carrying the signed-in id is ambiguous
and asks for an editor rather than choosing one.

Self-service writes derive the target Member from the signed-in Discord id on
the server. The browser never supplies an authoritative page id. Name, email
and Status may be corrected; Attendance and contributions are history and stay
read-only. A Discord nickname is a separate best-effort write to Discord, so a
permission failure cannot make a successful Notion write look unsuccessful.

An editor may inspect and edit another Member through an explicit Member id in
the `/profile` URL. That selection is request state, not session state: the
actor remains the signed-in editor in authorization and the Invocation log.
The inspected page uses the same presentation as self-service and grants no
ability to become the selected Member.

The portal reads published contribution and Attendance facts from Notion. It
does not copy them into D1, infer stored Standing, expose unpublished Article
planning data, or link Articles to WordPress. Every portal response is private
and non-cacheable.

## Consequences

Notion remains the one Member store, while Discord remains authoritative for
account identity, guild membership, roles, profile and nickname. D1 remains a
non-authoritative Invocation log.

Regular-member admission becomes distinct from admin admission. Both reuse one
live guild lookup, but only an Editorial Board role permits selecting somebody
else or using the existing admin tools.

Duplicate detection remains the pure rule already used by the Reconciler. A
duplicate warning is informational: it changes neither admission nor activity
counts, and an editor resolves the underlying rows in the existing workflow.
