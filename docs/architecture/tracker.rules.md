---
area: tracker
governs: ["scripts/tracker.mjs", "scripts/tracker-sync.mjs", "scripts/digest.mjs", "scripts/run-manifest.mjs"]
human: docs/architecture/tracker.md
source: docs/ideas/autonomous-e2e-loop.md
verified_at: d7da89f424960b24ee235b043673a1e2a2a78849
updated: 2026-10-09
---
# ARCH tracker — enforced rules

- **ARCH-TRACKER-01** [decided] The ledger stays the source of truth; .craftsman/runs/<slug>.json is a derived feature list regenerated on every transition and never hand-edited — check: run-manifest.test.mjs — cite: scripts/tracker.mjs:217-237
- **ARCH-TRACKER-02** [decided] Ledger events may gain fields but never lose them, and renderBlock output stays unchanged — check: tracker.test.mjs snapshot — cite: scripts/tracker.mjs:250-266
- **ARCH-TRACKER-03** [decided] A PARKED event from an autonomous run MUST carry decision {question, options[, recommended]}; Phase C is built from these — check: tracker.test.mjs — cite: scripts/tracker.mjs:46-78
- **ARCH-TRACKER-04** [decided] Autonomous runs MUST NOT emit CANCELLED; a unit reaches COMPLETE only through ticked [unit:] criteria — check: tracker refusal test — cite: scripts/tracker.mjs:64-101
- **ARCH-TRACKER-05** [decided] Each unit starts with a smoke run of the repo's gate command before editing — check: unit-runner.md step — cite: agents/unit-runner.md:14
