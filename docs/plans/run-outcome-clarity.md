---
slug: run-outcome-clarity
goal: /auto and /digest print a derived run outcome (delivered | stopped — needs you | open | not determined); follow-ups are counted separately and never block
level: feature
priority: P1
idea: docs/ideas/run-outcome-clarity.md
classification: in-scope — /craftsman:idea 2026-11-25 pursue-with-changes; /craftsman:architect --deep 2026-11-26 (ARCH-TRACKER-17..21, ARCH-AUTO-12, ARCH-PLAN-09)
tracker_rows: [TRACKER#leak-isolation, TRACKER#purge-action, TRACKER#outcome-core, TRACKER#outcome-wiring, TRACKER#digest-outcome, TRACKER#outcome-wording]
guards:
  blast_radius: done
  completeness_sweep: done
  blind_rederivation: skipped(config:never)
coverage:
  contract:      3.1 (plan-index node gains `planned`, additive), 4.2 (run manifest gains `outcome`, additive), 4.1 (tracker.mjs gains `outcome`), 2.1 (tracker.mjs gains `purge`), 2.3 (ledger-keys excuses tracker_purged); consumers in CONSUMERS
  data:          2.1 (purge removes a plan's events under the ledger lock; never run on the real ledger by this plan, ARCH-TRACKER-19); no schema migration (events gain no required field, ARCH-TRACKER-02)
  config:        N/A(no new config key; maxSessions, tracker.publish unchanged)
  security:      2.1-2.2 (purge refuses an autonomous caller and an active /auto run; refuses a plan with a doc or archive heading), 1.1-1.3 (tests can no longer write the real ledger)
  tests:         1.1, 1.3, 2.2, 2.4, 3.2, 3.4, 4.4, 5.2, 6.3 (each red first on the old code)
  observability: 4.1 (run_outcome), 4.3 (tracker_row_unclassified), 2.1 (tracker_purged)
  interface:     4.1 (`tracker.mjs outcome` CLI), 2.1 (`tracker.mjs purge` CLI), 5.1 (digest output), 6.1-6.2 (/auto Finish and /goal template wording)
  docs:          6.5 (CHANGELOG [Unreleased]); rules docs already written by /architect; /sync-docs --all re-verifies cites after merge
  rollback:      revert each unit's merge commit; every change is additive or wording; purge is never executed by this plan
units:
  - id: 1
    scope_id: leak-isolation
    project: .
    depends_on: []
    module: test fixtures + ledger isolation regression test
    language: javascript
    security: normal
    scope:
      read: [scripts/digest.test.mjs, scripts/run-manifest.test.mjs, scripts/loop-smoke.test.mjs]   # tracker.test.mjs (37 KB): grep -n mkdtempSync and edit those fixtures by range; core.mjs: read 160-200 only (mainCheckoutRoot)
      docs: [docs/architecture/tracker.rules.md]
      write: [scripts/lib/fixture-root.mjs, scripts/tracker-isolation.test.mjs, scripts/digest.test.mjs, scripts/run-manifest.test.mjs, scripts/loop-smoke.test.mjs, scripts/tracker.test.mjs]
    arch: [ARCH-TRACKER-20]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [test-driven-development], guards: [], mcp: [] }
  - id: 2
    scope_id: purge-action
    project: .
    depends_on: [leak-isolation]
    module: tracker.mjs purge + ledger-keys excusal
    language: javascript
    security: high
    scope:
      read: [scripts/lib/ledger-keys.mjs, scripts/lib/fixture-root.mjs, scripts/lib/ledger-rows.mjs]   # tracker.mjs (33 KB): read 1-20, 120-140, 225-235, 470-600 by range; core.mjs: grep -n "autoActive\|export function sidOf" and read those lines only
      docs: [docs/architecture/tracker.rules.md]
      write: [scripts/tracker.mjs, scripts/lib/ledger-keys.mjs, scripts/lib/ledger-rows.mjs, scripts/tracker-purge.test.mjs, scripts/tracker.test.mjs]   # tracker.test.mjs and ledger-rows.mjs: the ARCH-TRACKER-13 comment lines only
    arch: [ARCH-TRACKER-19, ARCH-TRACKER-02, ARCH-TRACKER-04, ARCH-TRACKER-11]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [test-driven-development], guards: [], mcp: [] }
  - id: 3
    scope_id: outcome-core
    project: .
    depends_on: []
    module: plan-index planned ids + pure lib/plan-outcome.mjs
    language: javascript
    security: normal
    scope:
      read: [scripts/lib/plan-index.mjs, scripts/lib/plan-index.test.mjs]
      docs: [docs/architecture/plan.rules.md, docs/architecture/tracker.rules.md]
      write: [scripts/lib/plan-index.mjs, scripts/lib/plan-index.test.mjs, scripts/lib/plan-outcome.mjs, scripts/lib/plan-outcome.test.mjs]
    arch: [ARCH-PLAN-09, ARCH-PLAN-02, ARCH-PLAN-04, ARCH-TRACKER-17, ARCH-TRACKER-04, ARCH-TRACKER-06]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [test-driven-development], guards: [], mcp: [] }
  - id: 4
    scope_id: outcome-wiring
    project: .
    depends_on: [leak-isolation, outcome-core]
    module: tracker.mjs outcome action, run manifest key, unclassified warning
    language: javascript
    security: normal
    scope:
      read: [scripts/run-manifest.mjs, scripts/run-manifest.test.mjs, scripts/lib/plan-outcome.mjs, scripts/lib/fixture-root.mjs]   # tracker.mjs (33 KB): read 1-20, 300-330, 595-620 by range
      docs: [docs/architecture/tracker.rules.md]
      write: [scripts/tracker.mjs, scripts/run-manifest.mjs, scripts/run-manifest.test.mjs, scripts/tracker-outcome.test.mjs]
    arch: [ARCH-TRACKER-17, ARCH-TRACKER-21, ARCH-TRACKER-01, ARCH-TRACKER-02, ARCH-TRACKER-07]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [test-driven-development], guards: [], mcp: [] }
  - id: 5
    scope_id: digest-outcome
    project: .
    depends_on: [outcome-core]
    module: digest done set + per-plan outcome line
    language: javascript
    security: normal
    scope:
      read: [scripts/digest.mjs, scripts/digest.test.mjs, scripts/loop-smoke.test.mjs, scripts/lib/plan-outcome.mjs]
      docs: [docs/architecture/tracker.rules.md]
      write: [scripts/digest.mjs, scripts/digest.test.mjs, scripts/loop-smoke.test.mjs]
    arch: [ARCH-TRACKER-18, ARCH-TRACKER-17]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [test-driven-development], guards: [], mcp: [] }
  - id: 6
    scope_id: outcome-wording
    project: .
    depends_on: [outcome-wiring, digest-outcome, purge-action]
    module: /auto Finish, /goal template, _features wording; stale ARCH-AUTO-09 cites; CHANGELOG
    language: markdown
    security: normal
    scope:
      read: [commands/auto.md, commands/instruction.md, commands/_features.md, scripts/auto-command.test.mjs]   # doc-size-policy.mjs: grep -n the three files' caps only; CHANGELOG.md: read the [Unreleased] head by range; orchestrate-scope-guard.mjs/.test.mjs, core.mjs, core.test.mjs: grep -n ARCH-AUTO-09 and edit those comment lines only
      docs: [docs/architecture/auto.rules.md, docs/architecture/slim.rules.md, docs/architecture/plan.rules.md, docs/architecture/engine.rules.md, docs/architecture/state.rules.md, docs/architecture/safety.rules.md]
      write: [commands/auto.md, commands/instruction.md, commands/_features.md, scripts/auto-command.test.mjs, scripts/orchestrate-scope-guard.mjs, scripts/orchestrate-scope-guard.test.mjs, scripts/lib/core.mjs, scripts/lib/core.test.mjs, CHANGELOG.md]
    arch: [ARCH-AUTO-12, ARCH-AUTO-03, ARCH-AUTO-04, ARCH-SLIM-17, ARCH-SLIM-18, ARCH-PLAN-06, ARCH-ENGINE-18, ARCH-SAFETY-02, ARCH-STATE-03]   # engine/safety/state: comment-only edits there; behaviour must not change
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [verification-before-completion], guards: [doc-size-policy], mcp: [] }
---

# Plan: Say plainly whether a run delivered, stopped, or left only follow-ups

## Outcome
`/auto` and `/digest` print a derived run outcome (delivered | stopped — needs you | open | not determined). Follow-ups are counted separately and never block.

## Scope Steps (executable core)

### Step 1 — leak-isolation (., javascript, normal)
Tooling: implementer implementer · gates code-reviewer · skills test-driven-development
Depends on: none
- [ ] 1.1 Write `scripts/tracker-isolation.test.mjs` first:
  - Create a scratch git repo R with a committed `.craftsman/tracker/events.jsonl` holding one sentinel event.
  - Spawn `node --test scripts/digest.test.mjs scripts/run-manifest.test.mjs scripts/loop-smoke.test.mjs scripts/tracker.test.mjs` with `TMPDIR=R/tmp`, then again with `GIT_DIR=R/.git`.
  - After each run, assert R's ledger bytes are unchanged and `R/.craftsman/runs/` does not exist.

  → accept: it FAILS on the current fixtures (record the failing output as evidence). This is ARCH-TRACKER-20's red test.
- [ ] 1.2 Add `scripts/lib/fixture-root.mjs`, exporting `gitRootedTmp(prefix)`:
  - It runs `fs.mkdtempSync(os.tmpdir()…)` plus `git init -q` in the new directory and returns its realpath.
  - On import it deletes `process.env.GIT_DIR` and `process.env.GIT_WORK_TREE`. An inherited GIT_DIR overrides git's repo discovery, so the git-init alone cannot stop that case.

  → accept: a one-line unit check inside 1.1's file shows that `git -C <root> rev-parse --show-toplevel` equals the returned root.
- [ ] 1.3 Switch the leaking fixture roots to `gitRootedTmp`:
  - `scripts/digest.test.mjs:10`
  - `scripts/run-manifest.test.mjs` context()
  - `scripts/loop-smoke.test.mjs` (the workspace root behind `selected`)
  - `scripts/tracker.test.mjs:14,452,510,542` (grep `mkdtempSync`)

  → accept: 1.1 passes; `node --test scripts/digest.test.mjs scripts/run-manifest.test.mjs scripts/loop-smoke.test.mjs scripts/tracker.test.mjs` passes; `git diff --stat .craftsman/tracker/events.jsonl` is empty after the full suite runs.

### Step 2 — purge-action (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor · skills test-driven-development
Depends on: leak-isolation
- [ ] 2.1 Add `purgePlan(input, context)` to `scripts/tracker.mjs` beside `archivePlan` (`:572-597`), and dispatch `action: "purge"` at `:600-615`, adding it to the error text.

  It refuses, in order:
  1. A missing or empty `reason`.
  2. `input.autonomous === true`.
  3. `autoActive(sidOf(input), context)` from `lib/core.mjs` (an active /auto run).
  4. An existing `docs/plans/<slug>.md` under `mainCheckoutRoot(context.root)`.
  5. A `TRACKER-archive.md` heading for the slug (`archivedSlugsOf`).
  6. Zero rows for the plan.

  Otherwise, under `withLock(ledgerPath)`, it keeps every event whose `plan !== input.plan`, writes the result atomically, writes **no** archive heading, logs `tracker_purged {plan, units, reason}` and calls `syncQuietly`.

  → accept: 2.2 green.
- [ ] 2.2 Write `scripts/tracker-purge.test.mjs` first, on `gitRootedTmp` fixtures. It covers one case per refusal in 2.1. Every case runs in a child process whose `CLAUDE_PROJECT_DIR` is the fixture root, so session markers resolve inside the fixture (ARCH-STATE-01). The active-/auto case writes the marker with `writeAutoMarker(sid, plan)` in that child and passes the same `session_id`. The `autonomous: true` case runs with no marker, so each refusal is proven on its own and none passes by accident. Afterwards, assert the real repo's `.craftsman/sessions` is unchanged. The happy path removes only that plan's events, leaves other plans and `TRACKER-archive.md` untouched, and logs `tracker_purged`.

  → accept: red before 2.1, green after.
- [ ] 2.3 `scripts/lib/ledger-keys.mjs` `archivedPlans` (`:24-40`): accept `ev.ev === "tracker_purged"` as an excusal for its `plan` only. A purge event without a `plan` excuses nothing (unlike archive's all-plans case).

  → accept: 2.4 green.
- [ ] 2.4 In `tracker-purge.test.mjs`, assert two things after a purge with no `tracker_published` since:
  - `droppedKeys` / `archivedPlans` excuses the purged plan's committed keys and no other plan's.
  - A `tracker_purged` event lacking `plan` excuses nothing.

  → accept: green.
- [ ] 2.5 Re-point the ARCH-TRACKER-13 comments to ARCH-TRACKER-19 (comment text only):
  - `scripts/lib/ledger-keys.mjs:1,34,46`
  - `scripts/tracker.mjs:231`
  - `scripts/lib/ledger-rows.mjs:1`
  - `scripts/tracker.test.mjs:175`

  → accept: `grep -rn 'ARCH-TRACKER-13' scripts` prints nothing.

### Step 3 — outcome-core (., javascript, normal)
Tooling: implementer implementer · gates code-reviewer · skills test-driven-development
Depends on: none
- [ ] 3.1 `scripts/lib/plan-index.mjs` `buildIndex` gives each node a new `planned` field.
  - **Parsing:** at `:151`, keep `scope_id` as well as `id` when parsing `units:`.
  - **Normalising:** a `normalizeRowId` helper takes the text after the last `#` in each `tracker_rows` entry, so `TRACKER#x`, `slug#x` and `x` are equal; it trims whitespace and ignores empties.
  - **`planned`:** the de-duplicated union of the normalised `tracker_rows` and every unit's `id` and `scope_id`. A missing field gives `[]`, `[]` gives `[]`, and a trailing `# comment` is stripped by the existing `stripComment`.

  → accept: 3.2 green.
- [ ] 3.2 Extend `scripts/lib/plan-index.test.mjs` first. Cover: the three id forms are equal; `[]`; an absent field; a trailing comment; a unit scope_id joining `planned`; an id containing `#` keeping only the text after the last `#` (documented behaviour).

  → accept: red before 3.1, green after; the existing plan-index tests are unchanged and green.
- [ ] 3.3 Create `scripts/lib/plan-outcome.mjs`, which imports only `./plan-index.mjs` and is pure (no fs, no ledger read).

  **API:** `classifyRow(row, plannedSet)` → `"follow-up" | "planned" | "unclassified"`. The order is: `row.origin` when it is `plan` or `follow-up`; else a unit starting `followup-` is a follow-up; else a unit or scope_id in `plannedSet` is planned; else unclassified.

  **API:** `slugOutcome(slug, rows, index)` → `{slug, outcome, planned_done, planned_total, followups_open, followups_total, unclassified: [{plan, unit, status}], blocked: [{plan, unit, status}], line}`.
  - The family is `[slug, ...descendantSlugs(slug, {index})]`, which includes derived scrutinise- and investigate- docs.
  - Each row's plan slug is the basename of `row.plan`, and its planned set comes from that plan's node.
  - CANCELLED planned rows are dropped from the total. MERGED and FEATURE_MERGED are open.

  The four outcome words are one exported frozen constant, `OUTCOMES = Object.freeze({ DELIVERED: "delivered", STOPPED: "stopped — needs you", NOT_DETERMINED: "not determined", OPEN: "open" })`. Consumers compare against it and never against string literals.

  **Outcome**, first match wins:
  - `delivered`: planned_total ≥ 1, every remaining planned row COMPLETE, and no open unclassified row.
  - `stopped — needs you`: a planned row is PARKED or BLOCKED.
  - `not determined`: an open unclassified row exists.
  - `open`: otherwise.

  **`line`:** `OUTCOME: <outcome> — planned <done>/<total> COMPLETE; follow-ups: <n> open`, plus `; unclassified: <plan#unit,…>` when there are any.

  → accept: 3.4 green.
- [ ] 3.4 Write `scripts/lib/plan-outcome.test.mjs` first: a table test over in-memory rows and a `buildIndex` fixture. It covers:
  - an empty planned set → never delivered
  - a planned CANCELLED row dropped
  - a planned MERGED row → open
  - follow-ups only open → delivered, with follow-ups counted
  - an open unclassified row → not determined, and it is listed
  - a planned PARKED row → stopped — needs you
  - `origin` beating the prefix, and the prefix beating membership
  - a family that includes a derived `scrutinise-<slug>` doc
  - a `line` snapshot

  → accept: red before 3.3, green after.

### Step 4 — outcome-wiring (., javascript, normal)
Tooling: implementer implementer · gates code-reviewer · skills test-driven-development
Depends on: leak-isolation, outcome-core
- [ ] 4.1 Add `action: "outcome"` to `scripts/tracker.mjs` (dispatch `:600-615`; error text updated).
  - Input `{slug}`: a bare slug or a docs/plans path.
  - It loads `currentState(context)` and `loadIndex(mainCheckoutRoot(context.root))`, returns `slugOutcome(...)`, logs `run_outcome {slug, outcome, planned_done, planned_total, followups_open, unclassified: <count>}`, and the CLI prints the JSON.
  - An unknown slug, with no node and no rows, throws `outcome: unknown slug <slug>`.

  → accept: 4.4 green.
- [ ] 4.2 `scripts/run-manifest.mjs` `buildManifest(plan, rows, acceptanceText, index)`. An optional fourth argument adds an `outcome` key holding the same `slugOutcome` block for the plan's slug, `line` included (ARCH-TRACKER-17). With no index, the key is omitted: an additive key, ARCH-TRACKER-07. `syncRunManifest` loads the index fail-open, so a throw omits the key and never fails the transition.

  → accept: the existing `run-manifest.test.mjs` assertions are unchanged and green; one new case asserts `outcome` is present with an index and absent without one.
- [ ] 4.3 In `transition()` (`scripts/tracker.mjs:304-316`), when the written event is the row's first, `docs/plans/<slug>.md` exists, and `classifyRow` gives `unclassified`, log `tracker_row_unclassified {plan, unit}`. Wrap it in try/catch so it never refuses or fails the transition (ARCH-TRACKER-21).

  → accept: 4.4 green.
- [ ] 4.4 Write `scripts/tracker-outcome.test.mjs` first, on `gitRootedTmp` fixtures with a docs/plans doc. It covers:
  - the CLI `outcome` on a delivered family with open follow-ups prints `delivered` with follow-ups counted
  - `run_outcome` is logged
  - an unknown slug errors
  - a first-time unclassified row logs `tracker_row_unclassified` and the transition still succeeds
  - a planned row and a `followup-` row log no warning
  - an index read throwing still lets the transition succeed (fail open)

  → accept: red before 4.1/4.3, green after.
- [ ] 4.5 Against the real ledger (read-only), run `printf '%s' '{"action":"outcome","slug":"sandbox-auto-flow"}' | node scripts/tracker.mjs`.

  → accept: it prints `outcome: "delivered"` with `followups_open` ≥ 1, recorded as evidence. If it does not, stop and report the classification that disagrees; never edit a rule or a plan doc to make it pass.

### Step 5 — digest-outcome (., javascript, normal)
Tooling: implementer implementer · gates code-reviewer · skills test-driven-development
Depends on: outcome-core
- [ ] 5.1 Change `scripts/digest.mjs`:
  - `DONE_STATUSES` = COMPLETE only (`:11`).
  - New `shipped` bucket (MERGED rows), rendered as "📦 Shipped, awaiting COMPLETE".
  - The done empty-state text becomes `(nothing COMPLETE yet)` (`:70`).
  - Each plan line appends its `slugOutcome(...).outcome` and follow-up count, with the index loaded fail-open; on failure it keeps today's percent line.
  - The `--html` / dashboard path is unchanged.

  → accept: 5.2 green.
- [ ] 5.2 Update `scripts/digest.test.mjs` first:
  - a MERGED row is never in `done` and is in `shipped`
  - a plan line shows `delivered` for a fixture whose only open rows are `followup-*`
  - the empty-state text

  Adjust `scripts/loop-smoke.test.mjs` only where it asserted MERGED-as-done.

  → accept: red before 5.1, green after.

### Step 6 — outcome-wording (., markdown, normal)
Tooling: implementer implementer · gates code-reviewer · skills verification-before-completion · guards doc-size-policy
Depends on: outcome-wiring, digest-outcome, purge-action
- [ ] 6.0 Re-measure on current main before editing: `wc -c commands/auto.md commands/instruction.md commands/_features.md` and their caps (`grep -n` in `scripts/doc-size-policy.mjs`). `followup-auto-flow-friction#g1-goal-superseded` also edits instruction.md (PENDING at plan time); if it has landed, budget against the new size.

  → accept: the numbers are recorded in evidence.
- [ ] 6.1 Reword `commands/auto.md:35` (Finish), in no more bytes than today. It prints `tracker.mjs outcome <slug>`'s line first, then the remaining rows with follow-ups counted apart, and prompts to continue (`/craftsman:auto <slug>`, ARCH-AUTO-03). It repeats B–C until the outcome is delivered. Reword `commands/_features.md:31` to "/auto ends when the slug's outcome is delivered (ARCH-AUTO-12)."

  → accept: `node scripts/doc-size-policy.mjs` PASS; neither file grows.
- [ ] 6.2 Reword the `commands/instruction.md` goal-template evidence clause (`:56`). Replace "every docs/plans/TRACKER.md row for <slug> = COMPLETE (print them)" with the printed `tracker.mjs outcome <slug>` line reading delivered. The (P), (A), BLOCKED ON USER, parked-rows and turn-cap exits stay verbatim (ARCH-AUTO-04).

  → accept: doc-size-policy PASS; `wc -c commands/instruction.md` ≤ the 6.0 value.
- [ ] 6.3 `scripts/auto-command.test.mjs:63-66`: assert the new Finish sentence (outcome line printed first; repeat until delivered) and the new evidence clause, replacing the `until every row for the slug is COMPLETE` assertion (ARCH-SLIM-18).

  → accept: red against the 6.1/6.2 originals, green after.
- [ ] 6.4 Re-point the ARCH-AUTO-09 comments to ARCH-AUTO-12 (comment text only):
  - `scripts/orchestrate-scope-guard.mjs:51`
  - `scripts/orchestrate-scope-guard.test.mjs:215`
  - `scripts/lib/core.mjs:374`
  - `scripts/lib/core.test.mjs:692`

  → accept: `grep -rn 'ARCH-AUTO-09' scripts commands` prints nothing.
- [ ] 6.5 Add one `CHANGELOG.md` `## [Unreleased]` bullet: derived run outcome, `tracker.mjs outcome`/`purge`, digest done = COMPLETE, test-ledger isolation.

  → accept: one new bullet; `node --test scripts/*.test.mjs scripts/lib/*.test.mjs` exit 0; `node scripts/arch-check.mjs lint` PASS.

## Sequencing
- **u1 first:** every later ledger-writing test uses its `gitRootedTmp`, and ARCH-TRACKER-20 says it lands before any purge.
- **u3 is pure and independent**, so u4 and u5 build on it.
- **u2 is off the critical path**, so a parked purge never blocks the outcome track.
- **u6 last:** its wording names `tracker.mjs outcome`, which must exist first, and it re-measures byte budgets on the final main.

## Verification background
- Goal met on a stop: `commands/instruction.md:44`. Every-row done: `commands/auto.md:35`, `commands/instruction.md:56`, `commands/_features.md:31`, pinned by `scripts/auto-command.test.mjs:63-66`.
- Derived docs hang off their source plan: `scripts/lib/plan-index.mjs:235-237`. Units are parsed with id only: `scripts/lib/plan-index.mjs:151`.
- `scrutinise-sandbox-auto-flow` lists `followup-*` rows in `tracker_rows` (`docs/plans/scrutinise-sandbox-auto-flow.md` header), which is why the prefix precedes membership (ARCH-TRACKER-17).
- Leak path: `scripts/lib/core.mjs:183-197` (`mainCheckoutRoot` adopts `git worktree list`'s first entry) → `scripts/tracker.mjs:124-126` `ledgerPath`. Fixture roots: `scripts/digest.test.mjs:10`, `scripts/tracker.test.mjs:14,452,510,542`. 71 leaked events across 8 plans, published in `a92226a`.
- Excusals are a closed list: `scripts/lib/ledger-keys.mjs:33`. `archivePlan` precedent: `scripts/tracker.mjs:572-597`. The autonomous flag is self-declared: `scripts/tracker.mjs:76-77`, so purge also checks `autoActive` (`scripts/lib/core.mjs`, `export const autoActive`).
- Manifest builder: `scripts/run-manifest.mjs:26-62`, called from `scripts/tracker.mjs:319-324`. No script reads `runs/<slug>.json`.
- Byte caps: `scripts/doc-size-policy.mjs:58` (auto.md 4561, current 4538), `:65` (instruction.md 8503, current 8502). Invocation caps cannot rise: `scripts/doc-size-policy.test.mjs:158`.

CONSUMERS:
- `plan-index` node (`buildIndex`): additive `planned` field. Readers `scripts/lib/{core,dashboard,export-notes,next-queue,archive,tracker-rollup}.mjs`, `scripts/{tracker,tracker-publish,plan-graph,run-args,orchestrate-scope-guard,doc-retire,session-context,repo-exec,arch-check}.mjs` are unaffected (no test deep-equals a whole node; `scripts/lib/plan-index.test.mjs:72` checks `children` only).
- `buildManifest` / `syncRunManifest`: `scripts/run-manifest.test.mjs`, `scripts/tracker.mjs:319-324`. The `buildManifest` in `scripts/workspace-init.mjs:23` is an unrelated homonym.
- `buildDigest`: `scripts/digest.mjs` renderers, `scripts/digest.test.mjs`, `scripts/loop-smoke.test.mjs`.
- `archivedPlans` / `droppedKeys`: `scripts/lib/ledger-keys.mjs` internal → `scripts/tracker-publish.mjs`, `scripts/tracker.mjs` sync.
- tracker CLI action list: the only error-text reader is `scripts/tracker.mjs:615` itself; no test pins it.

## Risk & rollback
- **Naming loophole:** a `followup-` name stops blocking `delivered`; the acceptance gate (ARCH-AUTO-04) is the backstop, and the line always prints the follow-up count.
- **Not-determined plans:** three live plans read `not determined` until their legacy rows are triaged by hand (ARCH-PLAN-04).
- **Purge is never executed here:** the final turn prints the owner's commands for plans a, f, demo, example, release, other, live, big. After running them, publish with `manual: true` and fast-forward the main checkout.
- **Rollback:** revert per unit. Every change is additive or wording.

## Out of scope
- Running purge on the real ledger.
- Triaging the 35 MERGED or 53 unclassified legacy rows.
- Dashboard, export-notes and rollup outcome views (ARCH-VIEWS-12, ARCH-TRACKER-10 keep every-row status in v1).
- Releasing /auto guards on `delivered` (ARCH-AUTO-12).
- A lint requiring `tracker_rows`.
