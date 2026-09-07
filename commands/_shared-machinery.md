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

### Plan memory ledger

The local `scripts/plan-memory.mjs` ledger is the durable fallback for optional
memory providers. Recall only after the active scope is installed, filter by the
selected project, plan, unit, and scope, and cap results with `max_items` and
`max_chars`. Treat every result as unverified context until its source files are
checked. Record only post-gate facts with source files, commit identity,
verification status, and an expiry where the fact can become stale.

Memory is advisory: it must never authorize a read/write, widen a scope, settle a
claim, replace tracker state, satisfy acceptance, or decide a merge. Provider
failure means no memory and must not block execution. External providers such as
Mempalace may implement the same recall/record shape, but remain optional and
project-isolated.

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
Memory:       plan-memory (bounded recall; post-gate record)
```

### Scope — <unit-slug>

The plan's machine-readable `scope` is a hard allow-list, separate from tooling:

```
Scope:
	project: <selected repository or project root>
	read:  <specific source, test, config, and contract files>
	docs:  <specific docs/reference files>
	write: <specific files the unit may create or edit>
```

The executor and implementer may read only `read` + `docs` for implementation
context, plus the tracker row and task text needed to operate the workflow, and
may write only `write`. A missing scope is a plan defect: pause that unit, add
the scope from a targeted dependency trace, and record the correction in the
tracker. Do not compensate with a whole-repository scan.

### Scope steps and workspace boundaries

The planner groups all changes for one coherent project/repository boundary into
one scope step identified by `scope_id`. Each step declares `project` and
`depends_on`; the executor validates and topologically orders these ids before
loading implementation context. A step is the context-reset boundary: all tasks
in that step share one activated manifest and one hand-off.

For a workspace containing many repositories, `project` is an explicit selected
root. The planner records only affected roots supported by dependency evidence;
it must not enumerate or scan the entire workspace. Cross-project consumers are
represented as dependencies between steps, not by widening one step's read glob.

Workspace discovery is opt-in and deterministic: set `CRAFTSMAN_WORKSPACE_MANIFEST`
to a manifest path, or place `craftsman.workspace.json` at the current project
root. The manifest uses `{ "version": 1, "projects": { "id": { "root": "..." } } }`.
Roots must be relative, unique, existing, and inside the manifest directory.
Named projects must resolve to Git roots; invalid or missing entries block the
run. With no manifest, `project: "."` retains the legacy single-repository path.

**Executor rule:** treat the manifest as the allow-list for that unit. Use the named implementer, run the named gates + checks, load the named skills, make the named MCP calls — do **not** invoke gates/skills/agents the manifest omits. If the diff turns out to need one the planner missed, add it AND note the manifest gap in the tracker so the next plan is better. A unit with no manifest → fall back to full Phase X routing (`_shared-execution.md`) and flag the missing manifest.
