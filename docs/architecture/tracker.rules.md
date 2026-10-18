---
area: tracker
governs: ["scripts/tracker.mjs", "scripts/tracker-sync.mjs", "scripts/digest.mjs", "scripts/run-manifest.mjs"]
human: docs/architecture/tracker.md
source: docs/ideas/autonomous-e2e-loop.md
verified_at: ac57d0e891bc7343dcb07f174e179ab8f1fd68c9
updated: 2026-10-18
---
# ARCH tracker — enforced rules

- **ARCH-TRACKER-01** [decided] The ledger stays the source of truth; .craftsman/runs/<slug>.json is a derived feature list regenerated on every transition and never hand-edited — check: run-manifest.test.mjs — cite: scripts/tracker.mjs:217-237
- **ARCH-TRACKER-02** [decided] Ledger events may gain fields but never lose them, and renderBlock output stays unchanged — check: tracker.test.mjs snapshot — cite: scripts/tracker.mjs:250-266
- **ARCH-TRACKER-03** [decided] A PARKED event from an autonomous run MUST carry decision {question, options[, recommended]}; Phase C is built from these — check: tracker.test.mjs — cite: scripts/tracker.mjs:46-78
- **ARCH-TRACKER-04** [decided] Autonomous runs MUST NOT emit CANCELLED; a unit reaches COMPLETE only through ticked [unit:] criteria — check: tracker refusal test — cite: scripts/tracker.mjs:64-101
- **ARCH-TRACKER-05** [decided] Each unit starts with a smoke run of the repo's gate command before editing — check: unit-runner.md step — cite: agents/unit-runner.md:14
- **ARCH-TRACKER-06** [decided] FEATURE_MERGED is a unit landed on its feature branch: it needs ticked [unit:] criteria like MERGED, is never auto-promoted, and reaches COMPLETE only through land-feature, which promotes every row of the feature with the landing sha — check: tracker.test.mjs transitions — cite: scripts/tracker.mjs:12-21
- **ARCH-TRACKER-07** [decided] Ledger events gain optional feature and feature_branch; the run manifest keeps features[] as units and adds feature_groups; no migration rewrites scope_id — check: run-manifest.test.mjs — cite: scripts/run-manifest.mjs:26-48
- **ARCH-TRACKER-08** [decided] A `[feature:<id>]` criterion gates its feature's land-feature; untagged criteria gate only the last feature's land-feature — check: core.test.mjs, tracker.test.mjs — cite: scripts/lib/core.mjs:421-430
- **ARCH-TRACKER-09** [decided] TRACKER-archive.md headings are machine-readable and tracker.mjs lookup {plan|slug} returns the parsed line — check: tracker.test.mjs lookup — cite: scripts/tracker.mjs:401-402
- **ARCH-TRACKER-10** [decided] Each epic and story has a generated docs/plans/<slug>/TRACKER.md rollup rendered from the ledger through plan-index (a parent is COMPLETE only when every descendant row is COMPLETE); it is fenced, pre-guard-protected and never hand-edited; the root TRACKER.md block and renderBlock stay unchanged — check: tracker.test.mjs rollup snapshot, pre-guard.test.mjs — cite: scripts/tracker.mjs:147-195
- **ARCH-TRACKER-11** [decided] `tracker.mjs publish` is the only path that commits progress to base: under the base merge lock it renders the block, the rollups and docs/plans/TRACKER.jsonl into a detached temp worktree at origin/<base>, commits only those pathspecs, pushes HEAD:<base>, re-renders and retries once on rejection, and never parks a unit; it runs at feature prepare, on each unit landed (FEATURE_MERGED), parked or blocked, at feature landing and on /sync-docs --tracker, never per IN_PROGRESS — check: tracker.test.mjs publish idempotency and race — cite: scripts/repo-exec.mjs:276-310
- **ARCH-TRACKER-12** [decided] publish refuses to shrink a committed non-empty block to empty without an archive event, and `tracker.mjs init` rehydrates an absent local ledger from docs/plans/TRACKER.jsonl (derived, written only by publish; ARCH-TRACKER-01 unchanged) — check: tracker.test.mjs refuse-to-blank — cite: scripts/tracker.mjs:184-195
