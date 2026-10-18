---
area: auto
governs: ["commands/auto.md", "commands/instruction.md", "scripts/orchestrate-scope-guard.mjs"]
human: docs/architecture/auto.md
source: docs/ideas/autonomous-e2e-loop.md
verified_at: ac57d0e891bc7343dcb07f174e179ab8f1fd68c9
updated: 2026-10-18
---
# ARCH auto — enforced rules

- **ARCH-AUTO-01** [superseded by ARCH-AUTO-09] /craftsman:auto is the single entry: Phase A asks every open decision (idea → architect → plan), Phase B runs unattended under /goal, Phase C asks one round; repeat until every slug row is COMPLETE — check: auto.md phases — cite: commands/auto.md:10-34
- **ARCH-AUTO-02** [decided] /auto MUST NOT default an open decision; only conventional choices default — check: auto.md, reviewer — cite: commands/auto.md:18
- **ARCH-AUTO-03** [decided] /auto MUST end each run listing remaining rows and prompting to continue — check: auto.md final step — cite: commands/auto.md:34
- **ARCH-AUTO-04** [decided] The /goal condition keeps instruction.md's evidence clause, adds "parked rows with Phase C asked = met stop", and stays ≤4000 chars (wc -c) — check: instruction.md composition — cite: commands/instruction.md:55-58
- **ARCH-AUTO-05** [decided] Each Phase B pass gets a fresh /goal turn cap sized from remaining rows by instruction.md's bands — check: auto.md — cite: commands/auto.md:24
- **ARCH-AUTO-06** [decided] orchestrate-scope-guard MUST treat /auto like /orchestrate (scope-required, acceptance ownership) and grant its unit runners — check: guard test — cite: scripts/orchestrate-scope-guard.mjs:63-92
- **ARCH-AUTO-07** [decided] Where the mod can't launch (-p, disableAllHooks, no mod support), /auto prints the paste-ready goal like /instruction — check: auto.md fallback — cite: commands/auto.md:26
- **ARCH-AUTO-08** [decided] FEATURE_MERGED is open for grants, turn caps, force block; +1 grant/feature — check: core.test — cite: scripts/lib/core.mjs:278-279
- **ARCH-AUTO-09** [decided] /craftsman:auto is the single entry: Phase A asks every open decision (idea → architect → plan), Phase B runs unattended under /goal, Phase C asks one consolidated round; repeat until every row of every plan the slug resolves to through plan-index is COMPLETE, and autoActive, autoForceBlock and runner grants read the resolved feature plan, so an epic or story slug never holds the marker for 24 h — check: core.test.mjs descendant rows, auto-command.test.mjs — cite: scripts/lib/core.mjs:302-325
