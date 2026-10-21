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
- **ARCH-SAFETY-04** [decided] Advisory hooks (quality-gate, stop-gate, builtin-skill-context) MAY fail open on bad input but MUST say so once per session, and SessionStart MUST report whether the guards are on or off and why — check: core.test.mjs advisory cases, session-context.test.mjs reason strings — cite: scripts/lib/core.mjs:586-607, scripts/session-context.mjs:34-45
- **ARCH-SAFETY-05** [decided] Only CRAFTSMAN_SAFETY=off in the user's environment MUST disable the safety hooks; CRAFTSMAN=off, .craftsman/off and enabled:false switch off the quality, doc and tracker machinery only, and a tool call cannot create .craftsman/off, edit the safety keys, hooks.json or grant markers, or run toggle.mjs off or doc-write.mjs on outside a craftsman command (and scope activation honours a manifest naming hooks.json or the config only after /orchestrate or /auto) — check: pre-guard.test.mjs self-disable table, core.test.mjs safetyEnabled — cite: scripts/lib/core.mjs:588-592, scripts/pre-guard.mjs:899-955, scripts/scope.mjs:149-154
