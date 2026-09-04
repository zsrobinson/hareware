# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v`; `gh` does this automatically when run inside a clone.

## Issue relationships

Parent/child and blocking relationships live in GitHub's own graph, not in issue bodies.

- **Sub-issue**: `gh api --method POST repos/<owner>/<repo>/issues/<parent>/sub_issues -F sub_issue_id=<child-db-id>`
- **Blocking**: `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`

Both take the issue's numeric **database id** (`gh api repos/<owner>/<repo>/issues/<n> --jq .id`), never the `#number` or `node_id`. GitHub reports open blockers as `issue_dependencies_summary.blocked_by`, which is the live gate: a ticket is unblocked once every blocker is closed.

Issue bodies therefore run straight from what to build into acceptance criteria. Where a skill's template carries `## Parent` or `## Blocked by` sections — those exist for trackers with no native support — wire the relationship and leave the sections out, so each fact has one home.

Naming another issue in prose stays welcome where it explains _why_ two tickets relate. The graph records that they relate; it cannot record why.

## Recording a design change

A ticket's design changes while it is open. Where the change gets written is
decided by who else needs to know, never by what is convenient at the time.

- **Only this ticket is affected** — edit the **issue body**. The acceptance
  criteria are the contract an agent reads via `gh issue view`; a correction
  living only in a comment leaves the criteria stating something false. Change
  the body, then comment with the reasoning. GitHub keeps the body's edit
  history, so nothing is lost.
- **Dependent tickets are affected** — write an **ADR** under `docs/adr/`, then
  cite it from the body of every affected issue. `docs/agents/domain.md` already
  requires every skill to read the relevant ADRs before exploring, which makes
  `docs/adr/` the one surface downstream readers are guaranteed to reach. The
  issue graph records _that_ two tickets relate; it cannot carry a decision
  between them.
- **What a word means changed** — `CONTEXT.md`, same reasoning.

**Not the pull request.** A PR records how something was built, not what was
decided, and an agent picking up a dependent ticket reads that ticket's body and
the ADRs — never a merged PR from a ticket upstream of it. A decision that
exists only in a PR description is effectively deleted on merge. The PR
_carries_ the ADR, in the same commit as the code honouring it; it is not the
place the decision lives.

Name the dependent issue numbers in that PR's description. GitHub drops a
cross-reference into each of their timelines, so a downstream ticket visibly
gains "the design moved, here is where" without anyone tracking it by hand.

## Finding work

`is:blocked` is dependency-aware in issue search, though GitHub's search-qualifier documentation omits it. The frontier — everything startable right now — is:

```sh
gh issue list --search 'is:open has:parent-issue -is:blocked'
```

`has:parent-issue` drops the parent issues, which are never work in themselves. Narrow with `label:ready-for-agent no:assignee` for unclaimed agent work, or `label:ready-for-human` for work needing judgement.

`blocked-by:<n>` and `parent-issue:<n>` both parse and silently return nothing. Only the `has:`, `no:` and `is:` forms are live.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

When set to `yes`, PRs run through the same labels and states as issues, using the `gh pr` equivalents:

- **Read a PR**: `gh pr view <number> --comments` and `gh pr diff <number>` for the diff.
- **List external PRs for triage**: `gh pr list --state open --json number,title,body,labels,author,authorAssociation,comments` then keep only `authorAssociation` of `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR`, or `NONE` (drop `OWNER`/`MEMBER`/`COLLABORATOR`).
- **Comment / label / close**: `gh pr comment`, `gh pr edit --add-label`/`--remove-label`, `gh pr close`.

GitHub shares one number space across issues and PRs, so a bare `#42` may be either: resolve with `gh pr view 42` and fall back to `gh issue view 42`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. `gh issue create --label wayfinder:map`.
- **Child ticket**: an issue linked to the map as a GitHub sub-issue (`gh api` on the sub-issues endpoint). Where sub-issues aren't enabled, add the child to a task list in the map body and put `Part of #<map>` at the top of the child body. Labels: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: GitHub's native issue dependencies — see **Issue relationships** above for the call and the database-id gotcha. A ticket is unblocked when every blocker is closed.
- **Frontier query**: list the map's open children (`gh issue list --state open`, scoped to the map's sub-issues / task list), drop any with an open blocker (`issue_dependencies_summary.blocked_by > 0`, or an open issue in the `Blocked by` line) or an assignee; first in map order wins.
- **Claim**: `gh issue edit <n> --add-assignee @me`, the session's first write.
- **Resolve**: `gh issue comment <n> --body "<answer>"`, then `gh issue close <n>`, then append a context pointer (gist + link) to the map's Decisions-so-far.
