---
slug: plan-hierarchy
goal: Epic, story and feature levels work across plan, orchestrate and auto, with one worktree per feature and progress published to main.
idea: docs/ideas/plan-hierarchy.md
priority: P1
classification: in-scope (docs/ideas/plan-hierarchy.md verdict pursue-with-changes; docs/architecture/plan.rules.md)
tracker_rows: [TRACKER#plan-hierarchy]
guards:
  blast_radius: done
  completeness_sweep: done
  blind_rederivation: skipped(config:never)
coverage:
  contract:      1.1 | plan-index API is new; consumers 6.1, 7.1, 18.1, 19.1 (CONSUMERS block); ledger gains optional fields only 6.1
  data:          6.1 | ledger fields feature/feature_branch, status FEATURE_MERGED; 15.1 TRACKER.jsonl snapshot
  config:        2.1 | planning.featureBranches, planning.featureUnitCap, tracker.publish, execution.maxSubagents, execution.maxSessions
  security:      15.1 | publish pathspec limit, plain push, force-block intact; 11.1 plan gate
  tests:         every unit has its own test task
  observability: 11.3 | logEvent for feature_worktree, land_unit, tracker_published, plan_gate
  interface:     19.1 | --level / --feature, frontmatter fields, docs for commands
  docs:          19.1, 20.1 | commands reference doc, README, EXTENDING, CHANGELOG
  rollback:      2.1 | planning.featureBranches default false keeps per-unit worktrees; tracker.publish off
units:
  - id: plan-index
    scope_id: plan-index
    project: .
    depends_on: []
    module: scripts/lib/plan-index.mjs
    language: javascript
    security: normal
    scope:
      read: [skills/language-aware-planning/references/plan-template.md, scripts/plan-graph.mjs, scripts/init.mjs]
      docs: [docs/architecture/plan.rules.md]
      write: [scripts/lib/plan-index.mjs, scripts/lib/plan-index.test.mjs]
    arch: [ARCH-PLAN-01, ARCH-PLAN-02, ARCH-PLAN-05]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [], mcp: [] }
  - id: config-keys
    scope_id: config-keys
    project: .
    depends_on: []
    module: craftsman.config.json
    language: json
    security: normal
    scope:
      read: [craftsman.config.json, scripts/lib/core.mjs]
      docs: [docs/architecture/engine.rules.md]
      write: [craftsman.config.json, scripts/lib/core.test.mjs]
    arch: [ARCH-ENGINE-12, ARCH-ENGINE-18]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [], mcp: [] }
  - id: graph-features
    scope_id: graph-features
    project: .
    depends_on: [plan-index, config-keys]
    module: scripts/plan-graph.mjs
    language: javascript
    security: normal
    scope:
      read: [scripts/plan-graph.mjs, scripts/lib/plan-index.mjs]
      docs: [docs/architecture/landing.rules.md, docs/architecture/engine.rules.md]
      write: [scripts/plan-graph.mjs, scripts/plan-graph.test.mjs]
    arch: [ARCH-LAND-03, ARCH-LAND-18, ARCH-ENGINE-16, ARCH-ENGINE-18]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [], mcp: [] }
  - id: arch-lint
    scope_id: arch-lint
    project: .
    depends_on: [plan-index]
    module: scripts/arch-check.mjs
    language: javascript
    security: normal
    scope:
      read: [scripts/arch-check.mjs, scripts/lib/plan-index.mjs]
      docs: [docs/architecture/plan.rules.md, docs/architecture/docs.rules.md]
      write: [scripts/arch-check.mjs, scripts/arch-check.test.mjs]
    arch: [ARCH-PLAN-02, ARCH-DOCS-03]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [], mcp: [] }
  - id: init-stamp
    scope_id: init-stamp
    project: .
    depends_on: [plan-index]
    module: scripts/init.mjs
    language: javascript
    security: normal
    scope:
      read: [scripts/init.mjs, scripts/lib/plan-index.mjs]
      docs: [docs/architecture/plan.rules.md]
      write: [scripts/init.mjs, scripts/init.test.mjs]
    arch: [ARCH-PLAN-04]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [], mcp: [] }
  - id: ledger-feature
    scope_id: ledger-feature
    project: .
    depends_on: [plan-index]
    module: scripts/tracker.mjs
    language: javascript
    security: normal
    scope:
      read: [scripts/tracker.mjs, scripts/run-manifest.mjs, scripts/lib/core.mjs]
      docs: [docs/architecture/tracker.rules.md]
      write: [scripts/tracker.mjs, scripts/tracker.test.mjs, scripts/run-manifest.mjs, scripts/run-manifest.test.mjs]
    arch: [ARCH-TRACKER-01, ARCH-TRACKER-02, ARCH-TRACKER-04, ARCH-TRACKER-06, ARCH-TRACKER-07]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [], mcp: [] }
  - id: core-features
    scope_id: core-features
    project: .
    depends_on: [ledger-feature]
    module: scripts/lib/core.mjs
    language: javascript
    security: normal
    scope:
      read: [scripts/lib/core.mjs, scripts/lib/plan-index.mjs]
      docs: [docs/architecture/state.rules.md, docs/architecture/tracker.rules.md, docs/architecture/auto.rules.md]
      write: [scripts/lib/core.mjs, scripts/lib/core.test.mjs]
    arch: [ARCH-STATE-03, ARCH-TRACKER-08, ARCH-AUTO-08, ARCH-AUTO-09]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [], mcp: [] }
  - id: stop-feature
    scope_id: stop-feature
    project: .
    depends_on: [core-features]
    module: scripts/stop-gate.mjs
    language: javascript
    security: normal
    scope:
      read: [scripts/stop-gate.mjs, scripts/lib/core.mjs]
      docs: [docs/architecture/state.rules.md]
      write: [scripts/stop-gate.mjs, scripts/stop-gate.test.mjs]
    arch: [ARCH-STATE-04, ARCH-STATE-08]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [], mcp: [] }
  - id: claim-feature
    scope_id: claim-feature
    project: .
    depends_on: [plan-index]
    module: scripts/claim.mjs
    language: javascript
    security: normal
    scope:
      read: [scripts/claim.mjs, scripts/claim.test.mjs]
      docs: [docs/architecture/engine.rules.md]
      write: [scripts/claim.mjs, scripts/claim.test.mjs]
    arch: [ARCH-ENGINE-15]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [], mcp: [] }
  - id: rollups
    scope_id: rollups
    project: .
    depends_on: [ledger-feature]
    module: scripts/lib/tracker-rollup.mjs
    language: javascript
    security: normal
    scope:
      read: [scripts/tracker.mjs, scripts/pre-guard.mjs, scripts/lib/plan-index.mjs]
      docs: [docs/architecture/tracker.rules.md, docs/architecture/state.rules.md]
      write: [scripts/lib/tracker-rollup.mjs, scripts/lib/tracker-rollup.test.mjs, scripts/tracker.mjs, scripts/pre-guard.mjs, scripts/pre-guard.test.mjs]
    arch: [ARCH-TRACKER-01, ARCH-TRACKER-02, ARCH-TRACKER-10, ARCH-STATE-03]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [], mcp: [] }
  - id: repo-prepare
    scope_id: repo-prepare
    project: .
    depends_on: [config-keys, graph-features, claim-feature]
    module: scripts/repo-exec.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/repo-exec.mjs, scripts/worktree-sweep.mjs, scripts/lib/core.mjs, .gitignore]
      docs: [docs/architecture/landing.rules.md]
      write: [scripts/repo-exec.mjs, scripts/repo-exec.test.mjs, scripts/worktree-sweep.mjs, scripts/worktree-sweep.test.mjs, .gitignore]
    arch: [ARCH-LAND-05, ARCH-LAND-06, ARCH-LAND-09, ARCH-LAND-13, ARCH-LAND-16]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [], guards: [], mcp: [] }
  - id: land-unit
    scope_id: land-unit
    project: .
    depends_on: [repo-prepare]
    module: scripts/repo-exec.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/repo-exec.mjs, scripts/lib/land.mjs]
      docs: [docs/architecture/landing.rules.md]
      write: [scripts/repo-exec.mjs, scripts/repo-exec.test.mjs, scripts/lib/land.mjs, scripts/lib/land.test.mjs]
    arch: [ARCH-LAND-05, ARCH-LAND-06, ARCH-LAND-14]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [], guards: [], mcp: [] }
  - id: land-feature
    scope_id: land-feature
    project: .
    depends_on: [land-unit]
    module: scripts/repo-exec.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/repo-exec.mjs, scripts/lib/land.mjs]
      docs: [docs/architecture/landing.rules.md]
      write: [scripts/repo-exec.mjs, scripts/repo-exec.test.mjs]
    arch: [ARCH-LAND-05, ARCH-LAND-06, ARCH-LAND-10, ARCH-LAND-18]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [], guards: [], mcp: [] }
  - id: pr-submodule
    scope_id: pr-submodule
    project: .
    depends_on: [land-feature]
    module: scripts/repo-exec.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/repo-exec.mjs, scripts/lib/plan-submodules.mjs]
      docs: [docs/architecture/landing.rules.md]
      write: [scripts/repo-exec.mjs, scripts/repo-exec.test.mjs, scripts/lib/plan-submodules.mjs, scripts/lib/plan-submodules.test.mjs]
    arch: [ARCH-LAND-03, ARCH-LAND-05, ARCH-LAND-11, ARCH-LAND-12]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [], guards: [], mcp: [] }
  - id: publish
    scope_id: publish
    project: .
    depends_on: [rollups, repo-prepare]
    module: scripts/tracker-publish.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/tracker.mjs, scripts/repo-exec.mjs, scripts/lib/force-block.mjs, scripts/lib/tracker-rollup.mjs]
      docs: [docs/architecture/tracker.rules.md, docs/architecture/landing.rules.md]
      write: [scripts/tracker-publish.mjs, scripts/tracker-publish.test.mjs, scripts/tracker.mjs, scripts/repo-exec.mjs, scripts/lib/force-block.mjs]
    arch: [ARCH-TRACKER-01, ARCH-TRACKER-11, ARCH-TRACKER-12, ARCH-LAND-05, ARCH-LAND-17]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [], guards: [], mcp: [] }
  - id: shared-scope
    scope_id: shared-scope
    project: .
    depends_on: [repo-prepare]
    module: scripts/scope.mjs
    language: javascript
    security: normal
    scope:
      read: [scripts/scope.mjs, scripts/scope.test.mjs]
      docs: [docs/architecture/state.rules.md]
      write: [scripts/scope.mjs, scripts/scope.test.mjs]
    arch: [ARCH-STATE-03, ARCH-STATE-09]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [], mcp: [] }
  - id: engine-run
    scope_id: engine-run
    project: .
    depends_on: [land-feature, shared-scope, publish, graph-features]
    module: workflows/run.js
    language: javascript
    security: normal
    scope:
      read: [workflows/run.js, agents/unit-runner.md, scripts/wiring.test.mjs, scripts/doc-size-policy.mjs]
      docs: [docs/architecture/engine.rules.md, docs/architecture/state.rules.md, docs/architecture/slim.rules.md]
      write: [workflows/run.js, agents/unit-runner.md, commands/_features.md, scripts/wiring.test.mjs, scripts/doc-size-policy.mjs, scripts/engine.test.mjs]
    arch: [ARCH-ENGINE-03, ARCH-ENGINE-04, ARCH-ENGINE-13, ARCH-ENGINE-16, ARCH-ENGINE-17, ARCH-STATE-09, ARCH-SLIM-01, ARCH-SLIM-05]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [], mcp: [] }
  - id: guard-session
    scope_id: guard-session
    project: .
    depends_on: [core-features]
    module: scripts/orchestrate-scope-guard.mjs
    language: javascript
    security: normal
    scope:
      read: [scripts/orchestrate-scope-guard.mjs, scripts/session-context.mjs, scripts/lib/plan-index.mjs]
      docs: [docs/architecture/auto.rules.md, docs/architecture/state.rules.md]
      write: [scripts/orchestrate-scope-guard.mjs, scripts/orchestrate-scope-guard.test.mjs, scripts/session-context.mjs, scripts/session-context.test.mjs]
    arch: [ARCH-AUTO-06, ARCH-AUTO-09, ARCH-STATE-02]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [], mcp: [] }
  - id: command-docs
    scope_id: command-docs
    project: .
    depends_on: [engine-run, guard-session, init-stamp]
    module: commands/
    language: markdown
    security: normal
    scope:
      read: [commands/orchestrate.md, commands/auto.md, commands/instruction.md, commands/plan.md, commands/_features.md, skills/language-aware-planning/references/plan-template.md, scripts/doc-size-policy.mjs]
      docs: [docs/architecture/plan.rules.md, docs/architecture/slim.rules.md, docs/architecture/auto.rules.md, docs/architecture/engine.rules.md]
      write: [commands/orchestrate.md, commands/auto.md, commands/instruction.md, commands/plan.md, commands/_features.md, skills/language-aware-planning/references/plan-template.md, scripts/auto-command.test.mjs]
    arch: [ARCH-PLAN-03, ARCH-PLAN-06, ARCH-ENGINE-13, ARCH-AUTO-09, ARCH-SLIM-01, ARCH-SLIM-04, ARCH-SLIM-05, ARCH-SLIM-06]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [], mcp: [] }
  - id: release-docs
    scope_id: release-docs
    project: .
    depends_on: [command-docs, arch-lint, pr-submodule, claim-feature, stop-feature]
    module: CHANGELOG.md
    language: markdown
    security: normal
    scope:
      read: [CHANGELOG.md, README.md, EXTENDING.md]
      docs: [docs/architecture/slim.rules.md]
      write: [CHANGELOG.md, README.md, EXTENDING.md]
    arch: [ARCH-SLIM-08]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [], mcp: [] }
---

# Plan: plan-hierarchy

## Outcome
Epic, story and feature levels work across plan, orchestrate and auto, with one worktree per feature and progress published to main. Same meaning as `goal`.

## Scope Steps (executable core)

### Step 1 — plan-index (., javascript, normal)
Depends on: none
- [ ] 1.1 Create `scripts/lib/plan-index.mjs`: parse `docs/plans/*.md` frontmatter (slug, level, parent, children, priority, features groups, unit ids) into a tree; `level` absent = feature; `priority` inherited from `parent:`, default P2 → accept: unit test builds a 3-level tree and checks levels and inherited priority
- [ ] 1.2 Validate: refuse dangling or cyclic `parent:`, a parent of the wrong level, `parent: <story>` on a separate plan, and a `children:` list that disagrees with children's `parent:`; a `scrutinise-`/`investigate-` doc inherits its `parent:` plan's level → accept: one test per refusal and the inheritance case
- [ ] 1.3 Export `resolve(slug, {level, feature})` returning ordered features then units (`children:` order, else priority, then slug) and `descendantSlugs(slug)`; a plan without `features:` is one implicit feature (id = slug) → accept: tests for default level, `--feature`, implicit feature; `node --test scripts/lib/plan-index.test.mjs` passes

### Step 2 — config-keys (., json, normal)
Depends on: none
- [ ] 2.1 Add `planning.featureBranches` (false), `planning.featureUnitCap` (8), `tracker.publish` ("push"), `execution.maxSubagents` (0 = root-only, running at once), `execution.maxSessions` (1; reserved) with defaults that change no behaviour → accept: core.test asserts each default and that merged project config overrides them
- [ ] 2.2 Document in the same test that `execution.maxSessions` is read by nothing yet → accept: grep for `maxSessions` outside config and tests finds none

### Step 3 — graph-features (., javascript, normal)
Depends on: plan-index, config-keys
- [ ] 3.1 Teach `plan-graph.mjs` the optional step field `feature`: refuse a feature with more than `planning.featureUnitCap` units and a `depends_on` into a later feature; steps without a feature share one implicit feature → accept: tests for cap, later-feature dependency and implicit feature
- [ ] 3.2 Add `waves(steps, {maxSubagents})`: batches of 2+ steps only when `maxSubagents` ≥ 2, no `depends_on` between them and disjoint `scope.write`; otherwise one step per batch → accept: tests for cap 0, cap 2 disjoint, cap 2 overlapping writes, cap 2 dependent

### Step 4 — arch-lint (., javascript, normal)
Depends on: plan-index
- [ ] 4.1 `arch-check.mjs lint` runs plan-index validation over `docs/plans` and reports each refusal as an error with the plan path → accept: arch-check.test fixture with a cyclic parent fails lint; the repo's current plans still pass

### Step 5 — init-stamp (., javascript, normal)
Depends on: plan-index
- [ ] 5.1 `/init --update` and `/upgrade` stamp `level: feature` into canonical plan docs only; never touch `scope_id`, legacy hand-written rows or non-canonical docs → accept: init.test covers a canonical doc stamped, a legacy doc and `plugin-enhancements-handoff.md` untouched, and a second run is a no-op

### Step 6 — ledger-feature (., javascript, normal)
Depends on: plan-index
- [ ] 6.1 `tracker.mjs`: add status FEATURE_MERGED (needs ticked `[unit:]` criteria like MERGED, never auto-promoted, COMPLETE only through land-feature, which promotes every row of the feature) and optional ledger fields `feature`, `feature_branch`; `renderBlock` output unchanged → accept: tracker.test transitions and the existing snapshot still pass
- [ ] 6.2 `run-manifest.mjs`: keep `features[]` as units and add `feature_groups`; no migration rewrites `scope_id` → accept: run-manifest.test checks both keys on a plan with and without features

### Step 7 — core-features (., javascript, normal)
Depends on: ledger-feature
- [ ] 7.1 `[feature:<id>]` acceptance criteria gate that feature's land-feature; untagged criteria gate only the last feature's → accept: core.test cases for tagged, untagged and mixed lines
- [ ] 7.2 FEATURE_MERGED counts as open for grants, turn caps and force block, with +1 runner grant per feature → accept: core.test grant and force-block cases
- [ ] 7.3 `planStatuses`/`autoMarkerHolds` resolve a slug through `plan-index` descendants so an epic or story slug does not hold the marker for 24 h → accept: core.test with an epic slug whose children are COMPLETE releases the marker

### Step 8 — stop-feature (., javascript, normal)
Depends on: core-features
- [ ] 8.1 `stop-gate` blocks while an owned feature is all FEATURE_MERGED and unlanded; the background-tasks skip still applies → accept: stop-gate.test cases for blocked, landed and background-task skip

### Step 9 — claim-feature (., javascript, normal)
Depends on: plan-index
- [ ] 9.1 `claim.mjs` accepts unit `feature:<id>`; a second session claiming the same feature gets `unit already claimed`; stale recovery unchanged → accept: claim.test covers two claimants and a sanitised `:`

### Step 10 — rollups (., javascript, normal)
Depends on: ledger-feature
- [ ] 10.1 `scripts/lib/tracker-rollup.mjs`: render `docs/plans/<slug>/TRACKER.md` per epic and story from the ledger via plan-index (a parent is COMPLETE only when every descendant row is COMPLETE; counts, percent, links) inside `craftsman:rollup` fence markers → accept: snapshot test on a fixture ledger
- [ ] 10.2 `tracker.mjs` re-renders rollups after any transition of a descendant row and exposes a `rollup` action; the root `TRACKER.md` block is byte-identical → accept: tracker.test asserts root block unchanged and rollup updated
- [ ] 10.3 `pre-guard.mjs` blocks hand edits of rollup files and fences like the root tracker → accept: pre-guard.test blocks an Edit of `docs/plans/<slug>/TRACKER.md` and allows the generator

### Step 11 — repo-prepare (., javascript, high)
Depends on: config-keys, graph-features, claim-feature
- [ ] 11.1 `repo-exec prepare` with `feature` set (only when `planning.featureBranches`): worktree `<main checkout>/.worktrees/<plan>-<id>` on `feature/<plan>-<id>`, anchored at the main checkout root even from a linked `.claude/worktrees` session, reattach on repeat, branch pushed at creation, base guard accepts `feature/` → accept: repo-exec.test for reattach, linked-worktree anchoring and the push
- [ ] 11.2 Plan gate: prepare refuses while the plan doc, its parent chain or its rollups differ from `origin/<base>` (blob compare) → accept: repo-exec.test refusal and pass cases
- [ ] 11.3 `worktree-sweep` never sweeps `feature/` branches; add `.claude/worktrees/` to `.gitignore`; log `feature_worktree` and `plan_gate` events → accept: worktree-sweep.test and a grep of `.gitignore`

### Step 12 — land-unit (., javascript, high)
Depends on: repo-prepare
- [ ] 12.1 `repo-exec land-unit {worktree_path, unit}`: re-run the gate, check out the feature branch, merge `--no-ff` the unit branch, push the feature branch, delete the unit branch; log `land_unit` → accept: repo-exec.test happy path
- [ ] 12.2 A conflict PARKs with a decision (ARCH-LAND-06); a PARKED/BLOCKED unit keeps its branch and leaves the feature branch checked out clean → accept: repo-exec.test conflict and blocked cases

### Step 13 — land-feature (., javascript, high)
Depends on: land-unit
- [ ] 13.1 `repo-exec land-feature`: detached temp worktree, base merged in, gate re-run, `--no-ff`, push; feature lock then base lock; refuses unless `planning.featureBranches` and every row of the feature is FEATURE_MERGED → accept: repo-exec.test lands a two-unit feature and refuses an incomplete one
- [ ] 13.2 Conflicts, ff-only failures and rejected pushes PARK the feature's last unit with a decision; never `--force` → accept: repo-exec.test conflict case and a grep for force flags in the new code

### Step 14 — pr-submodule (., javascript, high)
Depends on: land-feature
- [ ] 14.1 `land: pr` mode: unit PRs target the feature branch; one feature PR targets base → accept: repo-exec.test with a stubbed `gh`
- [ ] 14.2 A submodule bump step shares its submodule steps' feature in `plan-submodules.mjs` → accept: plan-submodules.test

### Step 15 — publish (., javascript, high)
Depends on: rollups, repo-prepare
- [ ] 15.1 `scripts/tracker-publish.mjs` and `tracker.mjs publish`: under the base merge lock, fetch, add a detached temp worktree at `origin/<base>`, render the root block, rollups and `docs/plans/TRACKER.jsonl` there, `git add` only those pathspecs, commit `docs(tracker): …`, push `HEAD:<base>`; on rejection fetch, re-render and retry once; never PARK; honour `tracker.publish` off|push; log `tracker_published` / `tracker_publish_rejected` → accept: tracker-publish.test with a bare-remote fixture: idempotent bytes from two ledgers, retry after a competing push, off mode is a no-op
- [ ] 15.2 Refuse to shrink a committed non-empty block to empty without an archive event; `tracker.mjs init` rehydrates an absent local ledger from `TRACKER.jsonl` → accept: tests for refuse-to-blank and rehydrate
- [ ] 15.3 `force-block.mjs` allows the plain publish push and still blocks force flags → accept: pre-guard/force-block tests for both

### Step 16 — shared-scope (., javascript, normal)
Depends on: repo-prepare
- [ ] 16.1 Scope test for one worktree and two sequential units: activating unit B replaces unit A's scope (a.txt blocked, b.txt allowed); `release` between units; two wave worktrees hold two independent scopes → accept: scope.test cases pass; change `scope.mjs` only if a case fails

### Step 17 — engine-run (., javascript, normal)
Depends on: land-feature, shared-scope, publish, graph-features
- [ ] 17.1 `workflows/run.js`: group units by feature, carry the feature's `worktree_path` from the first unit's result to later units, call land-feature once after a feature's last unit, run waves only when `execution.maxSubagents` ≥ 2 and `planning.featureBranches` is true; single-feature path unchanged otherwise; no fs, shell, Date or import() → accept: wiring.test lint passes; engine.test covers grouping and an inert wave when the cap is 0
- [ ] 17.2 `commands/_features.md` (new, passed as protocolText): feature prepare/reattach, land-unit, scope release on land/park/block, land-feature, publish triggers; add a `doc-size-policy.mjs` budget for it; replace the matching prose in `agents/unit-runner.md` with a one-line pointer and keep it ≤ 3800 → accept: doc-size-policy PASS and wiring.test both engines reference the same unit-runner file

### Step 18 — guard-session (., javascript, normal)
Depends on: core-features
- [ ] 18.1 `orchestrate-scope-guard` sizes runner grants from the resolved feature plan, not the parent doc, and re-points the auto marker to the feature plan slug → accept: guard test with an epic slug resolving to two features
- [ ] 18.2 `session-context` resolves the slug through plan-index and prints its level in the existing line (no new lines) → accept: session-context.test

### Step 19 — command-docs (., markdown, normal)
Depends on: engine-run, guard-session, init-stamp
- [ ] 19.1 `/orchestrate` and `/auto` accept `--level epic|story|feature|unit` (default feature) and `--feature <id>`; `/instruction` goal text names the level, the feature and the wave allowance; `/plan` writes `level`, `parent`, `children`, `priority`; detail lives in `commands/_features.md`, read only at the point of need → accept: auto-command.test asserts the flags and that each command file stays within its budget
- [ ] 19.2 `plan-template.md` documents the new frontmatter fields; each edit to a full command is offset by an equal trim in the same file → accept: `node scripts/doc-size-policy.mjs` and `scripts/descriptions.test.mjs` pass

### Step 20 — release-docs (., markdown, normal)
Depends on: command-docs, arch-lint, pr-submodule, claim-feature, stop-feature
- [ ] 20.1 README and EXTENDING: levels, rollups, publish, the new config keys and the dark-by-default flags → accept: grep finds each key in README or EXTENDING
- [ ] 20.2 CHANGELOG `[Unreleased]`: one entry for plan-hierarchy (edit an existing bullet if present), file stays under 8 KB → accept: `wc -c CHANGELOG.md` and a grep for the entry

## Sequencing
plan-index → config → graph/arch-lint/init → ledger → core/stop/claim → rollups → repo-exec (prepare, land-unit, land-feature, pr) → publish → scope test → engine → guards → docs. Foundations and pure libs first; repo-exec units run one after another because they share a file; docs last so they describe shipped behaviour.

## Verification background   (citations — for the reviewer, not the executor)
- Feature code from `feature-branch-plans` is absent today: `grep` for FEATURE_MERGED, land-feature, `features:` finds nothing in `scripts/`; this plan builds the script-level half of that design as well (owner chose Option B).
- `parent:` already means "source plan" for scrutinise docs — `docs/plans/scrutinise-autonomous-e2e-loop.md:4`.
- `repo-exec merge` uses `--no-ff` and an ancestry check — `scripts/repo-exec.mjs:234-237`.
- Scope matching picks the innermost root — `scripts/scope.mjs:90-97`.
- `autoMarkerHolds` returns true for a slug with no rows — `scripts/lib/core.mjs:319-320`.
- Ledger path — `scripts/tracker.mjs:120`; root `TRACKER.md` rendered in the main checkout — `scripts/tracker.mjs:112-124`.
- Doc caps — `scripts/doc-size-policy.mjs:21-31`; `orchestrate.md` 9911/10000, `plan.md` 9969/10000, `unit-runner.md` 3798/3800.

CONSUMERS:
- plan-index API → `scripts/arch-check.mjs` (4.1), `scripts/lib/core.mjs` (7.3), `scripts/tracker.mjs` (10.2), `scripts/orchestrate-scope-guard.mjs` (18.1), `scripts/session-context.mjs` (18.2), `scripts/init.mjs` (5.1)
- ledger fields `feature`/`feature_branch`, status FEATURE_MERGED → `scripts/tracker.mjs`, `scripts/run-manifest.mjs`, `scripts/lib/core.mjs` (7.2), `scripts/stop-gate.mjs` (8.1), `workflows/run.js` (17.1)
- `repo-exec` actions `prepare` (feature), `land-unit`, `land-feature` → `agents/unit-runner.md`, `workflows/run.js`, `commands/_features.md`
- `tracker.publish`, `planning.*`, `execution.maxSubagents` config keys → `scripts/tracker-publish.mjs`, `scripts/plan-graph.mjs`, `workflows/run.js`

## Risk & rollback
- Behavioural changes are dark by default: `planning.featureBranches: false` keeps per-unit worktrees and sequential units; `execution.maxSubagents: 0` keeps waves off; `tracker.publish: off` turns publishing off. Revert any step with `git revert`; generated rollups are deletable.
- `ARCH-LAND-10` and `ARCH-ENGINE-16` require live spikes (feature merge/sync/land-feature/conflict park/sweep; two wave worktrees; a `node` push from a `.claude/worktrees` session). Those are not run by this plan; the flags stay off until the spike evidence is recorded.
- This plan has 20 units and no `features:` groups; once `planning.featureUnitCap` (8) is enforced by `plan-graph`, split a re-run of it into features.
- Repo-exec steps 11-15 share files and run strictly in order.

## Out of scope
- DOCS-01..09 doc retirement (`doc-retire.mjs`, `/sync-docs --archive|--prune`), TRACKER-09 archive lookup, AUTO-… slim ratchet: sibling Part B, plus ARCH-DOCS-09.
- `/focus` and `scripts/focus.mjs` (not built; plugin-overhaul), the `ready`/`/queue` dispatcher, `execution.maxSessions` behaviour.
- Running the live spikes and flipping the flags on.
- Adding the new lib files to `tracker.rules.md` `governs`: `/architect --update tracker` after merge.
