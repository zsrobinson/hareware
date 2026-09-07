# Public calendar to Discord events

Exploration — 2026-09-06. This is a proposal, not an accepted design or a change
to the ADRs. No live calendars or Discord events were inspected or modified.

## Club context

The public Google Calendar and Discord Events should describe the same club
events. Notion's Meetings database also contains private editorial board
meetings, agendas and notes. The immediate problem is entering public events
twice, not replacing the meeting database.

The club has not settled which tool should own event entry. Google Calendar
currently lets members subscribe, and Discord displays events natively. The
user tentatively prefers Google if choosing one, while also considering Notion.

Other proposed improvements have lower priority after clarification: articles
consistently publish at 6am; export tools intentionally serve different roles;
magazine designers work on assigned spreads; newsletter copy-and-paste is
adequate; Notion already provides public resources for editors.

## Recommendation

Provisionally, make the existing public Google Calendar the place officers create and change
public events. HareWare periodically reconciles those events into Discord. Do
not read Notion for this automation. Start with timed, public events and a
bounded upcoming horizon, such as the next eight weeks, with a manual preview
and run available in the existing admin panel. The horizon and polling interval
are proposed defaults, not club requirements.

If officers prefer entering events in Notion, revisit the direction explicitly:
Notion would supply selected public events to both destinations. That needs a
positive public-event selection and an approved set of public fields; reading
the entire mixed Meetings database and filtering out board meetings by title
is not an adequate publication boundary.

This preserves [ADR 0001's](../adr/0001-notion-as-the-store.md) operational
continuity: officers can still use Google Calendar and Discord directly when
HareWare is unavailable. It also respects
[ADR 0006's](../adr/0006-hareware-is-a-reminder-bot.md) distinction between an
informal article planning record and information people act upon. Public event
times already belong to the latter category. However, automatic mirroring is a
new responsibility, and deserves a narrow ADR covering ownership, failure
visibility and recovery before implementation.

## Verified API capabilities

- Google supports API keys for anonymous public-data access; Calendar's event
  listing makes authorization optional. If the calendar's event details are
  actually public, a restricted Calendar API key avoids storing an officer's
  OAuth refresh token. A calendar containing public-facing events is not
  necessarily configured for public API access; verify that first.
  [Credentials](https://developers.google.com/workspace/guides/create-credentials),
  [event listing](https://developers.google.com/workspace/calendar/api/v3/reference/events/list).
- If it is not public, a service account can be explicitly shared onto the
  calendar with reader access. Google's Calendar codelab demonstrates sharing
  with a service-account email, and Calendar defines the reader role. This is
  separate from domain-wide impersonation. User OAuth with
  `calendar.events.readonly` is another option, with token ownership to hand over.
  [Calendar codelab](https://codelabs.developers.google.com/codelabs/chatbots-dialogflow-fulfillment/),
  [sharing](https://developers.google.com/workspace/calendar/api/concepts/sharing),
  [scopes](https://developers.google.com/workspace/calendar/api/auth).
- A full listing can expand recurring events with `singleEvents=true`, constrain
  a time window and paginate. Incremental synchronization adds persistent token
  management, prohibits `timeMin`/`timeMax` on incremental requests, and requires
  rebuilding after HTTP 410. For this small, moving horizon, begin with full
  reads. Fetch every page before reconciling.
  [Event listing](https://developers.google.com/workspace/calendar/api/v3/reference/events/list).
- Recurring instances have separate IDs; a series shares one `iCalUID`, so that
  alone is insufficient for matching. `recurringEventId` plus
  `originalStartTime` identifies an occurrence even after rescheduling.
  Cancelled exceptions can contain only identifying fields; deleted events
  eventually disappear from responses.
  [Events resource](https://developers.google.com/workspace/calendar/api/v3/reference/events),
  [recurrence](https://developers.google.com/workspace/calendar/api/guides/recurringevents).
- Google push channels require renewal and an HTTPS receiver. Polling avoids
  that maintenance and can recover by reading current state.
  [Push notifications](https://developers.google.com/workspace/calendar/api/guides/push).
- Discord supports listing, creating, updating and deleting scheduled events.
  In-person meetings use `EXTERNAL`: a location and end time are required, with
  no channel. Names and locations allow 100 characters, descriptions 1,000.
  The bot needs `CREATE_EVENTS` for its own events; modifying someone else's
  requires `MANAGE_EVENTS`. A server supports 100 scheduled or active events.
  Discord recurrence is restricted: applications cannot set its ending date or
  count. Prefer separate occurrences expanded by Google initially. Completed
  and cancelled statuses cannot be changed again.
  [Scheduled events API](https://docs.discord.com/developers/resources/guild-scheduled-event).

The developer API says external events start and finish automatically at their
scheduled times. Discord's support instructions instead discuss pressing Start
Event to notify interested members. Treat lifecycle and actual notifications as
separate behavior to verify in a test server; do not promise notifications from
successful event creation alone.
[API lifecycle](https://docs.discord.com/developers/resources/guild-scheduled-event#guild-scheduled-event-status-update-automation),
[Discord support](https://support.discord.com/hc/en-us/articles/4409494125719-Scheduled-Events).

## Identity and recovery

A title and date are editable; they cannot be the relationship between copies.
Each managed Discord event needs a recoverable reference to its Google calendar
and occurrence. A visible source link with an unambiguous source identity in the
description is a candidate, subject to testing its length and presentation.
Only events carrying a verified managed identity should be reconciled. Existing
manually created events need deliberate adoption or a cutover date, rather than
guessing matches or creating duplicates.

A D1 mapping can be a convenience only if deleting it allows recovery from the
two services without duplicate events or lost interest registrations. This is
the test imposed by [ADR 0007](../adr/0007-an-admin-panel-over-an-invocation-log.md).
[ADR 0009](../adr/0009-editor-commands-in-discord.md) now explicitly says D1
contains only the invocation log; adding even a reconstructible mapping changes
that documented scope. Listing Discord events and reconstructing matches each
run might eliminate the table altogether. Mapping recovery does not by itself
prevent concurrent creates: an overlapping manual run and cron, or a timed-out
create that actually succeeded, must not blindly create another copy.

Google's hidden extended properties could alternatively hold Discord IDs, but
writing them requires calendar write access and recurrence instances need
careful treatment. It also does not solve a crash between creating the Discord
event and saving its ID. This is not the first choice for an otherwise read-only
Google integration.
[Extended properties](https://developers.google.com/workspace/calendar/api/guides/extended-properties).

## Behavior to settle before building

- Google owns the mirrored title, time, location and public description.
  Changes in Discord would be overwritten on the next reconciliation. Explain
  that in the source link or event description, and provide a way to pause sync
  for manual outage recovery.
- Never translate a failed or partial calendar response into cancellations.
  Check an existing managed event's source directly before removing it: absence
  from a bounded window can mean it moved outside that window. Log permission
  loss and unreadable events separately from confirmed cancellations.
- Keep updates on the existing Discord event where possible; replacing it loses
  its identity and attached interest registrations. Decide how restored Google
  events and already-started Discord events should behave.
- Skip and report all-day events or missing times/locations until an explicit
  policy exists. Do not invent a meeting time. Exclude private or redacted
  entries even when the credential could read more. Copy only the public fields
  needed for the listing, without attendee lists or private Notion links.
- Validate recurrence exceptions, cancellations, timezone changes across DST,
  retries, lost local state, permission failures and actual notifications in a
  test server. Event posting has its own side effects; the reminder channel
  override does not isolate server-level scheduled events.

The first useful deliverable is a read-only preview comparing the public
calendar against Discord, showing proposed creations, edits, cancellations and
unresolved matches. That makes both the club workflow and the privacy boundary
reviewable before any automatic publishing is enabled.
