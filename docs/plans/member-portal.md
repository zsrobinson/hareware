# Member Portal implementation plan

Build the private `/profile` experience described by
[ADR 0011](../adr/0011-a-member-portal-without-impersonation.md). This document
is the feature contract and execution order; the ADR owns the identity and
authorization decisions.

## Member experience

`/profile` admits any signed-in Discord guild member and sends a signed-out
visitor through Discord sign-in with `/profile` as the return destination. A
Discord outage, an absent guild member, a missing Notion token and an ambiguous
Discord-to-Member link are distinct visible outcomes. Every response carrying
Member data sets `Cache-Control: private, no-store`.

The page has one quiet header and a page-wide activity range. With no range
parameters it shows all time. Presets write concrete inclusive Eastern dates to
`from=YYYY-MM-DD&to=YYYY-MM-DD`: the current January–June or July–December
semester, the July–June academic year, and the past twelve months. A custom
range writes the same parameters. Invalid or inverted dates fall back visibly
rather than producing plausible zeroes.

Two cards fill the activity area:

- **Contributions** counts and lists published Notion Articles in range,
  distinguishing writing from image work. It shows the Notion headline and
  publication date without a WordPress link. A person credited for both kinds
  on one Article sees both contributions.
- **Attendance** counts and lists Meetings in range, distinguishing General
  Body meetings, Volunteer Events and Editorial Board meetings. All are facts
  the Member may inspect even though Editorial Board attendance does not count
  toward Standing.

The cards show unavailable data as an error rather than an empty list. An empty
bounded range offers to show all time. A small keyboard- and touch-accessible
help affordance says to ask an editor when history is wrong. The page presents
activity, never a Standing preset or eligibility verdict.

## Identity lifecycle

Resolve a signed-in person by exact Discord id:

1. One Member row opens the portal.
2. No row opens a confirmation form prefilled from the Discord display name.
   Real name, email and a live Notion Status option are required. Confirmation
   creates a Member with the immutable signed-in Discord id.
3. More than one row stops with an explanation to ask an editor.

Before creation, run the existing pure matching rules. A similar or duplicate
name produces a calm warning without exposing another Member's email or
activity and without preventing creation. A linked Member appearing between
the initial read and confirmation wins over creating another row.

The identity card exposes separate edit affordances for real name, email,
Status and Discord nickname. Each opens a focused dialog following the
`/attendance` pattern. The first three write Notion; nickname writes Discord
with the bot's `MANAGE_NICKNAMES` permission and reports role-hierarchy refusal
without affecting Notion. Discord id is never editable.

Each write re-resolves its target and permission server-side. Self-service
targets the unique Member linked to the session Discord id; an Editorial Board
member may explicitly target the Member they are inspecting. Every successful
or failed write produces a `roster-edit` Invocation carrying the actual
signed-in actor, and every successful UI action produces a toast.

## Editor inspection

An Editorial Board member sees a compact Member picker near the `/profile`
heading. It is visually secondary and absent for regular members. Selecting a
Member writes `member=<notion-page-id>` while preserving the activity range.
Regular members cannot use that parameter.

Inspection renders the same identity and activity UI, including the same edit
dialogs and help affordance. No impersonation banner, editor-only repair links
or alternate controls change the selected Member's presentation. Authorization
and logging still identify the editor.

## Sidebar

Move account actions out of the footer. Beside the HareWare mark and title,
place the existing overflow menu. Between the brand row and navigation groups,
show exactly one account action:

- signed out: a compact purple **Sign in with Discord** button;
- signed in: a regular profile link showing the Discord identity and leading
  to `/profile`.

Below it, render **Public tools** for everyone and **Admin tools** only for an
Editorial Board member. The collapsed rail and mobile sheet preserve the same
information hierarchy. Cached public pages still resolve account and admin
navigation client-side without placing personalized markup in shared HTML.

## Reconciler

Add an informational section for Member names whose normalized Notion name and
current Discord display name differ. Decorative nicknames are intentionally
included. The section is a review surface, not a task list: it has no persisted
acknowledgement, does not affect admission or Standing, and uses the same guild
profiles and name normalization already used by Member matching.

On `/profile`, show a small possible-duplicate message only when the existing
`duplicates(people)` result contains that Member. The portal defines no second
duplicate rule.

## Module seams

Deepen the Member domain behind two interfaces before building presentation:

- A profile read accepts the authenticated actor plus optional editor-selected
  Member and date range, then returns a discriminated view: ready, unlinked,
  ambiguous or unavailable. It owns the concurrent Notion reads, exact
  identity resolution, range filtering and duplicate warning.
- A profile mutation accepts authenticated intent rather than a trusted target.
  It resolves self versus editor inspection, performs one Notion or Discord
  write, and records the Invocation. Route files translate HTTP only.

Reuse `Person`, `MeetingRecord`, `ContributionRecord`, `duplicates`, the Notion
adapter and Discord adapter. Extend those interfaces where the Member Portal
needs information instead of introducing parallel row shapes or remote calls
inside UI modules.

Keep query state in the existing React Query provider. Give profile data one
key derived from selected Member and date range; serialize writes per Member.
On success, install the mutation response in the cache before invalidating any
broader roster reads. An older in-flight response must never overwrite a newer
mutation result, and one field's refresh must not revert another queued field.

## Execution order

1. **Pin behavior with domain tests.** Cover identity resolution, ambiguous
   ids, creation races, inclusive ranges, contribution roles, all Meeting
   types, duplicate warnings and actor/subject authorization.
2. **Build the deep Member interfaces.** Add the read and mutation interfaces,
   extending Notion and Discord adapters only for protocol details. Route tests
   prove that browser-supplied targets cannot cross the authorization rule.
3. **Build `/profile`.** Add server rendering, creation state, two activity
   cards, URL-backed range controls, focused edit dialogs, errors, empty states,
   help affordances, toasts and race-safe query behavior.
4. **Add editor inspection and Reconciler names.** Reuse the same profile view
   and pure matching logic, then test the regular-member refusal path.
5. **Reshape navigation.** Move account actions into the header area and make
   Admin tools role-aware on server-rendered and cached pages without leaking a
   viewer into cached HTML.
6. **Verify end to end.** Run generated binding types where needed, focused
   tests throughout, then Astro checking, lint, the complete test suite and
   formatting. Exercise responsive and keyboard behavior in the browser.

Steps 3–5 may proceed in parallel after step 2 fixes the interfaces. Each owns
its files; integration happens only after its focused tests pass.

## Acceptance criteria

- A signed-out `/profile` visit returns to `/profile` after Discord sign-in.
- A guild member with one linked Member sees only that Member unless they hold
  Editorial Board.
- A member with no link can review and create a complete Member despite a
  similar-name warning; a concurrent link does not create a duplicate.
- Multiple rows with the session Discord id stop and ask for an editor.
- Regular members cannot select or mutate another Member by changing a URL or
  request body.
- Editors can select and edit another Member while every Invocation names the
  editor as actor.
- All-time and bounded inclusive ranges drive every count and both lists from
  the URL; invalid ranges cannot masquerade as no activity.
- Only Articles with a Publication Date appear, with separate writing and image
  contributions and no WordPress dependency.
- Attendance displays all recorded Meeting types without presenting Standing.
- Profile fields edit in separate dialogs; Discord id cannot be edited.
- A Discord nickname failure leaves Notion state untouched and explains the
  Discord permission failure.
- Duplicate and name-mismatch notices reuse existing pure matching behavior and
  never become blocking work.
- Successful writes toast once and remain visible after refresh, navigation,
  queued edits and out-of-order responses.
- Member data and personalized navigation are private and never enter cached
  public HTML.
- The sidebar matches the agreed signed-out, signed-in, public and admin states
  in expanded, collapsed and mobile layouts.
- `npx astro check`, `npm run lint`, `npm test`, and `npm run format:check` pass.
