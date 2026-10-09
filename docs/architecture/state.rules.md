---
area: state
governs: ["scripts/lib/core.mjs", "scripts/scope.mjs", "scripts/pre-guard.mjs", "scripts/stop-gate.mjs", "scripts/orchestrate-scope-guard.mjs", "scripts/agent-mode-guard.mjs", "scripts/session-context.mjs", "scripts/doc-write.mjs", "scripts/quality-gate.mjs"]
human: docs/architecture/state.md
source: docs/ideas/autonomous-e2e-loop.md
verified_at: 256913f42d004100f55ed7bc1115c151b8d9466f
updated: 2026-10-09
---
# ARCH state — enforced rules

- **ARCH-STATE-01** [decided] PROJECT_ROOT MUST derive from CLAUDE_PROJECT_DIR (or its own git toplevel) and MUST NOT depend on process.cwd(); a session opened above a repo works only through a registered craftsman.workspace.json — check: core.test.mjs asserts the same root for differing cwd — cite: scripts/lib/core.mjs:63-87
- **ARCH-STATE-02** [decided] A grant's writer and spender MUST compute its path from identical inputs (session id + project id), never from cwd — check: orchestrate-scope-guard → agent-mode-guard round-trip test from two cwds — cite: scripts/lib/core.mjs:208-230
- **ARCH-STATE-03** [decided] Inside any agent session_id is the root session's; per-unit scope and scope-required MUST be keyed by the unit's worktree, with the session scope as fallback for the root engine — check: scope.test.mjs, two worktrees hold two independent scopes — cite: scripts/scope.mjs:48-61
- **ARCH-STATE-04** [decided] stop-gate MUST skip only the acceptance block while Stop input background_tasks lists an in-flight workflow or subagent; secrets and regression checks stay armed — check: stop-gate.test.mjs case with background_tasks — cite: scripts/stop-gate.mjs:289-310
- **ARCH-STATE-05** [decided] agent-mode-guard MUST match Task|Agent|Workflow and allow Workflow only for scripts under ${CLAUDE_PLUGIN_ROOT}/workflows/ while execution.engine is "workflow" — check: agent-mode-guard.test.mjs blocks an ad-hoc script — cite: hooks/hooks.json:11-12
- **ARCH-STATE-06** [decided] Hooks MUST NOT address a workspace project by cwd; sub-project grants and scopes live in the root project's session dir, keyed by project id — check: grep hooks for cwd-based project resolution — cite: scripts/agent-mode-guard.mjs:56-58
- **ARCH-STATE-07** [decided] Craftsman MUST NOT register a SubagentStop hook; a unit's "done" is tracker.mjs's refusal of unmet criteria, not a stop hook — check: hooks.json has no SubagentStop key — cite: scripts/tracker.mjs:80-101
