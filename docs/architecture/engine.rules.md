---
area: engine
governs: ["workflows/**", "agents/unit-runner.md", "commands/_shared-execution.md", "craftsman.config.json", "scripts/wiring.test.mjs"]
human: docs/architecture/engine.md
source: docs/ideas/autonomous-e2e-loop.md
verified_at: 256913f42d004100f55ed7bc1115c151b8d9466f
updated: 2026-10-09
---
# ARCH engine — enforced rules

- **ARCH-ENGINE-01** [superseded by ARCH-ENGINE-12] execution.engine MUST be one of workflow | subagent | root, default "workflow"; an unavailable workflow runtime falls back to "subagent", never silently to "root"; "root" is explicit opt-in only — check: config default + /auto launch fallback test — cite: craftsman.config.json:3-6
- **ARCH-ENGINE-02** [decided] The workflow default MUST NOT land until a 1-unit spike records hooks firing in agents, worktree-keyed scope activation, the quality gate, repo-exec prepare/merge, a tracker transition and the park path — check: spike evidence in the plan's acceptance criteria — cite: docs/plans/autonomous-e2e-loop-evidence.md:34-55
- **ARCH-ENGINE-03** [decided] A workflow script MUST only orchestrate: no fs/shell, no import(), no Date.now/Math.random/new Date(); all repo work runs in agents via the existing scripts — check: wiring.test.mjs lints workflows/*.js — cite: scripts/wiring.test.mjs:98-134
- **ARCH-ENGINE-04** [decided] One unit protocol: agents/unit-runner.md drives both the workflow agent() prompts and the subagent fallback — check: wiring test, both engines reference the same file — cite: scripts/wiring.test.mjs:149-161
- **ARCH-ENGINE-05** [decided] Each unit runs an implementer agent then a separate fresh reviewer agent; the script enforces at most 2 fix rounds, then PARKs — check: workflow loop bound + test — cite: workflows/run.js:99-121
- **ARCH-ENGINE-06** [decided] Unit agents MUST return schema JSON {unit, status, evidence, sha|pr, parked[]}; root context holds only tracker state, the plan path and per-unit summaries of at most 2k tokens — check: every agent() call passes a schema — cite: workflows/run.js:17-45
- **ARCH-ENGINE-07** [decided] An open decision mid-run MUST PARK the unit with a structured decision, never a default, and leave its dependants PENDING — check: tracker.test.mjs decision field — cite: scripts/tracker.mjs:46-78
- **ARCH-ENGINE-08** [decided] /plan MUST refuse a unit whose scope.read + scope.docs + task text exceeds execution.unitContextBytes (default 122880) — check: plan dry-run test — cite: scripts/arch-check.mjs:152-185
- **ARCH-ENGINE-09** [decided] Units run sequentially in plan-graph order (pipeline, not parallel) until parallel scope isolation (ARCH-STATE-03) is spike-proven — check: workflows use pipeline() — cite: workflows/run.js:166-183
- **ARCH-ENGINE-10** [decided] For autonomous runs root-context-first supersedes the total-token rationale for root-only mode — check: README and CHANGELOG wording — cite: CHANGELOG.md:21-25
- **ARCH-ENGINE-11** [decided] scripts/workflow.test.mjs MUST be renamed loop-smoke.test.mjs so "workflow" means only Claude Code workflows — check: file absent — cite: scripts/loop-smoke.test.mjs:1-48
- **ARCH-ENGINE-12** [decided] execution.engine MUST be one of workflow | subagent | root, default "workflow"; under /auto an unavailable workflow runtime falls back to "subagent" (one unit-runner per unit, granted by the /auto invocation, ARCH-AUTO-06), never silently to "root"; a standalone /orchestrate stays root-only (ARCH-ENGINE-10), so there an unavailable workflow is reported and the unit protocol runs in root; "root" is explicit opt-in only — check: config default is workflow + agent-mode-guard blocks a unit-runner outside a live /auto — cite: scripts/agent-mode-guard.mjs:91-123
