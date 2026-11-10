# Dependency updates

Dependabot checks npm weekly on Monday at 09:00 America/New_York, and GitHub
Actions monthly. npm version updates have an eight-PR limit; GitHub Actions
has five. Security updates have their own GitHub limit and are not included in
these version-only groups. Enable Dependabot security updates in the repository
settings to receive automatic security-fix PRs; alerts alone do not enable them.

## What can merge automatically

Only minor and patch updates in the explicit `routine` npm group are eligible:
linting, Prettier, test tools, and the small `clsx` helper. The allow-list is in `.github/dependabot.yml`.
The framework, Cloudflare deployment/runtime, React, UI libraries, Vite and
database tooling remain manual. The current pre-1.0 packages, formatting
plugins and Node types are also outside the automatic group. Node types
currently target 26 while CI runs Node 24; align those deliberately rather
than automatically widening the available type surface. All major updates, GitHub Actions updates,
maintainer changes and unknown metadata remain manual too. Do not add a package
to `routine` just because it is a development dependency: build tools and
migrations can affect production.

The workflow is **off until explicitly enabled**. It reads verified Dependabot
metadata, checks that only `package.json` and `package-lock.json` changed, and
requests `gh pr merge --auto --squash` for the expected head commit. It neither
approves PRs nor bypasses protection. A grouped PR's highest version change must
be minor or patch, so a major cannot hide among smaller bumps.

`pull_request_target` supplies the base branch's trusted workflow and the token
permissions needed to request auto-merge. It must never check out the PR, install
its dependencies, or execute its code. The only external action is pinned to a
commit, with its author and signed-commit verification left enabled. The job is
restricted to this repository, a Dependabot actor and author, a same-repository
head, and non-draft PRs targeting main.

## Required settings before opting in

1. Settings → General → Pull Requests: **Allow auto-merge** must be enabled
   (already enabled at the v3 audit). Squash merging must remain available.
2. Settings → Branches → main protection: retain required **Verify** and
   **Workers Builds: hareware**, and enable **Require branches to be up to date
   before merging**. The audit found that last option disabled. Select GitHub
   Actions as Verify's expected source; Workers Builds is already bound to the
   Cloudflare app. Keep conversation resolution required. This workflow uses
   ordinary protected merges, not administrator bypass.
3. Settings → Security → Advanced Security: keep Dependabot alerts enabled and
   enable **Dependabot security updates** (disabled at the audit). Security PRs
   stay manual unless they independently satisfy the routine-group policy.
4. After the config is merged and protection is correct, Settings → Secrets and
   variables → Actions → Variables: set repository variable
   **DEPENDABOT_AUTO_MERGE** to **true**. Delete it or set it to false to stop
   new automatic requests. Previously enabled requests must be disabled on the
   affected PRs separately.

No personal token or Actions approval permission is needed. The job requests
`contents: write` and `pull-requests: write` only; it does not approve reviews.
If required approving reviews are added later, they still need to be satisfied.
The workflow takes effect only once present on main; the config PR cannot test
its own privileged trigger. A later eligible Dependabot PR is the first live
verification. Changing the opt-in variable does not itself trigger a run; a
subsequent Dependabot open, reopen or update does.

## What CI proves, and its limits

Verify runs `npm ci` (including generated Worker types), Astro type checking,
ESLint, the ordinary test suite, and formatting on PRs and pushes to main.
Workers Builds separately runs the production build and deploys a branch
Preview, including for Dependabot PRs. Both are required before merging.

A successful build does not exercise Discord OAuth, Sheet concurrency, Jetpack
availability, real reminder delivery or the appearance of exported graphics.
Previews also share the real Sheet and log with production. Framework, UI,
runtime and deployment changes need an appropriate preview check; never send a
live reminder as a routine dependency test. SemVer and passing CI reduce risk
but do not detect every regression or malicious package release. Updates to the
test toolchain can change what the tests catch, which is another reason to keep
the auto-merge group small.

The built-in `GITHUB_TOKEN` does not trigger downstream GitHub Actions on its
own merge push. The PR's required checks must already pass; Cloudflare's external
GitHub integration remains the deployment pipeline. If deployment is moved into
GitHub Actions, revisit the token/trigger design before relying on this flow.

Dependabot rebases normally, but stops automatic rebasing after a PR has been
open for 30 days. Old green checks are not proof against today's main: request a
fresh rebase and checks, or replace the obsolete PR. Do not merge overlapping
React/framework groups independently without checking what each still changes.

Sources: [GitHub's Dependabot automation guide](https://docs.github.com/en/code-security/tutorials/secure-your-dependencies/automate-dependabot-with-actions),
[Dependabot options](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference),
and [GitHub token event behavior](https://docs.github.com/en/actions/how-tos/writing-workflows/choosing-when-your-workflow-runs/triggering-a-workflow).
