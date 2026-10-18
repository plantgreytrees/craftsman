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
touches: [commands/plan.md, skills/language-aware-planning/references/plan-template.md, scripts/plan-graph.mjs, scripts/tracker.mjs, scripts/run-manifest.mjs, scripts/repo-exec.mjs, scripts/claim.mjs, scripts/arch-check.mjs, scripts/digest.mjs, workflows/run.js, agents/unit-runner.md, commands/orchestrate.md, commands/_shared-execution.md, commands/auto.md, commands/merge.md, commands/sync-docs.md, docs/architecture/tracker.rules.md, docs/architecture/landing.rules.md, docs/architecture/engine.rules.md, scripts/*.test.mjs, README.md, CHANGELOG.md]
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
8. **`--update` last, and non-destructive.**
   - Add a `features:` grouping over existing units.
   - Never renumber `scope_id`.
   - Migrate only live plans; COMPLETE plans are retired by recommendation 2
     instead.

## Open questions
- **Merge model?** Answered: feature branch; the whole feature lands on main once.
- **Which command owns the flags?** Answered: `/sync-docs`.
- **Can `--clear` delete idea and architecture docs?** Answered: everything stale.
  Applied as "delete when uncited, supersede when cited"
  (recommendation 4).
- **Still open:** is the `--clean`/`--clear` → `--archive`/`--prune` rename
  acceptable? It is a naming preference only the user can settle.

## Next step
`/architect feature-branch-plans --deep`. It is cross-cutting and amends
ARCH-ENGINE-09, ARCH-LAND-02 and ARCH-TRACKER-04. Ask it to sequence B (doc
retirement) as the first plan and A (feature branches) behind a spike.
