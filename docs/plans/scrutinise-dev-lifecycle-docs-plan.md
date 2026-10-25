---
slug: scrutinise-dev-lifecycle-docs-plan
goal: The approval flow, ledger guards, gate lookup and doc budgets from the slim-Craftsman plan hold up under an isolated review.
level: feature
parent: dev-lifecycle-docs-plan
priority: P1
classification: in-scope # /scrutinise rounds 1 (630b4de..80719a8), 2 (630b4de..a72e66a) 3 (630b4de..9a9fee0) 4 (630b4de..f317620) 16 to 21 (630b4de..a875848) of dev-lifecycle-docs-plan, every finding verified by root
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
  - id: fix-helper-form
    scope_id: fix-helper-form
    project: .
    depends_on: []
    module: commands/_approval.md
    language: markdown + javascript
    security: high
    scope:
      read: [commands/_approval.md, commands/_network.md, agents/unit-runner.md, scripts/pre-guard.test.mjs, scripts/script-authority.test.mjs]
      docs: [docs/architecture/safety.rules.md, docs/architecture/approval.rules.md, docs/architecture/landing.rules.md, docs/architecture/engine.rules.md, docs/architecture/slim.rules.md]
      write: [commands/_approval.md, commands/_network.md, agents/unit-runner.md, scripts/pre-guard.test.mjs]
    arch: [ARCH-SAFETY-05, ARCH-APPROVAL-04, ARCH-LAND-25, ARCH-ENGINE-04, ARCH-ENGINE-21, ARCH-SLIM-02]
  - id: fix-scan-floor
    scope_id: fix-scan-floor
    project: .
    depends_on: []
    module: scripts/approval.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/approval.mjs, scripts/approval.test.mjs]
      docs: [docs/architecture/approval.rules.md]
      write: [scripts/approval.mjs, scripts/approval.test.mjs]
    arch: [ARCH-APPROVAL-08, ARCH-APPROVAL-04]
  - id: fix-claim-anchor
    scope_id: fix-claim-anchor
    project: .
    depends_on: []
    module: scripts/claim.mjs
    language: javascript
    security: normal
    scope:
      read: [scripts/claim.mjs, scripts/claim.test.mjs]
      docs: [docs/architecture/state.rules.md]
      write: [scripts/claim.mjs, scripts/claim.test.mjs]
    arch: [ARCH-STATE-03]
  - id: fix-claims-dir
    scope_id: fix-claims-dir
    project: .
    depends_on: []
    module: scripts/claim.mjs
    language: javascript
    security: normal
    scope:
      read: [scripts/claim.mjs, scripts/claim.test.mjs, scripts/account-switch.mjs, scripts/account-switch.test.mjs]
      docs: [docs/architecture/state.rules.md, docs/architecture/engine.rules.md]
      write: [scripts/claim.mjs, scripts/claim.test.mjs, scripts/account-switch.mjs, scripts/account-switch.test.mjs]
    arch: [ARCH-STATE-03, ARCH-ENGINE-23]
  - id: fix-merge-approval
    scope_id: fix-merge-approval
    project: .
    depends_on: []
    module: scripts/repo-exec.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/repo-exec.mjs, scripts/lib/approval-gate.mjs, scripts/repo-exec-approval.test.mjs]
      docs: [docs/architecture/landing.rules.md, docs/architecture/approval.rules.md]
      write: [scripts/repo-exec.mjs, scripts/lib/approval-gate.mjs, scripts/repo-exec-approval.test.mjs]
    arch: [ARCH-LAND-28, ARCH-APPROVAL-08]
  - id: fix-helper-root
    scope_id: fix-helper-root
    project: .
    depends_on: []
    module: agents/unit-runner.md
    language: markdown + javascript
    security: normal
    scope:
      read: [agents/unit-runner.md, scripts/lib/core.mjs, scripts/claim.test.mjs]
      docs: [docs/architecture/state.rules.md, docs/architecture/engine.rules.md, docs/architecture/slim.rules.md]
      write: [agents/unit-runner.md, scripts/claim.test.mjs]
    arch: [ARCH-STATE-03, ARCH-ENGINE-21, ARCH-SLIM-02]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [arch-check], mcp: [] }
  - id: fix-merge-gate-target
    scope_id: fix-merge-gate-target
    project: .
    depends_on: []
    module: scripts/lib/approval-gate.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/lib/approval-gate.mjs, scripts/repo-exec.mjs, scripts/repo-exec-approval.test.mjs, commands/merge.md]
      docs: [docs/architecture/landing.rules.md, docs/architecture/approval.rules.md, docs/architecture/tracker.rules.md, docs/architecture/engine.rules.md, docs/architecture/slim.rules.md]
      write: [scripts/lib/approval-gate.mjs, scripts/repo-exec.mjs, scripts/repo-exec-approval.test.mjs, commands/merge.md]
    arch: [ARCH-LAND-28, ARCH-LAND-16, ARCH-APPROVAL-08, ARCH-TRACKER-08, ARCH-ENGINE-13, ARCH-SLIM-02]
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
- [ ] 1.1 Add `scripts/lib/gate-command.test.mjs` …
- [ ] 1.2 Implement the pure …
- [ ] 1.3 Make `scripts/tool-slots.test.mjs` call …
- [ ] 1.4 `doc-checks.mjs` `onPath` resolves a …
- [ ] 1.5 `EXTENDING.md` says a project drops the …

### Step 2 — fix-approval-record (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor · guards arch-check
Depends on: none
- [ ] 2.1 `prepare` reads …
- [ ] 2.2 `prepare` takes `plan` and `feature`, …
- [ ] 2.3 `prepare` refuses a `landed` record and …
- [ ] 2.4 `check` requires …
- [ ] 2.5 `prepare` and `check` read-modify-write …
- [ ] 2.6 Export `CHOICES` once from …
- [ ] 2.7 `RISKY` gains `.circleci/`, …

### Step 3 — fix-approval-scan (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor · guards arch-check
Depends on: fix-approval-record
- [ ] 3.1 Add a test first where a secret exists …
- [ ] 3.2 `prepare` creates a detached temp …
- [ ] 3.3 Run `scanContent` over the rendered …

### Step 4 — fix-land-race (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor · guards arch-check
Depends on: fix-gate-lookup, fix-approval-scan
- [ ] 4.1 Add a race test first: the feature head …
- [ ] 4.2 In `landFeature` take the feature lock …
- [ ] 4.3 Log `approval_unenforced` from …
- [ ] 4.4 Add tests: an approved `open-pr` choice …

### Step 5 — fix-publish-trust (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor · guards arch-check
Depends on: none
- [ ] 5.1 Add refusal tests first: `on-approve` …
- [ ] 5.2 `publishTracker` in `on-approve` mode …
- [ ] 5.3 Reword `commands/_features.md` publish …
- [ ] 5.4 `commands/sync-docs.md` tells …
- [ ] 5.5 `scripts/approval-protocol.test.mjs` …

### Step 6 — fix-sync-guard (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor · guards arch-check
Depends on: fix-publish-trust
- [ ] 6.1 Add a 50-committed vs 5-local test for …
- [ ] 6.2 Move `committedKeys` and …
- [ ] 6.3 The existing publish guard tests stay …

### Step 7 — fix-budget-growth (., javascript, normal)
Tooling: implementer implementer · gates code-reviewer · guards arch-check
Depends on: none
- [ ] 7.1 Add tests first: a 10 KB plan grown to …
- [ ] 7.2 Cap an existing file at its merge-base …

### Step 8 — fix-stats-and-prose (., javascript, normal)
Tooling: implementer implementer · gates code-reviewer · guards arch-check
Depends on: fix-publish-trust
- [ ] 8.1 Add `approvalSection(events)` to …
- [ ] 8.2 Rewrite the "Git authority" paragraph …

### Step 9 — fix-approval-hardening (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor · guards arch-check
Depends on: none
- [ ] 9.1 Add tests first: `prepare` refuses a …
- [ ] 9.2 `prepare` requires `head_sha` to match …
- [ ] 9.3 `landed` and `attachUrl` run their …
- [ ] 9.4 `prepare` keeps the scanned Markdown in …

### Step 10 — fix-publish-single-use (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor · guards arch-check
Depends on: fix-approval-hardening
- [ ] 10.1 Add tests first: a second publish with …
- [ ] 10.2 `approval.mjs` exports …
- [ ] 10.3 Remove the caller-set `archived` input …
- [ ] 10.4 With `approvalRequired(cfg)` a …
- [ ] 10.5 `commands/_approval.md` step 5 names …

### Step 11 — fix-merge-retire (., javascript, normal)
Tooling: implementer implementer · gates code-reviewer · guards arch-check
Depends on: none
- [ ] 11.1 Add a test first in a new …
- [ ] 11.2 After promotion `merge()` runs the …
- [ ] 11.3 Strengthen the open-pr landing test in …

### Step 12 — fix-publish-cli (., javascript, normal)
Tooling: implementer implementer · gates code-reviewer · guards arch-check
Depends on: none
- [ ] 12.1 Add …
- [ ] 12.2 In `scripts/tracker.mjs` replace the …

### Step 13 — fix-publish-atomic (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor · guards arch-check
Depends on: none
- [ ] 13.1 Add tests first: two on-approve …
- [ ] 13.2 Re-run `runLanded` after the base lock …
- [ ] 13.3 Default `tracker.publish` to …

### Step 14 — fix-approval-reprepare (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor · guards arch-check
Depends on: none
- [ ] 14.1 Add tests first: after an approved …
- [ ] 14.2 `prepare` supersedes a `landed` record …
- [ ] 14.3 Remove `landed` from the CLI `ACTIONS` …

### Step 15 — fix-cli-contract (., javascript, normal)
Tooling: implementer implementer · gates code-reviewer · guards arch-check
Depends on: none
- [ ] 15.1 Add tests first in …
- [ ] 15.2 In `scripts/tracker.mjs` print the …
- [ ] 15.3 `tracker-publish.mjs` returns …
- [ ] 15.4 `approval.mjs` `prepare` keeps …

### Step 16 — fix-approval-fallback (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor · guards arch-check
Depends on: none
- [ ] 16.1 Add tests first in …
- [ ] 16.2 `scripts/approval.mjs` `check` maps …
- [ ] 16.3 `commands/_approval.md` step 6 names …

### Step 17 — fix-approval-record-protect (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor · guards arch-check
Depends on: none
- [ ] 17.1 Add tests first …
- [ ] 17.2 `SELF_NEVER` in …

### Step 18 — fix-helper-form (., markdown + javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor · guards arch-check
Depends on: none
- [ ] 18.1 Add tests first in …
- [ ] 18.2 Rewrite the three helpers without a …

### Step 19 — fix-scan-floor (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor · guards arch-check
Depends on: none
- [ ] 19.1 Add a test first in …
- [ ] 19.2 The `secrets` runner in …

### Step 20 — fix-claim-anchor (., javascript, normal)
Tooling: implementer implementer · gates code-reviewer · guards arch-check
Depends on: none
- [ ] 20.1 Add tests first in …
- [ ] 20.2 `claimPath` in `scripts/claim.mjs` …

### Step 21 — fix-claims-dir (., javascript, normal)
Tooling: implementer implementer · gates code-reviewer · guards arch-check
Depends on: none
- [ ] 21.1 Add tests first: an account-switch …
- [ ] 21.2 `scripts/claim.mjs` exports …

### Step 22 — fix-merge-approval (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor · guards arch-check
Depends on: none
- [ ] 22.1 Add tests first in …
- [ ] 22.2 `mergeOnly` in `scripts/repo-exec.mjs` …

### Step 23 — fix-helper-root (., markdown + javascript, normal)
Tooling: implementer implementer · gates code-reviewer · guards arch-check
Depends on: none
- [ ] 23.1 Add a test first: from a workspace …
- [ ] 23.2 The `S` helper in …

### Step 24 — fix-merge-gate-target (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor · guards arch-check
Depends on: none
- [ ] 24.1 Add tests first in `scripts/repo-exec-approval.test.mjs`: gate on, a direct `merge` with a `feature_branch` that is not the real target is refused and `main` and origin do not move; a docs-only merge (every path under `docs/plans/` or `docs/ideas/`) is allowed; a code merge without `feature_branch` is refused; a merge into a real feature branch is allowed and base is unchanged → accept: red before the change
- [ ] 24.2 `assertMergeAllowed` in `scripts/lib/approval-gate.mjs` allows a merge only when it truly targets `feature_branch`, or when it is docs-only; the error no longer offers `feature_branch`; `commands/merge.md` section 5 handles "approval required" (tell the owner, land through `land-feature`) within its `FILE_CAPS` entry; `repo-exec.mjs` grows under about 1 KB → accept: 24.1 and the unit-context test green

## Sequencing
Independent now: fix-gate-lookup, fix-approval-record, fix-publish-trust, fix-budget-growth. Then fix-approval-scan (after record), fix-sync-guard and fix-stats-and-prose (after publish-trust), and fix-land-race last (after gate-lookup and approval-scan) because it shares `repo-exec.mjs` and `approval-gate.mjs`.

Round 2 sequencing: fix-approval-hardening and fix-merge-retire are independent; fix-publish-single-use follows fix-approval-hardening because both edit `approval.mjs`.

Round 3 units (fix-publish-cli, fix-publish-atomic, fix-approval-reprepare) touch disjoint files and run in parallel.

Round 4 adds one unit, fix-cli-contract; it has no dependencies.

Rounds 16 to 19 add fix-approval-fallback, fix-approval-record-protect, fix-helper-form, fix-scan-floor, fix-claim-anchor, fix-claims-dir, fix-merge-approval and fix-helper-root; their files are disjoint, so they run in parallel.

## Verification background   (citations — for the reviewer, not the executor)
- `findGateCommand` takes the first existing marker in map order and `loadConfig` deep-merges defaults first — `scripts/repo-exec.mjs:315-326`, `scripts/lib/core.mjs:573-581`
- `prepare` passes `prLines: input.prLines` — `scripts/approval.mjs:58`
- `gateFeature` reads the feature head before the feature lock — `scripts/repo-exec.mjs:599-603`
- `on-approve` accepts a caller-set flag — `scripts/tracker-publish.mjs:109`
- `syncTrackerDoc` has no dropped-key guard — `scripts/tracker.mjs` (`syncTrackerDoc`)
- `lintBudgets` recomputes an existing file's cap from the merge-base every run — `scripts/arch-check.mjs:291`
- Reproduced by root: a project declaring only `package.json: npm test` still resolves `just check`; one appended line to `docs/plans/dev-lifecycle-docs-plan.md` fails lint
- Round 19: `ownedClaims` reads the per-checkout claims directory — `scripts/account-switch.mjs:202-213`; `mergeOnly` never checks `approvalRequired` — `scripts/repo-exec.mjs:346-370`; the `S` helper has no root pin in workspace mode — `agents/unit-runner.md:8`, `scripts/lib/core.mjs:65-86,150-152`
- Round 21: `assertMergeAllowed` passes any `feature_branch` but the direct path merges into `info.base_branch` — `scripts/lib/approval-gate.mjs:22-24`, `scripts/repo-exec.mjs:363-395`; `/craftsman:merge` passes no `feature_branch` — `commands/merge.md:58-62`

CONSUMERS:
- `findGateCommand` → `scripts/repo-exec.mjs` (merge gate), `scripts/snapshot.mjs`, `scripts/tool-slots.test.mjs`
- `approval.mjs` actions → `scripts/lib/approval-gate.mjs` (record shape), `commands/_approval.md` (argument names; unchanged), `scripts/session-context.mjs` (`pending`)
- `publishTracker` → `scripts/tracker.mjs` publish action, `scripts/repo-exec.mjs`, `commands/_features.md`, `commands/sync-docs.md`
- `committedKeys` / `archivedPlans` → `scripts/tracker-publish.mjs`, `scripts/tracker.mjs` after the move
- `lintBudgets` → `arch-check lint` only

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
- **Round 17 (`/scrutinise`, range 630b4de..bafa7a5):** one Critical (documented helpers blocked by the guard) and one Warning (config can replace the secrets floor) become fix-helper-form and fix-scan-floor.
- **Round 18:** one Warning (claim lock not anchored at the main checkout) becomes fix-claim-anchor; Suggestions are PENDING rows: `approval-cli-refusal`, `publish-manual-owner`, `readme-safety-keys`.
- **Round 19:** three Warnings become fix-claims-dir, fix-merge-approval and fix-helper-root; PENDING rows: `approval-floor-vs-stopgate-note`, `mainroot-missing-fallback`.
- **Round 21:** one Critical and two Warnings (merge gate bypass, `/merge` refused, Phase-A exemption unbuilt) become fix-merge-gate-target. Owner chose to auto-resolve: docs-only exemption. PENDING rows: `unit-runner-claim-project`, `merge-gate-callers-test`.

## Out of scope
- Wiring the lease exception, guard narrowing, the TDD step and the plugin `userConfig` knobs (all wait for PR #1); the telemetry marker, lease glob anchoring and the workspace key collision (follow-ups above).
