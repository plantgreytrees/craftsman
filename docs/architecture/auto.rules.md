---
area: auto
governs: ["commands/auto.md", "commands/instruction.md", "scripts/orchestrate-scope-guard.mjs"]
human: docs/architecture/auto.md
source: docs/ideas/autonomous-e2e-loop.md
verified_at: 9e122b185051f279778b956746840d9253d32ae4
updated: 2026-11-01
---
# ARCH auto — enforced rules

- **ARCH-AUTO-01** [superseded by ARCH-AUTO-09]
- **ARCH-AUTO-02** [decided] /auto MUST NOT default an open decision; only conventional choices default — check: auto.md, reviewer — cite: commands/auto.md:18
- **ARCH-AUTO-03** [decided] /auto MUST end each run listing remaining rows and prompting to continue — check: auto.md final step — cite: commands/auto.md:35
- **ARCH-AUTO-04** [decided] The /goal condition keeps instruction.md's evidence clause, adds "parked rows with Phase C asked = met stop", and stays ≤4000 chars (wc -c) — check: instruction.md composition — cite: commands/instruction.md:55-58
- **ARCH-AUTO-05** [decided] Each Phase B pass gets a fresh /goal turn cap sized from remaining rows by instruction.md's bands — check: auto.md — cite: commands/auto.md:24
- **ARCH-AUTO-06** [superseded by ARCH-AUTO-10]
- **ARCH-AUTO-07** [decided] Where the mod can't launch (-p, disableAllHooks, no mod support), /auto prints the paste-ready goal like /instruction — check: auto.md fallback — cite: commands/auto.md:26
- **ARCH-AUTO-08** [decided] FEATURE_MERGED is open for grants, turn caps, force block; +1 grant/feature — check: core.test — cite: scripts/lib/core.mjs:302-305,346-347
- **ARCH-AUTO-09** [decided] /craftsman:auto is the single entry: Phase A asks every open decision (idea → architect → plan), Phase B runs unattended under /goal, Phase C asks one consolidated round; repeat until every row of every plan the slug resolves to through plan-index is COMPLETE, and autoActive, autoForceBlock and runner grants read the resolved feature plan, so an epic or story slug never holds the marker for 24 h — check: core.test.mjs descendant rows, auto-command.test.mjs — cite: scripts/lib/core.mjs:372-406, scripts/orchestrate-scope-guard.mjs:133-148
- **ARCH-AUTO-10** [decided] /auto MUST NOT set scope-required (Phase A writes docs); its goal's /orchestrate sets it; /auto keeps the marker, ownership and runner grants — check: orchestrate-scope-guard.test.mjs — cite: scripts/orchestrate-scope-guard.mjs:116-148
- **ARCH-AUTO-11** [decided] The session's scope-required marker MUST belong to the /orchestrate run that armed it: /orchestrate arms it, /auto never does and keeps it while its run is active (ARCH-AUTO-10); SessionStart re-arms it on resume or compaction only when the session's hand-off still lists remaining units (a closing hand-off arms nothing); a craftsman command the user types (a prompt, never a model Skill call) other than /orchestrate or /auto, outside an active /auto run, clears the session-level marker and session scope, never a worktree-keyed unit scope, binding or marker (scope.mjs release, ARCH-STATE-03); scope activation still clears it — check: orchestrate-scope-guard.test.mjs a typed /plan after /orchestrate clears them, a Skill call does not, an active /auto run keeps them; session-context.test.mjs a closing hand-off arms nothing — cite: scripts/orchestrate-scope-guard.mjs:116-127, scripts/session-context.mjs:166-169, scripts/scope.mjs:205-207
