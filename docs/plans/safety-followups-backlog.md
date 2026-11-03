---
slug: safety-followups-backlog
goal: The follow-ups left after PR #1 and #3 are validated, ordered by value, and each is a small test-first unit; stale ledger rows are closed with evidence.
level: feature
priority: P2
classification: in-scope (follow-ups of scrutinise-fixes-and-safety; validated against main 5f35322)
tracker_rows: []   # deliberately none: docs/plans/TRACKER.md holds the user's uncommitted change; register after it is committed (see Sequencing)
guards:
  blast_radius: done
  completeness_sweep: done
  blind_rederivation: skipped(trivial)
coverage:
  contract:      N/A(no exported API or schema change; SAFETY_CONFIG_KEYS gains two entries, its consumers are safetyProjection and scope.mjs)
  data:          N/A(no persistence or migration)
  config:        1.1 (two existing keys become protected; no new key)
  security:      1.1, 2.1
  tests:         1.1, 2.1, 3.2
  observability: N/A(a refusal already names the key)
  interface:     N/A(no UI, API or CLI surface)
  docs:          1.3, 2.3
  rollback:      one revert per unit; each is its own commit
units:
  - id: 1
    scope_id: approval-keys-protected
    project: .
    depends_on: []
    module: scripts/lib/self-protect.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/lib/self-protect.mjs, scripts/lib/self-protect.test.mjs, scripts/lib/approval-gate.mjs]
      docs: [docs/architecture/safety.rules.md, docs/architecture/state.rules.md]
      write: [scripts/lib/self-protect.mjs, scripts/lib/self-protect.test.mjs, scripts/pre-guard.test.mjs, docs/architecture/safety.rules.md, docs/architecture/safety.md]
    arch: [ARCH-SAFETY-05, ARCH-STATE-06]
    tooling: { implementer: implementer, gates: [security-auditor], skills: [test-driven-development], guards: [arch-check], mcp: [] }
  - id: 2
    scope_id: goal-file-main-checkout
    project: .
    depends_on: [approval-keys-protected]
    module: scripts/goal-token.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/goal-token.mjs, scripts/goal-token.test.mjs, scripts/state-write.mjs]
      docs: [docs/architecture/safety.rules.md, docs/architecture/mod.rules.md]
      write: [scripts/goal-token.mjs, scripts/goal-token.test.mjs, docs/architecture/safety.rules.md, docs/architecture/safety.md]
    arch: [ARCH-SAFETY-09, ARCH-MOD-02]
    tooling: { implementer: implementer, gates: [security-auditor], skills: [test-driven-development], guards: [arch-check], mcp: [] }
  - id: 3
    scope_id: ismain-helper
    project: .
    depends_on: [goal-file-main-checkout]
    module: scripts/lib/core.mjs
    language: javascript
    security: normal
    scope:
      read: [scripts/lib/core.mjs, scripts/lib/core.test.mjs]
      docs: [docs/architecture/state.rules.md]
      write: [scripts/lib/core.mjs, scripts/lib/core.test.mjs]
    arch: [ARCH-STATE-06]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [test-driven-development], guards: [arch-check], mcp: [] }
  - id: 4
    scope_id: ledger-housekeeping
    project: .
    depends_on: []
    module: docs/plans/TRACKER.md
    language: markdown
    security: normal
    scope:
      read: [docs/plans/TRACKER.md]
      docs: []
      write: []   # ledger rows change only through scripts/tracker.mjs, never by hand
    arch: []
    tooling: { implementer: implementer, gates: [phase-tracker], skills: [], guards: [], mcp: [] }
---

# Plan: safety follow-ups backlog

## Outcome
The follow-ups left after PR #1 and #3 are validated and ordered by value, each a small test-first unit, and the ledger rows that are already built are closed with evidence.

## Scope Steps (executable core)

### Step 1 — approval-keys-protected (., javascript, high) — DO FIRST
Tooling: implementer implementer · gates security-auditor · skills test-driven-development · guards arch-check
Depends on: none
- [ ] 1.1 Add `repoExec.approval.required` and `planning.featureBranches` to `SAFETY_CONFIG_KEYS` (`scripts/lib/self-protect.mjs:56-59`), tests first in `self-protect.test.mjs` (`safetyProjection` of a config that flips each key differs) and `pre-guard.test.mjs` (an edit that flips either key is refused with no scope and allowed only under `/orchestrate`; one that changes an unrelated key passes) → accept: both red on main, green after
- [ ] 1.2 Prove the keys exist: assert each dotted name resolves in the shipped `craftsman.config.json` (the list's own contract) → accept: test fails if a name is mistyped
- [ ] 1.3 Name both keys in ARCH-SAFETY-05 and `safety.md`, re-point the cites, bump `verified_at` → accept: `safety-cites`, `safety-docs` and `arch-check lint` pass
Why first: `scripts/lib/approval-gate.mjs:13` enables the approval gate only when both keys are true, so editing either switches a human approval off without any safety key changing.

### Step 2 — goal-file-main-checkout (., javascript, high)
Tooling: implementer implementer · gates security-auditor · skills test-driven-development · guards arch-check
Depends on: approval-keys-protected
- [ ] 2.1 Red test with a linked-worktree fixture: `state-write.mjs` writes `instructions/<slug>.goal.txt` into the main checkout's `.craftsman` (`state-write.mjs:19`), then `mintGoalToken` for that file succeeds; today it resolves under `PROJECT_ROOT` (`goal-token.mjs:27`) and throws → accept: red before, green after
- [ ] 2.2 Resolve the instructions directory through `mainCheckoutRoot(root)` in `goal-token.mjs`, keeping the realpath-inside-instructions check, the name and SHA-256 record and the nonce strict → accept: an outside file, a symlink out of the instructions directory and an unrelated copy are refused; a worktree-local copy directly under <root>/.craftsman/instructions now mints (W1 = B) (new cases)
- [ ] 2.3 Update ARCH-SAFETY-09's text and cite lines → accept: `safety-cites` passes
Impact: `/instruction` in a linked worktree falls back to the paste path today (fails closed, UX only).

### Step 3 — ismain-helper (., javascript, normal) — OPTIONAL, P3 — INCLUDED (user decision, 2026-10-24)
Tooling: implementer implementer · gates code-reviewer · skills test-driven-development · guards arch-check
Depends on: goal-file-main-checkout
- [ ] 3.1 Count the idioms first: `grep -rn "import.meta.url ===" scripts` and the `realpathSync` / `pathToFileURL` / `fileURLToPath` variants; record the list in the commit message → accept: the count matches the plan's ~25
- [ ] 3.2 Add `isMain(metaUrl, argv1 = process.argv[1])` to `scripts/lib/core.mjs` with tests for a path holding a space, a `%`, a symlinked script and a missing `argv[1]` → accept: red before the helper exists
- [ ] 3.3 Switch the scripts over in batches of five, one commit each, no logic change → accept: the full suite is green after every batch
Why optional: the template-literal form mis-handles a path with a space or `%`, but plugin scripts run from a cache path without either, so no failure has been seen.

### Step 4 — ledger-housekeeping (., markdown, normal) — HOLD until the user has committed their `TRACKER.md` change
Tooling: implementer implementer · gates phase-tracker
Depends on: none
- [ ] 4.1 Register this plan's rows (`tracker.mjs`, one `PENDING` row per step above) → accept: `tracker.mjs status` lists four rows
- [ ] 4.2 Close the rows that are already built, each with the evidence shown, by `tracker.mjs` transition to `COMPLETE`:
  - `followup-md-dirty-marker` — `scripts/quality-gate.mjs:46-61` (`stopGate.markdownTests`)
  - `followup-skill-record` — `scripts/lib/core.mjs:641-651` (`recordCommand` with `via`; the typed command outranks a Skill call)
  - `config-keys-protected` — `SAFETY_CONFIG_KEYS` in `scripts/lib/self-protect.mjs`
  - `prompt-failclosed` — ARCH-SAFETY-02 (a failed UserPromptSubmit exits 0) and `launcher.test.mjs`
  - `follow-up-2` of `scrutinise-engine-hardening` — `scripts/stop-gate.mjs:255-280` (own timeout against budget)
  - `follow-up-1` of `scrutinise-engine-hardening` — verify the `acceptance.ref` path is covered by `stop-gate.test.mjs` and `orchestrate-scope-guard.test.mjs`, then close; if a gap remains, leave it PENDING and say which
  → accept: `tracker.mjs status` shows them COMPLETE and `TRACKER.md` re-rendered
- [ ] 4.3 Do not register `ARCH-LAND-23`: the force-with-lease own-branch exception is wired (`scripts/pre-guard.mjs:1127`) → accept: none needed

## Sequencing
1 first (security, tiny, no dependency). 2 next (it touches the same safety text as 1, so the cite edits do not collide). 3 is optional and last. 4 is independent but waits for the user's `TRACKER.md` change to be committed, because the ledger re-renders that file.

## Verification background (citations — for the reviewer, not the executor)
- The approval gate needs both keys true — `scripts/lib/approval-gate.mjs:13` (and `approvalUnenforced` at line 15)
- Both keys exist in the shipped config — `craftsman.config.json:106`, `craftsman.config.json:164`
- State-write targets the main checkout — `scripts/state-write.mjs:19`; the goal-token resolves under the session root — `scripts/goal-token.mjs:27`
- Force-with-lease exception is wired — `scripts/pre-guard.mjs:1127`
- CONSUMERS: `SAFETY_CONFIG_KEYS` → `safetyProjection` (`scripts/lib/self-protect.mjs`), `scripts/scope.mjs`, `scripts/pre-guard.mjs`; no external consumer
- Recorded decision, no unit: `followup-quality-switch-env` — the quality gates honouring `CRAFTSMAN=off` in a script's own environment is a stated limit in ARCH-SAFETY-05 (pinned by `scripts/tracker.test.mjs`); it stays a limit.

## Risk & rollback
Step 1 makes two more config edits need a unit scope; a legitimate edit of either key then needs `/orchestrate`, the same as the existing safety keys. Step 2 widens where goal-token reads, so its refusal cases are the point of the tests. Each step is one commit and reverts alone.

## Out of scope
Archive and option spellings in the guard (a stated best-effort limit, the sandbox is the boundary); `.git/worktrees/*/config` protection (shipped in PR #3); registering rows before the user commits their `TRACKER.md` change.
