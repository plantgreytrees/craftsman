---
area: auto
governs: ["commands/auto.md", "commands/instruction.md", "scripts/orchestrate-scope-guard.mjs"]
human: docs/architecture/auto.md
source: docs/ideas/autonomous-e2e-loop.md
verified_at: 655e17e28b036ec540800c641ef14b28fcea146a
updated: 2026-10-09
---
# ARCH auto — enforced rules

- **ARCH-AUTO-01** [decided] /craftsman:auto is the single entry: Phase A asks every open decision (idea → architect → plan), Phase B runs unattended under /goal, Phase C asks one consolidated round; repeat until every row for the slug is COMPLETE — check: auto.md phase headings — cite: commands/auto.md:10-34
- **ARCH-AUTO-02** [decided] /auto MUST NOT default an open decision; defaults are allowed only for conventional choices — check: auto.md + reviewer — cite: commands/auto.md:18
- **ARCH-AUTO-03** [decided] /auto MUST end every run by listing the remaining rows and prompting the user to continue — check: auto.md final step — cite: commands/auto.md:34
- **ARCH-AUTO-04** [decided] The /goal condition keeps instruction.md's evidence clause, adds "parked rows with Phase C asked = met stop", and stays ≤4000 chars by wc -c — check: instruction.md composition step — cite: commands/instruction.md:55-58
- **ARCH-AUTO-05** [decided] Each Phase B pass gets a fresh /goal turn cap, sized from the remaining rows using instruction.md's bands — check: auto.md — cite: commands/auto.md:24
- **ARCH-AUTO-06** [decided] orchestrate-scope-guard MUST treat /auto like /orchestrate (scope-required, acceptance ownership) and grant its per-unit runners — check: guard test — cite: scripts/orchestrate-scope-guard.mjs:63-92
- **ARCH-AUTO-07** [decided] Where the mod cannot launch (-p, disableAllHooks, no mod support), /auto prints the paste-ready goal as /instruction does — check: auto.md fallback — cite: commands/auto.md:26
