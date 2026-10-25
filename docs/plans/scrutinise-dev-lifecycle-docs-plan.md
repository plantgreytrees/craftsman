---
slug: scrutinise-dev-lifecycle-docs-plan
goal: The approval flow, ledger guards, gate lookup and doc budgets from the slim-Craftsman plan hold up under an isolated review.
level: feature
parent: dev-lifecycle-docs-plan
priority: P1
classification: in-scope # /scrutinise rounds 1 (630b4de..80719a8), 2 (630b4de..a72e66a) 3 (630b4de..9a9fee0) 4 (630b4de..f317620) and 16 (630b4de..90cb828) of dev-lifecycle-docs-plan, every finding verified by root
tracker_rows: []
guards:
  blast_radius: done
  completeness_sweep: done
  blind_rederivation: skipped(config:never)
coverage:
  contract:      fix-gate-lookup | fix-approval-record | fix-publish-trust # CONSUMERS block
  data:          fix-approval-record | fix-sync-guard # approval record history, ledger-keys
  config:        fix-gate-lookup | fix-approval-record | fix-budget-growth # marker null, prLines from config, budget caps
  security:      fix-approval-scan | fix-land-race | fix-publish-trust # scan the approved head, no check-then-use race, publish needs a landed record
  tests:         every unit has a red-first test task
  observability: fix-land-race | fix-publish-trust | fix-stats-and-prose # approval_unenforced, tracker_publish_unapproved, time-to-approve
  interface:     fix-publish-trust | fix-stats-and-prose # protocol wording in _features.md, sync-docs.md, auto.md
  docs:          fix-gate-lookup | fix-publish-trust | fix-stats-and-prose # EXTENDING.md, _features.md, sync-docs.md, auto.md
  rollback:      every unit is one commit; revert it
units:
  - id: fix-gate-lookup
    scope_id: fix-gate-lookup
    project: .
    depends_on: []
    module: scripts/lib/gate-command.mjs
    language: javascript
    security: normal
    scope:
      read: [scripts/repo-exec.mjs, scripts/snapshot.mjs, scripts/doc-checks.mjs, scripts/doc-checks.test.mjs, scripts/tool-slots.test.mjs, EXTENDING.md]
      docs: [docs/architecture/engine.rules.md, docs/architecture/landing.rules.md]
      write: [scripts/lib/gate-command.mjs, scripts/lib/gate-command.test.mjs, scripts/repo-exec.mjs, scripts/snapshot.mjs, scripts/doc-checks.mjs, scripts/doc-checks.test.mjs, scripts/tool-slots.test.mjs, EXTENDING.md]
    arch: [ARCH-ENGINE-20, ARCH-LAND-25]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [arch-check], mcp: [] }
  - id: fix-approval-record
    scope_id: fix-approval-record
    project: .
    depends_on: []
    module: scripts/approval.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/approval.mjs, scripts/approval.test.mjs, scripts/lib/approval-page.mjs, scripts/lib/approval-page.test.mjs, scripts/lib/approval-gate.mjs]
      docs: [docs/architecture/approval.rules.md]
      write: [scripts/approval.mjs, scripts/approval.test.mjs, scripts/lib/approval-page.mjs, scripts/lib/approval-page.test.mjs, scripts/lib/approval-gate.mjs]
    arch: [ARCH-APPROVAL-03, ARCH-APPROVAL-04, ARCH-APPROVAL-06]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [], guards: [arch-check], mcp: [] }
  - id: fix-approval-scan
    scope_id: fix-approval-scan
    project: .
    depends_on: [fix-approval-record]
    module: scripts/approval.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/approval.mjs, scripts/approval.test.mjs, scripts/secrets-scan.mjs, scripts/doc-checks.mjs]
      docs: [docs/architecture/approval.rules.md, docs/architecture/engine.rules.md]
      write: [scripts/approval.mjs, scripts/approval.test.mjs]
    arch: [ARCH-APPROVAL-01, ARCH-APPROVAL-02, ARCH-ENGINE-20]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [], guards: [arch-check], mcp: [] }
  - id: fix-land-race
    scope_id: fix-land-race
    project: .
    depends_on: [fix-gate-lookup, fix-approval-scan]
    module: scripts/repo-exec.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/repo-exec.mjs, scripts/approval.mjs, scripts/lib/approval-gate.mjs, scripts/repo-exec-approval.test.mjs]
      docs: [docs/architecture/landing.rules.md, docs/architecture/approval.rules.md]
      write: [scripts/repo-exec.mjs, scripts/lib/approval-gate.mjs, scripts/repo-exec-approval.test.mjs]
    arch: [ARCH-LAND-22, ARCH-LAND-25, ARCH-LAND-27, ARCH-APPROVAL-04]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [], guards: [arch-check], mcp: [] }
  - id: fix-publish-trust
    scope_id: fix-publish-trust
    project: .
    depends_on: []
    module: scripts/tracker-publish.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/tracker-publish.mjs, scripts/tracker-publish.test.mjs, commands/_features.md, commands/sync-docs.md, scripts/approval-protocol.test.mjs]
      docs: [docs/architecture/tracker.rules.md, docs/architecture/landing.rules.md, docs/architecture/engine.rules.md, docs/architecture/docs.rules.md, docs/architecture/slim.rules.md]
      write: [scripts/tracker-publish.mjs, scripts/tracker-publish.test.mjs, commands/_features.md, commands/sync-docs.md, scripts/approval-protocol.test.mjs]
    arch: [ARCH-LAND-24, ARCH-LAND-22, ARCH-TRACKER-13, ARCH-ENGINE-13, ARCH-DOCS-14, ARCH-SLIM-02]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [], guards: [arch-check], mcp: [] }
  - id: fix-sync-guard
    scope_id: fix-sync-guard
    project: .
    depends_on: [fix-publish-trust]
    module: scripts/tracker.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/tracker.mjs, scripts/tracker-publish.mjs, scripts/tracker.test.mjs, scripts/tracker-publish.test.mjs]
      docs: [docs/architecture/tracker.rules.md]
      write: [scripts/tracker.mjs, scripts/tracker-publish.mjs, scripts/lib/ledger-keys.mjs, scripts/tracker.test.mjs, scripts/tracker-publish.test.mjs]
    arch: [ARCH-TRACKER-13, ARCH-TRACKER-02, ARCH-TRACKER-11]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [], guards: [arch-check], mcp: [] }
  - id: fix-budget-growth
    scope_id: fix-budget-growth
    project: .
    depends_on: []
    module: scripts/arch-check.mjs
    language: javascript
    security: normal
    scope:
      read: [scripts/arch-check.mjs, scripts/arch-check.test.mjs, craftsman.config.json]
      docs: [docs/architecture/docs.rules.md]
      write: [scripts/arch-check.mjs, scripts/arch-check.test.mjs]
    arch: [ARCH-DOCS-10, ARCH-DOCS-03]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [arch-check], mcp: [] }
  - id: fix-stats-and-prose
    scope_id: fix-stats-and-prose
    project: .
    depends_on: [fix-publish-trust]
    module: scripts/stats.mjs
    language: javascript
    security: normal
    scope:
      read: [scripts/stats.mjs, scripts/stats.test.mjs, commands/auto.md, scripts/auto-command.test.mjs, scripts/approval-protocol.test.mjs]
      docs: [docs/architecture/mod.rules.md, docs/architecture/approval.rules.md, docs/architecture/auto.rules.md, docs/architecture/slim.rules.md]
      write: [scripts/stats.mjs, scripts/stats.test.mjs, commands/auto.md]
    arch: [ARCH-APPROVAL-06, ARCH-MOD-03, ARCH-AUTO-09, ARCH-SLIM-02, ARCH-LAND-22]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [arch-check], mcp: [] }
  - id: fix-approval-hardening
    scope_id: fix-approval-hardening
    project: .
    depends_on: []
    module: scripts/approval.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/approval.mjs, scripts/approval.test.mjs, scripts/lib/approval-gate.mjs]
      docs: [docs/architecture/approval.rules.md, docs/architecture/engine.rules.md]
      write: [scripts/approval.mjs, scripts/approval.test.mjs]
    arch: [ARCH-APPROVAL-01, ARCH-APPROVAL-03, ARCH-ENGINE-20]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [], guards: [arch-check], mcp: [] }
  - id: fix-publish-single-use
    scope_id: fix-publish-single-use
    project: .
    depends_on: [fix-approval-hardening]
    module: scripts/tracker-publish.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/tracker-publish.mjs, scripts/tracker-publish.test.mjs, scripts/approval.mjs, scripts/approval.test.mjs, scripts/repo-exec-approval.test.mjs, commands/_approval.md, scripts/approval-protocol.test.mjs]
      docs: [docs/architecture/tracker.rules.md, docs/architecture/landing.rules.md, docs/architecture/approval.rules.md, docs/architecture/engine.rules.md, docs/architecture/docs.rules.md, docs/architecture/slim.rules.md]
      write: [scripts/tracker-publish.mjs, scripts/tracker-publish.test.mjs, scripts/approval.mjs, scripts/approval.test.mjs, scripts/repo-exec-approval.test.mjs, commands/_approval.md, scripts/approval-protocol.test.mjs]
    arch: [ARCH-LAND-24, ARCH-LAND-22, ARCH-TRACKER-13, ARCH-APPROVAL-01, ARCH-APPROVAL-04, ARCH-ENGINE-13, ARCH-ENGINE-20, ARCH-DOCS-14, ARCH-SLIM-02]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [], guards: [arch-check], mcp: [] }
  - id: fix-merge-retire
    scope_id: fix-merge-retire
    project: .
    depends_on: []
    module: scripts/repo-exec.mjs
    language: javascript
    security: normal
    scope:
      read: [scripts/repo-exec.mjs, scripts/lib/approval-gate.mjs, scripts/doc-retire.mjs]
      docs: [docs/architecture/landing.rules.md, docs/architecture/approval.rules.md, docs/architecture/docs.rules.md]
      write: [scripts/repo-exec.mjs, scripts/lib/approval-gate.mjs, scripts/repo-exec-retire.test.mjs, scripts/repo-exec-approval.test.mjs]
    arch: [ARCH-LAND-26, ARCH-LAND-25, ARCH-APPROVAL-04, ARCH-DOCS-09]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [arch-check], mcp: [] }
  - id: fix-publish-cli
    scope_id: fix-publish-cli
    project: .
    depends_on: []
    module: scripts/tracker.mjs
    language: javascript
    security: normal
    scope:
      read: [scripts/tracker.mjs, scripts/tracker.test.mjs]
      docs: [docs/architecture/tracker.rules.md, docs/architecture/landing.rules.md]
      write: [scripts/tracker.mjs, scripts/tracker-publish-cli.test.mjs]
    arch: [ARCH-TRACKER-11, ARCH-LAND-24]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [arch-check], mcp: [] }
  - id: fix-publish-atomic
    scope_id: fix-publish-atomic
    project: .
    depends_on: []
    module: scripts/tracker-publish.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/tracker-publish.mjs, scripts/tracker-publish.test.mjs, scripts/lib/ledger-keys.mjs, scripts/approval.mjs]
      docs: [docs/architecture/tracker.rules.md, docs/architecture/landing.rules.md, docs/architecture/engine.rules.md, docs/architecture/docs.rules.md]
      write: [scripts/tracker-publish.mjs, scripts/tracker-publish.test.mjs, scripts/lib/ledger-keys.mjs]
    arch: [ARCH-LAND-24, ARCH-TRACKER-13, ARCH-ENGINE-13, ARCH-ENGINE-20, ARCH-DOCS-14]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [], guards: [arch-check], mcp: [] }
  - id: fix-approval-reprepare
    scope_id: fix-approval-reprepare
    project: .
    depends_on: []
    module: scripts/approval.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/approval.mjs, scripts/approval.test.mjs, scripts/lib/approval-gate.mjs, scripts/repo-exec-approval.test.mjs]
      docs: [docs/architecture/approval.rules.md, docs/architecture/engine.rules.md, docs/architecture/landing.rules.md]
      write: [scripts/approval.mjs, scripts/approval.test.mjs, scripts/lib/approval-gate.mjs, scripts/repo-exec-approval.test.mjs]
    arch: [ARCH-APPROVAL-03, ARCH-APPROVAL-04, ARCH-ENGINE-20, ARCH-LAND-27]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [], guards: [arch-check], mcp: [] }
  - id: fix-cli-contract
    scope_id: fix-cli-contract
    project: .
    depends_on: []
    module: scripts/tracker.mjs
    language: javascript
    security: normal
    scope:
      read: [scripts/tracker.mjs, scripts/tracker-publish.mjs, scripts/tracker-publish.test.mjs, scripts/tracker-publish-cli.test.mjs, scripts/approval.mjs, scripts/approval.test.mjs]
      docs: [docs/architecture/tracker.rules.md, docs/architecture/landing.rules.md, docs/architecture/approval.rules.md, docs/architecture/engine.rules.md, docs/architecture/docs.rules.md]
      write: [scripts/tracker.mjs, scripts/tracker-publish.mjs, scripts/tracker-publish.test.mjs, scripts/tracker-publish-cli.test.mjs, scripts/approval.mjs, scripts/approval.test.mjs]
    arch: [ARCH-TRACKER-11, ARCH-LAND-24, ARCH-APPROVAL-03, ARCH-ENGINE-13, ARCH-ENGINE-20, ARCH-DOCS-14]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [arch-check], mcp: [] }
  - id: fix-approval-fallback
    scope_id: fix-approval-fallback
    project: .
    depends_on: []
    module: scripts/approval.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/approval.mjs, scripts/approval.test.mjs, scripts/approval-protocol.test.mjs, commands/_approval.md]
      docs: [docs/architecture/approval.rules.md]
      write: [scripts/approval.mjs, scripts/approval.test.mjs, scripts/approval-protocol.test.mjs, commands/_approval.md]
    arch: [ARCH-APPROVAL-04, ARCH-APPROVAL-07]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [], guards: [arch-check], mcp: [] }
  - id: fix-approval-record-protect
    scope_id: fix-approval-record-protect
    project: .
    depends_on: []
    module: scripts/lib/self-protect.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/lib/self-protect.mjs, scripts/lib/self-protect.test.mjs, scripts/pre-guard.test.mjs]
      docs: [docs/architecture/approval.rules.md, docs/architecture/safety.rules.md]
      write: [scripts/lib/self-protect.mjs, scripts/lib/self-protect.test.mjs, scripts/pre-guard.test.mjs]
    arch: [ARCH-APPROVAL-04, ARCH-SAFETY-05]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [], guards: [arch-check], mcp: [] }
---

# Plan: Fix round 1 for the slim-Craftsman programme

## Outcome
The gate lookup, approval record, approval scan, landing race, publish trust, sync guard, doc budgets and the approval metrics and prose match their rules and the findings of the isolated review.

## Scope Steps (executable core)
Findings come from `/scrutinise` round 1 of `docs/plans/dev-lifecycle-docs-plan.md` (range `630b4de..80719a8`). The serial order below avoids two units editing one file at once.

### Step 1 — fix-gate-lookup (., javascript, normal)
Tooling: implementer implementer · gates code-reviewer · guards arch-check
Depends on: none
- [ ] 1.1 Add `scripts/lib/gate-command.test.mjs` first: a deepMerge'd project config that declares only `package.json` plus a justfile with no …
- [ ] 1.2 Implement the pure `findGateCommand(worktree, cfg, {onPath, justTargets})` in `scripts/lib/gate-command.mjs` and use it from …
- [ ] 1.3 Make `scripts/tool-slots.test.mjs` call the real function with a deepMerge'd config instead of its mirror
- [ ] 1.4 `doc-checks.mjs` `onPath` resolves a binary path containing `/` against the spawn `cwd` (`path.resolve(cwd, bin)`)
- [ ] 1.5 `EXTENDING.md` says a project drops the marker by setting it to `null`, and that now works

### Step 2 — fix-approval-record (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor · guards arch-check
Depends on: none
- [ ] 2.1 `prepare` reads `repoExec.approval.prLines` from `loadConfig(projectContext(root))` and passes it to `recommend`
- [ ] 2.2 `prepare` takes `plan` and `feature`, sets `run = runIdFor(plan, feature)`, refuses an `input.run` that differs, and stores `feature` in …
- [ ] 2.3 `prepare` refuses a `landed` record and moves an earlier decision into `history[]` instead of resetting it silently
- [ ] 2.4 `check` requires `Date.parse(row.decided_at) >= Date.parse(record.requested_at)`
- [ ] 2.5 `prepare` and `check` read-modify-write under a lock (`withLock`)
- [ ] 2.6 Export `CHOICES` once from `scripts/lib/approval-page.mjs` and import it in `approval.mjs` and `approval-gate.mjs`
- [ ] 2.7 `RISKY` gains `.circleci/`, `Jenkinsfile`, `azure-pipelines.yml`, `bitbucket-pipelines.yml`

### Step 3 — fix-approval-scan (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor · guards arch-check
Depends on: fix-approval-record
- [ ] 3.1 Add a test first where a secret exists only on the feature branch (committed there, absent from the main checkout) and `prepare` refuses
- [ ] 3.2 `prepare` creates a detached temp worktree at `input.head_sha`, runs `cfg.security.check` there with the built-in `scanTree` as fallback, …
- [ ] 3.3 Run `scanContent` over the rendered Markdown and HTML text and refuse on any hit, listing file:line:rule only

### Step 4 — fix-land-race (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor · guards arch-check
Depends on: fix-gate-lookup, fix-approval-scan
- [ ] 4.1 Add a race test first: the feature head moves between the approval check and the lock, and the landing must not merge the new commit
- [ ] 4.2 In `landFeature` take the feature lock before `gateFeature`; create the temp worktree with `worktree add --detach <temp> <gate.head>`; in …
- [ ] 4.3 Log `approval_unenforced` from `merge()` once per merge when `repoExec.approval.required` is true and `planning.featureBranches` is off; …
- [ ] 4.4 Add tests: an approved `open-pr` choice routes to the PR path and records `landed_mode: "open-pr"`; the approved choice overrides …

### Step 5 — fix-publish-trust (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor · guards arch-check
Depends on: none
- [ ] 5.1 Add refusal tests first: `on-approve` with `approved:true` but no run, or a run whose record is not `landed`, does not publish; …
- [ ] 5.2 `publishTracker` in `on-approve` mode publishes only for a `landed` record named by `input.run`, or `input.manual === true`; log …
- [ ] 5.3 Reword `commands/_features.md` publish line to "after a land-feature that returned merged or pushed (not parked) pass `{approved:true, …
- [ ] 5.4 `commands/sync-docs.md` tells `/sync-docs --tracker` to run `tracker.mjs publish` with `{manual:true}` after the owner confirms, within its …
- [ ] 5.5 `scripts/approval-protocol.test.mjs` asserts the corrected wording

### Step 6 — fix-sync-guard (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor · guards arch-check
Depends on: fix-publish-trust
- [ ] 6.1 Add a 50-committed vs 5-local test for `syncTrackerDoc` first
- [ ] 6.2 Move `committedKeys` and `archivedPlans` into `scripts/lib/ledger-keys.mjs`, used by `tracker-publish.mjs` and `syncTrackerDoc`; keep …
- [ ] 6.3 The existing publish guard tests stay green after the move

### Step 7 — fix-budget-growth (., javascript, normal)
Tooling: implementer implementer · gates code-reviewer · guards arch-check
Depends on: none
- [ ] 7.1 Add tests first: a 10 KB plan grown to 11 KB under a 60 KB budget passes lint; a 70 KB plan that grows fails; a 70 KB plan that shrinks …
- [ ] 7.2 Cap an existing file at its merge-base size only when that size already exceeds the default; otherwise allow growth up to the default; keep …

### Step 8 — fix-stats-and-prose (., javascript, normal)
Tooling: implementer implementer · gates code-reviewer · guards arch-check
Depends on: fix-publish-trust
- [ ] 8.1 Add `approvalSection(events)` to `stats.mjs`: pairs `approval_requested` with `approval_decided` by run and reports count, p50 and p95 …
- [ ] 8.2 Rewrite the "Git authority" paragraph of `commands/auto.md` to ARCH-LAND-22/23 wording at no more bytes than today, keeping every phrase …

### Step 9 — fix-approval-hardening (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor · guards arch-check
Depends on: none
- [ ] 9.1 Add tests first: `prepare` refuses a `head_sha` that is not a 40-hex commit (a branch name, a short sha, `--force`); `landed` and …
- [ ] 9.2 `prepare` requires `head_sha` to match `^[0-9a-f]{40}$` and resolves it with `git rev-parse --verify <sha>^{commit}` before it is stored or …
- [ ] 9.3 `landed` and `attachUrl` run their read-modify-write under `withLock`; `prepare` catches a busy lock and returns `refuse(message)`
- [ ] 9.4 `prepare` keeps the scanned Markdown in the record and `fallback` writes that text, never caller text

### Step 10 — fix-publish-single-use (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor · guards arch-check
Depends on: fix-approval-hardening
- [ ] 10.1 Add tests first: a second publish with the same `run` is refused; `archived:true` in the input no longer excuses a shrink; …
- [ ] 10.2 `approval.mjs` exports `markPublished(run)` (under the lock, sets `published_at`); `runLanded` in `tracker-publish.mjs` requires `status: …
- [ ] 10.3 Remove the caller-set `archived` input from `render` and the `allArchived` parameter of `droppedKeys` call site; the existing …
- [ ] 10.4 With `approvalRequired(cfg)` a configured `push` mode takes the `on-approve` path; log `tracker_publish_manual` for `manual:true` so the …
- [ ] 10.5 `commands/_approval.md` step 5 names `tracker.mjs` publish with `{approved:true, run}`; `approval-protocol.test.mjs` asserts it and fails …

### Step 11 — fix-merge-retire (., javascript, normal)
Tooling: implementer implementer · gates code-reviewer · guards arch-check
Depends on: none
- [ ] 11.1 Add a test first in a new `scripts/repo-exec-retire.test.mjs` (small; copy the setup helper idea from `repo-exec-approval.test.mjs`, do …
- [ ] 11.2 After promotion `merge()` runs the same non-mutating retire check `landFeature` uses (reuse the `approval-gate.mjs` helper; keep …
- [ ] 11.3 Strengthen the open-pr landing test in `repo-exec-approval.test.mjs`: assert `parked !== true` before reading `landed_mode`

### Step 12 — fix-publish-cli (., javascript, normal)
Tooling: implementer implementer · gates code-reviewer · guards arch-check
Depends on: none
- [ ] 12.1 Add `scripts/tracker-publish-cli.test.mjs` first: spawn `node scripts/tracker.mjs` with `{"action":"publish"}` on stdin in a scratch git …
- [ ] 12.2 In `scripts/tracker.mjs` replace the top-level `await (await import("./tracker-publish.mjs"))` in the `publish` branch so `tracker.mjs` …

### Step 13 — fix-publish-atomic (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor · guards arch-check
Depends on: none
- [ ] 13.1 Add tests first: two on-approve publishes with the same `run` where the first lands during the second's lock wait leave the second …
- [ ] 13.2 Re-run `runLanded` after the base lock is taken; call `markPublished` on the `unchanged` return too (approved, non-manual); log …
- [ ] 13.3 Default `tracker.publish` to `on-approve` when the key is absent (ARCH-LAND-24); delete the dead `allArchived` parameter of `droppedKeys`

### Step 14 — fix-approval-reprepare (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor · guards arch-check
Depends on: none
- [ ] 14.1 Add tests first: after an approved open-pr landing (record `landed`, `landed_mode: "open-pr"`) `prepare` for the same run succeeds and …
- [ ] 14.2 `prepare` supersedes a `landed` record whose `landed_mode` is `open-pr` (history entry, new `requested` record) and refuses only a …
- [ ] 14.3 Remove `landed` from the CLI `ACTIONS` (repo-exec reaches it through the module); `afterLand` logs `approval_landed_refused {run, reason}` …

### Step 15 — fix-cli-contract (., javascript, normal)
Tooling: implementer implementer · gates code-reviewer · guards arch-check
Depends on: none
- [ ] 15.1 Add tests first in `scripts/tracker-publish-cli.test.mjs`: `tracker.mjs lookup` for an unknown plan prints exactly `null` and exits 0; the …
- [ ] 15.2 In `scripts/tracker.mjs` print the result unless the action is `publish` (which prints for itself), so a `null` result is printed
- [ ] 15.3 `tracker-publish.mjs` returns `refused: "token spent"` and logs `tracker_publish_token_spent {run}` when the lock re-check finds the token …
- [ ] 15.4 `approval.mjs` `prepare` keeps `landed_sha`, `landed_mode` and `published_at` in the `history[]` entry it writes when it supersedes a …

### Step 16 — fix-approval-fallback (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor · guards arch-check
Depends on: none
- [ ] 16.1 Add tests first in `scripts/approval.test.mjs`: a round trip `prepare` → `fallback().options[i]` → `check` with `{row:{choice:<label>, head_sha}, source:"fallback", writer_is_owner:true}` records `decided` with the routed choice (`merge` or `open-pr`); the same call without `source:"fallback"` is refused; a stale db row with no `decided_at` and no `source` is still refused → accept: red before the change
- [ ] 16.2 `scripts/approval.mjs` `check` maps the labels in `QUESTION.options` to `merge` / `open-pr` and stamps `decided_at` only when `source === "fallback"`; the stale-row check stands for every other caller → accept: 16.1 green
- [ ] 16.3 `commands/_approval.md` step 6 names that exact call, byte-neutral within its cap (2130); `scripts/approval-protocol.test.mjs` asserts the wording → accept: protocol and doc-size tests green

### Step 17 — fix-approval-record-protect (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor · guards arch-check
Depends on: none
- [ ] 17.1 Add tests first (`scripts/lib/self-protect.test.mjs`, `scripts/pre-guard.test.mjs`): a Write/Edit and a shell redirect onto `.craftsman/approvals/x.json` are denied; `node scripts/approval.mjs` and `repo-exec.mjs` (their own processes) are not → accept: red before the change
- [ ] 17.2 `SELF_NEVER` in `scripts/lib/self-protect.mjs` gains `.craftsman/approvals/**` with a one-line reason → accept: 17.1 green, full suite green, unit-context budget green

## Sequencing
Independent now: fix-gate-lookup, fix-approval-record, fix-publish-trust, fix-budget-growth. Then fix-approval-scan (after record), fix-sync-guard and fix-stats-and-prose (after publish-trust), and fix-land-race last (after gate-lookup and approval-scan) because it shares `repo-exec.mjs` and `approval-gate.mjs`.

Round 2 sequencing: fix-approval-hardening and fix-merge-retire are independent; fix-publish-single-use follows fix-approval-hardening because both edit `approval.mjs`.

Round 3 units (fix-publish-cli, fix-publish-atomic, fix-approval-reprepare) touch disjoint files and run in parallel.

Round 4 adds one unit, fix-cli-contract; it has no dependencies.

Round 16 adds fix-approval-fallback and fix-approval-record-protect; their files are disjoint, so they run in parallel.

## Verification background   (citations — for the reviewer, not the executor)
- `findGateCommand` takes the first existing marker in map order and `loadConfig` deep-merges defaults first — `scripts/repo-exec.mjs:315-326`, `scripts/lib/core.mjs:573-581`
- `prepare` passes `prLines: input.prLines` — `scripts/approval.mjs:58`
- `gateFeature` reads the feature head before the feature lock — `scripts/repo-exec.mjs:599-603`
- `on-approve` accepts a caller-set flag — `scripts/tracker-publish.mjs:109`
- `syncTrackerDoc` has no dropped-key guard — `scripts/tracker.mjs` (`syncTrackerDoc`)
- `lintBudgets` recomputes an existing file's cap from the merge-base every run — `scripts/arch-check.mjs:291`
- Reproduced by root: a project declaring only `package.json: npm test` still resolves `just check`; one appended line to `docs/plans/dev-lifecycle-docs-plan.md` fails lint
- Round 2: `runLanded` accepts any landed record and never consumes it — `scripts/tracker-publish.mjs:65`; `input.archived` disables the dropped-key guard — `scripts/tracker-publish.mjs:33`; `merge()` has no retire check — `scripts/repo-exec.mjs` (`merge`); `commands/_approval.md:13` documents `{approved:true}` without `run`; `head_sha` is stored unvalidated — `scripts/approval.mjs:96`
- Round 3: `tracker.mjs publish` exits 13 (unsettled top-level await: `tracker-publish.mjs` imports `tracker.mjs` while it is still evaluating) — `scripts/tracker.mjs:558`, reproduced by root; `prepare` refuses a `landed` record, and an open-pr landing marks it `landed` at once — `scripts/approval.mjs:133`, `scripts/lib/approval-gate.mjs:61-63`; `runLanded` is checked before the base lock — `scripts/tracker-publish.mjs:69,101`
- Round 4: `if (output)` hides the `null` that `lookupArchive` returns on a miss, so `tracker.mjs lookup` prints nothing — `scripts/tracker.mjs:557`, reproduced by root; the callers that need `null` are `commands/auto.md`, `commands/orchestrate.md`, `commands/instruction.md`
- Round 16: `fallback()` offers the labels `Merge now` / `Open PR`, but `check` takes only `merge` / `open-pr` and requires `row.decided_at` — `scripts/approval.mjs:16,168-171`, `commands/_approval.md:15`; `.craftsman/approvals/**` is not in `SELF_NEVER`, so a tool write forges the record `gateFeature` and `runLanded` trust — `scripts/lib/self-protect.mjs:17-25`, `scripts/lib/approval-gate.mjs:284`

CONSUMERS:
- `findGateCommand` → `scripts/repo-exec.mjs` (merge gate), `scripts/snapshot.mjs`, `scripts/tool-slots.test.mjs`
- `approval.mjs` actions → `scripts/lib/approval-gate.mjs` (record shape), `commands/_approval.md` (argument names; unchanged), `scripts/session-context.mjs` (`pending`)
- `publishTracker` → `scripts/tracker.mjs` publish action, `scripts/repo-exec.mjs`, `commands/_features.md`, `commands/sync-docs.md`
- `committedKeys` / `archivedPlans` → `scripts/tracker-publish.mjs`, `scripts/tracker.mjs` after the move
- `lintBudgets` → `arch-check lint` only
- Round 2: `runLanded` / `publishTracker` → `commands/_approval.md` step 5, `commands/_features.md`, `scripts/approval-protocol.test.mjs`; `markPublished` is new in `scripts/approval.mjs`

## Risk & rollback
- Each unit is one commit; revert it. fix-land-race touches the landing path: run `scripts/repo-exec.test.mjs` and `scripts/repo-exec-approval.test.mjs` before and after.
- fix-budget-growth changes a decided rule's behaviour (ARCH-DOCS-10 text says an existing file's cap is its size); the rule is refined in the following `/architect --update` so the text matches the code.

## Decisions
- **Follow-ups are ledger rows only, not units:** `profile-knobs` (PARKED on PR #1, needs `scripts/lib/core.mjs`), `approval-owner-trust`, `telemetry-baseline-marker`, `lease-glob-anchoring`, `workspace-key-collision` (PENDING, not driven).
- **Criteria reopened by the review** (unticked in `.craftsman/acceptance.md`): `[unit:ledger-guard]` 1.2 → fix-sync-guard; `[unit:land-gate]` 16.1, 16.4 → fix-publish-trust, fix-land-race; `[unit:docs-budgets]` 9.1 and `[unit:profile-and-release]` 18.1 → profile-knobs.

- **Round 2 (`/scrutinise`, range 630b4de..a72e66a):** criteria `[unit:ledger-guard]` 1.2 (the `archived:true` bypass) and `[unit:land-gate]` 16.4 (single-use publish token) are reopened and map to fix-publish-single-use. `manual:true` on publish stays an agent-asserted flag like `writer_is_owner`; it now logs `tracker_publish_manual` and is part of the `approval-owner-trust` follow-up.
- **Round 2 follow-ups, ledger rows only:** `ledger-parser-dedupe` (one block parser for `committedKeys` and `parseBlockRows`, one `loadRecord` for approval records, one PATH lookup), `budget-ratchet-keys` (a deleted budget key or `enforce:false` on the branch escapes the merge-base ratchet), `lease-doc-claim` (auto.md names `--force-with-lease` before the guard is wired).

- **Round 3 (`/scrutinise`, range 630b4de..9a9fee0):** `[unit:land-gate]` 16.4 stays open until fix-publish-cli lands (the documented publish entry point deadlocked). Round-3 follow-ups, ledger rows only: `approval-scan-config-source` (the scan's `security.check` comes from the feature worktree config), `offline-landed-record` (an offline land-feature marks the record landed while the push is only queued), `approval-lock-stale-race` (two waiters can both break a stale lock).

- **Round 16 (`/scrutinise`, range 630b4de..90cb828):** two Warnings (fallback round trip, forged approval record) become fix-approval-fallback and fix-approval-record-protect; `approval-owner-trust` keeps only the agent-asserted `writer_is_owner`. Suggestions are ledger rows, not driven: `budget-key-removal`, `approval-prepare-derive-diff`, `approval-lock-break-race`, `approval-json-quoting`, `approval-loadrecord-dedupe`, `ledger-parse-dedupe2`, `onpath-dedupe`, `events-jsonl-protect`.

## Out of scope
- Wiring the lease exception, guard narrowing, the TDD step and the plugin `userConfig` knobs (all wait for PR #1); the telemetry marker, lease glob anchoring and the workspace key collision (follow-ups above).
