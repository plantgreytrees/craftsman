# Hand-off: Craftsman Plugin Enhancements

## Purpose

Resume work on Craftsman's context-minimization, scoped execution, multi-phase hand-off, concurrency, and multi-repository workspace enhancements without re-reading the entire repository.

## User goals

- Plans should define the smallest useful file/document scope automatically.
- Multi-step workflows should load only the files and docs required for the active step.
- Work should be grouped by coherent scope so related changes are completed together.
- Units/phases should hand off state, compact or clear context, and resume cleanly.
- Missing dependencies should trigger targeted re-analysis and explicit scope expansion.
- Workspaces with 60+ repositories/projects must select only affected projects and never scan everything by default.

## Implemented

### Plan and scope model

- Plan template supports per-step:
  - `scope_id`
  - `project`
  - `depends_on`
  - `scope.read`
  - `scope.docs`
  - `scope.write`
  - per-step tooling allow-list
- Planner instructions group all changes for one project/repository boundary into one scope step.
- Executor instructions validate and topologically order scope steps.
- One scope packet remains active for all tasks in that step, reducing repeated context loading.

### Runtime enforcement

- `PreToolUse` now covers `Read`, `Glob`, `Grep`, `Write`, `Edit`, `MultiEdit`, and `NotebookEdit`.
- Active scopes block undeclared reads, searches, and writes before the tool runs.
- Scope-required state blocks implementation-context tools until a manifest is activated.
- A blocked dependency requires targeted re-analysis, plan scope update, scope activation, and retry.
- Repository-wide searches are rejected during scoped execution.
- Project boundaries are enforced at runtime.

### Handoffs and concurrency

- Handoffs are persisted per session under `.craftsman/sessions/<sid>/handoff.json`.
- Session start restores the handoff and requires fresh scope activation.
- Atomic plan/unit claims prevent duplicate concurrent execution.
- Merge-lock guidance requires atomic lock acquisition.
- Claims are project-qualified.

### Workspace manifest

- Explicit opt-in manifest support:
  - `CRAFTSMAN_WORKSPACE_MANIFEST=/path/to/craftsman.workspace.json`
  - or `craftsman.workspace.json` at the current project root
- Manifest format:

```json
{
  "version": 1,
  "projects": {
    "payments": { "root": "services/payments" },
    "search": { "root": "tools/search" }
  }
}
```

- Named roots must be relative, existing, unique, inside the manifest directory, and independent Git roots.
- Unknown project ids fail closed.
- Legacy single-repository behavior remains available through `project: "."` with no manifest.
- Added `/craftsman:workspace-init` to create or explicitly update manifests from supplied `id=path` mappings without scanning the workspace.

### Selected-project runtime context

- Quality gates load the selected project's config and use its root for checks,
  caches, baselines, and session markers.
- Session snapshots, tooling detection, Stop-gate commands, Git status, claims,
  learned rules, and hand-offs use the selected project context.
- Workspace resolution rejects non-Git roots; relative worktrees resolve from
  the selected project rather than the default repository.
- Repository-local worktrees, base branches, merge locks, merges, pushes, and
  cleanup are handled by `scripts/repo-exec.mjs` for each selected project.

### Model routing and fan-out efficiency

- `/scrutinise` now uses the established `sonnet` tier instead of the undocumented `fable` value.
- `phase-tracker` uses `haiku` for deterministic bookkeeping.
- Deep scrutiny uses one comprehensive reviewer per module, capped at 12 reviewer calls per round, with specialist follow-up only for surviving findings or high-sensitivity modules.
- `/understand` and `/investigate` cap their initial read-only dispatch at eight agents and combine adjacent low-risk segments beyond that point.
- `scripts/model-policy.mjs` validates command and agent model frontmatter against the supported tiers.
- `PreToolUse` now applies document-write authority only to write-capable tools, so orchestration metadata reads do not trigger false scope retries.
- Shared worktree binding state resolves beside the Git common directory, allowing concurrent-session Git mutation guards to see the same binding from linked worktrees.
- Stop-gate fixture cleanup runs after the file's concurrent tests, removing a false validation race.

### Cross-session design decision

- Memory integrations remain optional, advisory, and evidence-backed. They may supply compact decisions, gotchas, and unresolved risks at scope boundaries, but scope manifests, tracker state, Git, and tests remain authoritative for reads, writes, merges, and completion.

## Important files

- `commands/plan.md` — planner scope-step contract.
- `commands/orchestrate.md` — dependency ordering, activation, hand-off, and resume behavior.
- `commands/_shared-machinery.md` — scope/tooling/workspace rules.
- `commands/_shared-execution.md` — unit lifecycle, claims, compaction, and merge protocol.
- `skills/language-aware-planning/references/plan-template.md` — canonical plan schema.
- `scripts/lib/core.mjs` — workspace manifest discovery and selected-project resolution.
- `scripts/scope.mjs` — active scope manifest lifecycle.
- `scripts/pre-guard.mjs` — runtime read/write/search enforcement.
- `scripts/plan-graph.mjs` — dependency validation and ordering.
- `scripts/workspace-init.mjs` — workspace manifest creation/update helper.
- `scripts/handoff.mjs` — durable session hand-off writer.
- `scripts/claim.mjs` — atomic plan/step claim lifecycle.
- `hooks/hooks.json` — hook registration.
- `commands/workspace-init.md` — user-facing workspace setup command.

## Validation status

Last verified:

- 88 tests passed.
- All Node syntax checks passed.
- Hook/config JSON validation passed.
- `git diff --check` passed.
- Model frontmatter policy check passed.
- Workspace-init CLI smoke test passed with two temporary Git repositories.

## Known follow-up risks

1. Cross-repository changes remain separate scope steps and separate execution branches; there is no single cross-repository atomic commit. Each repository-local lifecycle is now implemented by `scripts/repo-exec.mjs`.
2. Existing older plan documents may not contain `scope_id`, `project`, `depends_on`, or scope manifests. They require migration or an explicit compatibility fallback before strict enforcement is enabled for them.
3. The current hand-off markdown is a human-readable checkpoint; the runtime hand-off remains session-scoped and is not intended to be committed as workflow state.
5. Runtime token and completion usage is not exposed to the plugin scripts, so model effectiveness and review ROI remain unmeasured beyond router decisions and deterministic gate outcomes.

## Resume protocol

1. Read this hand-off only.
2. Inspect the exact files listed under **Important files** for the next change.
3. Choose one follow-up risk or enhancement; do not reopen broad repository exploration.
4. Create a focused plan step with explicit `project`, `scope_id`, `depends_on`, and read/docs/write lists.
5. Run the focused tests for the touched scripts before expanding scope.
