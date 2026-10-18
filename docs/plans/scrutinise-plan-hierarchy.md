---
slug: scrutinise-plan-hierarchy
goal: Plans of any size run under /orchestrate with every flag off, and the feature-branch path records, gates and lands what its rules say.
parent: plan-hierarchy
priority: P1
classification: in-scope (/scrutinise plan-hierarchy, isolated scrutineer, 2026-10-18; round 1 - 1 Critical, 9 Warning, 11 Suggestion; round 2 - 0 Critical, 4 Warning, 5 Suggestion)
tracker_rows: [TRACKER#scrutinise-plan-hierarchy]
guards:
  blast_radius: done
  completeness_sweep: done
  blind_rederivation: skipped(findings-driven, the isolated scrutineer is the independent derivation)
coverage:
  contract:      1.1 | plan-graph CLI input field `feature` and config-driven cap; 2.1 tracker transition table; consumers in CONSUMERS block
  data:          8.1 | ledger rows carry feature, feature_branch, session_id in feature mode
  config:        1.1 | planning.featureUnitCap read by the CLI; cap on the implicit feature only when planning.featureBranches
  security:      10.1 | feature id and plan slug pattern checks (7.1); 12.1 publish archive-event guard; 12.2 prune before retry
  tests:         every unit has its own test task
  observability: N/A(no new events; existing plan_gate, land_unit, tracker_published unchanged)
  interface:     9.1 | --level / --feature honoured by the /auto grant; 1.1 orchestrate.md step 3 field list
  docs:          8.1 | commands/_features.md and agents/unit-runner.md stay inside their byte caps
  rollback:      every change is behind planning.featureBranches false or fixes a defect on the default path; revert is per unit
units:
  - id: plan-graph-cap
    scope_id: plan-graph-cap
    project: .
    depends_on: []
    module: scripts/plan-graph.mjs
    language: javascript
    security: normal
    scope:
      read: [scripts/plan-graph.mjs, scripts/lib/plan-index.mjs, commands/orchestrate.md, craftsman.config.json]
      docs: [docs/architecture/engine.rules.md, docs/architecture/slim.rules.md, docs/architecture/landing.rules.md, docs/architecture/plan.rules.md]
      write: [scripts/plan-graph.mjs, scripts/plan-graph.test.mjs, commands/orchestrate.md]
    arch: [ARCH-ENGINE-18, ARCH-ENGINE-16, ARCH-SLIM-05, ARCH-LAND-18, ARCH-PLAN-03]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [], mcp: [] }
  - id: tracker-park
    scope_id: tracker-park
    project: .
    depends_on: []
    module: scripts/tracker.mjs
    language: javascript
    security: normal
    scope:
      read: [scripts/tracker.mjs]
      docs: [docs/architecture/landing.rules.md, docs/architecture/tracker.rules.md]
      write: [scripts/tracker.mjs, scripts/tracker.test.mjs]
    arch: [ARCH-LAND-06, ARCH-TRACKER-06]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [], mcp: [] }
  - id: gate-parser
    scope_id: gate-parser
    project: .
    depends_on: []
    module: scripts/repo-exec.mjs
    language: javascript
    security: normal
    scope:
      read: [scripts/repo-exec.mjs, scripts/lib/plan-index.mjs]
      docs: [docs/architecture/plan.rules.md, docs/architecture/landing.rules.md]
      write: [scripts/repo-exec.mjs, scripts/repo-exec.test.mjs]
    arch: [ARCH-PLAN-02, ARCH-LAND-16]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [], mcp: [] }
  - id: gate-rollups
    scope_id: gate-rollups
    project: .
    depends_on: [gate-parser]
    module: scripts/repo-exec.mjs
    language: javascript
    security: normal
    scope:
      read: [scripts/repo-exec.mjs, scripts/tracker.mjs]
      docs: [docs/architecture/landing.rules.md, docs/architecture/tracker.rules.md]
      write: [scripts/repo-exec.mjs, scripts/repo-exec.test.mjs]
    arch: [ARCH-LAND-16, ARCH-TRACKER-10]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [], mcp: [] }
  - id: land-linked
    scope_id: land-linked
    project: .
    depends_on: [gate-rollups]
    module: scripts/repo-exec.mjs
    language: javascript
    security: normal
    scope:
      read: [scripts/repo-exec.mjs]
      docs: [docs/architecture/landing.rules.md]
      write: [scripts/repo-exec.mjs, scripts/repo-exec.test.mjs]
    arch: [ARCH-LAND-13, ARCH-LAND-14]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [], mcp: [] }
  - id: feature-criteria
    scope_id: feature-criteria
    project: .
    depends_on: [land-linked]
    module: scripts/repo-exec.mjs
    language: javascript
    security: normal
    scope:
      read: [scripts/repo-exec.mjs, scripts/lib/core.mjs, scripts/lib/plan-index.mjs]
      docs: [docs/architecture/tracker.rules.md, docs/architecture/landing.rules.md]
      write: [scripts/repo-exec.mjs, scripts/repo-exec.test.mjs]
    arch: [ARCH-TRACKER-08, ARCH-LAND-18]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [], mcp: [] }
  - id: repo-hardening
    scope_id: repo-hardening
    project: .
    depends_on: [feature-criteria]
    module: scripts/repo-exec.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/repo-exec.mjs]
      docs: [docs/architecture/landing.rules.md]
      write: [scripts/repo-exec.mjs, scripts/repo-exec.test.mjs]
    arch: [ARCH-LAND-13, ARCH-LAND-14, ARCH-LAND-18]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [], guards: [], mcp: [] }
  - id: feature-fields
    scope_id: feature-fields
    project: .
    depends_on: [tracker-park, gate-rollups]
    module: commands/_features.md
    language: markdown
    security: normal
    scope:
      read: [commands/_features.md, agents/unit-runner.md, workflows/run.js, scripts/engine.test.mjs]
      docs: [docs/architecture/tracker.rules.md, docs/architecture/state.rules.md, docs/architecture/landing.rules.md, docs/architecture/slim.rules.md, docs/architecture/engine.rules.md]
      write: [commands/_features.md, agents/unit-runner.md, scripts/engine.test.mjs, scripts/doc-size-policy.mjs]
    arch: [ARCH-TRACKER-07, ARCH-TRACKER-11, ARCH-STATE-08, ARCH-LAND-18, ARCH-SLIM-01, ARCH-SLIM-05, ARCH-ENGINE-13]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [], mcp: [] }
  - id: guard-level-flags
    scope_id: guard-level-flags
    project: .
    depends_on: []
    module: scripts/orchestrate-scope-guard.mjs
    language: javascript
    security: normal
    scope:
      read: [scripts/orchestrate-scope-guard.mjs, scripts/lib/plan-index.mjs, scripts/lib/core.mjs]
      docs: [docs/architecture/auto.rules.md, docs/architecture/plan.rules.md, docs/architecture/state.rules.md]
      write: [scripts/orchestrate-scope-guard.mjs, scripts/orchestrate-scope-guard.test.mjs]
    arch: [ARCH-AUTO-08, ARCH-AUTO-09, ARCH-PLAN-03, ARCH-STATE-02]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [], mcp: [] }
  - id: index-hardening
    scope_id: index-hardening
    project: .
    depends_on: []
    module: scripts/lib/plan-index.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/lib/plan-index.mjs, scripts/lib/tracker-rollup.mjs, scripts/arch-check.mjs]
      docs: [docs/architecture/plan.rules.md, docs/architecture/tracker.rules.md, docs/architecture/docs.rules.md]
      write: [scripts/lib/plan-index.mjs, scripts/lib/plan-index.test.mjs, scripts/lib/tracker-rollup.mjs, scripts/lib/tracker-rollup.test.mjs, scripts/arch-check.mjs, scripts/arch-check.test.mjs]
    arch: [ARCH-PLAN-02, ARCH-TRACKER-10, ARCH-DOCS-03]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [], guards: [], mcp: [] }
  - id: status-consumers
    scope_id: status-consumers
    project: .
    depends_on: []
    module: scripts/digest.mjs
    language: javascript
    security: normal
    scope:
      read: [scripts/digest.mjs, scripts/init.mjs]
      docs: [docs/architecture/tracker.rules.md, docs/architecture/plan.rules.md]
      write: [scripts/digest.mjs, scripts/digest.test.mjs, scripts/init.mjs, scripts/init.test.mjs]
    arch: [ARCH-TRACKER-06, ARCH-TRACKER-07, ARCH-PLAN-04]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [], mcp: [] }
  - id: publish-hardening
    scope_id: publish-hardening
    project: .
    depends_on: []
    module: scripts/tracker-publish.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/tracker-publish.mjs]
      docs: [docs/architecture/tracker.rules.md, docs/architecture/landing.rules.md]
      write: [scripts/tracker-publish.mjs, scripts/tracker-publish.test.mjs]
    arch: [ARCH-TRACKER-11, ARCH-TRACKER-12, ARCH-LAND-17]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [], guards: [], mcp: [] }
  - id: historic-budget
    scope_id: historic-budget
    project: .
    depends_on: [plan-graph-cap, tracker-park, gate-parser, gate-rollups, land-linked, feature-criteria, repo-hardening, feature-fields, guard-level-flags, index-hardening, status-consumers, publish-hardening]
    module: docs/plans/autonomous-e2e-loop.md
    language: markdown
    security: normal
    scope:
      read: [docs/plans/autonomous-e2e-loop.md, scripts/arch-check.test.mjs]
      docs: [docs/architecture/engine.rules.md]
      write: [docs/plans/autonomous-e2e-loop.md]
    arch: [ARCH-ENGINE-08]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [], mcp: [] }
  - id: gate-fail-closed
    scope_id: gate-fail-closed
    project: .
    depends_on: [historic-budget]
    module: scripts/repo-exec.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/repo-exec.mjs, scripts/lib/plan-index.mjs, scripts/lib/core.mjs]
      docs: [docs/architecture/tracker.rules.md, docs/architecture/landing.rules.md]
      write: [scripts/repo-exec.mjs, scripts/repo-exec.test.mjs]
    arch: [ARCH-TRACKER-08, ARCH-LAND-18]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [], mcp: [] }
  - id: gate-chain
    scope_id: gate-chain
    project: .
    depends_on: [gate-fail-closed]
    module: scripts/repo-exec.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/repo-exec.mjs, scripts/lib/plan-index.mjs]
      docs: [docs/architecture/landing.rules.md, docs/architecture/plan.rules.md]
      write: [scripts/repo-exec.mjs, scripts/repo-exec.test.mjs]
    arch: [ARCH-LAND-16, ARCH-PLAN-02]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [], mcp: [] }
  - id: publish-archive-window
    scope_id: publish-archive-window
    project: .
    depends_on: [historic-budget]
    module: scripts/tracker-publish.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/tracker-publish.mjs]
      docs: [docs/architecture/tracker.rules.md, docs/architecture/landing.rules.md]
      write: [scripts/tracker-publish.mjs, scripts/tracker-publish.test.mjs]
    arch: [ARCH-TRACKER-11, ARCH-TRACKER-12, ARCH-LAND-17]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [], mcp: [] }
---
# Plan: scrutinise-plan-hierarchy

## Outcome
Plans of any size run under /orchestrate with every flag off, and the feature-branch path records, gates and lands what its rules say. Same meaning as `goal`.

## Scope Steps (executable core)

### Step 1 — plan-graph-cap (., javascript, normal)
Depends on: none
- [ ] 1.1 `plan-graph.mjs` CLI reads `planning.featureUnitCap` from the merged config and applies the implicit-feature cap only when `planning.featureBranches` is true; steps take feature membership from a per-step `feature` or a plan's `features:` groups via plan-index; add `feature` to the step field list in `commands/orchestrate.md` step 3 and offset it with an equal trim in the same file (cap 10000) → accept: plan-graph.test: 9 untagged steps pass under default config, 9 fail with `featureBranches` true, a configured cap of 3 is read, and the field set orchestrate.md sends is accepted; `node scripts/doc-size-policy.mjs` PASS
- [ ] 1.2 If no way of applying the implicit-feature cap only under `featureBranches` is compatible with ARCH-ENGINE-18, stop and report the rule conflict; never edit the rule → accept: report, or a note in the commit message that no amendment was needed

### Step 2 — tracker-park (., javascript, normal)
Depends on: none
- [ ] 2.1 `tracker.mjs`: allow `FEATURE_MERGED → PARKED` (a decision is required, as for other parks) and re-entry `PARKED → FEATURE_MERGED` → accept: tracker.test transitions for both, a PARKED refused without a decision, and every other FEATURE_MERGED transition unchanged
- [ ] 2.2 A land-feature park recorded through the real tracker: a ledger fixture with a feature's last row FEATURE_MERGED, then the `PARKED` transition the engine sends → accept: tracker.test case passes (not a stub)

### Step 3 — gate-parser (., javascript, normal)
Depends on: none
- [ ] 3.1 `repo-exec.mjs` `planGateFiles` resolves the parent chain with `loadIndex(main).get(slug).parent`; its own `parent:` regex is removed → accept: repo-exec.test plan-gate cases still pass, plus a parent supplied in frontmatter that the old regex missed; `grep -n "parent:" scripts/repo-exec.mjs` finds no regex parse

### Step 4 — gate-rollups (., javascript, normal)
Depends on: gate-parser
- [ ] 4.1 The plan gate compares the plan doc and its parent docs only; generated rollup files (`docs/plans/<slug>/TRACKER.md`) are left out of the comparison because every tracker transition rewrites them locally → accept: repo-exec.test: a tracker transition, then feature prepare for a plan with a `parent:`, passes; a hand-edited plan doc still refuses

### Step 5 — land-linked (., javascript, normal)
Depends on: gate-rollups
- [ ] 5.1 `landUnit` checks `worktree_path` and `unit_worktree` against `mainCheckoutRoot(context.root)`, as `landFeature`'s cleanup does → accept: repo-exec.test land-unit from `linkedContext` (a `.claude/worktrees` session) lands; a path outside the main checkout is still refused

### Step 6 — feature-criteria (., javascript, normal)
Depends on: land-linked
- [ ] 6.1 `landFeature` reads `.craftsman/acceptance.md` of the main checkout, computes `featureCriteria(text, feature, isLast)` (last feature from plan-index `resolve`) and refuses while any is open → accept: repo-exec.test: refused with an open `[feature:<id>]` line, refused for the last feature with an open untagged line, lands when all are ticked

### Step 7 — repo-hardening (., javascript, high)
Depends on: feature-criteria
- [ ] 7.1 `prepareFeature` and `landFeature` refuse a feature id that does not match `/^[A-Za-z0-9._-]+$/` or contains `..` before building any path → accept: repo-exec.test refuses `x/../../..` and `a b` in both actions, and accepts `core-1.2`
- [ ] 7.2 `landUnit` takes the feature lock before merging into the feature worktree and releases it on every exit → accept: repo-exec.test: a held lock makes land-unit wait or refuse as land-feature does; the lock is gone after success and after a conflict park

### Step 8 — feature-fields (., markdown, normal)
Depends on: tracker-park, gate-rollups
- [ ] 8.1 `commands/_features.md` requires `feature`, `feature_branch` and `session_id` on every feature-mode transition (IN_PROGRESS, FEATURE_MERGED, PARKED, BLOCKED); `agents/unit-runner.md` step 1 passes `session_id`; stay within caps (`_features.md` 3500, `unit-runner.md` 3800) by trimming prose of equal length in the same file → accept: engine.test or wiring test asserts the three field names appear in both files; `node scripts/doc-size-policy.mjs` PASS
- [ ] 8.2 `_features.md` states the publish trigger at feature prepare (ARCH-TRACKER-11) and the park transition for a land-feature park, within the cap → accept: grep for both in `_features.md`; doc-size-policy PASS

### Step 9 — guard-level-flags (., javascript, normal)
Depends on: none
- [ ] 9.1 `orchestrate-scope-guard` parses `--level` and `--feature` from the command args, passes them to plan-index `resolve`, and sizes the runner grant with `runnerDispatchCount(units.length, features.length)` (one extra per feature); the auto marker points at the resolved plan → accept: guard test: `--level epic` over two features grants both features' units plus the per-feature extra; a bare slug still behaves as before

### Step 10 — index-hardening (., javascript, high)
Depends on: none
- [ ] 10.1 `buildIndex` refuses a plan whose frontmatter `slug` does not match `/^[A-Za-z0-9._-]+$/`; `rollupPath` never leaves `docs/plans` → accept: plan-index.test refuses `slug: ../..`; tracker-rollup.test writes nothing outside `docs/plans` for it
- [ ] 10.2 `lintPlans` maps the frontmatter slug to its file path before matching errors, so a doc whose slug differs from its filename, or a duplicate slug, reports the right files → accept: arch-check.test with a renamed-slug fixture and a duplicate-slug fixture name the correct paths

### Step 11 — status-consumers (., javascript, normal)
Depends on: none
- [ ] 11.1 `digest.mjs` counts FEATURE_MERGED rows with the open work, and `init.mjs` status detection matches `FEATURE_MERGED` as active → accept: digest.test and init.test cases with a FEATURE_MERGED row

### Step 12 — publish-hardening (., javascript, high)
Depends on: none
- [ ] 12.1 The refuse-to-blank guard accepts an archive only when the ledger or event log carries a real archive event (`tracker_archived` or `doc_retired`), not any difference in `TRACKER-archive.md` → accept: tracker-publish.test: a checkout merely behind origin cannot blank the published block; a real archive event still can
- [ ] 12.2 The retry runs `git worktree prune` before re-adding the temp worktree → accept: tracker-publish.test: a failed `worktree remove` then a retry succeeds

### Step 13 — historic-budget (., markdown, normal)
Depends on: every other step (last, because the byte counts move with the other steps' reads)
- [ ] 13.1 Trim `scope.read` of the historic `state-root-pin` and `auto-command` units in `docs/plans/autonomous-e2e-loop.md` (drop files already in `write`, such as test files) until each fits `execution.unitContextBytes`; never raise the budget or touch the test → accept: `node --test scripts/arch-check.test.mjs` passes, and `node --test scripts/*.test.mjs scripts/lib/*.test.mjs` exits 0

### Step 14 — gate-fail-closed (., javascript, high)
Depends on: historic-budget
- [ ] 14.1 The last-feature check in `landFeature` returns a tagged result (`{ last: boolean }` or `{ error }`, documented in JSDoc) instead of a boolean that folds "unresolvable" into false; on `{ error }` it refuses only when an open untagged line exists (`land-feature refused: cannot resolve plan index to tell if <feature> is last: <err>`) and still evaluates `[feature:<id>]` lines with last=false; non-index errors are not swallowed → accept: repo-exec.test: a deliberately broken sibling plan doc refuses and names the index error; open `[feature:<id>]` lines still refuse with a broken index; a plan with no `features:` (implicit feature id = slug, the last feature) refuses on an open untagged line; the passing cases of 6.1 and the ARCH-TRACKER-08 check files (core.test, tracker.test) still pass

### Step 15 — gate-chain (., javascript, high)
Depends on: gate-fail-closed
- [ ] 15.1 `planGateFiles` throws, naming the index error, when `loadIndex` fails; it finds the leaf by the index node whose `.path === docs/plans/<planSlug>.md`, walks `.parent` through the same slug-keyed Map, and pushes each node's `.path`; `planGate` treats a file missing both locally and on origin as differing for every entry including the leaf; ARCH-LAND-16's text is not edited and the commit message records that rollups stay excluded (tracked as `rule-land-16-rollups`), without claiming compliance → accept: repo-exec.test: a broken sibling doc refuses the gate naming the error; a missing leaf and a missing parent refuse; a parent whose filename differs from its slug is compared by its real path; 3.1 and 4.1 tests still pass

### Step 16 — publish-archive-window (., javascript, high)
Depends on: historic-budget
- [ ] 16.1 `hasArchiveEvent` returns false without reading anything when `context.stateDir` is unset, and otherwise scans the log backward: archive events (`tracker_archived`, `doc_retired`) after the last `tracker_published` unlock the blank guard; a log with no `tracker_published` counts every archive event (stated in the code comment); publish already logs `tracker_published` to the same log (`tracker-publish.mjs:100`) → accept: tracker-publish.test: unset stateDir refuses and never reads the process cwd; an archive event before the last publish cannot unlock; one after it can; a log with no publish line and an archive event unlocks; 12.1, 12.2 and the ARCH-TRACKER-12 refuse-to-blank test still pass

## Sequencing
Steps 3 → 4 → 5 → 6 → 7 run strictly in order: they all edit `scripts/repo-exec.mjs` and its test. Step 8 follows steps 2 and 4. Steps 1, 2, 9, 10, 11, 12 are independent of each other. Step 13 is last of round 1. Round 2: 14 → 15 run in order (both edit `scripts/repo-exec.mjs` and its test); 16 is independent of them.

## Verification background   (citations — for the reviewer, not the executor)
- Cap enforced with no options and the default 8: `scripts/plan-graph.mjs:32`, `:115`; `commands/orchestrate.md:29` sends `(id, scope_id, project, depends_on, bumps)` only.
- `FEATURE_MERGED: new Set(["COMPLETE", "BLOCKED"])`: `scripts/tracker.mjs:20`.
- `landFeature` filters `row.feature === input.feature`: `scripts/repo-exec.mjs:449-450`; the protocol sends neither field: `commands/_features.md:15`.
- Plan gate hashes the working tree against the `origin/<base>` blob: `scripts/repo-exec.mjs:140-155`; every transition rewrites rollups: `scripts/tracker.mjs:233`.
- `landUnit` path check: `scripts/repo-exec.mjs:386`; `prepareFeature` anchors at `mainCheckoutRoot`: `:159-165`.
- `featureCriteria` is exported but unused outside tests: `scripts/lib/core.mjs:452`.
- Grant sizing: `scripts/orchestrate-scope-guard.mjs:42-51`, `:108`.
- Byte caps: `orchestrate.md` 9893/10000, `unit-runner.md` 3796/3800, `_features.md` 3463/3500.
- Historic budget failure: `state-root-pin` 132460 B and `auto-command` 141110 B against 122880.

CONSUMERS:
- plan-graph CLI input (`feature` field, config-read cap) → `commands/orchestrate.md` step 3; `workflows/run.js` does its own grouping and does not call the CLI.
- tracker transition table (`FEATURE_MERGED → PARKED`) → `workflows/run.js` park path, `scripts/stop-gate.mjs`, `scripts/lib/core.mjs` (open-status sets), `scripts/repo-exec.mjs` land-feature.
- ledger fields `feature`, `feature_branch`, `session_id` in feature mode → `scripts/repo-exec.mjs` (`landFeature`), `scripts/stop-gate.mjs` (ARCH-STATE-08), `scripts/run-manifest.mjs` (`feature_groups`).
- `repo-exec` actions `prepare` (feature), `land-unit`, `land-feature`: argument shapes unchanged; new refusals only → `agents/unit-runner.md`, `commands/_features.md`, `workflows/run.js`.
- plan-index slug rule → `scripts/lib/tracker-rollup.mjs`, `scripts/arch-check.mjs`, `scripts/orchestrate-scope-guard.mjs`, `scripts/session-context.mjs`.

## Risk & rollback
- Steps 1, 9 and 13 change default-path behaviour (a defect fix); everything else is behind `planning.featureBranches`, which stays false.
- The live feature path stays unexercised: ARCH-LAND-10 and ARCH-ENGINE-16 spikes are not run here, so steps 2–8 are verified by tests only.
- This plan has 13 units and no `features:` groups. Until step 1 lands, the `plan-graph` CLI would refuse it at the old cap of 8, so it runs through the workflow engine, which orders units itself.
- Each step reverts on its own commit.

## Out of scope
- Publishing only a projection of ledger rows in `TRACKER.jsonl` (session_id, evidence, error): needs a decision on ARCH-TRACKER-12.
- Passing `featureBranches`, `maxSubagents` and `featuresText` into `craftsman:run` from the Engine paragraph: blocked on the live spikes.
- `CHANGELOG.md` `[Unreleased]` was condensed instead of cut as `[2.2.0]`: touches the sibling plan's changelog-cut unit and needs the user.
- Running the live spikes and flipping any flag on.
- Round 2 Suggestions, flagged not driven: plan-graph CLI reads the plan index from `process.cwd()` and `orchestrate.md` never sends `plan` (needs an edit at its 9893/10000 cap); `landUnit` worktree checks run before the feature lock is taken; the slug pattern is written out in four places with disagreeing `..` rules (one `isSafeSlug` export); `commands/_features.md` has no clause for the PARKED → FEATURE_MERGED re-entry (3496/3500).
- Decision for the user, not a unit (`rule-land-16-rollups`): commit 3d49b8b left generated rollups out of the plan gate, but decided ARCH-LAND-16 still says prepare refuses while rollups differ from origin/<base>, and its cite `scripts/repo-exec.mjs:126-127` is stale. Either amend the rule through `/architect` to "plan doc and parent chain; generated rollups are excluded", or conform the code (publish before the gate). The rule is not edited here.
