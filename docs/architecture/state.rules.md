---
area: state
governs: ["scripts/lib/core.mjs", "scripts/scope.mjs", "scripts/pre-guard.mjs", "scripts/stop-gate.mjs", "scripts/orchestrate-scope-guard.mjs", "scripts/agent-mode-guard.mjs", "scripts/session-context.mjs", "scripts/doc-write.mjs", "scripts/quality-gate.mjs"]
human: docs/architecture/state.md
source: docs/ideas/autonomous-e2e-loop.md
verified_at: ac57d0e891bc7343dcb07f174e179ab8f1fd68c9
updated: 2026-10-18
---
# ARCH state — enforced rules

- **ARCH-STATE-01** [decided] PROJECT_ROOT MUST derive from CLAUDE_PROJECT_DIR (or its git toplevel), never process.cwd(); a session above a repo works only via a registered craftsman.workspace.json — check: core.test.mjs same root for differing cwd — cite: scripts/lib/core.mjs:63-87
- **ARCH-STATE-02** [decided] A grant's writer and spender MUST derive its path from session id + project id, never cwd — check: two-cwd round-trip test — cite: scripts/lib/core.mjs:208-230
- **ARCH-STATE-03** [decided] Inside an agent session_id is the root's; per-unit scope and scope-required MUST be keyed by the unit's worktree, session scope as root-engine fallback — check: scope.test.mjs — cite: scripts/scope.mjs:48-61
- **ARCH-STATE-04** [decided] stop-gate MUST skip only the acceptance block while background_tasks lists an in-flight workflow or subagent; secrets and regression checks stay armed — check: stop-gate.test.mjs — cite: scripts/stop-gate.mjs:286-307
- **ARCH-STATE-05** [decided] agent-mode-guard MUST match Task|Agent|Workflow and allow Workflow only for ${CLAUDE_PLUGIN_ROOT}/workflows/ scripts while execution.engine is "workflow" — check: agent-mode-guard.test.mjs — cite: hooks/hooks.json:11-12
- **ARCH-STATE-06** [decided] Hooks MUST NOT address a workspace project by cwd; sub-project grants and scopes live in the root session dir keyed by project id — check: grep hooks for cwd resolution — cite: scripts/agent-mode-guard.mjs:56-58
- **ARCH-STATE-07** [decided] Craftsman MUST NOT register a SubagentStop hook; "done" is tracker.mjs refusing unmet criteria — check: hooks.json has no SubagentStop — cite: scripts/tracker.mjs:80-101
- **ARCH-STATE-08** [decided] stop-gate blocks while an owned feature is all FEATURE_MERGED, unlanded (STATE-04 skip applies) — check: stop-gate.test — cite: scripts/stop-gate.mjs:282-307
- **ARCH-STATE-09** [decided] In a shared feature worktree scope stays keyed by worktree (ARCH-STATE-03): activating the next unit replaces the previous unit's scope file, and land, park and block each release the worktree scope before the next unit's smoke gate; wave units each hold their own worktree and scope — check: scope.test.mjs two units in one worktree, two wave worktrees — cite: scripts/scope.mjs:124-136
