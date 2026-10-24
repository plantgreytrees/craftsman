---
slug: dev-lifecycle-docs-plan
goal: Craftsman runs unattended to one approval page, never loses tracker rows, blocks only what matters, and measures its own token cost.
level: feature
priority: P1
idea: docs/ideas/dev-lifecycle-docs-plan.md
classification: in-scope # docs/ideas/dev-lifecycle-docs-plan.md verdict pursue-with-changes (high); rules docs approval, landing, tracker, docs, state, slim, engine, mod, plan
tracker_rows: []
guards:
  blast_radius: done
  completeness_sweep: done
  blind_rederivation: skipped(config:never)
coverage:
  contract:      ledger-guard | land-gate # CONSUMERS block; publish, state-write, session-context and repo-exec consumers named
  data:          ledger-guard | ledger-repair | approval-record # ledger key-level guard and repair; .craftsman/approvals/<run>.json
  config:        tool-slots | docs-budgets | land-gate | profile-and-release # justfile marker, docs.checks, docs.budgets, repoExec.approval, tracker.publish default, userConfig
  security:      force-lease | guard-narrowing | approval-page | approval-record # force-with-lease own branch, guard narrowing, approval owner + head_sha check, secrets never in the page
  tests:         every unit has its own red-first test task
  observability: guard-narrowing | guard-stats | baseline-metric | land-gate | approval-record # guard_unparsed, baseline sample, retire candidates, approval events
  interface:     approval-page | approval-protocol | profile-and-release # approval page and its fallback; /init scaffold
  docs:          rolling-scrutinise | approval-protocol | closing-changelog # byte-neutral prose, closing CHANGELOG entry
  rollback:      every unit is one commit; the approval gate ships behind repoExec.approval.required; revert the unit commit
units:
  - id: ledger-guard
    scope_id: ledger-guard
    project: .
    depends_on: []
    module: scripts/tracker-publish.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/tracker-publish.mjs, scripts/tracker-publish.test.mjs, scripts/tracker.mjs]
      docs: [docs/architecture/tracker.rules.md]
      write: [scripts/tracker-publish.mjs, scripts/tracker-publish.test.mjs]
    arch: [ARCH-TRACKER-13, ARCH-TRACKER-02, ARCH-TRACKER-11]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [], guards: [arch-check], mcp: [] }
  - id: ledger-repair
    scope_id: ledger-repair
    project: .
    depends_on: [ledger-guard]
    module: scripts/tracker.mjs
    language: javascript
    security: normal
    scope:
      read: [scripts/tracker.mjs, scripts/tracker.test.mjs, scripts/tracker-publish.mjs]
      docs: [docs/architecture/tracker.rules.md]
      write: [scripts/tracker.mjs, scripts/tracker.test.mjs]
    arch: [ARCH-TRACKER-13, ARCH-TRACKER-14, ARCH-TRACKER-02, ARCH-TRACKER-09]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [arch-check], mcp: [] }
  - id: force-lease
    scope_id: force-lease
    project: .
    depends_on: []
    module: scripts/lib/force-block.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/lib/force-block.mjs, scripts/pre-guard.mjs]
      docs: [docs/architecture/landing.rules.md]
      write: [scripts/lib/force-block.mjs, scripts/lib/force-block.test.mjs]
    arch: [ARCH-LAND-23, ARCH-LAND-24]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [], guards: [], mcp: [] }
  - id: guard-narrowing
    scope_id: guard-narrowing
    project: .
    depends_on: [force-lease]
    module: scripts/pre-guard.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/lib/force-block.mjs, scripts/lib/shell-words.mjs]
      docs: [docs/architecture/state.rules.md, docs/architecture/safety.rules.md, docs/architecture/landing.rules.md]
      write: [scripts/pre-guard.mjs, scripts/pre-guard-narrow.test.mjs, scripts/lib/force-block.mjs]
    arch: [ARCH-STATE-12, ARCH-STATE-13, ARCH-LAND-23, ARCH-SAFETY-03, ARCH-SAFETY-05, ARCH-DOCS-07]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [], guards: [arch-check], mcp: [] }
  - id: guard-stats
    scope_id: guard-stats
    project: .
    depends_on: []
    module: scripts/stats.mjs
    language: javascript
    security: normal
    scope:
      read: [scripts/stats.mjs, scripts/stats.test.mjs]
      docs: [docs/architecture/mod.rules.md, docs/architecture/state.rules.md]
      write: [scripts/stats.mjs, scripts/stats.test.mjs]
    arch: [ARCH-MOD-03, ARCH-STATE-12]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [arch-check], mcp: [] }
  - id: baseline-metric
    scope_id: baseline-metric
    project: .
    depends_on: [guard-stats]
    module: scripts/telemetry.mjs
    language: javascript
    security: normal
    scope:
      read: [scripts/telemetry.mjs, scripts/telemetry.test.mjs, scripts/stats.mjs, scripts/session-context.mjs, scripts/session-context.test.mjs]
      docs: [docs/architecture/slim.rules.md, docs/architecture/mod.rules.md]
      write: [scripts/telemetry.mjs, scripts/telemetry.test.mjs, scripts/stats.mjs, scripts/stats.test.mjs, scripts/session-context.test.mjs]
    arch: [ARCH-SLIM-10, ARCH-MOD-03, ARCH-MOD-04]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [arch-check], mcp: [] }
  - id: surface-trim
    scope_id: surface-trim
    project: .
    depends_on: []
    module: agents/*, commands/*
    language: markdown
    security: normal
    scope:
      read: [scripts/doc-size-policy.mjs, scripts/descriptions.test.mjs, hooks/register.js, agents/code-reviewer.md, commands/auto-go.md]
      docs: [docs/architecture/slim.rules.md]
      write: [agents/api-reviewer.md, agents/code-reviewer.md, agents/consumer-tracer.md, agents/dependency-auditor.md, agents/idiom-reviewer.md, agents/migration-reviewer.md, agents/observability-reviewer.md, agents/performance-reviewer.md, agents/security-auditor.md, agents/standards-keeper.md, agents/ui-ux-reviewer.md, agents/review-router.md, commands/account-switch.md, commands/builtin-check.md, commands/toggle.md, commands/baseline.md, commands/auto-go.md, commands/fix-tests.md, scripts/entry-surface.test.mjs]
    arch: [ARCH-SLIM-12, ARCH-SLIM-02, ARCH-SLIM-06]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [arch-check], mcp: [] }
  - id: tool-slots
    scope_id: tool-slots
    project: .
    depends_on: []
    module: craftsman.config.json
    language: javascript
    security: normal
    scope:
      read: [craftsman.config.json, scripts/init.mjs, scripts/secrets-scan.mjs]
      docs: [docs/architecture/engine.rules.md]
      write: [craftsman.config.json, scripts/doc-checks.mjs, scripts/doc-checks.test.mjs, scripts/tool-slots.test.mjs]
    arch: [ARCH-ENGINE-20]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [], guards: [arch-check], mcp: [] }
  - id: docs-budgets
    scope_id: docs-budgets
    project: .
    depends_on: [tool-slots]
    module: scripts/arch-check.mjs
    language: javascript
    security: normal
    scope:
      read: [scripts/arch-check.mjs, scripts/arch-check.test.mjs, scripts/doc-size-policy.mjs, craftsman.config.json]
      docs: [docs/architecture/docs.rules.md, docs/architecture/slim.rules.md, docs/architecture/engine.rules.md]
      write: [scripts/arch-check.mjs, scripts/arch-check.test.mjs, craftsman.config.json]
    arch: [ARCH-DOCS-10, ARCH-DOCS-03, ARCH-SLIM-02, ARCH-ENGINE-20]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [arch-check], mcp: [] }
  - id: retire-check
    scope_id: retire-check
    project: .
    depends_on: []
    module: scripts/doc-retire.mjs
    language: javascript
    security: normal
    scope:
      read: [scripts/doc-retire.mjs, scripts/doc-retire.test.mjs]
      docs: [docs/architecture/docs.rules.md]
      write: [scripts/doc-retire.mjs, scripts/doc-retire.test.mjs]
    arch: [ARCH-DOCS-02, ARCH-DOCS-08, ARCH-DOCS-09]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [arch-check], mcp: [] }
  - id: rolling-scrutinise
    scope_id: rolling-scrutinise
    project: .
    depends_on: []
    module: commands/scrutinise.md
    language: markdown
    security: normal
    scope:
      read: [commands/scrutinise.md, commands/_scrutinise-deep.md, scripts/doc-size-policy.mjs]
      docs: [docs/architecture/docs.rules.md, docs/architecture/slim.rules.md]
      write: [commands/scrutinise.md, commands/_scrutinise-deep.md, scripts/scrutinise-rolling.test.mjs]
    arch: [ARCH-DOCS-11, ARCH-SLIM-02, ARCH-SLIM-03, ARCH-SLIM-06]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [arch-check], mcp: [] }
  - id: tdd-step
    scope_id: tdd-step
    project: .
    depends_on: [surface-trim]
    module: agents/unit-runner.md
    language: markdown
    security: normal
    scope:
      read: [agents/unit-runner.md, agents/implementer.md, scripts/doc-size-policy.mjs]
      docs: [docs/architecture/engine.rules.md, docs/architecture/slim.rules.md]
      write: [agents/unit-runner.md, agents/implementer.md, scripts/unit-runner-tdd.test.mjs]
    arch: [ARCH-ENGINE-21, ARCH-ENGINE-04, ARCH-SLIM-02]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [arch-check], mcp: [] }
  - id: vendored-skills
    scope_id: vendored-skills
    project: .
    depends_on: [surface-trim]
    module: skills/*
    language: markdown
    security: normal
    scope:
      read: [scripts/doc-size-policy.mjs, scripts/descriptions.test.mjs, scripts/builtin-skill-context.mjs, agents/unit-runner.md]
      docs: [docs/architecture/slim.rules.md]
      write: [skills/test-driven-development/SKILL.md, skills/systematic-debugging/SKILL.md, skills/verification-before-completion/SKILL.md, scripts/doc-size-policy.mjs, scripts/skills-vendored.test.mjs, commands/investigate.md, commands/architect.md, agents/scrutineer.md, agents/idea-critic.md]
    arch: [ARCH-SLIM-11, ARCH-SLIM-01, ARCH-SLIM-02]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [arch-check], mcp: [] }
  - id: approval-page
    scope_id: approval-page
    project: .
    depends_on: [ledger-guard, tool-slots]
    module: scripts/lib/approval-page.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/doc-checks.mjs, scripts/secrets-scan.mjs, scripts/tracker.mjs]
      docs: [docs/architecture/approval.rules.md]
      write: [scripts/lib/approval-page.mjs, scripts/lib/approval-page.test.mjs]
    arch: [ARCH-APPROVAL-02, ARCH-APPROVAL-03, ARCH-APPROVAL-07]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor, ui-ux-reviewer], skills: [], guards: [arch-check], mcp: [] }
  - id: approval-record
    scope_id: approval-record
    project: .
    depends_on: [approval-page]
    module: scripts/approval.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/lib/approval-page.mjs, scripts/doc-checks.mjs, scripts/secrets-scan.mjs, scripts/lib/core.mjs]
      docs: [docs/architecture/approval.rules.md, docs/architecture/state.rules.md]
      write: [scripts/approval.mjs, scripts/approval.test.mjs]
    arch: [ARCH-APPROVAL-01, ARCH-APPROVAL-04, ARCH-APPROVAL-05, ARCH-APPROVAL-06, ARCH-STATE-13]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [], guards: [arch-check], mcp: [] }
  - id: land-gate
    scope_id: land-gate
    project: .
    depends_on: [approval-record, retire-check, docs-budgets]
    module: scripts/repo-exec.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/repo-exec.mjs, scripts/approval.mjs, scripts/doc-retire.mjs, scripts/tracker-publish.mjs, craftsman.config.json]
      docs: [docs/architecture/landing.rules.md, docs/architecture/approval.rules.md, docs/architecture/tracker.rules.md, docs/architecture/engine.rules.md]
      write: [scripts/repo-exec.mjs, scripts/tracker-publish.mjs, scripts/repo-exec-approval.test.mjs, craftsman.config.json]
    arch: [ARCH-LAND-22, ARCH-LAND-24, ARCH-LAND-26, ARCH-LAND-27, ARCH-APPROVAL-01, ARCH-APPROVAL-04, ARCH-TRACKER-13, ARCH-ENGINE-12]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [], guards: [arch-check], mcp: [] }
  - id: approval-protocol
    scope_id: approval-protocol
    project: .
    depends_on: [land-gate, vendored-skills, baseline-metric]
    module: commands/_approval.md
    language: markdown
    security: normal
    scope:
      read: [commands/auto.md, commands/merge.md, scripts/approval.mjs, scripts/doc-size-policy.mjs, scripts/session-context.mjs]
      docs: [docs/architecture/approval.rules.md, docs/architecture/slim.rules.md, docs/architecture/auto.rules.md, docs/architecture/state.rules.md]
      write: [commands/_approval.md, commands/auto.md, scripts/session-context.mjs, scripts/session-context.test.mjs, scripts/doc-size-policy.mjs, scripts/approval-protocol.test.mjs]
    arch: [ARCH-APPROVAL-01, ARCH-APPROVAL-05, ARCH-APPROVAL-07, ARCH-SLIM-01, ARCH-SLIM-02, ARCH-SLIM-03, ARCH-SLIM-10, ARCH-AUTO-09, ARCH-STATE-01]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [arch-check], mcp: [] }
  - id: profile-and-release
    scope_id: profile-and-release
    project: .
    depends_on: [approval-protocol]
    module: .claude-plugin/plugin.json
    language: json
    security: normal
    scope:
      read: [.claude-plugin/plugin.json, .claude-plugin/marketplace.json, scripts/init.mjs, scripts/init.test.mjs, scripts/self-update.mjs, scripts/changelog.test.mjs, CONTRIBUTING.md]
      docs: [docs/architecture/plan.rules.md, docs/architecture/mod.rules.md]
      write: [.claude-plugin/plugin.json, scripts/init.mjs, scripts/init.test.mjs, EXTENDING.md, scripts/release-identity.test.mjs]
    arch: [ARCH-PLAN-07, ARCH-MOD-06, ARCH-PLAN-04]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [arch-check], mcp: [] }
  - id: closing-changelog
    scope_id: closing-changelog
    project: .
    depends_on: [profile-and-release]
    module: CHANGELOG.md
    language: markdown
    security: normal
    scope:
      read: [CHANGELOG.md, scripts/changelog.test.mjs]
      docs: [docs/architecture/slim.rules.md]
      write: [CHANGELOG.md]
    arch: [ARCH-SLIM-08]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [arch-check], mcp: [] }
  - id: profile-knobs
    scope_id: profile-knobs
    project: .
    depends_on: []
    module: scripts/lib/user-config.mjs
    language: javascript
    security: normal
    scope:
      read: [.claude-plugin/plugin.json, craftsman.config.json, scripts/lib/core.mjs, scripts/release-identity.test.mjs]
      docs: [docs/architecture/plan.rules.md, docs/architecture/mod.rules.md, docs/architecture/docs.rules.md, docs/architecture/engine.rules.md, docs/architecture/state.rules.md]
      write: [.claude-plugin/plugin.json, craftsman.config.json, scripts/lib/core.mjs, scripts/lib/user-config.mjs, scripts/lib/user-config.test.mjs, scripts/release-identity.test.mjs, EXTENDING.md]
    arch: [ARCH-PLAN-07, ARCH-MOD-06, ARCH-DOCS-15, ARCH-ENGINE-22, ARCH-STATE-01]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [arch-check], mcp: [] }
  - id: fix-bypass-allowlist
    scope_id: fix-bypass-allowlist
    project: .
    depends_on: []
    module: scripts/pre-guard.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/lib/shell-words.mjs, scripts/lib/force-block.mjs]
      docs: [docs/architecture/state.rules.md, docs/architecture/safety.rules.md, docs/architecture/landing.rules.md]
      write: [scripts/pre-guard.mjs, scripts/pre-guard-narrow.test.mjs]
    arch: [ARCH-STATE-14, ARCH-STATE-13, ARCH-LAND-23, ARCH-SAFETY-03, ARCH-SAFETY-05, ARCH-DOCS-07]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [], guards: [arch-check], mcp: [] }
  - id: fix-reviewer-red
    scope_id: fix-reviewer-red
    project: .
    depends_on: []
    module: agents/code-reviewer.md
    language: markdown
    security: normal
    scope:
      read: [agents/code-reviewer.md, agents/unit-runner.md, scripts/doc-size-policy.mjs]
      docs: [docs/architecture/engine.rules.md, docs/architecture/slim.rules.md]
      write: [agents/code-reviewer.md, scripts/unit-runner-tdd.test.mjs]
    arch: [ARCH-ENGINE-21, ARCH-ENGINE-04, ARCH-SLIM-02]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [arch-check], mcp: [] }
  - id: fix-heredoc-strict
    scope_id: fix-heredoc-strict
    project: .
    depends_on: []
    module: scripts/lib/heredoc-allow.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/lib/shell-words.mjs, scripts/lib/heredoc-allow.mjs]
      docs: [docs/architecture/state.rules.md, docs/architecture/safety.rules.md, docs/architecture/landing.rules.md]
      write: [scripts/pre-guard.mjs, scripts/lib/heredoc-allow.mjs, scripts/pre-guard-narrow.test.mjs]
    arch: [ARCH-STATE-14, ARCH-STATE-13, ARCH-LAND-23, ARCH-SAFETY-03, ARCH-SAFETY-05, ARCH-DOCS-07]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [], guards: [arch-check], mcp: [] }
  - id: fix-red-run-evidence
    scope_id: fix-red-run-evidence
    project: .
    depends_on: []
    module: agents/code-reviewer.md
    language: markdown
    security: normal
    scope:
      read: [agents/code-reviewer.md, agents/unit-runner.md, workflows/run.js, commands/_shared-execution.md, scripts/doc-size-policy.mjs, scripts/unit-runner-tdd.test.mjs]
      docs: [docs/architecture/engine.rules.md, docs/architecture/slim.rules.md, docs/architecture/plan.rules.md]
      write: [agents/code-reviewer.md, agents/unit-runner.md, workflows/run.js, commands/_shared-execution.md, scripts/unit-runner-tdd.test.mjs, scripts/wiring.test.mjs]
    arch: [ARCH-ENGINE-21, ARCH-ENGINE-04, ARCH-ENGINE-12, ARCH-SLIM-02, ARCH-PLAN-07]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [arch-check], mcp: [] }
  - id: revert-heredoc-prose
    scope_id: revert-heredoc-prose
    project: .
    depends_on: []
    module: scripts/pre-guard.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/lib/heredoc-allow.mjs]
      docs: [docs/architecture/state.rules.md, docs/architecture/safety.rules.md, docs/architecture/landing.rules.md]
      write: [scripts/pre-guard.mjs, scripts/pre-guard-narrow.test.mjs, scripts/lib/heredoc-allow.mjs]
    arch: [ARCH-STATE-14, ARCH-STATE-15, ARCH-LAND-23, ARCH-SAFETY-03, ARCH-SAFETY-05, ARCH-DOCS-07]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [], guards: [arch-check], mcp: [] }
  - id: fix-evidence-flow
    scope_id: fix-evidence-flow
    project: .
    depends_on: []
    module: workflows/run.js
    language: javascript
    security: normal
    scope:
      read: [workflows/run.js, agents/unit-runner.md, agents/implementer.md, agents/code-reviewer.md, commands/_shared-execution.md, scripts/doc-size-policy.mjs, scripts/unit-runner-tdd.test.mjs]
      docs: [docs/architecture/engine.rules.md, docs/architecture/slim.rules.md]
      write: [workflows/run.js, agents/unit-runner.md, agents/implementer.md, agents/code-reviewer.md, commands/_shared-execution.md, scripts/unit-runner-tdd.test.mjs]
    arch: [ARCH-ENGINE-21, ARCH-ENGINE-04, ARCH-ENGINE-12, ARCH-SLIM-02]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [arch-check], mcp: [] }
  - id: fix-lease-expansion
    scope_id: fix-lease-expansion
    project: .
    depends_on: []
    module: scripts/lib/force-block.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/lib/force-block.mjs, scripts/lib/force-block.test.mjs, workflows/run.js, commands/_shared-execution.md, scripts/unit-runner-tdd.test.mjs, scripts/doc-size-policy.mjs]
      docs: [docs/architecture/landing.rules.md, docs/architecture/safety.rules.md, docs/architecture/state.rules.md, docs/architecture/engine.rules.md, docs/architecture/slim.rules.md]
      write: [scripts/lib/force-block.mjs, scripts/lib/force-block.test.mjs, scripts/pre-guard-narrow.test.mjs, workflows/run.js, commands/_shared-execution.md, scripts/unit-runner-tdd.test.mjs]
    arch: [ARCH-LAND-23, ARCH-STATE-16, ARCH-SAFETY-03, ARCH-ENGINE-21, ARCH-ENGINE-12, ARCH-SLIM-02]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [], guards: [arch-check], mcp: [] }
  - id: fix-lease-qualified
    scope_id: fix-lease-qualified
    project: .
    depends_on: []
    module: scripts/lib/force-block.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/lib/force-block.mjs, scripts/lib/force-block.test.mjs, scripts/pre-guard-narrow.test.mjs]
      docs: [docs/architecture/landing.rules.md, docs/architecture/safety.rules.md, docs/architecture/state.rules.md]
      write: [scripts/lib/force-block.mjs, scripts/lib/force-block.test.mjs, scripts/pre-guard-narrow.test.mjs, docs/architecture/landing.rules.md]
    arch: [ARCH-LAND-23, ARCH-STATE-16, ARCH-SAFETY-03]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [], guards: [arch-check], mcp: [] }
  - id: fix-force-config-xargs
    scope_id: fix-force-config-xargs
    project: .
    depends_on: []
    module: scripts/lib/force-block.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/lib/force-block.mjs, scripts/lib/force-block.test.mjs, scripts/pre-guard-narrow.test.mjs]
      docs: [docs/architecture/landing.rules.md, docs/architecture/safety.rules.md, docs/architecture/state.rules.md]
      write: [scripts/lib/force-block.mjs, scripts/lib/force-block.test.mjs, scripts/pre-guard-narrow.test.mjs]
    arch: [ARCH-LAND-23, ARCH-STATE-16, ARCH-SAFETY-03]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [], guards: [arch-check], mcp: [] }
---

# Plan: Slim Craftsman — approval page, ledger guard, guard narrowing, measured tokens

## Outcome
Craftsman runs a plan unattended to one verification point, shows an approval page with two buttons, never silently loses tracker rows, blocks only secrets, outside-worktree deletes and base/PR/external publication, and reports its own start-up versus growth token cost.

## Scope Steps (executable core)
Order follows `docs/architecture/approval.md` "Order of work". Step 2 there (landing PR #1) is the owner's and is **not** a unit here; two units carry a precondition task on it (see Decisions).

### Step 1 — ledger-guard (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor · guards arch-check
Depends on: none
- [ ] 1.1 Add a red-first test with a 50-row committed block against 5 local rows, a JSONL-absent variant and an `archived:true` variant → accept: the new cases fail on the current guard (`tracker-publish.mjs:57-60`)
- [ ] 1.2 Make publish and sync refuse any render that drops a committed row key lacking a `tracker_archived` or `doc_retired` event since the last `tracker_published`, logging `tracker_publish_refused {dropped[]}` (ARCH-TRACKER-13) → accept: the new cases pass and the existing publish tests stay green
- [ ] 1.3 Compare keys from `TRACKER.jsonl`, else from the committed block's `plan|unit` pairs → accept: a repo with only the block is guarded too

### Step 2 — ledger-repair (., javascript, normal)
Tooling: implementer implementer · gates code-reviewer · guards arch-check
Depends on: ledger-guard
- [ ] 2.1 Add `tracker.mjs init --merge`: add only keys absent locally and absent from `TRACKER-archive.md` headings → accept: a test with an archived key shows it is not resurrected
- [ ] 2.2 Add `tracker.mjs init --from-block`: one row per committed block row (plan, unit, module, status), evidence "rehydrated from TRACKER.md block", never overwriting a key the ledger holds (ARCH-TRACKER-14) → accept: a 50-row block fixture yields 50 rows and a second run adds none
- [ ] 2.3 Keep ARCH-TRACKER-02 (events gain fields, never lose them) → accept: the existing snapshot test is unchanged

### Step 3 — force-lease (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor
Depends on: none
- [ ] 3.1 Add `scripts/lib/force-block.test.mjs` first: `--force-with-lease` to a named own branch allowed; to base, to another branch, plain `--force`, `-f`, `+refspec`, `reset --hard` and `worktree remove --force` refused → accept: red before the change
- [ ] 3.2 Export a pure check that takes the run's own branch patterns (`feature/<plan>-*`, claimed unit branches) and implements the single lease exception of ARCH-LAND-23 → accept: all cases green, no caller changed yet

### Step 4 — guard-narrowing (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor · guards arch-check
Depends on: force-lease
PR #1 landed (a92c915), so 4.0 holds. `pre-guard.mjs` (93 KB) exceeds the unit-context budget: it is write-listed, not read-listed; read it in parts. PR #1 adds `docs/architecture/safety.rules.md`, which now governs `pre-guard.mjs` (ARCH-SAFETY-01 leaves outside-root deletes and credential reads to the sandbox). Do not add a guard for them.
- [ ] 4.0 Precondition: `git cat-file -e origin/main:docs/architecture/safety.rules.md` (PR #1 landed). Absent → PARK the unit with decision `{question: "PR #1 has not landed on origin/main; this unit edits scripts/pre-guard.mjs, which PR #1 also rewrites. Wait or proceed?", options: ["wait for PR #1", "proceed and accept a rebase conflict"], recommended: "wait for PR #1"}`; no edit → accept: the unit either parks or the file exists on origin/main
- [ ] 4.1 Add `scripts/pre-guard-narrow.test.mjs` first: `--no-verify` as prose inside a heredoc body is allowed, but inside a heredoc fed to a shell or interpreter (bash, sh, env, python, node) it is refused; env-prefix, loop and subshell removal forms stay refused (owner decision 2026-10-23: PR #1's fail-closed refusal, test 24.1, is kept) → accept: red before the change
- [ ] 4.2 Make the hook-bypass check read heredoc bodies only when a shell or interpreter runs them (ARCH-STATE-14) and wire the own-branch lease check from force-lease (ARCH-LAND-23) → accept: new tests green, the existing `pre-guard.test.mjs` suite unchanged and green
- [ ] 4.3 Keep the three hard lines (ARCH-STATE-13): secrets, deletes outside the worktree, publication → accept: existing refusal tests green

### Step 5 — guard-stats (., javascript, normal)
Tooling: implementer implementer · gates code-reviewer
Depends on: none (the stats code is tested with sample events, so it does not wait for the PR #1-gated guard unit)
- [ ] 5.1 Add a blocks-by-reason table and the last-7-days `guard_unparsed` list to `stats.mjs` → accept: `stats.test.mjs` case with sample events passes
- [ ] 5.2 No new retirement section (ARCH-DOCS-08) → accept: stats output has no new top-level section name beyond the reasons table

### Step 6 — baseline-metric (., javascript, normal)
Tooling: implementer implementer · gates code-reviewer
Depends on: guard-stats
- [ ] 6.1 Make `telemetry.mjs` at Stop read the transcript's first assistant usage and emit `context{phase:"baseline"}` once per session id → accept: `telemetry.test.mjs` shows one baseline event across two Stop runs
- [ ] 6.2 Make `stats.mjs` report baseline, peak and growth per session → accept: `stats.test.mjs` case
- [ ] 6.3 Add a SessionStart `additionalContext` byte cap test (target 3 KB; set to current size if above, then only lower) → accept: the test passes at the measured size

### Step 7 — surface-trim (., markdown, normal)
Tooling: implementer implementer · gates code-reviewer · guards arch-check
Depends on: none
- [ ] 7.1 List commands that no other command, agent, workflow, hook or mod file invokes (grep `/craftsman:<name>`, `SlashCommand`, `hooks/register.js`); flag only those with `disable-model-invocation: true` → accept: `scripts/entry-surface.test.mjs` fails if a flagged command is invoked elsewhere
- [ ] 7.2 Add `maxTurns` to every reviewer agent in the write list → accept: frontmatter present
- [ ] 7.3 Keep every edited file at or below its `FILE_CAPS` size by trimming prose in the same file, never raising a cap (ARCH-SLIM-02) → accept: `doc-size-policy` green
- [ ] 7.4 Record the unflagged commands and why in the commit message → accept: message lists them

### Step 8 — tool-slots (., javascript, normal)
Tooling: implementer implementer · gates code-reviewer, security-auditor · guards arch-check
Depends on: none
- [ ] 8.1 Put `"justfile": "just check"` first in `stopGate.commands` so marker order prefers it, and add `docs.checks` default `[]` → accept: `tool-slots.test.mjs` shows the lookup picks `just check` when a justfile exists and falls through when absent
- [ ] 8.2 Add `scripts/doc-checks.mjs`: runs each configured docs check (markdownlint-cli2, `lychee --offline`) skipping a missing binary silently, JSON result → accept: `doc-checks.test.mjs` covers present, absent and failing
- [ ] 8.3 `pre-commit run --all-files` is run only when a `.pre-commit-config.yaml` and the binary exist and only through the verification point (ARCH-ENGINE-20), never per unit → accept: test asserts no per-unit call site
- [ ] 8.4 `/init` writes no justfile, pre-commit or CI file → accept: existing `init.test.mjs` unchanged and green

### Step 9 — docs-budgets (., javascript, normal)
Tooling: implementer implementer · gates code-reviewer · guards arch-check
Depends on: tool-slots
- [ ] 9.1 Add `docs.budgets {planBytes, scrutiniseBytes, claudeMdLines, openPlans, enforce}`: the plugin defaults keep the three keys (`arch-check.test.mjs` 9.1 pins them) and `enforce` follows the budgetsEnforce setting (default true); this repo sets `claudeMdLines` and `openPlans` in its own `craftsman.project.json` → accept: config parses
- [ ] 9.2 Make `arch-check lint` enforce the budgets: existing files cap at their size on first run, a new plan defaults to 60 KB and a new scrutinise doc to 30 KB, caps ratchet against the merge-base value → accept: `arch-check.test.mjs` growth case fails lint, shrink case passes, `enforce:false` only reports
- [ ] 9.3 `/sync-docs` reports budget state every pass → accept: the output of lint lists each file's bytes against its cap

### Step 10 — retire-check (., javascript, normal)
Tooling: implementer implementer · gates code-reviewer · guards arch-check
Depends on: none
- [ ] 10.1 Export a pure `retireCheck(plans, root)` from `doc-retire.mjs` that returns `{plan, referrers[]}` for every all-closed plan without mutating anything → accept: a test with a cited and an uncited plan returns referrers for the cited one and none for the other
- [ ] 10.2 The result never throws; a scan error returns an empty list and a reason → accept: test with an unreadable root

### Step 11 — rolling-scrutinise (., markdown, normal)
Tooling: implementer implementer · gates code-reviewer · guards arch-check
Depends on: none
- [ ] 11.1 Replace the append rule at `commands/scrutinise.md:42` with: one rolling summary plus the latest round, older rounds in git history (ARCH-DOCS-11) → accept: the wiring test finds the new sentence
- [ ] 11.2 Net bytes of `scrutinise.md` and its per-invocation total do not exceed their caps; donate bytes from `_scrutinise-deep.md` or the same file → accept: `doc-size-policy` green with no cap raised

### Step 12 — tdd-step (., markdown, normal)
Tooling: implementer implementer · gates code-reviewer · guards arch-check
Depends on: surface-trim
- [ ] 12.0 Precondition: `git cat-file -e origin/main:docs/architecture/safety.rules.md`. Absent → PARK with decision `{question: "PR #1 has not landed; this unit edits agents/unit-runner.md, a PR #1 conflict file. Wait or proceed?", options: ["wait for PR #1", "proceed and accept a rebase conflict"], recommended: "wait for PR #1"}` → accept: the unit parks or the file exists
- [ ] 12.1 Add the red-green step to `agents/unit-runner.md` implement flow and the reviewer check to `agents/implementer.md` (ARCH-ENGINE-21), net-zero bytes → accept: `unit-runner-tdd.test.mjs` finds both sentences; sizes at or below caps
- [ ] 12.2 Verification before completion: the unit's evidence field names fresh gate output → accept: test asserts the sentence

### Step 13 — vendored-skills (., markdown, normal)
Tooling: implementer implementer · gates code-reviewer · guards arch-check
Depends on: surface-trim
- [ ] 13.1 Write three short SKILL.md files (test-driven-development, systematic-debugging, verification-before-completion), each with a description of at most 110 chars, an MIT attribution line to obra/superpowers and no dependency on it (ARCH-SLIM-11) → accept: `skills-vendored.test.mjs` checks attribution and description length
- [ ] 13.2 Add each file's `FILE_CAPS` entry at its size → accept: `doc-size-policy` green
- [ ] 13.3 Trim at least the excess over the 8,500-char description cap from the descriptions of the existing commands and agents in the write list (not underscore docs) → accept: `descriptions.test.mjs` green
- [ ] 13.4 `scripts/doc-size-policy.mjs` edits are additive FILE_CAPS lines only → accept: diff shows no existing cap raised

### Step 14 — approval-page (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor, ui-ux-reviewer
Depends on: ledger-guard, tool-slots
- [ ] 14.1 Add `approval-page.test.mjs` first: a fixture with a `.env` change renders the key name and never the value; sections are changes, attention list, evidence, risk and rollback → accept: red before the lib exists
- [ ] 14.2 Implement `renderApproval(run)` returning a self-contained HTML page and a Markdown twin, plus `recommend(run)` (Open PR for protected base, security/infra/CI/env/migration/submodule-pointer paths or more than `repoExec.approval.prLines`; else Merge now) → accept: recommendation table test
- [ ] 14.3 The page declares the db and user capabilities in its config output and offers two buttons; the click writes `approvals/<run> {choice, head_sha}` under an owner-write rule (ARCH-APPROVAL-03) → accept: test inspects the emitted capability config

### Step 15 — approval-record (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor
Depends on: approval-page
- [ ] 15.1 `approval.mjs prepare`: runs gates evidence, the secrets scan, `doc-checks` and `pre-commit` once, writes `.craftsman/approvals/<run>.json {url, plan, feature_heads, recommendation, requested_at}` and logs `approval_requested` → accept: test with stub runners
- [ ] 15.2 `approval.mjs check`: takes the session's read of the db row as stdin JSON, refuses unless the writer is the artifact owner and `head_sha` equals the recorded head; logs `approval_decided` → accept: mismatched sha and non-owner cases are refused (ARCH-APPROVAL-04)
- [ ] 15.3 `approval.mjs landed` logs `approval_landed`; the Markdown fallback path asks once through the prompt protocol (ARCH-APPROVAL-07) → accept: test for the fallback file

### Step 16 — land-gate (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor
Depends on: approval-record, retire-check, docs-budgets
- [ ] 16.1 Add `repoExec.approval {required, prLines}` defaults and refuse `land-feature` to base, PR and tracker publish without a matching approved record when `required` is true (ARCH-LAND-22) → accept: `repo-exec-approval.test.mjs` refuses without a record, lands with one
- [ ] 16.2 Moved base: re-merge base into the feature, re-run the gate, land only if green, conflict-free and the approved head is an ancestor; otherwise PARK and ask for a new page (ARCH-LAND-27) → accept: moved-base, conflict and head-mismatch cases
- [ ] 16.3 After promotion log `doc_retire_candidate` per all-closed plan using `retireCheck`; a failure never fails the landing (ARCH-LAND-26) → accept: a thrown scan leaves the landing successful
- [ ] 16.4 `tracker.publish` accepts `on-approve`; publish pushes only inside an approved land or a user-run `/sync-docs --tracker` (ARCH-LAND-24); old installs treat any non-`push` value as off (`tracker-publish.mjs:78-79`) → accept: test for all three modes
- [ ] 16.5 Set the defaults `repoExec.approval.required: true` and `tracker.publish: "on-approve"` in the **last** commit of this unit (owner chose ship-on) → accept: a one-line diff; this run itself still lands through the installed plugin copy until `/craftsman:upgrade`

### Step 17 — approval-protocol (., markdown, normal)
Tooling: implementer implementer · gates code-reviewer · guards arch-check
Depends on: land-gate, vendored-skills, baseline-metric
- [ ] 17.1 Write `commands/_approval.md` (underscore shared doc, `disable-model-invocation: true`, description ≤80 chars): how root publishes the page as a private Artifact with the db and user capabilities, watches for the republish, reads the `approvals/<run>` row with ArtifactData, calls `approval.mjs check`, then lands through `repo-exec` (ARCH-APPROVAL-01..07) → accept: `approval-protocol.test.mjs` finds each protocol sentence
- [ ] 17.2 Wire `commands/auto.md` Phase B to end at the verification point and name `_approval.md`; trade bytes inside `auto.md` and `merge.md` so no cap rises and `INVOCATION_CAPS["auto"]` is unchanged (ARCH-SLIM-02/03) → accept: `doc-size-policy` green
- [ ] 17.3 `session-context.mjs` prints one line naming approved-but-unlanded runs from `.craftsman/approvals/`; the byte cap from step 6 still holds (ARCH-APPROVAL-05, ARCH-SLIM-10) → accept: `session-context.test.mjs` case plus the cap test
- [ ] 17.4 Add `_approval.md` to `FILE_CAPS` at its size → accept: `doc-size-policy` green

### Step 18 — profile-and-release (., json, normal)
Tooling: implementer implementer · gates code-reviewer · guards arch-check
Depends on: approval-protocol
- [ ] 18.1 Declare the four plugin `userConfig` options in `.claude-plugin/plugin.json` (autonomyLevel, reviewDepth, modelTier, budgetsEnforce) guarded by a feature-detect test; no `version` key (ARCH-MOD-06, ARCH-PLAN-07) → accept: `release-identity.test.mjs` asserts the manifest keys and that `version` is absent
- [ ] 18.2 Make `/init --update` scaffold an empty `.claude/rules/craftsman-loop.md` only when absent and never write a justfile, pre-commit or CI file → accept: `init.test.mjs` cases
- [ ] 18.3 Document the `craftsman#stable` channel and the doc-lint clone one-liner in `EXTENDING.md` → accept: the section exists and the file stays within the existing cap policy

### Step 19 — closing-changelog (., markdown, normal)
Tooling: implementer implementer · gates code-reviewer · guards arch-check
Depends on: profile-and-release
- [ ] 19.1 Add one concise `[Unreleased]` entry for the programme (existing bullets for related features are edited, not duplicated), staying under 8 KB (ARCH-SLIM-08) → accept: `changelog.test.mjs` green
- [ ] 19.2 `metadata.release` is not touched here; releases are cut by the owner → accept: `plugin.json` unchanged by this unit

### Step 20 — profile-knobs (., javascript, normal)
Tooling: implementer implementer · gates code-reviewer · guards arch-check
Depends on: none
Owner decision (2026-10-23): map three knobs, `modelTier` reserved. Platform facts (code.claude.com plugins-reference, verified): `userConfig` options are strict objects; allowed keys are `type`, `title`, `description`, `default` (plus `required`, `multiple`, `sensitive`, `min`, `max`, `options`); this unit uses only `type`, `title`, `description`, `default` because `options` breaks Claude Code before v2.1.271; option keys are identifiers and reach hooks as `CLAUDE_PLUGIN_OPTION_<KEY>` uppercased (`AUTONOMYLEVEL`, `REVIEWDEPTH`, `MODELTIER`, `BUDGETSENFORCE`).
- [ ] 20.1 Add `scripts/lib/user-config.test.mjs` first: `applyUserConfig(defaults, env)` maps `AUTONOMYLEVEL` attended|standard|unattended to `repoExec.approval.prLines` 100|400|1000, `REVIEWDEPTH` light|standard|deep to `planning.blindRederivation` never|auto|always, `BUDGETSENFORCE` "true"|"false" to `docs.budgets.enforce`; `MODELTIER` is accepted and changes nothing (reserved); an unset variable leaves the default; an unknown value is ignored and never throws; `loadConfig` over a temp project that sets the same key wins over the machine-wide value → accept: red before the lib exists
- [ ] 20.2 Implement the pure `applyUserConfig` in `scripts/lib/user-config.mjs` and call it in `loadConfig` between the plugin defaults and the project files (project config overrides), reading only `CLAUDE_PLUGIN_OPTION_*` variables, so nothing changes when the platform exports none → accept: tests green, the full suite unchanged
- [ ] 20.3 Declare `userConfig` in `.claude-plugin/plugin.json` with exactly `autonomyLevel`, `reviewDepth`, `modelTier` (string options with a default) and `budgetsEnforce` (boolean, default true), each with only `type`, `title`, `description`, `default`; no `options`, no `version` → accept: `release-identity.test.mjs` asserts the four keys, the allowed field names and that `version` and `options` are absent
- [ ] 20.4 Add `claudeMdLines: 200` and `openPlans: 30` under `docs.budgets` in this repo's `craftsman.project.json` (not the plugin defaults: `arch-check.test.mjs` 9.1 pins those to three keys) (generous, so other repos keep linting clean; this repo has 14 open plans and no CLAUDE.md) → accept: config parses, `arch-check lint` PASS on this repo
- [ ] 20.5 Document the four machine-wide settings, their mapping and that a project config wins, in one short `EXTENDING.md` section within its cap → accept: the section exists, `doc-size-policy` green

### Step 21 — fix-bypass-allowlist (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor · guards arch-check
Depends on: none
`pre-guard.mjs` (93 KB) is write-listed, not read-listed: read it in parts. Finding (round 6, Warning): `bypassView` strips heredoc bodies from the hook-bypass check unless the text holds a listed shell or interpreter word, so an unlisted consumer (tcsh, mksh, ash, deno, bun, lua, pwsh, `nodejs`, `perl5.36`, or a heredoc written to a file that the same command then runs) now hides its body; main refused those.
- [ ] 21.1 Add tests first in `scripts/pre-guard-narrow.test.mjs` (spell the flag in two parts so the file never trips the hook): a heredoc fed to each of tcsh, mksh, ash, busybox sh, deno, bun, lua, pwsh, nodejs, perl5.36 is refused; a heredoc written to a file with `cat > x <<EOF` and then run in the same command (`sh x`, `./x`, `source x`, `bash x`) is refused; `git -c alias.x='!sh' x <<EOF` is refused; the allowed cases stay allowed: `git commit -F - <<EOF` prose, `cat <<EOF`, `cat > notes.txt <<EOF`, `tee f <<EOF` → accept: the new refusals fail on the current `bypassView`
- [ ] 21.2 Replace the denylist in `bypassView` with an allowlist: strip heredoc bodies only when every command head left in the command (after removing the bodies) is one of `cat`, `tee`, `git commit|tag|notes` without `-c`, `echo`, `printf`, `true`, `wc`, `sort`, `uniq`, `head`, `tail`; any other head, a pipe into an unlisted head, or a head that runs a file keeps the bodies in view (fail closed) → accept: tests green, `pre-guard.test.mjs` unchanged and green
- [ ] 21.3 The comment above `bypassView` cites ARCH-STATE-14, not the superseded ARCH-STATE-12 → accept: grep shows no ARCH-STATE-12 in `pre-guard.mjs`

### Step 22 — fix-reviewer-red (., markdown, normal)
Tooling: implementer implementer · gates code-reviewer · guards arch-check
Depends on: none
Finding (round 6, Warning): ARCH-ENGINE-21 says the reviewer refuses a unit whose new test never failed, but the sentence exists only in `agents/implementer.md`.
- [ ] 22.1 Add to `scripts/unit-runner-tdd.test.mjs` first: `agents/code-reviewer.md` carries the refusal sentence (the unit's evidence names the failing run of each new test, else the review returns a Critical finding) → accept: red before the change
- [ ] 22.2 Add that sentence to `agents/code-reviewer.md` by trading bytes inside the file so its `FILE_CAPS` entry (2564) does not rise → accept: the test and `doc-size-policy` green

### Step 23 — fix-heredoc-strict (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor · guards arch-check
Depends on: none
`pre-guard.mjs` (93 KB) is write-listed, not read-listed: read it in parts. Findings (round 7, Warning): (a) `sort` is on the `heredoc-allow.mjs` allowlist but `sort` can run a program (a compress-program option) and so run a heredoc body; (b) `stripHeredocs` does not track `${...}` parameter expansion, so `<<TAG}` inside `${x:-...}` (literal to bash) is read as a heredoc start and the lines after it, which bash runs, are stripped from the bypass check.
- [ ] 23.1 Add tests first in `scripts/pre-guard-narrow.test.mjs` (flag spelled in two parts): a heredoc fed to `sort` with a program option is refused; the `${x:-<<EOF}` shape with the flag on the following line is refused; refused cases for `$( )`, backticks, `<( )`/`>( )`, `;`-chained shells, path-qualified heads (`/bin/sh`), leading assignments (`FOO=1 sh`) and `git -C dir commit`/`git -c k=v commit`; the allowed cases stay allowed (`git commit -F - <<EOF` prose, `cat <<EOF`, `cat > notes.txt <<EOF`, `tee f <<EOF`) → accept: the sort and `${}` cases fail on the current code
- [ ] 23.2 Shrink the allowlist in `scripts/lib/heredoc-allow.mjs` to the consumers that cannot run a program: `cat`, `tee`, and `git commit|tag|notes` (drop `sort`, `echo`, `printf`, `true`, `wc`, `uniq`, `head`, `tail`) → accept: tests green
- [ ] 23.3 Make `stripHeredocs` in `pre-guard.mjs` treat `${` … matching `}` as one opaque word in the command and double-quote contexts, as it already does for `$((` and `$[`; an unterminated `${` keeps the rest of the text in view (fail closed) → accept: tests green, `pre-guard.test.mjs` unchanged and green

### Step 24 — fix-red-run-evidence (., markdown, normal)
Tooling: implementer implementer · gates code-reviewer · guards arch-check
Depends on: none
Findings (round 7, Warning): the `agents/code-reviewer.md` refusal expects red-run evidence that no caller passes (`commands/_shared-execution.md` step 8 gives it the diff only; integration and scrutinise reviews have no unit evidence), and on the `/auto` workflow path `workflows/run.js` sends the review role only `worktree_path`; ARCH-PLAN-07's check names a no-fourth-profile-file assertion that does not exist.
- [ ] 24.1 Add tests first in `scripts/unit-runner-tdd.test.mjs`: the `code-reviewer.md` sentence is scoped to per-unit review; `_shared-execution.md` step 8 tells root to pass the implementer's evidence (the failing run of each new test) to `code-reviewer`; the `## review` role in `agents/unit-runner.md` returns `CHANGES` when the evidence lacks that failing run; the review prompt in `workflows/run.js` carries the implementer's evidence → accept: red before the change
- [ ] 24.2 Make those four edits, trading bytes inside each `.md` so no `FILE_CAPS` entry rises (`_shared-execution.md` is 12764 of 12769) → accept: the tests and `doc-size-policy` green
- [ ] 24.3 Add to `scripts/wiring.test.mjs` the ARCH-PLAN-07 assertion that no fourth profile file exists: no tracked file named `craftsman.profile.*`, `.claude/profile.*` or a root or `docs/` `profile.json|md|yaml` → accept: the test passes and fails when such a file is added to a temp repo fixture

### Step 25 — revert-heredoc-prose (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor · guards arch-check
Depends on: none
Owner decision (2026-10-23, after round 8): the heredoc-prose allowance rests on a hand-written bash lexer in a safety hook and keeps meeting shapes where it and bash disagree (a quoted or escaped `}` in `${...}`, a backslash-newline before a terminator, `$'...'` strings). Drop it: the hook-bypass check reads the whole command again, exactly as PR #1 had it. Keep the own-branch lease allowance. Root runs this unit by hand (a mechanical revert verified against a92c915).
- [ ] 25.1 Add to `scripts/pre-guard-narrow.test.mjs` first: a heredoc body that mentions the bypass flag (flag spelled in two parts) is refused again, for `git commit -F - <<EOF`, `cat <<EOF` and `tee f <<EOF`; the lease tests stay → accept: the new refusals fail on the current `bypassView`
- [ ] 25.2 Remove `bypassView`, `scripts/lib/heredoc-allow.mjs`, `braceEnd` and the `${` handling added to `arithmeticEnd`/`stripHeredocs`; the hook-bypass check tests `command` as in a92c915; keep `ownBranchesOf` wiring → accept: `pre-guard.mjs` differs from a92c915 only in the `ownBranchesOf` import and call; `pre-guard.test.mjs` unchanged and green
- [ ] 25.3 ARCH-STATE-14 is superseded by ARCH-STATE-16 (lease allowance only; heredoc prose stays refused), and the plan and acceptance wording of 4.1/4.2 and of units fix-bypass-allowlist and fix-heredoc-strict follow it → accept: `arch-check lint` PASS

### Step 26 — fix-evidence-flow (., javascript, normal)
Tooling: implementer implementer · gates code-reviewer · guards arch-check
Depends on: none
Findings (round 8, Warning): (a) after a fix round `workflows/run.js` hands the reviewer only the fix round's evidence, so the red-run check fails again and the unit PARKs; (b) the producer is never told to put the failing run into its returned evidence (`agents/unit-runner.md` steps 6-8, `agents/implementer.md` Return list); (c) on the root path a router SKIP runs no `code-reviewer`, so nobody checks the red run; (d) `agents/code-reviewer.md` does not say which modes "per-unit review" excludes.
- [ ] 26.1 Add tests first to `scripts/unit-runner-tdd.test.mjs`: the review prompt in `workflows/run.js` carries the original evidence on every round; `agents/unit-runner.md` step 7 or 8 says evidence names the failing run of each new test; `agents/implementer.md` Return list names it; `commands/_shared-execution.md` step 8 makes the SKIP route check it; `agents/code-reviewer.md` names integration and scrutinise reviews as not subject to it → accept: red before the change
- [ ] 26.2 Make those edits, trading bytes inside each `.md` so no `FILE_CAPS` entry rises (`unit-runner.md` 3605/3605, `implementer.md` 2222/2224, `code-reviewer.md` 2563/2564, `_shared-execution.md` 12764/12769) → accept: the tests and `doc-size-policy` green

### Step 27 — fix-lease-expansion (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor · guards arch-check
Depends on: none
Root runs this unit by hand. Findings (round 9): (Critical) the lease allowance reads the refspec text before the shell expands it, so `feature/<plan>-$X` with `X=x:main`, a backtick or `$( )` substitution, `$'\x3a'`, or `HEAD:feature/p-x:main` (git splits at the last colon, the code at the first) reaches main; `ownBranchesOf` turns the bound branch into a glob, so a branch of `*` allows `HEAD:main`; (Warning) a fix round's evidence replaces the earlier fix round's, so the round-2 review can lack a new test's failing run; (Suggestion) the byte trades dropped the `(_architecture.md)` pointer in `_shared-execution.md` step 8.
- [ ] 27.1 Add tests first in `scripts/lib/force-block.test.mjs` and `scripts/pre-guard-narrow.test.mjs`: a lease push is refused when its command text holds `$`, a backtick or a backslash anywhere, for a refspec word with `{`, `}`, `*`, `?`, `[`, `(`, a quote or a second colon (`HEAD:feature/p-x:main`), and for a binding branch of `*`; the existing allowed cases (plain names, `HEAD:feat/unit-a`, `refs/heads/` form, `--force-with-lease=name:sha`) stay allowed → accept: the expansion and double-colon cases fail on the current code
- [ ] 27.2 In `leaseToOwnBranch` require every word to match `^[A-Za-z0-9._/:=-]+$`, every ref to be `name` or `src:dst` with exactly one colon at most and both sides `^[A-Za-z0-9._/-]+$`, and no `$`, backtick or backslash anywhere in the command text; make `ownBranchesOf` return the bound branch only when it matches `^[A-Za-z0-9._/-]+$` and compile the `feature/<plan>-*` glob so `*` means `[A-Za-z0-9._-]+` → accept: tests green
- [ ] 27.3 `workflows/run.js` collects every fix round's evidence and sends all of it with the original on each review round; a behavioural test drives the loop through two fix rounds (or asserts the accumulation) → accept: test green
- [ ] 27.4 Restore the `(_architecture.md)` pointer in `commands/_shared-execution.md` step 8 within its `FILE_CAPS` entry; pin it in `scripts/unit-runner-tdd.test.mjs` → accept: `doc-size-policy` green

### Step 28 — fix-lease-qualified (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor · guards arch-check
Depends on: none
Root runs this unit by hand. Round 10 (Critical): a colon-less ref lets git apply `remote.<n>.push` or `push.default=upstream` and push to main (config from a `-c` word, a `GIT_CONFIG_*` prefix or an earlier `git config`); an explicit `src:dst` ignores the remap. A bound branch such as `heads/main` makes `src:heads/main` resolve to refs/heads/main.
- [ ] 28.1 Add tests first in `scripts/lib/force-block.test.mjs` and `scripts/pre-guard-narrow.test.mjs`: a lease push is refused for a colon-less ref, for a destination not written as `refs/heads/<own>`, with `-c`, `--config-env`, `--git-dir`, `--work-tree` before `push`, with a `GIT_*=` or `env` prefix, and for bound branches `HEAD`, `-x`, `refs/heads/main`, `heads/main`, `Main`, `a/main`; allowed: `HEAD:refs/heads/feat/unit-a`, `feat/unit-a:refs/heads/feat/unit-a`, `-C dir push` with those refs, `-u`, `--force-if-includes` → accept: the config-remap and `heads/main` cases fail on the current code
- [ ] 28.2 In `leaseToOwnBranch` require every ref to be exactly `src:refs/heads/<own>` (one colon, `src` a safe name, no `+`); refuse the allowance when the command text holds a global config option, `GIT_*=` or `env`; in `ownBranchesOf` reject `HEAD`, names starting with `-`, `refs/` or `heads/`, and any name ending in a `main` or `master` segment, case-insensitively → accept: tests green
- [ ] 28.3 Refresh the ARCH-LAND-23 cite to the file's real line count and word the rule's lease clause as `src:refs/heads/<own>` only → accept: `arch-check lint` PASS

### Step 29 — fix-force-config-xargs (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor · guards arch-check
Depends on: none
Root runs this unit by hand. Round 11 findings in the general force block (older than the lease work): (Critical) a config option or `git config` write in the same command turns a plain push into a forced one (`remote.<n>.push=+HEAD:refs/heads/main`, `remote.<n>.mirror`), and the block only looks at the push words; (Critical) force flags supplied at run time through `xargs`/`parallel` are invisible; (Warning) `ownBranchesOf` trusts the bound branch as run-created, so a base other than main/master (develop, trunk) bound by a scope on the main checkout passes; (Suggestion) `--namespace` is not refused.
- [ ] 29.1 Add tests first in `scripts/lib/force-block.test.mjs`: each of these is blocked: a push under `-c remote.<n>.push=+…`, `-c remote.<n>.mirror=…`, `--config-env=…`, `GIT_CONFIG_COUNT=…`, `--namespace=…`; `git config remote.<n>.push +…` and `git config remote.<n>.mirror …` writes; `xargs git …`, `xargs -a f git`, `parallel git …`; and `ownBranchesOf` returns no binding branch unless it starts with `feat/` or `feature/`; plain pushes, `-C dir push`, and the lease cases of 28.1 stay as they are → accept: the config and xargs shapes fail on the current code
- [ ] 29.2 In `destructiveGit` block any `git push` whose command text carries `-c`, `--config-env`, `--namespace`, `--git-dir`, `--work-tree`, a `GIT_*=` variable or `env`, block `git config` writes of `remote.*.push`, `remote.*.mirror` and `alias.*`, and block any command where `xargs` or `parallel` runs `git`; limit `ownBranchesOf` to bound branches matching `^(?:feat|feature)/` → accept: tests green
- [ ] 29.3 Pin the same shapes through the real guard in `scripts/pre-guard-narrow.test.mjs` (plain push with `-c` remote push override, `xargs git push`) → accept: tests green

## Sequencing
tracker guard first (live defect, no PR #1 files) → force-lease → guard narrowing (PR #1 precondition; nothing depends on it) → stats → baseline metric; surface-trim, tool-slots, docs-budgets, retire-check and rolling-scrutinise are independent and run between → tdd-step (PR #1 precondition; nothing depends on it) → vendored-skills (needs byte donors, waits only for surface-trim) → approval page → record → land gate (needs retire-check and budgets) → protocol → profile/release → CHANGELOG. The approval gate is last on purpose so every earlier unit lands before it exists. The two PR #1-gated units PARK in isolation: no other unit depends on them, so a PARK never stalls the programme.

Round 6 units (fix-bypass-allowlist, fix-reviewer-red) touch disjoint files and run in parallel. The `craftsman.project.json` edit of 9.1/20.4 waits for the owner to run /craftsman:upgrade and /reload-plugins (the installed hook is older than scripts/scope.mjs on main, so no session can record /orchestrate, and both config files are self-protected).

Round 7 units (fix-heredoc-strict, fix-red-run-evidence) touch disjoint files and run in parallel.

Round 8: revert-heredoc-prose (root, by hand) and fix-evidence-flow (runner) touch disjoint files.

Round 9: fix-lease-expansion (root, by hand).

## Verification background   (citations — for the reviewer, not the executor)
- Publish guard only refuses a shrink to empty — `scripts/tracker-publish.mjs:57-60`
- Old installs treat any `tracker.publish` other than `push` as off — `scripts/tracker-publish.mjs:78-79`
- `findGateCommand` takes the first existing marker in object order — `scripts/repo-exec.mjs:315-325`
- `landFeature` is `scripts/repo-exec.mjs:568-670`; `landFeaturePullRequest` follows at `:671`
- FILE_CAPS entries per shipped md, additive edit point — `scripts/doc-size-policy.mjs:19-99`; invocation caps `:103-137`
- Description budget 8,500 chars, 8,334 used, 166 spare — `scripts/descriptions.test.mjs:16`
- Unit runners hold no credentials; PR state is checked with local refs only (ARCH-LAND-19) — `docs/architecture/landing.rules.md` ARCH-LAND-19
- Stop-time telemetry reads the transcript tail today — `scripts/telemetry.mjs:18-69`
- Hooks registered today — `hooks/hooks.json` (SessionStart session-context and tracker-sync; Stop stop-gate, tracker-sync, telemetry)

CONSUMERS:
- `tracker-publish.mjs` publishTracker → `scripts/repo-exec.mjs` (prepare, land, park), `scripts/tracker.mjs` (publish action), `commands/sync-docs.md` (`--tracker`); new refusal result field `refused` is additive
- `force-block.mjs` → `scripts/pre-guard.mjs` (force block under /auto); `scripts/lib/force-block.test.mjs` is new
- `doc-retire.mjs` retireCheck (new export) → `scripts/repo-exec.mjs` land-gate only; existing exports unchanged
- `telemetry.mjs` events → `scripts/stats.mjs`; `context{phase:"baseline"}` is additive
- `craftsman.config.json` new keys `docs.budgets`, `docs.checks`, `repoExec.approval`, `tracker.publish` value `on-approve` → `scripts/lib/core.mjs` loadConfig (deep-merge, unchanged), `scripts/arch-check.mjs`, `scripts/repo-exec.mjs`, `scripts/tracker-publish.mjs`
- `scripts/session-context.mjs` output → every session; byte cap test guards growth
- `commands/auto.md`, `commands/merge.md` → `INVOCATION_CAPS` entries in `scripts/doc-size-policy.mjs`

## Risk & rollback
- Guard narrowing reverses the 18 Oct fail-closed decision (owner approved 2026-10-23): revert the `guard-narrowing` commit; the weekly `guard_unparsed` list is the check.
- The approval gate ships on by default (owner choice). This run executes with the installed plugin copy `792b8e4abf1b`, so the gate affects only runs after `/craftsman:upgrade`. Roll back by setting `repoExec.approval.required: false` and `tracker.publish: "push"` in a project config.
- `disable-model-invocation` is applied to the safe subset only; `ARCH-SLIM-12` wording ("every other command") needs an `/architect --update slim` follow-up.
- Rebase cost on PR #1: unavoidable additive edits to `scripts/doc-size-policy.mjs` (new FILE_CAPS lines) and `CHANGELOG.md`; `agents/unit-runner.md` and `scripts/pre-guard.mjs` only if the owner proceeds before it lands.
- Each unit is one commit; revert per unit.

## Decisions
- **Scope (owner, 2026-10-23):** plan all 7 steps, build all, land directly to main.
- **Landing gate default (owner):** ships on; the flip is in the last commit of `land-gate`.
- **ARCH-SLIM-12 (owner):** safe subset now; rule wording amended later.
- **PR #1:** is not a unit. Units `guard-narrowing` and `tdd-step` carry a precondition task and PARK with a decision if `docs/architecture/safety.rules.md` is not on `origin/main`. Additive-only collisions remain either way: `scripts/doc-size-policy.mjs`, `CHANGELOG.md`.
- **Approval transport:** the page is published and read by the root session with the Artifact and ArtifactData tools; node scripts compose content, write records and verify decisions, because scripts cannot call those tools.
- **Baseline sample:** taken at Stop from the transcript's first assistant usage so no `hooks.json` change is needed (PR #1 rewrites that file).

## Out of scope
- Landing PR #1 or resolving its conflicts; hourly snapshots and restic; the Loost transcript scan and `claude-context`; deleting retired plan docs (ARCH-DOCS-02 stays); a plugin `version` key; Renovate, OSV-Scanner, git-cliff; the Loost `CLAUDE.md` diet; rolling out to Loost, Gallery and Podling.
