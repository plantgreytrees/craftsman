# Shared execution machinery

> Canonical protocol for every command that **executes** code changes (`/orchestrate`,
> executed `investigate-*`/`scrutinise-*` plan docs). Link here and `Read` at the phase
> that needs it, don't inline — one source of truth. Not user-invocable. Kept light
> since read unconditionally; the expensive per-unit loop is `_shared-execution.md`,
> read only when execution actually starts.

Referenced by: `orchestrate.md` · executed `investigate-*`/`scrutinise-*` plan docs.

---

## Standing constraints (non-negotiable)

- **Agent mode — mechanically enforced.** Check `execution.agentMode` (default `root-only`, also asserted every session). Every "delegate/dispatch/fan out" instruction below means: do it yourself, sequentially, no Task/Agent tool, no parallel. `agent-mode-guard.mjs` (`PreToolUse` on `Task|Agent`) hard-blocks any Task call under root-only mode except the named exceptions (`/plan`'s `plan-strategist`, and the single granted isolated agent of `/scrutinise`, `/idea`, `/architect --deep` — `_shared-analysis.md`'s Agent mode section). Only `agentMode: "subagents"` restores real delegation.
- **Decide from `docs/`, don't stall.** Resolve design/security calls by reading the governing `docs/architecture/*.rules.md` (never the human `<area>.md`) and `docs/standards/*`, and acting — cite `file:line` and the ARCH id, record the decision. A `decided` ARCH rule is a locked invariant: breaking it needs `/architect`, not a workaround (`_architecture.md`). Stop the user only for genuine product/scope ambiguity or a locked-invariant change.
- **Acceptance is the contract.** `.craftsman/acceptance.md` (if present) gates "done"; the plan's acceptance section refines it per feature.
- **Plans** live only in `docs/plans/<slug>.md`.
- **Shared tracker** (`docs/plans/TRACKER.md`) — touch only rows you created; never prune/reformat foreign ones.
- **Commit style** — Conventional Commits; a hook rejection is fixed in the worktree, never bypassed. `--no-verify`/`--no-gpg-sign`/gpgsign-off is **mechanically blocked** by `pre-guard.mjs`, not just forbidden by convention.
- **Deterministic guards are the backstop.** `consumer-tracer` before touching any exported/shared contract; the project's own detected format/lint/typecheck/test at each gate. An un-updated consumer is the #1 missed unit.
- **Standards, same change.** A governing `docs/standards/` entry: implementer conforms, `code-reviewer` checks it; `standards-keeper` (audit mode) for whole-family consistency. No standard for an established family → note it, run `standards-keeper` (derive mode).

## Optional MCP (use if available, skip if trivial)

- **context7** — resolve external library API docs before an implementer writes against one; skip for pure in-repo edits.
- **memory** — recall gotchas/decisions for the area at unit start; record what was learned at close-out.
- **sequential-thinking** — only for genuinely complex units (multi-contract, ambiguous decomposition).

### Plan memory ledger

`scripts/plan-memory.mjs` is the durable fallback for optional memory providers. Recall only after scope is installed; filter by project/plan/unit/scope; cap with `max_items`/`max_chars`. **Always pass a real, specific `query`** — an empty query returns nothing (no blanket-dump fallback); a real one only surfaces records whose summary/category/tags/source_files actually match. Treat every result as unverified until its source files are checked. Record only post-gate facts: source files, commit identity, verification status, expiry where relevant, **`tags`** (required, ≥1), and a **summary ≤220 chars** — one terse fact, never a paragraph.

Memory is advisory only — never authorizes a read/write, widens scope, settles a claim, or decides a merge. Provider failure = no memory, never a block. External providers may implement the same shape but stay optional and project-isolated.

---

## The tooling manifest (planner → executor contract)

Every plan doc carries, per unit, a `### Tooling` block naming *only* what that unit needs, resolved once at plan time. `gate-select.mjs` (`_shared-execution.md` step 5) re-derives the same gates from the actual diff at execute time — a floor under the planner's listing, not a replacement.

```
### Tooling — <unit-slug>
Implementer:  implementer                     # language auto-detected at execute time
Gates:        security-auditor, ui-ux-reviewer, migration-reviewer, api-reviewer, dependency-auditor, standards-keeper   # only ones this diff triggers
Skills:       <1–3 relevant skills>
Checks:       <detected build/lint/typecheck/test commands>
MCP:          context7 (lib API), memory (recall+record)   # if available; skip-if-trivial
Memory:       plan-memory (bounded recall; post-gate record)
```

### Scope — <unit-slug>

A hard allow-list, separate from tooling:

```
Scope:
	project: <selected repository or project root>
	read:  <specific source, test, config, contract files>
	docs:  <specific docs/reference files>
	write: <specific files the unit may create or edit>
```

The executor/implementer read only `read`+`docs` (plus tracker row + task text) and write only `write`. Missing scope = plan defect: pause, add the scope from a targeted dependency trace, record the correction. Never compensate with a whole-repo scan.

### Scope steps and workspace boundaries

One `scope_id` per coherent project/repository boundary; each step declares `project` + `depends_on`, validated and topologically ordered before context loads. A step is the context-reset boundary — one activated manifest, one hand-off.

`project` is an explicit selected root in a multi-repo workspace; record only roots with dependency evidence, never enumerate the workspace. Cross-project consumers are step dependencies, not a widened read glob.

Workspace discovery: `CRAFTSMAN_WORKSPACE_MANIFEST` env path, or `craftsman.workspace.json` at the project root — `{ "version": 1, "projects": { "id": { "root": "..." } } }`, roots relative/unique/existing/inside the manifest dir, resolving to Git roots (invalid/missing entries block the run). No manifest → `project: "."`, legacy single-repo path.

**Executor rule:** the manifest is the allow-list — use the named implementer, gates, skills, MCP calls; never invoke what it omits. A diff needing one the planner missed → add it AND note the gap in the tracker. No manifest at all → fall back to full Phase X routing (`_shared-execution.md`) and flag it.
