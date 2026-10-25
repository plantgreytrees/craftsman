---
area: gates
governs: ["scripts/gate-select.mjs", "scripts/ui-gate.mjs", "scripts/ui-gate.test.mjs", "agents/ui-ux-reviewer.md"]
human: docs/architecture/gates.md
source: docs/ideas/artist-ui-gate.md
verified_at: bf45a1acc994d28a711c4946f1b87b9fae8f9bdb
updated: 2026-10-25
---
# ARCH gates — enforced rules

- **ARCH-GATES-01** [decided] The ui gate MUST be routed only by scripts/ui-gate.mjs, run when gate-select prints `ui`; it prints one JSON object {route: "artist"|"fallback", reason, reuse?, critic?, a11y} and every outcome is advisory, never blocking a merge — check: ui-gate.test.mjs route shape; _shared-execution.md ui line — cite: commands/_shared-execution.md:33, scripts/gate-select.mjs:80
- **ARCH-GATES-02** [decided] Artist is usable only when ~/.claude/plugins/installed_plugins.json lists exactly `artist@artist-marketplace` with an installPath under ~/.claude/plugins/, enabledPlugins["artist@artist-marketplace"] is true in the user, project or local settings, and the project has a format-2 docs/design/DESIGN.md (or DESIGN.md); any failed condition MUST yield route "fallback" with that condition as reason — check: ui-gate.test.mjs fixtures per condition — cite: docs/architecture/gates.rules.md:12, docs/ideas/artist-ui-gate.md:49
- **ARCH-GATES-03** [superseded by ARCH-GATES-07]
- **ARCH-GATES-04** [decided] artist:design-critic MUST run only when the unit worktree holds an untracked .artist/runs/*/report.json, with a brief of exactly that report's screenshots, the report.json, DESIGN.md and Artist's rubric path; it is dispatched isolated only when listed in execution.builtinAgents, otherwise root applies the brief labelled NOT ISOLATED, and it is never retried — check: ui-gate.test.mjs critic field; _shared-execution.md — cite: scripts/agent-mode-guard.mjs:101-102
- **ARCH-GATES-05** [decided] ui-ux-reviewer is the built-in accessibility floor (contrast, focus, semantic markup, accessible names, React Native equivalents) and loads no design skill; ui-gate sets a11y true on the fallback route and on the artist route whenever no verify report exists — check: ui-gate.test.mjs a11y field; doc-size-policy cap — cite: agents/ui-ux-reviewer.md:1-6
- **ARCH-GATES-06** [decided] Allowing artist:design-critic is user configuration (execution.builtinAgents, documented in EXTENDING.md); agent-mode-guard.mjs MUST NOT special-case it — check: agent-mode-guard.mjs diff empty — cite: scripts/agent-mode-guard.mjs:101-102
- **ARCH-GATES-07** [decided] On the artist route reuse-check MUST run as `node <installPath>/scripts/reuse-check.mjs --project <worktree> --run <dir> --base <merge-base>`, plus `--justifications <report dir>/justifications.json` only when the chosen verify report's dir holds that file as a regular file inside the dir that parses as JSON (an invalid one is omitted and named in reason); the run dir is in craftsman session state outside the worktree; exit 0/1 are advisory findings, exit 2 or a throw MUST fall back with the error as reason — check: ui-gate.test.mjs exit cases and justifications argv cases — cite: scripts/ui-gate.mjs:218-219
