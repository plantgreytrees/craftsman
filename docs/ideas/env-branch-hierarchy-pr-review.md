---
slug: env-branch-hierarchy-pr-review
status: pursue-with-changes
verdict: pursue-with-changes
confidence: medium
depth: standard
isolation: isolated
created: 2026-10-23
updated: 2026-10-23
related: [docs/ideas/plugin-optimisation-recheck.md, docs/plans/pr-land-mode.md, docs/architecture/landing.rules.md, docs/ideas/dev-lifecycle-docs-plan.md (branch worktree-idea-dev-lifecycle-docs-plan), docs/architecture/approval.rules.md (same branch), docs/ideas/feature-branch-plans.md]
touches: [scripts/lib/land.mjs, scripts/repo-exec.mjs, commands/_approval.md (new, other branch), commands/scrutinise.md, agents/scrutineer.md, commands/merge.md, commands/auto.md, docs/architecture/landing.rules.md, docs/architecture/approval.rules.md (other branch), craftsman.config.json, EXTENDING.md, README.md, CHANGELOG.md]
---

# Idea: Environment-branch hierarchy and an independent PR-review step

## Proposal (neutral restatement)
**Problem.** Craftsman lands on one base branch per repo, inferred from `origin/HEAD`
or the current branch (`scripts/repo-exec.mjs:98-118`), by direct merge or, with
`repoExec.land: "pr"`, by opening a PR and asking the host to auto-merge
(`scripts/lib/land.mjs:1-6,176-195`, ARCH-LAND-12). It has no ordered set of
environment branches (development, staging, production) and no step that reviews a
PR and then hands the final merge to the owner.
**Claimed benefit.** Safer promotion to production and an independent review before
merge, starting with Gleam and possibly spreading.
**Who benefits.** The solo maintainer of Gleam (61 registered projects).
**Done.** Features land on a development branch through a reviewed PR; promotion
development → staging → production goes through reviewed PRs; craftsman refuses to
skip a level.
Two readings of "approves": a real host approval, or a craftsman-recorded verdict.

## Verdict
**PURSUE-WITH-CHANGES** (medium), as the smallest slice only. Defer the environment
hierarchy: Gleam has no staging environment (owner answer, 2026-10-23) and only `main`
deploys (`azure-pipelines-deploy.yml:35-38`), so extra branches would promote nothing.
Build the review step as a fresh-context `scrutineer` verdict comment on PRs opened
through the other session's approval page, with the owner's merge click as the gate
(owner answer: a verdict comment, not a host approval). **Deciding fact:** a same-account
host approval is impossible (GitHub bars authors approving their own PR) and Gleam's
private Free-plan repo returns 403 on branch protection and rulesets, so neither an
approval nor a level-skip rule could be enforced. **Most likely to flip it:** a real
staging deploy target plus GitHub Pro (enforceable protection).

| criterion | score 1–5 | evidence |
|---|---|---|
| value | 2 | no staging target, no recorded wrong-branch incident, `gh pr list --state all` is empty |
| system fit | 2 | review step duplicates `/scrutinise <range>` and the approval page; hierarchy fights single-base ARCH-LAND-12/18 |
| cost (5 = cheap) | 2 for the full idea, 4 for the slice | full idea touches landing, repo-exec, a new agent and 61 submodules |
| risk (5 = low) | 2 | false safety on an unprotected repo, branch drift, wrong-base inference |
| reversibility | 3 | config reverts cleanly; long-lived branches and habits do not |
| evidence strength | 3 | repo and API facts verified; branching-model evidence is secondary |

## Overlap & prior work
Searched: `docs/ideas/*`, `docs/plans/pr-land-mode.md`, `docs/architecture/landing.rules.md`,
`CHANGELOG.md`, the other session's branch, Gleam's CI and deploy files.
- **Extends** `docs/plans/pr-land-mode.md` (host adapters, `land.mjs`).
- **Overlaps** the other session's approval design: ARCH-APPROVAL-01..07 end `/auto` at a
  verification point and offer "Merge now" or "Open PR" to the owner, who lands only after a
  matching head SHA; its ARCH-LAND-22 supersedes ARCH-LAND-01, so `/auto` no longer has
  standing approval to land on base (origin/worktree-idea-dev-lifecycle-docs-plan,
  `landing.rules.md:11,31`). That branch has no environment-branch design.
- **Overlaps** `/scrutinise`, which already accepts a git range and runs the isolated
  `scrutineer` (`commands/scrutinise.md:3,16,22`, `agents/scrutineer.md`).
- **Sequencing:** `plugin-optimisation-recheck` puts the ledger fix and PR #1 first.

## System fit (whole project)
- **contract ripple:** `land.mjs` `openPullRequest` result would gain a review field; the base inference at `repo-exec.mjs:104-113` would have to choose among bases.
- **data:** the verdict is recorded with the approval run, not a new store.
- **config & flags:** a target map such as `repoExec.targets` would be needed only once a second environment exists.
- **security:** a same-token reviewer adds no identity separation; independence comes from a fresh context only.
- **tests:** `land.test.mjs` cases for the comment step; none for a hierarchy until it is built.
- **observability:** review verdicts belong in `approval_*` events (ARCH-APPROVAL-06).
- **UI:** the approval page's "Open PR" path (other branch).
- **docs:** landing and approval rules; a Gleam README note about `develop`.
- **Second-order:** three PRs per change for one maintainer invites rubber-stamping; 61 submodules multiply pointer bumps (ARCH-LAND-03) by the number of levels.

## Research
- GitLab Flow's environment-branch model: staging → pre-production → production, commits flow
  downstream only (https://archives.docs.gitlab.com/15.8/ee/topics/gitlab_flow.html; archived
  docs and mirrors, current page not retrieved).
- GitHub: a PR author cannot approve their own PR; only write-access approvals count
  (https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/approving-a-pull-request-with-required-reviews).
- Gleam on GitHub: private, owner type User, `branches/main/protection` and `rulesets` both
  return HTTP 403 "Upgrade to GitHub Pro", `allow_auto_merge=false`, no PRs ever opened (live
  API, 2026-10-23). Auto-merge needs the repo setting and usually protection
  (https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/incorporating-changes-from-a-pull-request/automatically-merging-a-pull-request);
  `openPullRequest` already treats a refusal as non-fatal (`land.mjs:188-194`).
- Anthropic's `code-review` plugin posts a PR comment only with `--comment`, does not approve
  or merge (https://github.com/anthropics/claude-code/tree/main/plugins/code-review).
  `pr-review-toolkit` is known from secondary sources only.
- Environment required reviewers are public-repo-only below Enterprise (https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments, plus a community thread; secondary).
- Git Flow vs trunk-based: long-lived branches drift and delay integration (mergify.com and
  flagsmith.com blog posts; secondary, DORA reports not retrieved).

## Critique
- **Steelman.** Gleam is multi-tenant with real production risk (`DOCKER.md:37`); an
  autonomous session sits one manual Azure approval from prod. A review between "done" and
  `main` from a fresh context closes a real gap, and CI already names a `develop` branch.
- **Strongest case against.** The hierarchy cannot be enforced on Gleam and maps to no real
  environment; the review step already exists as `/scrutinise` plus the approval page.
- **Hidden assumptions.** A staging environment exists (owner: it does not). Accidental
  prod merges happen (test: search git log for reverts on `main`; none cited). The Azure
  pipeline is wired up (UNPROVEN). Same-account approval has value (test: `gh pr review
  --approve` on a throwaway PR; expect refusal).
- **Failure modes.** Drift between development and production; hotfixes that never flow
  back; several sessions promoting at once carrying unreviewed work; wrong-base inference
  sending a feature to prod; a craftsman-only skip rule bypassed by any direct push.
- **Kill criteria.** No staging target within the quarter → drop environment branches.
  ARCH-APPROVAL merges and covers "owner does the final merge" → drop the review step as a
  separate feature. Owner merges without reading the verdict for a month → drop posting it.
- **Cheaper alternatives.** Do nothing (the approval rules already remove `/auto`'s base
  authority). Tag or release promotion: `main` stays integration and prod deploys from a `v*`
  tag through the existing manual Azure stage. GitHub Pro for enforceable protection.
  Anthropic's `code-review --comment`. A config-only `repoExec.targets` map, later.

## Disputed
None. The critic's corrections stand: `develop` triggers are at
`build-multi-repo.yml:13,15`; Gleam's own config sets only `verifyTestsBeforeMerge`
(`craftsman.config.json:168-170`) and inherits `land: "direct"` from the plugin default.

## Recommendations
1. **Split the two halves.** Defer the environment hierarchy; reopen it on a staging target.
2. **Fold the review into the approval page's "Open PR" path** once that merges: run
   `/scrutinise <base>..<feature>` fresh, post the verdict with `gh pr comment`, never
   approve (the host would refuse). Gleam sets `repoExec.land: "pr"`.
3. **If production safety is urgent now,** make the Azure deploy tag- or release-triggered;
   it is cheaper and real.
4. **Fix Gleam's stale `develop`** in `build-multi-repo.yml:13,15` independently.
5. **Sequence after** the ledger fix, PR #1 and the approval-page merge.

## Open questions
- Answered 2026-10-23: no separate staging environment exists; "approve" means a review
  verdict comment with the owner's merge as the gate.
- Open: should tag-based prod promotion be designed now, ahead of the hierarchy?

## Next step
`/architect env-branch-hierarchy-pr-review` only for the review-comment slice, after the
approval page lands; otherwise nothing. Reopen the hierarchy when Gleam has a staging
deploy target and enforceable branch protection.
