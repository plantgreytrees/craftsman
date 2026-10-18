---
slug: feature-branch-plans
goal: Finished plans retire to one archive line with their commit ids, stale docs can be pruned safely, and every craftsman file has an enforced size cap.
idea: docs/ideas/feature-branch-plans.md
priority: P2
classification: in-scope (docs/ideas/feature-branch-plans.md verdict pursue-with-changes; docs/architecture/docs.rules.md, slim.rules.md, tracker.rules.md ARCH-TRACKER-09)
tracker_rows: [TRACKER#feature-branch-plans]
guards:
  blast_radius: done
  completeness_sweep: done
  blind_rederivation: skipped(config:never)
coverage:
  contract:      3.1 | archive heading format/parse pair + `tracker.mjs lookup`; consumers 2.2, 6.1, 7.1, 7.2 (CONSUMERS block)
  data:          3.1 | TRACKER-archive.md heading gains goal/doc/landed shas; legacy headings still parse
  config:        N/A(no new config keys; docWriteGuard reused)
  security:      2.1, 4.2 | deletion needs the doc-write grant in script and pre-guard; reference refusal has no force path
  tests:         every unit has its own test task
  observability: 2.3, 1.1, 11.1 | doc_retired / doc_prune_refused events; hook latency p50/p95 budget
  interface:     6.1 | /sync-docs --archive / --prune
  docs:          6.1, 7.1, 10.1 | sync-docs prune doc, idea overlap scan, CHANGELOG
  rollback:      every unit is additive or a cap; revert the unit's merge commit. Retired docs stay in git history at the archived doc sha.
units:
  - id: stats-latency
    scope_id: stats-latency
    project: .
    depends_on: []
    module: scripts/stats.mjs
    language: javascript
    security: normal
    scope:
      read: [scripts/stats.mjs, scripts/stats.test.mjs, hooks/hooks.json, .github/workflows/ci.yml]
      docs: [docs/architecture/mod.rules.md, docs/architecture/slim.rules.md]
      write: [scripts/stats.mjs, scripts/stats.test.mjs, .github/workflows/ci.yml]
    arch: [ARCH-MOD-03, ARCH-SLIM-07]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [], mcp: [] }
  - id: doc-retire
    scope_id: doc-retire
    project: .
    depends_on: []
    module: scripts/doc-retire.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/tracker.mjs, scripts/pre-guard.mjs, scripts/doc-write.mjs, scripts/lib/core.mjs]
      docs: [docs/architecture/docs.rules.md]
      write: [scripts/doc-retire.mjs, scripts/doc-retire.test.mjs]
    arch: [ARCH-DOCS-02, ARCH-DOCS-07, ARCH-DOCS-08]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [], guards: [], mcp: [] }
  - id: tracker-lookup
    scope_id: tracker-lookup
    project: .
    depends_on: []
    module: scripts/tracker.mjs
    language: javascript
    security: normal
    scope:
      read: [scripts/tracker.mjs, scripts/tracker.test.mjs, docs/plans/TRACKER-archive.md]
      docs: [docs/architecture/tracker.rules.md, docs/architecture/docs.rules.md]
      write: [scripts/tracker.mjs, scripts/tracker.test.mjs]
    arch: [ARCH-TRACKER-01, ARCH-TRACKER-09, ARCH-DOCS-05]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [], mcp: [] }
  - id: doc-retire-tree
    scope_id: doc-retire-tree
    project: .
    depends_on: [doc-retire, tracker-lookup]
    module: scripts/doc-retire.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/doc-retire.mjs, scripts/doc-retire.test.mjs, scripts/lib/plan-index.mjs, scripts/lib/core.mjs, scripts/pre-guard.mjs, scripts/pre-guard.test.mjs]
      docs: [docs/architecture/docs.rules.md, docs/architecture/state.rules.md]
      write: [scripts/doc-retire.mjs, scripts/doc-retire.test.mjs, scripts/lib/core.mjs, scripts/lib/core.test.mjs, scripts/pre-guard.mjs, scripts/pre-guard.test.mjs]
    arch: [ARCH-DOCS-07, ARCH-DOCS-09, ARCH-STATE-02, ARCH-STATE-06]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [], guards: [], mcp: [] }
  - id: source-lint
    scope_id: source-lint
    project: .
    depends_on: []
    module: scripts/arch-check.mjs
    language: javascript
    security: normal
    scope:
      read: [scripts/arch-check.mjs, scripts/arch-check.test.mjs]
      docs: [docs/architecture/docs.rules.md]
      write: [scripts/arch-check.mjs, scripts/arch-check.test.mjs]
    arch: [ARCH-DOCS-03]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [], mcp: [] }
  - id: sync-docs-modes
    scope_id: sync-docs-modes
    project: .
    depends_on: [doc-retire-tree]
    module: commands/sync-docs.md
    language: markdown
    security: normal
    scope:
      read: [commands/sync-docs.md, scripts/doc-retire.mjs, scripts/wiring.test.mjs, scripts/doc-size-policy.mjs]
      docs: [docs/architecture/docs.rules.md, docs/architecture/slim.rules.md]
      write: [commands/sync-docs.md, commands/_sync-docs-prune.md, scripts/wiring.test.mjs, scripts/doc-size-policy.mjs]
    arch: [ARCH-DOCS-04, ARCH-DOCS-05, ARCH-SLIM-01, ARCH-SLIM-04]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [], mcp: [] }
  - id: lookup-callers
    scope_id: lookup-callers
    project: .
    depends_on: [tracker-lookup]
    module: commands/
    language: markdown
    security: normal
    scope:
      read: [commands/idea.md, commands/auto.md, commands/instruction.md, commands/orchestrate.md, scripts/auto-command.test.mjs]
      docs: [docs/architecture/docs.rules.md, docs/architecture/auto.rules.md, docs/architecture/plan.rules.md, docs/architecture/slim.rules.md]
      write: [commands/idea.md, commands/auto.md, commands/instruction.md, commands/orchestrate.md, scripts/auto-command.test.mjs]
    arch: [ARCH-DOCS-05, ARCH-DOCS-06, ARCH-PLAN-06, ARCH-SLIM-02]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [], mcp: [] }
  - id: trim-at-cap
    scope_id: trim-at-cap
    project: .
    depends_on: [lookup-callers, sync-docs-modes]
    module: commands/
    language: markdown
    security: normal
    scope:
      read: [commands/_shared-execution.md, commands/sync-docs.md, commands/plan.md, commands/orchestrate.md, commands/_architecture.md, agents/unit-runner.md, scripts/doc-size-policy.mjs, scripts/wiring.test.mjs, scripts/stats.mjs]
      docs: [docs/architecture/slim.rules.md, docs/architecture/engine.rules.md, docs/architecture/tracker.rules.md]
      write: [commands/_shared-execution.md, commands/sync-docs.md, commands/plan.md, commands/orchestrate.md, commands/_architecture.md, agents/unit-runner.md, scripts/wiring.test.mjs]
    arch: [ARCH-SLIM-04, ARCH-SLIM-05, ARCH-SLIM-06, ARCH-TRACKER-05]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [], mcp: [] }
  - id: size-policy
    scope_id: size-policy
    project: .
    depends_on: [trim-at-cap]
    module: scripts/doc-size-policy.mjs
    language: javascript
    security: normal
    scope:
      read: [scripts/doc-size-policy.mjs, scripts/init.mjs, scripts/descriptions.test.mjs]
      docs: [docs/architecture/slim.rules.md]
      write: [scripts/doc-size-policy.mjs, scripts/doc-size-policy.test.mjs]
    arch: [ARCH-SLIM-01, ARCH-SLIM-02, ARCH-SLIM-03]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [], mcp: [] }
  - id: changelog-cut
    scope_id: changelog-cut
    project: .
    depends_on: [size-policy, hook-timing, source-lint]
    module: CHANGELOG.md
    language: markdown
    security: normal
    scope:
      read: [CHANGELOG.md, scripts/descriptions.test.mjs]
      docs: [docs/architecture/slim.rules.md]
      write: [CHANGELOG.md, scripts/changelog.test.mjs]
    arch: [ARCH-SLIM-08, ARCH-SLIM-09]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [], mcp: [] }
  - id: hook-timing
    scope_id: hook-timing
    project: .
    depends_on: [doc-retire-tree, stats-latency]
    module: scripts/pre-guard.mjs
    language: javascript
    security: normal
    scope:
      read: [scripts/pre-guard.mjs, scripts/stop-gate.mjs, scripts/pre-guard.test.mjs, scripts/stop-gate.test.mjs]
      docs: [docs/architecture/state.rules.md, docs/architecture/slim.rules.md]
      write: [scripts/pre-guard.mjs, scripts/stop-gate.mjs, scripts/pre-guard.test.mjs, scripts/stop-gate.test.mjs]
    arch: [ARCH-STATE-04, ARCH-SLIM-07]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [], mcp: [] }
---

# Plan: feature-branch-plans — doc retirement and slim caps

## Outcome
Finished plans retire to one archive line with their commit ids, stale docs can be pruned safely, and every craftsman file has an enforced size cap. Same meaning as `goal`. The feature layer itself (features, `land-feature`, `--update` stamping) ships in `docs/plans/plan-hierarchy.md`.

## Scope Steps (executable core)

Units 1–2 run now. Units 3–11 start BLOCKED on `plan-hierarchy` (shared files; `scripts/lib/plan-index.mjs` comes from its plan-index unit); unblock each to PENDING once that plan is COMPLETE. `doc-retire.mjs` is not wired into any command until unit 6, so its partial rules before units 3–4 are never exercised.

### Step 1 — stats-latency (., javascript, normal)
Depends on: none
- [ ] 1.1 `stats.mjs`: report p50/p95 (existing nearest-rank `pct`, `stats.mjs:40-43`; print `n<20` beside small samples) for every event type that carries `ms`, and flag one whose p95 exceeds 80% of its `hooks/hooks.json` timeout → accept: stats.test with fixture events covers flagged, unflagged and small-sample output
- [ ] 1.2 `ci.yml`: warn (not fail) when the `scripts/**/*.mjs` byte total grows against the base branch → accept: the step prints the delta and exits 0

### Step 2 — doc-retire (., javascript, high)
Depends on: none
- [ ] 2.1 Create `scripts/doc-retire.mjs` exporting `retire({plan}, context)` returning `{retired, siblings}` or `{refused, reason, referrers}`; the CLI mirrors `tracker.mjs`'s error path. Refuse without the doc-write grant: the `doc-write-pending` marker (`doc-write.mjs:15`), else the session marker when `--sid` is given → accept: doc-retire.test on a temp git repo (context param, no mocks) covers no-grant refusal with no file or ledger change
- [ ] 2.2 Referrers = `git grep -l -F` for the plan path and slug over tracked files (rules `cite:`/`source:`, `scripts/*.test.mjs`, top-level `*.md`, `docs/**` incl. `related:`), excluding the plan, its retiring siblings and `docs/plans/TRACKER*.md`; any hit refuses and lists every referrer; no force option → accept: test covers a referrer listed, a closed sibling citing its parent not blocking, and no bypass flag
- [ ] 2.3 Order: check every refusal (grant, referrers, open siblings keep the plan) → record `doc_sha` = HEAD (must contain the files) → `git rm` plan + closed `scrutinise-`/`investigate-` siblings (staged) → `tracker.mjs archive` with `{plan, goal, doc_sha, landed_sha}`; if archive throws, restore the staged files → commit `docs: retire <plan>` → accept: test covers success, archive refusal leaving files and ledger unchanged, and the commit holding the removal + archive
- [ ] 2.4 `logEvent` `doc_retired {plan, sha, siblings}` and `doc_prune_refused {path, cited_by}` → accept: test reads both events

### Step 3 — tracker-lookup (., javascript, normal) — BLOCKED on plan-hierarchy
Depends on: none
- [ ] 3.1 One `formatArchiveHeading`/`parseArchiveHeading` pair: `## <plan> (<date>) — <goal> · doc <sha> · landed <sha>`, where `goal` has ` · ` and ` — ` replaced by `; `; `archivePlan` (`tracker.mjs:402`) writes it when given the fields, the legacy `## <plan> (<date>)` otherwise → accept: tracker.test round-trips a goal containing both separators and covers the legacy form
- [ ] 3.2 Idea index heading `## idea <slug> (<date>) — <verdict> · <deciding fact> · doc <sha>` in the same pair; action `lookup {plan|slug}` returns the parsed record or `null` → accept: tracker.test covers full, legacy, idea and miss

### Step 4 — doc-retire-tree (., javascript, high) — BLOCKED on plan-hierarchy
Depends on: doc-retire, tracker-lookup
- [ ] 4.1 Move the grant check into `core.mjs` `hasDocWriteGrant({sid}, context)`; `pre-guard.mjs:301-302` and `doc-retire.mjs` both call it → accept: core.test covers pending, session and none; pre-guard.test unchanged and green
- [ ] 4.2 `pre-guard.mjs`: block `git rm`/`rm` (including chained commands) of a `docWriteGuard.docPaths` file without the grant, beside the Write-tool check (`pre-guard.mjs:289-305`) → accept: pre-guard.test covers blocked, chained-blocked and granted
- [ ] 4.3 `doc-retire.mjs`: refuse a parent whose descendants are live (`plan-index` `descendantSlugs`) and remove the plan's `docs/plans/<slug>/TRACKER.md` rollup → accept: doc-retire.test covers both; a successful retire writes the full DOCS-09 heading

### Step 5 — source-lint (., javascript, normal) — BLOCKED on plan-hierarchy
Depends on: none
- [ ] 5.1 `arch-check lint` fails a rules doc whose `source:` file is missing, naming the path (`arch-check.mjs:216-217`) → accept: arch-check.test covers it; `lint` on this repo still PASSes

### Step 6 — sync-docs-modes (., markdown, normal) — BLOCKED on plan-hierarchy
Depends on: doc-retire-tree
- [ ] 6.1 New `commands/_sync-docs-prune.md`, read only under `--archive`/`--prune`: archive retires COMPLETE plans via `doc-retire.mjs`; prune dry-runs, confirms each round of ≤15, skips docs named by a live row/claim/hand-off, touches non-craftsman folders only when named, prunes an uncited rejected/deferred idea to its index heading (3.2), and is never covered by `/goal` pre-approval → accept: wiring.test asserts the flags, dry run, ≤15, skip list and /goal exception
- [ ] 6.2 Add its cap to `doc-size-policy.mjs` in this merge; `sync-docs.md` gets one pointer line, net bytes ≤ 0 → accept: `wc -c` not larger than before; size policy green

### Step 7 — lookup-callers (., markdown, normal) — BLOCKED on plan-hierarchy
Depends on: tracker-lookup
- [ ] 7.1 `idea.md` Phase 1 overlap scan lists `TRACKER-archive.md` (`idea.md:30`) → accept: auto-command.test asserts it
- [ ] 7.2 `auto.md`, `instruction.md`, `orchestrate.md`: resolve an unknown slug through `tracker.mjs lookup` before treating it as new work; each of the four files net bytes ≤ 0 → accept: auto-command.test asserts each; arch-check.test unit-budget case still passes

### Step 8 — trim-at-cap (., markdown, normal) — BLOCKED on plan-hierarchy
Depends on: lookup-callers, sync-docs-modes
- [ ] 8.1 Record `stats.mjs` block rates, then trim every loadable `.md` within 1% of its cap (today: `_shared-execution`, `sync-docs`, `plan`, `orchestrate`, `_architecture`, `unit-runner`) to ≤ 95%: delete only hook/script-enforced prose or move it into a doc the command already reads; conditional detail never moves into an always-read doc; keep the unit-runner smoke step (ARCH-TRACKER-05); each removed MUST names its enforcer → accept: each file ≤ 95% of cap; suite + descriptions.test green; before/after block rates in the merge evidence

### Step 9 — size-policy (., javascript, normal) — BLOCKED on plan-hierarchy
Depends on: trim-at-cap
- [ ] 9.1 Per-file caps for every loadable `.md` (commands, `_*`, agents, SKILL.md, skill references) set to current size; an unmatched file is a finding (`doc-size-policy.mjs:53`) → accept: doc-size-policy.test covers an unmatched skill reference failing and a file 1 byte over
- [ ] 9.2 Per-invocation total per command (command + shared docs it reads unconditionally) with its own cap; the ratchet test compares each cap with the merge-base's `doc-size-policy.mjs` (`git show`), skipping when no git → accept: test fails when a cap rises or a command's total exceeds its cap

### Step 10 — changelog-cut (., markdown, normal) — BLOCKED on plan-hierarchy
Depends on: size-policy, hook-timing, source-lint
- [ ] 10.1 Cut `## [2.2.0] - <date>` from `[Unreleased]` (next SemVer minor after `[2.1.0]`, `CHANGELOG.md:521`; chosen in /architect), add one bullet for this plan, and `scripts/changelog.test.mjs` caps `[Unreleased]` at 8 KB → accept: test passes; descriptions.test total ≤ 8500 unchanged

### Step 11 — hook-timing (., javascript, normal) — BLOCKED on plan-hierarchy
Depends on: doc-retire-tree, stats-latency
- [ ] 11.1 Add `ms` to pre-guard's and stop-gate's terminal `logEvent` calls (`stop-gate.mjs:323-325`; pre-guard's allow/block exits) so 1.1 reports them; no change to decisions → accept: pre-guard.test and stop-gate.test read `ms` on pass and block; behaviour tests unchanged

## Sequencing
Units 1–2 now (new files or no overlap). Then plan-hierarchy lands. Then 3, 5 (independent) → 4 → 6, 7, 11 → 8 → 9 → 10. Caps are set after the trims so the ratchet starts from the final sizes; units 4 and 11 both write `pre-guard.mjs`, so 11 follows 4.

## Verification background
- Archive heading is written today without goal or shas, before any file removal — `scripts/tracker.mjs:384-403`
- tracker actions dispatch — `scripts/tracker.mjs:416-424`
- Scripts get no session id; doc-write drops a pending grant that pre-guard claims per session — `scripts/doc-write.mjs:5-15`, `scripts/pre-guard.mjs:301-302`
- Doc-write check covers Write tools only — `scripts/pre-guard.mjs:289-292`
- Skill references are skipped by the size policy — `scripts/doc-size-policy.mjs:53`
- Only the quality gate logs `ms` — `scripts/quality-gate.mjs:60-96`; stop-gate's final events — `scripts/stop-gate.mjs:323-325`
- Descriptions total cap 8500 — `scripts/descriptions.test.mjs:16`
- At-cap today (bytes/cap): `_shared-execution` 13499/13500, `sync-docs` 9987/10000, `plan` 9969/10000, `orchestrate` 9911/10000, `_architecture` 3996/4000, `unit-runner` 3798/3800 — `scripts/doc-size-policy.mjs:21-32`
- Smoke step to keep — `agents/unit-runner.md:14` (ARCH-TRACKER-05)
- plan-hierarchy writes `tracker.mjs`, `pre-guard.mjs`, `core.mjs`, `arch-check.mjs`, `doc-size-policy.mjs`, `wiring.test.mjs`, `unit-runner.md`, the four loop commands and `CHANGELOG.md` — `docs/plans/plan-hierarchy.md:33-280`

CONSUMERS:
- `TRACKER-archive.md` heading (format/parse pair, 3.1) → `tracker.mjs lookup` (3.2), `doc-retire.mjs` (2.3, 4.3), `/sync-docs --prune` idea index (6.1), `/idea` overlap scan (7.1), `/auto`, `/instruction`, `/orchestrate` slug resolution (7.2)
- `doc-retire.mjs retire` → `/sync-docs --archive` (6.1)
- `hasDocWriteGrant` → `pre-guard.mjs`, `doc-retire.mjs` (4.1)

## Risk & rollback
Deletion is the only destructive path: every refusal is checked before anything changes, the archive and removal land in one commit, and every retired doc is recoverable at its `doc <sha>`. Trimming can drop guidance: only enforced prose goes, and block rates are compared. Revert any unit by its merge commit.

## Out of scope
Feature layer, `land-feature`, rollups, publish, `[feature:]` gate and `--update` stamping (plan-hierarchy, ARCH-PLAN-04). A plugin version field (none exists in `.claude-plugin/plugin.json`).
