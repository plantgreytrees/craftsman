---
area: safety
governs: ["hooks/run.sh", "scripts/pre-guard.mjs", "scripts/agent-mode-guard.mjs", "scripts/orchestrate-scope-guard.mjs", "scripts/session-context.mjs", "scripts/worktree-sweep.mjs", "scripts/session-end.mjs"]
human: docs/architecture/safety.md
source: docs/plans/fixes-and-safety.md
verified_at: 44cd3ed6a4a989bb408791e78cd150a0c7dea7d1
updated: 2026-10-21
---
# ARCH safety — enforced rules

- **ARCH-SAFETY-01** [decided] Outside-root writes, deletes and credential reads MUST be left to the Claude Code sandbox; craftsman adds no guard for them — check: pre-guard.mjs names no outside-root write, delete or credential-read rule; /craftsman:init recommends the sandbox settings — cite: scripts/pre-guard.mjs:2-6
- **ARCH-SAFETY-02** [decided] A safety hook (pre-guard, agent-mode-guard, orchestrate-scope-guard) MUST fail closed: with node missing hooks/run.sh exits 2 with "node not found, guards cannot run" — check: launcher.test.mjs — cite: hooks/run.sh:14-19
- **ARCH-SAFETY-03** [decided] A safety hook MUST also fail closed in process: bad JSON, empty stdin, an uncaught error or a failed context load exits 2 naming the guard; onFailure "block" in hooks.json (Claude Code 2.1.295+) is only a second layer — check: pre-guard.test, agent-mode-guard.test and orchestrate-scope-guard.test fail-closed cases — cite: scripts/pre-guard.mjs:20-35, scripts/agent-mode-guard.mjs:56-71, scripts/orchestrate-scope-guard.mjs:72-87
