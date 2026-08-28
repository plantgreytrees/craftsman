# Shared execution machinery

> Canonical, single-source protocol for every command that **executes** code changes
> (`/orchestrate` and the executor half of `/investigate`/`/scrutinise` plan docs). Commands
> **link here and `Read` this file at the phase that needs it** instead of inlining it — one edit,
> one source of truth. Not user-invocable on its own.
>
> This file holds what **every** command that touches execution needs (constraints, MCP
> conventions, the tooling-manifest contract) — deliberately kept light since it's read
> unconditionally. The per-unit execution loop itself (worktrees, gates, merge) is the
> expensive part and lives in `${CLAUDE_PLUGIN_ROOT}/commands/_shared-execution.md`,
> read only by the command that's actually about to run it.

Referenced by: `${CLAUDE_PLUGIN_ROOT}/commands/orchestrate.md` · executed `investigate-*`/`scrutinise-*` plan docs.

---

## Standing constraints (non-negotiable, apply to every unit)

- **Decide from `docs/`, don't stall.** `docs/` is the standing authority. Resolve design/architecture/security judgement calls by reading the reference and acting, not by pausing for the user: load the relevant `docs/architecture/*`, `docs/standards/*` into the plan's Background with `file:line`, follow it, record the decision. **Only stop the user** for a true product/scope ambiguity or a change to a locked/signed-off invariant — note every such stop in the tracker.
- **Acceptance is the contract.** `.craftsman/acceptance.md` (if present) lists the gates a unit must pass; a unit is not done until its acceptance items hold. The plan doc's acceptance section refines them per feature.
- **Plans** live in `docs/plans/`. Never elsewhere. Plan docs are `docs/plans/<slug>.md`.
- **Shared tracker** — `docs/plans/TRACKER.md` is shared with concurrent sessions. Only touch execution rows you created (this run's slugs). Never prune/reformat foreign rows.
- **Commit style** — Conventional Commits. Respect the repo's commit hooks / pre-commit checks; a hook rejection is fixed **in the worktree**, never bypassed (`--no-verify` is forbidden).
- **Deterministic guards are the backstop — run them, don't eyeball.** Blast radius via `consumer-tracer` before touching any exported/shared contract; the project's own checks (format / lint / typecheck / test — detected, never assumed) at each gate. A changed contract with an un-updated consumer is the #1 missed unit; the tracer, not judgement, decides who is affected.
- **Standards, same change.** If `docs/standards/` carries a standard that governs the touched code, the implementer conforms to it and `code-reviewer` checks it; `standards-keeper` (audit mode) is the deeper consistency pass when a family's conventions matter more than one diff's correctness. Absent standard for a family the unit establishes → note "no standard — run `standards-keeper` (derive mode)".

## Optional MCP conventions (use if available; skip if trivial)

MCP is never ritual — use where it earns tokens, skip otherwise. Each is optional; degrade gracefully if the server is absent:
- **context7** — before an implementer writes against an external library API, resolve + query current docs rather than trusting training data. Skip for pure in-repo edits.
- **memory** — at unit start, recall gotchas for the touched area + change-class (tooling quirks, known-flaky tests, past decisions). At close-out, record what was learned (tooling detected, gotcha hit, contract touched → consumers). This is the durability win — each run makes the next smarter.
- **sequential-thinking** — only for genuinely complex units (multi-contract ripple, ambiguous decomposition). Skip trivial single-file units.

---

## The tooling manifest (planner → executor contract)

Every plan doc a planner emits carries, **per unit**, a `### Tooling` block naming *only* what that unit needs — so the executor loads exactly those and ignores the rest (no scanning every agent/skill/check per unit; less context, faster, fewer wrong turns). The planner resolves this once, at plan time, when it already knows the change shape.

```
### Tooling — <unit-slug>
Implementer:  implementer                     # the routing target; language auto-detected at execute time
Gates:        security-auditor, standards-keeper   # ONLY the specialist gates this diff triggers
Skills:       <1–3 skills relevant to this unit>
Checks:       <the detected build/lint/typecheck/test commands this diff must pass>
MCP:          context7 (lib API), memory (recall+record)   # if available; skip-if-trivial
```

**Executor rule:** treat the manifest as the allow-list for that unit. Use the named implementer, run the named gates + checks, load the named skills, make the named MCP calls — do **not** invoke gates/skills/agents the manifest omits. If the diff turns out to need one the planner missed, add it AND note the manifest gap in the tracker so the next plan is better. A unit with no manifest → fall back to full Phase X routing (`_shared-execution.md`) and flag the missing manifest.
