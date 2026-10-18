---
slug: feature-branch-plans
status: pursue-with-changes
verdict: pursue-with-changes
confidence: medium
depth: standard
isolation: isolated
created: 2026-10-18
updated: 2026-10-18
related: [commands/plan.md, commands/sync-docs.md, scripts/tracker.mjs, scripts/repo-exec.mjs, docs/architecture/tracker.rules.md, docs/architecture/landing.rules.md, docs/architecture/engine.rules.md, docs/architecture/auto.rules.md, docs/ideas/autonomous-e2e-loop.md]
touches: [commands/plan.md, commands/orchestrate.md, commands/_shared-execution.md, commands/_shared-machinery.md, commands/auto.md, commands/instruction.md, commands/merge.md, commands/scrutinise.md, commands/_scrutinise-deep.md, commands/investigate.md, commands/understand.md, commands/digest.md, commands/sync-docs.md, commands/architect.md, commands/_architect-maintain.md, commands/_architect-backfill.md, commands/_architecture.md, commands/idea.md, commands/init.md, commands/upgrade.md, commands/workspace-init.md, agents/unit-runner.md, agents/phase-tracker.md, agents/scrutineer.md, agents/plan-strategist.md, skills/language-aware-planning/references/plan-template.md, skills/language-aware-planning/references/idea-template.md, skills/language-aware-planning/references/architecture-template.md, scripts/tracker.mjs, scripts/run-manifest.mjs, scripts/plan-graph.mjs, scripts/lib/plan-submodules.mjs, scripts/repo-exec.mjs, scripts/worktree-sweep.mjs, scripts/stop-gate.mjs, scripts/lib/core.mjs, scripts/orchestrate-scope-guard.mjs, scripts/claim.mjs, scripts/handoff.mjs, scripts/session-context.mjs, scripts/plan-memory.mjs, scripts/digest.mjs, scripts/arch-check.mjs, scripts/pre-guard.mjs, scripts/init.mjs, scripts/doc-size-policy.mjs, workflows/run.js, hooks/register.js, craftsman.config.json, .claude-plugin/plugin.json, docs/architecture/tracker.rules.md, docs/architecture/landing.rules.md, docs/architecture/engine.rules.md, docs/architecture/auto.rules.md, docs/architecture/state.rules.md, scripts/*.test.mjs, README.md, EXTENDING.md, INSTALL.md, CHANGELOG.md]
---

# Idea: Feature-scoped plans with feature-branch landing, plus doc retirement modes

## Proposal (neutral restatement)
Two parts, judged separately.

**A — feature layer.** A plan doc gains a level between plan and unit:
plan → features → fine-grained units. Units keep today's shape and gates. Each
feature gets its own branch, and its units land on that branch instead of base.
When every unit of a feature is COMPLETE, the feature branch lands on main as one
merge. Separate sessions can each own a feature and share decisions through a
per-plan channel.

**B — doc lifecycle on `/sync-docs`.**
- `--clean` archives finished docs across `docs/`.
- `--clear` aggressively deletes deprecated or outdated docs from live and
  archived plans, ideas and architecture. The archive index keeps a one-line
  entry with the commit id; git history is the archive.
- `--update` migrates the existing tracker and plan docs to the feature format.

**Problem (observable).**
- Gleam has 1076 `.md` files under `docs/`: 635 in `docs/plans/archive`, 98 live
  plans and 74 in `plans/optional`.
- Loost has 155 live plan files and no archive folder at all.
- Large plans run long. Gleam's 90th percentile is 36 units in one plan, which
  is far too many for one session or one revert point.

**Who benefits:** the solo maintainer running several sessions across their own repos.

**Done:**
- A large request becomes features that each land on main as one merge, and
  each can be owned by its own session.
- `docs/` holds only live material plus a commit-id index of retired docs.

## Verdict
**PURSUE-WITH-CHANGES** (medium). Ship B first: its value is proven, and the
plugin has no code path that retires a plan doc. A is worth doing because large
plans exist. It does amend decided rules (ARCH-ENGINE-09, ARCH-LAND-02, and the
MERGED semantics behind ARCH-TRACKER-04), so it goes through `/architect --deep`
with features kept short-lived and size-capped. It is not a direct plan.

**Deciding fact:** `tracker.mjs archive` retires ledger rows but never the plan
doc (`scripts/tracker.mjs:384-408`). That is why the sprawl grows.

**Most likely to flip A to DEFER:** a feature-branch spike showing final-merge
conflict parks (ARCH-LAND-06) on most multi-unit features.

| criterion | A | B | evidence |
|---|---|---|---|
| value | 3 | 4 | Gleam p90 36 units/plan, median 6; Loost median 4 (measured); no plan-doc retirement (`scripts/tracker.mjs:384-408`) |
| system fit | 2 | 4 | A strains ARCH-ENGINE-09 (`engine.rules.md:19`) and ARCH-LAND-02 (`landing.rules.md:12`); B extends the existing archive action and `/sync-docs --tracker` (`sync-docs.md:40`) |
| cost (5 = cheap) | 2 | 4 | A touches ~14 plan/unit parsers plus landing and the ledger; `repo-exec` already accepts an explicit `base_branch` (`repo-exec.mjs:27-32`), which lowers it |
| risk (5 = low) | 2 | 3 | A: MERGED ≠ on-base, branch drift; B: deleting cited docs silently (`arch-check.mjs:216-217` checks the human doc, not `source:`) |
| reversibility | 2 | 4 | A is a format migration; B deletions are restorable via `git show <sha>:<path>` |
| evidence strength | 3 | 4 | sprawl and plan size measured; cross-session decision demand thin (Gleam 28 PARKED events, Loost 0) |

## Overlap & prior work
- **Extends** `/plan`'s existing feature split. "One feature = one user-visible
  outcome" and "One doc per feature" (`commands/plan.md:23,34`) already exist,
  but nothing enforces them. Large plans bundle many features in one doc.
- **Extends** `tracker.mjs archive` (`scripts/tracker.mjs:377-408`, added in
  b366ad2). It moves a COMPLETE plan's rows to `TRACKER-archive.md` with SHAs,
  but leaves the plan doc in place.
- **Extends** `/sync-docs --tracker`, which must archive shipped rows every pass
  (`commands/sync-docs.md:40`). `--arch` skips `docs/plans/`, `docs/ideas/` and
  `archive/` (`sync-docs.md:22`).
- **Conflicts with:**
  - ARCH-ENGINE-09: units run sequentially until parallel isolation is
    spike-proven.
  - ARCH-LAND-02: every unit lands through repo-exec in plan order.
  - ARCH-TRACKER-04 and the MERGED→COMPLETE auto-promotion
    (`tracker.mjs:229-230`): COMPLETE currently implies on base.
  - ARCH-AUTO-01: `/auto` repeats until every row is COMPLETE.
- **Premise correction:** `/investigate` and `/scrutinise` write no folders of
  their own. They hand off to `/plan`, which writes
  `docs/plans/investigate-<slug>.md` and `scrutinise-<slug>.md`
  (`commands/investigate.md:9,43`, `commands/scrutinise.md:42`). Gleam's
  `audits/` and `issues/` folders are not craftsman output.
- Searched: `docs/ideas/*` (only autonomous-e2e-loop), `TRACKER.md` goals,
  `docs/architecture/*.rules.md`, `CHANGELOG.md`, `commands/*`, `scripts/*`.

## System fit (whole project)
- **Contract ripple:**
  - A adds `feature` to the plan header and ledger events. ARCH-TRACKER-02
    allows only additive fields and an unchanged `renderBlock`.
  - About 14 consumers parse units or `scope_id`: plan-graph, run-manifest,
    tracker, scope, claim, handoff, session-context, stop-gate, stats,
    plan-memory, agent-mode-guard, orchestrate-scope-guard, `workflows/run.js`,
    `workflows/spike.js`. The critic did not check each one individually.
- **Data:**
  - A adds a feature status and feature-landed events to the ledger.
  - B adds the retired doc's last SHA to archive entries.
  - `--update` must keep `scope_id` stable, because claims, handoff and the
    run-manifest are keyed on it.
- **Config:** likely `planning.featureBranches` (on/off) and a feature size cap.
- **Security:** N/A (no auth or secret surface). Deletion is destructive but local and restorable.
- **Tests:** tracker, plan-graph, repo-exec (feature base and feature land), and
  arch-check (`source:` existence) tests.
- **Observability:** `logEvent` for `feature_landed` and `doc_retired`.
- **Interface:**
  - New `/sync-docs` modes.
  - Plan template gains a features section.
  - `/digest` shows per-feature progress.
- **Docs:** README, EXTENDING, CHANGELOG; the tracker, landing and engine rules
  docs are amended by `/architect`.

**Second-order effects:**
- With feature branches, MERGED means "on the feature branch". COMPLETE must
  then wait for the feature to land, or the loop gets the premature-victory
  failure mode.
- Long-lived feature branches drift. The final merge is the largest and riskiest
  in the flow.
- Parallel sessions are blocked by ARCH-ENGINE-09 until the ARCH-STATE-03
  isolation spike passes.
- `--clear` in the shared `docs/` can delete a plan doc that a concurrent
  session is executing.
- An unbounded `--clean` over Gleam's 1000+ files breaks `/sync-docs`'s
  no-repo-wide-sweep rule (`sync-docs.md:22`).

## Research
- Anthropic, *Effective harnesses for long-running agents*
  (https://anthropic.com/engineering/effective-harnesses-for-long-running-agents)
  - Cross-session memory is a feature list plus a progress file plus git log.
  - Each session works on one feature.
  - Premature "done" is a named failure mode.
  - Supports A's per-feature ownership; argues for strict COMPLETE semantics.
- Trunk-based development
  (https://trunkbaseddevelopment.com/short-lived-feature-branches/,
  https://mergify.com/learn/trunk-based-development/short-lived-branches):
  feature branches should live about one to two days at most; longer ones build
  up merge risk. This argues for a feature size cap and for syncing base into the
  feature branch per unit.
- ADR practice (https://www.martinfowler.com/bliki/ArchitectureDecisionRecord.html,
  https://backstage.io/docs/architecture-decisions,
  https://handbook.polar.sh/engineering/decisions): superseded decisions are
  marked and linked to their successor, not deleted.
- Delete-don't-archive
  (https://playbooks.com/skills/ladderchaos/tora-skills/repo-librarian,
  https://lists.w3.org/Archives/Public/public-aria-editors/2023Apr/0011.html):
  - Git history works as the archive; recover with `git log --diff-filter=D`
    or `git show <sha>:<path>`.
  - The costs are discoverability and broken inbound links, so check inbound
    references before deleting.

## Critique
- **Steelman.**
  - Sprawl is real and accelerating: Gleam added 278 doc files and Loost 146
    plan files in 60 days. The plugin creates them and has no exit path.
  - Large plans (p90 36 units) have no mid-plan revert or merge point.
  - A feature layer gives sessions a natural ownership boundary.
- **Strongest case against A.**
  - Feature branches cut against the per-unit landing that keeps main green.
  - They add a large final merge.
  - They need three decided rules amended.
  - The same split is available today by enforcing "one plan per feature" and
    splitting large requests into several plans.
- **Hidden assumptions.**
  - Sessions need to exchange decisions. Test: count PARKED decisions resolved
    by another plan's session. Only 28 PARKED events in Gleam and 0 in Loost.
  - Archived docs are never read again. Test: inbound links (52 in Gleam) and
    post-archive edits.
- **Failure modes.**
  - A feature never fully COMPLETE strands its units' work off main.
  - `--clear` deletes a doc that a running session reads.
  - Deleting an idea silently breaks a rules doc's `source:`.
  - `--update` renumbers `scope_id`s and orphans claims.
  - `--clean` and `--clear` differ by one letter, and one of them deletes.
- **Kill criteria.**
  - A: the feature-branch spike shows conflict parks on most multi-unit
    features, or the ENGINE-09 / STATE-03 isolation spike fails.
  - B: deleted docs are restored more than rarely, or a deletion breaks a link
    that no check catches.
- **Cheaper alternatives.**
  1. Do nothing: about 150 plan files per 60 days per repo. Not acceptable.
  2. Smallest slice: `tracker.mjs archive` also `git rm`s the plan doc and
     records its last SHA. This covers most of B.
  3. For A: enforce "one plan per feature" in `/plan`, giving several plans
     instead of one 36-unit plan, and use `claim.mjs` plus PARKED decisions and
     plan-memory for cross-session coordination. No new layer and no feature
     branches.

## Impact sweep (every command, agent, skill, script, workflow, hook)
Two read-only sweeps (2026-10-18) covered every file. Root re-checked the
blockers at the cited lines. A = feature layer, B = doc retirement.

### Blockers that shape the design
1. **Doc budgets are full.** `doc-size-policy.mjs:23,30,31`.

   | file | bytes | budget |
   |---|---|---|
   | `_shared-execution.md` | 13499 | 13500 |
   | `sync-docs.md` | 9987 | 10000 |
   | `plan.md` | 9969 | 10000 |
   | `orchestrate.md` | 9911 | 10000 |
   | `agents/unit-runner.md` | 3798 | 3800 |

   Any added prose fails `init --update` (`init.mjs:257-260`). So the feature
   protocol goes in a new reference file (e.g. `commands/_features.md`, loaded
   only when `planning.featureBranches` is on), and existing text is compressed
   to fit.
2. **"feature" is already taken, twice.**
   - Run manifest: `run-manifest.mjs:2,28,47` uses `features[]` to mean units.
     It is a derived contract (ARCH-TRACKER-01) read by `auto.md:30`. Add a
     per-entry `feature` field and a `feature_groups` list; never rename
     `features`.
   - Prose: `plan.md:3,23,34,35,41`, `orchestrate.md:41-63`,
     `_shared-machinery.md:21` and `plan-template.md:14` (`<feature-slug>`) use
     "feature" for a whole plan. All of them must be reworded.
3. **The worktree sweep can delete a live feature branch.**
   - `worktree-sweep.mjs:42-48,106` treats "contained in main/master" as
     merged, and `:145` then runs `git branch -D`.
   - An empty or just-synced feature branch therefore looks merged.
   - The sweep runs on every Stop (`stop-gate.mjs:36`) and at session start
     (`session-context.mjs:230`).
   - Feature branches must be exempt, identified by prefix or by ledger.
4. **`feature/` branches can be inferred as base.** `repo-exec.mjs:31`'s
   guard regex covers `feat|fix|chore|docs|refactor` but not `feature/`.
5. **The feature branch must exist on origin.** `prepare`, `sync`, `merge`
   and `landDetached` all use `origin/<base>` (`repo-exec.mjs:126-127,147-148,229,286-288`).
   Push the feature branch when it is created.
6. **Plan-wide criteria block feature completion.** An untagged criterion
   blocks COMPLETE (`tracker.mjs:303,312`). Add a `[feature:<id>]` criterion
   tag (`core.mjs:421-430`); otherwise only the last feature to land can
   complete.
7. **`/auto` stops granting runners at FEATURE_MERGED.** Runner grants
   require PENDING/IN_PROGRESS (`core.mjs:278,323` → `agent-mode-guard.mjs:91`).
   Count FEATURE_MERGED as open until the feature lands, and keep it out of
   `LANDED_STATUSES` (`core.mjs:279`).
8. **Deletions bypass doc-write authority.** `pre-guard.mjs:291` checks doc
   authority only for Write/Edit/MultiEdit/NotebookEdit. `git rm` from Bash
   is unguarded. Route every deletion through `tracker.mjs archive` / a
   `prune` script action, or extend the Bash check.
9. **Retiring docs would break checks that exist today.**
   - `engine.rules.md:12` (ARCH-ENGINE-02) cites
     `docs/plans/autonomous-e2e-loop-evidence.md`.
   - `arch-check.test.mjs:220-221` reads `docs/plans/autonomous-e2e-loop.md`.
   - All 6 rules docs have `source: docs/ideas/autonomous-e2e-loop.md`.
   - `README.md:215` cites the evidence doc.

   So the inbound-reference check must scan rules `cite:`/`source:`, tests,
   and the top-level `*.md`, not just `docs/`.
10. **A retired slug looks like new work.**
    - `/auto` runs `/plan <slug>` when `docs/plans/<slug>.md` is missing
      (`auto.md:16`).
    - `/instruction` treats a missing plan doc as a bare request
      (`instruction.md:18`).
    - Both, plus `/orchestrate` (`:19-20`), must look the slug up in
      `TRACKER-archive.md` first.
11. **`--update` already means two other things.** `/init --update`
    (`init.md:21,68-77`) already walks `docs/plans/` and stamps
    `craftsman_version` (`init.mjs:281-317`). `/architect --update` is called
    from `/sync-docs --all` (`sync-docs.md:12`). Put the plan-format migration
    in `/init --update`; don't add `/sync-docs --update`.
12. **Prune contradicts stated rules.**
    - `/sync-docs` never touches `docs/ideas/` or a paired architecture area
      (`sync-docs.md:10,12`; `_architecture.md:12,29`).
    - Rejected/deferred ideas are kept so `/idea` can spot duplicates
      (`idea-template.md:4`; `idea.md:30,63`).
    - Fix: prune deletes ideas only when uncited and not rejected/deferred (or
      after `/idea`'s overlap scan also reads the archive index). Cited ideas
      and rules docs are superseded through `/architect`, never deleted by
      `/sync-docs`.
13. **Submodule bumps across feature branches.** A submodule commit on a
    feature branch is not on the submodule's base. The parent bump
    (ARCH-LAND-03, `plan-submodules.mjs:79-85`) must wait for that feature to
    land. Alternatively, keep submodule steps out of feature branches.

### Per-file changes
**Commands**

| file | change | part |
|---|---|---|
| `commands/plan.md` | plan → features (≤ cap) → units; `feature` in the transition JSON (`:35`); FEATURE_MERGED wording (`:36`); hand-off lists features and branches, `/orchestrate <slug> [--feature id]` (`:41`) | A |
| `commands/orchestrate.md` | `--feature` selector and feature claim (`:19-20,29`); resume skips FEATURE_MERGED (`:23`); per-unit landing goes to the feature branch (`:2,30`); Phase D (`:41-46`) becomes the `land-feature` step (cross-unit review + smoke on the feature branch, then land); COMPLETE only after landing (`:50,54-55`); closing steps add `/sync-docs --archive` (`:59`); archived slug → stop (`:19`) | A/B |
| `commands/_shared-execution.md` | lock flow, prepare, 9a sync (base → feature → unit), 9d merge target, branch cleanup, close-out status, hand-off fields (`:9-14,26,35,42,45-49,58-60`). Move the detail to `_features.md` (budget) | A |
| `commands/_shared-machinery.md` | retired plans live in git history, indexed in `TRACKER-archive.md` (`:22`); feature claim and status (`:23`); plan-memory + PARKED feed the decisions section (`:36-38`); feature boundary, cap and stable `scope_id` (`:72`) | A/B |
| `commands/auto.md` | COMPLETE = feature landed; FEATURE_MERGED counts as open (`:2,34`); git authority covers feature branches, base syncs, `land-feature` (`:12`); archive-aware slug resolution (`:16`); engine per feature, turn cap per feature (`:22-24`); Phase C gets land-feature parks and the decisions section (`:30`) | A/B |
| `commands/instruction.md` | landed = every feature on base (`:2,12`); archive-aware source (`:18`); feature branch names in the evidence (`:20`); weight bands per feature (`:25-32`); fix-round unit → feature (`:51`); archive step + evidence from the archive line (`:52-55`) | A/B |
| `commands/merge.md` | `land-feature` path; land feature branches in feature order, not as stray branches (`:11-32`); per-feature contract check (`:47-53`); conflict fix on the feature branch (`:77-78`); ARCH-LAND-02 wording (`:95-97`); land-feature park (`:110-111`) | A |
| `commands/scrutinise.md`, `commands/_scrutinise-deep.md` | ranges per feature branch or land SHA (`scrutinise.md:16,22`; deep `:17`); retired plan read via `git show <last-doc-sha>:path` (`:31`); FEATURE_MERGED stays until the feature lands (`:40`); a round after retirement starts a fresh `scrutinise-<slug>` doc; the sibling retires with its parent | A/B |
| `commands/investigate.md` | `investigate-<slug>` retires with its parent only when its own rows are COMPLETE; its rows need a feature (`:43-44`) | A/B |
| `commands/understand.md` | prior context also from `TRACKER-archive.md` (`:22`) | B |
| `commands/digest.md` | per-feature progress; FEATURE_MERGED shown as "waiting to land" (`:2,12-14`) | A |
| `commands/sync-docs.md` | new `--archive` and `--prune` (no `--update`, see blocker 11); doc authority (`:10`); archive-aware slug (`:12`); prune exception for `archive/` with its own bounded, dry-run-first, ≤15-doc confirmed rounds (`:16,22`); dead plan links → archive line (`:37`); archive step does `git rm` + SHAs + inbound refusal (`:40`); `/goal` pre-approval never covers deletion (`:46`) | B |
| `commands/architect.md`, `_architect-maintain.md`, `_architect-backfill.md` | retired plans and ideas are reachable via the archive index plus `git show` (`architect.md:16`; maintain `:34`; backfill `:17-33`); `source:` written by `/architect` is now lint-checked (`:22`); an architected idea cited by `source:` is never pruned (`:46`); backfill counts FEATURE_MERGED as in-flight (`:33`); cites `<sha>:path:line` for retired plans (`:25,29`) | A/B |
| `commands/_architecture.md` | prune never deletes a paired area; it supersedes via `/architect` (`:12,29`) | B |
| `commands/idea.md` | overlap scan also reads `TRACKER-archive.md`; retention rule for prune (`:30,63`) | B |
| `commands/init.md`, `commands/upgrade.md`, `INSTALL.md` | `/init --update` is the plan-format migration home: add `features:`, never renumber `scope_id`, live plans only; migrate the new config keys (`init.md:20-23,68-77`; `upgrade.md:37-41`; `INSTALL.md:79-83,159`) | A |
| `commands/workspace-init.md` | multi-repo feature = one feature branch per project, landed per repo (`:58-61`) | A |

**Agents and skills**

| file | change | part |
|---|---|---|
| `agents/unit-runner.md` | `base_branch` = feature branch in prepare/review diff/sync/merge; land → FEATURE_MERGED; status enum (`:12,23,28,29,42`); possibly a `land-feature` role. Budget: 2 bytes free | A |
| `agents/phase-tracker.md` | Complete only when the feature is on base (`:11-21`) | A |
| `agents/scrutineer.md` | plan doc may be at a SHA; cross-unit checks within and across features (`:10,17`) | A/B |
| `agents/plan-strategist.md` | feature grouping with the cap as a decomposition constraint (`:8,13`) | A |
| `skills/language-aware-planning/references/plan-template.md` | plan slug (not `<feature-slug>`, `:14`); a `features:` list (id, branch, units); per-unit `feature:`; per-plan decisions section; feature boundary above steps (`:33-48,79-80,101-109`) | A/B |
| `skills/language-aware-planning/references/idea-template.md` | reconcile "rejected ideas are kept" with prune; `related:` links count as inbound references (`:4,147`) | B |
| `skills/language-aware-planning/references/architecture-template.md` | the `source:` it emits is the lint-checked citation (`:16,51`) | B |

**Scripts, workflows, hooks and config**

| file | change | ARCH | tests |
|---|---|---|---|
| `scripts/tracker.mjs` | FEATURE_MERGED in STATUSES and transitions (`:12-21`), the evidence/acceptance gates (`:41,87,260`); never auto-promotes (`:226-236,296-331`); new `land-feature` action moves the feature's units to COMPLETE and logs `feature_landed`; additive `feature` and `feature_branch` fields (`:261-279`); `renderBlock` unchanged; `archive` gains `git rm` + SHAs + inbound refusal + `doc_retired` (`:377-409`) | TRACKER-01/02/04 | tracker.test, acceptance-trigger.test |
| `scripts/run-manifest.mjs` | per-entry `feature` and `feature_groups` (blocker 2) | TRACKER-01 | run-manifest.test |
| `scripts/plan-graph.mjs` | validate `feature`, the cap, and cross-feature `depends_on` only on earlier features; order by feature; emit the grouping | LAND-02/03 | plan-graph.test |
| `scripts/lib/plan-submodules.mjs` | blocker 13 | LAND-03 | plan-submodules.test |
| `scripts/repo-exec.mjs` | `feature/` in the guard regex (`:31`); per-branch lock order feature → base (`:65-114`); push or fall back to the local feature ref (`:121-142`); new `sync-feature` (base → feature) and `land-feature` actions reusing `:210-259` and the park decisions (`:314-337`) | LAND-02/06 | repo-exec.test |
| `scripts/worktree-sweep.mjs` | never sweep or delete a feature branch (`:42-48,106-115,145`) | — | worktree-sweep.test |
| `scripts/stop-gate.mjs` | block a session whose owned feature is all FEATURE_MERGED but not landed (premature-victory guard) | STATE-04 | stop-gate.test |
| `scripts/lib/core.mjs` | OPEN/LANDED sets (`:278-279`); `[feature:<id>]` criteria (`:421-430`) | STATE, AUTO-06 | core.test, agent-mode-guard.test |
| `scripts/orchestrate-scope-guard.mjs` | count only unit `- id:` entries, not feature ids (`:29-35`); add grants for land-feature and sync dispatches (`:92`) | AUTO-06 | orchestrate-scope-guard.test |
| `scripts/claim.mjs` | feature claim `project--plan--feature--<id>` | — | claim.test |
| `scripts/handoff.mjs` | optional `feature` and `feature_branch` in state and hash | — | handoff.test |
| `scripts/session-context.mjs` | feature in the hand-off line; nudge → `--archive` (`:252,255`) | STATE | session-context.test |
| `scripts/plan-memory.mjs` | `list-decisions` action for the decisions section (the empty-query refusal at `:214`); optional `feature`; archive deletes or compacts the plan's memory file | — | plan-memory.test |
| `scripts/digest.mjs`, `hooks/register.js` | FEATURE_MERGED as "waiting to land"; per-feature progress (`digest.mjs:9,21-37,60-67`; `register.js:32-43`) | TRACKER, MOD-01 | digest.test, register.test.ts |
| `scripts/arch-check.mjs` | return `fm.source` (`:96`); existence check after `:217` | — | arch-check.test (and fix `:220-221` before retiring that plan) |
| `scripts/pre-guard.mjs` | blocker 8 | STATE, LAND-05 | pre-guard.test |
| `scripts/init.mjs` | FEATURE_MERGED in the status regex and active list (`:270,292`); `planDocuments` migration (`:281-317`) | — | init.test |
| `scripts/doc-size-policy.mjs` | blocker 1 (new budget entry for `_features.md`) | — | — |
| `workflows/run.js` | `feature` and `base_branch` in the args and brief; FEATURE_MERGED in the result enum; after a feature's last unit, `agent()` calls for sync-feature and land-feature, with a schema | ENGINE-03/05/06/09 | engine.test, wiring.test |
| `craftsman.config.json` | `planning.featureBranches` (default off), `planning.featureUnitCap` (~8) | ENGINE-12 | init.test |
| `.claude-plugin/plugin.json` | bump `metadata.release` so feature-format plans are identifiable | MOD | init.test |
| `README.md`, `EXTENDING.md` | loop, landing, tracker, doc-write authority, `planning` keys, `arch-check lint` docs (`README.md:46-176`; `EXTENDING.md:113-302`) | — | descriptions.test |

**Unaffected** (checked): `auto-go`, `baseline`, `stats`, `toggle`,
`builtin-check`, `fix-tests`, `_shared-analysis`; the implementer,
plan-reviewer, docs-curator, architect-analyst and idea-critic agents, and all
13 diff/code reviewer agents; the `deep-research` and `design-review` skills;
the language references; CONTRIBUTING; output-styles; `tracker-sync`,
`quality-gate`, `doc-write`, `scope`, `force-block`, `land`, `stats`,
`telemetry`, `self-update`, `workspace-init.mjs`, `workflows/spike.js`,
`hooks.json` (no SubagentStop, ARCH-STATE-07).

**After editing:** `tracker.mjs`, `repo-exec.mjs`, `run.js` and `register.js`
are cited by ARCH line ranges. `/architect --update` must re-point those cites,
because lint only checks that a range still fits the file.

## Disputed
- **Critic: "A duplicates an existing concept; a plan is already a feature."**
  Softened. Measured units per plan: Gleam median 6, p90 36; Loost median 4,
  p90 12. The critic's own kill criterion (median ≤ 3) is not met, and large
  plans do bundle several outcomes. The rule exists in prose (`plan.md:23,34`)
  but is not enforced.
- **Critic: "Never delete `docs/ideas` or `docs/architecture`."** Kept as a
  recommendation, but the user chose "everything stale" as `--clear`'s reach.
  Reconciled as conditional deletion; see recommendation 4.
- **Critic: "52 inbound links in Gleam" (marked UNPROVEN by the critic).**
  Confirmed by root: 52 Gleam docs outside `docs/plans/` reference `docs/plans/`
  paths.

## Recommendations
(ordered by impact)

1. **Split into two plans and ship B first.** B needs no rule amendments; A
   needs `/architect`.
2. **Plan-doc retirement lives in `tracker.mjs archive`, not a free-form
   sweep.** Archiving a COMPLETE plan should, under its existing lock and
   COMPLETE gate:
   - `git rm` the plan doc and its `scrutinise-` / `investigate-` siblings;
   - write `<slug> · <goal> · last-doc <sha> · landed <sha>` to the index;
   - refuse, or list, when inbound links exist.
3. **One deleting mode with a guarded UX.** Replace `--clean`/`--clear` with
   `--archive` (retire COMPLETE plans; safe and routine) and `--prune`
   (judgement-based deletion of stale docs). `--prune` should:
   - always do a dry run first;
   - require confirmation;
   - work in bounded rounds of about 15 docs, like `--tracker`;
   - skip any doc referenced by a live tracker row or a claim.
4. **Ideas and architecture: delete only when nothing cites them.**
   - Add a `source:` existence check to `arch-check lint`
     (`arch-check.mjs:216-217`), so deletion breakage is caught.
   - An idea whose plan is archived and that no rules doc cites can be deleted.
   - A rules doc or a cited idea is superseded, not deleted. ARCH rules already
     support `[superseded by …]`.
5. **Leave foreign folders alone unless named.** Gleam's `audits/`, `issues/`,
   `optional/` and `marketing/` are not craftsman output; prune them only when
   passed explicitly.
6. **A goes through `/architect --deep`, with these changes:**
   - **Size cap:** for example, at most about 8 units or one session per
     feature, so features stay short-lived.
   - **Base sync:** merge base into the feature branch before each unit lands
     there, so the final merge stays small.
   - **New status:** unit COMPLETE on the feature branch is `FEATURE_MERGED`.
     A unit counts as COMPLETE (ARCH-TRACKER-04, ARCH-AUTO-01) only after its
     feature lands on base.
   - **Landing:** reuse `repo-exec`'s explicit `base_branch` for unit landing,
     and add a `land-feature` step.
   - **Opt-in:** keep per-unit landing on base as the default for single-feature
     plans.
7. **Cross-session decisions: start with what exists.** A per-plan `decisions`
   section fed from PARKED decisions and plan-memory, before building any
   messaging channel. Demand is still unproven.
8. **`--update` last, and non-destructive, inside `/init --update`.** That
   command already walks `docs/plans/` and stamps `craftsman_version`
   (blocker 11).
   - Add a `features:` grouping over existing units.
   - Never renumber `scope_id`.
   - Migrate only live plans; COMPLETE plans are retired by recommendation 2
     instead.
9. **Fit the budgets before adding anything.** Put the feature protocol in
   `commands/_features.md` (its own budget, loaded only when
   `planning.featureBranches` is on) and compress the full files rather than
   raise their caps (blocker 1).
10. **Fix the cheap, already-real bugs first, in B's plan:**
    - `feature/` in the `repo-exec` guard;
    - `source:` existence in `arch-check`;
    - archive-aware slug resolution in `auto`, `instruction` and `orchestrate`;
    - deletions routed through a guarded script action (blockers 4, 8, 9, 10).
11. **A's plan opens with protection, then a spike.** First the worktree-sweep
    exemption and FEATURE_MERGED in `core.mjs` OPEN (blockers 3, 7). Then a
    `workflows/spike.js`-style one-feature, two-unit spike covering prepare,
    sync-feature, land-feature, a conflict park and the sweep, before any
    format change.

## Open questions
- **Merge model?** Answered: feature branch; the whole feature lands on main once.
- **Which command owns the flags?** Answered: `/sync-docs`.
- **Can `--clear` delete idea and architecture docs?** Answered: everything stale.
  Applied as "delete when uncited, supersede when cited"
  (recommendation 4).
- **Still open:**
  - Is the `--clean`/`--clear` → `--archive`/`--prune` rename acceptable? It is
    a naming preference only the user can settle.
  - Should the format migration live in `/init --update` rather than a new
    `/sync-docs --update` (blocker 11)?
  - May prune delete rejected or deferred ideas (blocker 12)?

## Next step
`/architect feature-branch-plans --deep`. It is cross-cutting and amends
ARCH-ENGINE-09, ARCH-LAND-02 and ARCH-TRACKER-04. Ask it to sequence B (doc
retirement) as the first plan and A (feature branches) behind a spike.
