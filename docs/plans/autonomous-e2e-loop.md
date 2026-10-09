---
slug: autonomous-e2e-loop
goal: One /craftsman:auto entry asks every decision up front, runs units unattended in fresh-context workflow agents, asks again after, and lands everything with a measured smaller root context.
idea: docs/ideas/autonomous-e2e-loop.md
classification: in-scope # idea verdict pursue-with-changes, status architected (docs/ideas/autonomous-e2e-loop.md:2-4); decided rules in docs/architecture/*.rules.md
tracker_rows: [state-root-pin, telemetry, baseline-run, auto-command, mod-launcher, workflow-spike, engine-guards, engine, plan-fit-and-measure, run-manifest-parked, description-diet, release-notes]
guards:
  blast_radius: done # grep sweep below (CONSUMERS); no HTTP/event boundary — hooks are process-boundary JSON on stdin, traced by grep
  completeness_sweep: done
  blind_rederivation: skipped(config:never) # craftsman.config.json planning.blindRederivation
coverage:
  contract:      1.3 | 1.4 | 4.2 | 7.1 | 8.3 | 10.1   # grant/scope path inputs, guard invocation regex, Workflow matcher, unit-runner schema, PARKED decision field
  data:          N/A(no database; .craftsman/ state files only — ledger gains an optional field, TRACKER-02)
  config:        8.1   # execution.engine, execution.unitContextBytes
  security:      4.3 | 7.1   # pre-guard force-blocks under /auto (LAND-05); Workflow path guarded (STATE-05)
  tests:         every unit — each step ends in `node --test scripts/*.test.mjs scripts/lib/*.test.mjs` exit 0
  observability: 2.1 | 2.2   # {ev:"context"} telemetry + stats root-context report (MOD-03)
  interface:     4.1 | 5.1   # /craftsman:auto command; mod band + /auto-go launcher (+ paste fallback, AUTO-07)
  docs:          4.5 | 9.2 | 12.1 | 12.2
  rollback:      see Risk & rollback — every unit is a revertable merge commit; engine falls back to subagent via config
units:
  - id: state-root-pin
    scope_id: state-root-pin
    project: .
    depends_on: []
    module: core root pin, scope keys
    language: JavaScript (Node ESM, node:test)
    security: high
    # Split by 9.1's ARCH-ENGINE-08 check: as one step it loaded 174,808 bytes (> 122,880).
    # Both halves shipped together in 1e4601b, executed root-only before the check existed.
    scope:
      read: [scripts/lib/core.mjs, scripts/scope.mjs, scripts/pre-guard.mjs, scripts/session-context.mjs, scripts/lib/core.test.mjs, scripts/scope.test.mjs]
      docs: [docs/architecture/state.rules.md]
      write: [scripts/lib/core.mjs, scripts/scope.mjs, scripts/pre-guard.mjs, scripts/session-context.mjs, scripts/lib/core.test.mjs, scripts/scope.test.mjs, scripts/pre-guard.test.mjs, scripts/session-context.test.mjs, scripts/builtin-skill-context.test.mjs, scripts/arch-check.test.mjs]  # re-scoped in execution: non-git test fixtures became git roots (ARCH-STATE-01)
    arch: [ARCH-STATE-01, ARCH-STATE-03, ARCH-STATE-06]
    tooling: { implementer: implementer, gates: [security-auditor], skills: [], guards: [pre-guard, quality-gate] }
  - id: state-root-pin-grants
    scope_id: state-root-pin-grants
    project: .
    depends_on: []
    module: grant paths, no SubagentStop
    language: JavaScript (Node ESM, node:test)
    security: high
    scope:
      read: [scripts/lib/core.mjs, scripts/agent-mode-guard.mjs, scripts/orchestrate-scope-guard.mjs, hooks/hooks.json, scripts/agent-mode-guard.test.mjs, scripts/orchestrate-scope-guard.test.mjs]
      docs: [docs/architecture/state.rules.md, docs/architecture/auto.rules.md]
      write: [scripts/lib/core.mjs, scripts/agent-mode-guard.mjs, scripts/orchestrate-scope-guard.mjs, scripts/agent-mode-guard.test.mjs, scripts/orchestrate-scope-guard.test.mjs]
    arch: [ARCH-STATE-02, ARCH-STATE-06, ARCH-STATE-07, ARCH-AUTO-06]
    tooling: { implementer: implementer, gates: [security-auditor], skills: [], guards: [pre-guard, quality-gate] }
  - id: telemetry
    scope_id: telemetry
    project: .
    depends_on: [state-root-pin]
    module: telemetry.mjs, stats root context
    language: JavaScript (Node ESM)
    security: normal
    scope:
      read: [scripts/lib/core.mjs, scripts/stats.mjs, hooks/hooks.json]
      docs: [docs/architecture/mod.rules.md]
      write: [scripts/telemetry.mjs, scripts/telemetry.test.mjs, scripts/stats.mjs, scripts/stats.test.mjs, hooks/hooks.json]
    arch: [ARCH-MOD-03, ARCH-MOD-04]
    tooling: { implementer: implementer, gates: [observability-reviewer], skills: [], guards: [pre-guard, quality-gate] }
  - id: baseline-run
    scope_id: baseline-run
    project: .
    depends_on: [telemetry]
    module: baseline evidence (live)
    language: Markdown (evidence)
    security: normal
    scope:
      read: [scripts/stats.mjs, scripts/telemetry.mjs]
      docs: [docs/architecture/mod.rules.md]
      write: [docs/plans/autonomous-e2e-loop-evidence.md]
    arch: [ARCH-MOD-03]
    tooling: { implementer: implementer, gates: [], skills: [], guards: [] }
  - id: auto-command
    scope_id: auto-command
    project: .
    depends_on: [state-root-pin, telemetry]
    module: /auto command, git authority, force blocks
    language: Markdown + JavaScript
    security: high
    scope:
      read: [commands/instruction.md, commands/orchestrate.md, commands/merge.md, scripts/orchestrate-scope-guard.mjs, scripts/pre-guard.mjs, scripts/plan-graph.mjs, scripts/repo-exec.mjs, scripts/orchestrate-scope-guard.test.mjs, scripts/pre-guard.test.mjs, scripts/plan-graph.test.mjs]
      docs: [docs/architecture/auto.rules.md, docs/architecture/landing.rules.md, docs/architecture/state.rules.md]
      write: [commands/auto.md, commands/instruction.md, commands/merge.md, scripts/orchestrate-scope-guard.mjs, scripts/pre-guard.mjs, scripts/orchestrate-scope-guard.test.mjs, scripts/pre-guard.test.mjs, scripts/plan-graph.test.mjs, scripts/auto-command.test.mjs]
    arch: [ARCH-AUTO-01, ARCH-AUTO-02, ARCH-AUTO-03, ARCH-AUTO-04, ARCH-AUTO-05, ARCH-AUTO-06, ARCH-AUTO-07, ARCH-LAND-01, ARCH-LAND-02, ARCH-LAND-03, ARCH-LAND-04, ARCH-LAND-05, ARCH-STATE-06]
    tooling: { implementer: implementer, gates: [security-auditor], skills: [], guards: [pre-guard, quality-gate] }
  - id: mod-launcher
    scope_id: mod-launcher
    project: .
    depends_on: [auto-command, telemetry]
    module: mod (hooks/register.js) + manifest
    language: JavaScript/TypeScript (Claude Code mod API)
    security: high
    scope:
      read: [hooks/hooks.json, .claude-plugin/plugin.json, scripts/telemetry.mjs, commands/auto.md, .github/workflows/ci.yml]
      docs: [docs/architecture/mod.rules.md, docs/architecture/auto.rules.md]
      write: [hooks/register.js, hooks/register.test.ts, hooks/hooks.json, .claude-plugin/plugin.json, docs/mod-manifest.txt, scripts/mod-manifest.test.mjs, .github/workflows/ci.yml, commands/auto.md, commands/auto-go.md, scripts/telemetry.mjs, scripts/telemetry.test.mjs]  # re-scoped in execution: the mod is declared by hooks.json "modules" (plugin.json unchanged); /auto-go needs a command file; telemetry takes a measured sample
    arch: [ARCH-MOD-01, ARCH-MOD-02, ARCH-MOD-03, ARCH-MOD-04, ARCH-MOD-05, ARCH-AUTO-07]
    tooling: { implementer: implementer, gates: [security-auditor], skills: [plugin-authoring], guards: [pre-guard, quality-gate] }
  - id: workflow-spike
    scope_id: workflow-spike
    project: .
    depends_on: [state-root-pin, telemetry, auto-command]
    module: 1-unit workflow spike (live)
    language: JavaScript (workflow script) + Markdown
    security: normal
    scope:
      read: [scripts/scope.mjs, scripts/quality-gate.mjs, scripts/repo-exec.mjs, scripts/tracker.mjs, agents/implementer.md, commands/_shared-execution.md]
      docs: [docs/architecture/engine.rules.md, docs/architecture/state.rules.md]
      write: [workflows/spike.js, agents/unit-runner.md, commands/_shared-execution.md, docs/plans/autonomous-e2e-loop-evidence.md]
    arch: [ARCH-ENGINE-02, ARCH-ENGINE-03, ARCH-ENGINE-04, ARCH-ENGINE-09, ARCH-STATE-03]
    tooling: { implementer: implementer, gates: [], skills: [workflow-authoring], guards: [pre-guard, quality-gate] }
  - id: engine-guards
    scope_id: engine-guards
    project: .
    depends_on: [workflow-spike]
    module: Workflow guard, runner grant
    language: JavaScript
    security: high
    # Split by 9.1's ARCH-ENGINE-08 check: as one step it loaded 135,142 bytes (> 122,880).
    # Both halves shipped together in 21ca2d6, executed root-only before the check existed.
    scope:
      read: [hooks/hooks.json, scripts/agent-mode-guard.mjs, scripts/orchestrate-scope-guard.mjs, scripts/lib/core.mjs, scripts/agent-mode-guard.test.mjs, scripts/orchestrate-scope-guard.test.mjs]
      docs: [docs/architecture/state.rules.md, docs/architecture/auto.rules.md]
      write: [hooks/hooks.json, scripts/agent-mode-guard.mjs, scripts/orchestrate-scope-guard.mjs, scripts/lib/core.mjs, scripts/agent-mode-guard.test.mjs, scripts/orchestrate-scope-guard.test.mjs]
    arch: [ARCH-STATE-05, ARCH-STATE-07, ARCH-AUTO-06]
    tooling: { implementer: implementer, gates: [security-auditor], skills: [], guards: [pre-guard, quality-gate] }
  - id: engine-guards-stop
    scope_id: engine-guards-stop
    project: .
    depends_on: [workflow-spike]
    module: stop-gate background tasks
    language: JavaScript
    security: high
    scope:
      read: [scripts/stop-gate.mjs, scripts/stop-gate.test.mjs]
      docs: [docs/architecture/state.rules.md]
      write: [scripts/stop-gate.mjs, scripts/stop-gate.test.mjs]
    arch: [ARCH-STATE-04]
    tooling: { implementer: implementer, gates: [security-auditor], skills: [], guards: [pre-guard, quality-gate] }
  - id: engine
    scope_id: engine
    project: .
    depends_on: [workflow-spike, engine-guards]
    module: workflows/run.js, unit-runner, engine config
    language: JavaScript (workflow script) + Markdown + JSON
    security: normal
    scope:
      read: [workflows/spike.js, agents/unit-runner.md, commands/_shared-execution.md, commands/auto.md, craftsman.config.json, scripts/wiring.test.mjs, scripts/workflow.test.mjs, scripts/plan-graph.mjs]
      docs: [docs/architecture/engine.rules.md, docs/architecture/auto.rules.md, docs/architecture/tracker.rules.md]
      write: [workflows/run.js, workflows/spike.js, agents/unit-runner.md, craftsman.config.json, commands/_shared-execution.md, commands/auto.md, scripts/wiring.test.mjs, scripts/workflow.test.mjs, scripts/loop-smoke.test.mjs, scripts/engine.test.mjs, scripts/agent-mode-guard.test.mjs]
    arch: [ARCH-ENGINE-01, ARCH-ENGINE-03, ARCH-ENGINE-04, ARCH-ENGINE-05, ARCH-ENGINE-06, ARCH-ENGINE-07, ARCH-ENGINE-09, ARCH-ENGINE-11, ARCH-AUTO-05, ARCH-TRACKER-05]
    tooling: { implementer: implementer, gates: [idiom-reviewer], skills: [workflow-authoring], guards: [pre-guard, quality-gate] }
  - id: plan-fit-and-measure
    scope_id: plan-fit-and-measure
    project: .
    depends_on: [engine, baseline-run]
    module: unit context-size check + workflow root measurement
    language: JavaScript + Markdown
    security: normal
    scope:
      read: [scripts/arch-check.mjs, scripts/arch-check.test.mjs, scripts/scope.mjs, commands/plan.md, skills/language-aware-planning/references/plan-template.md, craftsman.config.json, scripts/stats.mjs]
      docs: [docs/architecture/engine.rules.md]
      write: [scripts/arch-check.mjs, scripts/arch-check.test.mjs, commands/plan.md, skills/language-aware-planning/references/plan-template.md, docs/plans/autonomous-e2e-loop-evidence.md, docs/plans/autonomous-e2e-loop.md]  # re-scoped: 9.1 split step 1 to fit ARCH-ENGINE-08
    arch: [ARCH-ENGINE-08, ARCH-ENGINE-06]
    tooling: { implementer: implementer, gates: [], skills: [], guards: [pre-guard, quality-gate] }
  - id: run-manifest-parked
    scope_id: run-manifest-parked
    project: .
    depends_on: [engine]
    module: tracker decision field, run manifest, landing parks
    language: JavaScript + Markdown
    security: normal
    scope:
      read: [scripts/tracker.mjs, scripts/tracker.test.mjs, scripts/repo-exec.mjs, scripts/repo-exec.test.mjs, scripts/lib/land.mjs, commands/auto.md, agents/unit-runner.md, scripts/auto-command.test.mjs]
      docs: [docs/architecture/tracker.rules.md, docs/architecture/landing.rules.md, docs/architecture/auto.rules.md, docs/architecture/engine.rules.md]
      write: [scripts/tracker.mjs, scripts/run-manifest.mjs, scripts/tracker.test.mjs, scripts/run-manifest.test.mjs, scripts/repo-exec.mjs, scripts/repo-exec.test.mjs, commands/auto.md, agents/unit-runner.md, scripts/auto-command.test.mjs]  # re-scoped before execution: 10.4 asserts auto.md in auto-command.test.mjs
    arch: [ARCH-TRACKER-01, ARCH-TRACKER-02, ARCH-TRACKER-03, ARCH-TRACKER-04, ARCH-LAND-06, ARCH-AUTO-01, ARCH-ENGINE-07]
    tooling: { implementer: implementer, gates: [], skills: [], guards: [pre-guard, quality-gate] }
  - id: description-diet
    scope_id: description-diet
    project: .
    depends_on: [run-manifest-parked, mod-launcher, plan-fit-and-measure]
    module: command/agent/skill descriptions
    language: Markdown frontmatter + JavaScript test
    security: normal
    # Edits frontmatter `description:` lines only; bodies are never loaded, so the
    # globs stay in `write` and `read` holds only what the unit loads (ARCH-ENGINE-08).
    scope:
      read: [scripts/model-policy.mjs]
      docs: [docs/architecture/auto.rules.md, docs/architecture/engine.rules.md, docs/architecture/landing.rules.md]
      write: [commands/*.md, agents/*.md, skills/*/SKILL.md, scripts/descriptions.test.mjs, docs/plans/autonomous-e2e-loop-evidence.md]
    arch: [ARCH-AUTO-01, ARCH-ENGINE-04, ARCH-LAND-01]
    tooling: { implementer: implementer, gates: [], skills: [], guards: [pre-guard, quality-gate] }
  - id: release-notes
    scope_id: release-notes
    project: .
    depends_on: [description-diet]
    module: README, EXTENDING, CHANGELOG
    language: Markdown
    security: normal
    scope:
      read: [README.md, EXTENDING.md, CHANGELOG.md, docs/plans/autonomous-e2e-loop-evidence.md]
      docs: [docs/architecture/engine.rules.md]
      write: [README.md, EXTENDING.md, CHANGELOG.md]
    arch: [ARCH-ENGINE-10]
    tooling: { implementer: implementer, gates: [], skills: [], guards: [] }
---

# Plan: One-entry autonomous loop with a light root context

## Outcome
One `/craftsman:auto <request>` asks every open decision before implementation,
runs each unit unattended in a fresh-context workflow agent (falling back to
one sub-agent per unit), asks one consolidated round afterwards, and lands
every repo in plan order. Its root-context tokens are measured against a
root-only baseline.

**Proof boundary.** Units are either closed by `node --test` or by recorded
live evidence (`baseline-run`, `workflow-spike`, part of
`plan-fit-and-measure`). Live runs exercise the **installed** plugin, so before
each live unit the units it depends on must be merged to main and installed
with `/craftsman:upgrade` (`self-update.mjs`). Never hand-copy into the cache.
A live check that can't run in-session is a `BLOCKED ON USER` stop, not a
default.

## Scope Steps (executable core)

### Step 1 — state-root-pin (., JavaScript, high)
Tooling: implementer · gates security-auditor · guards pre-guard, quality-gate
Depends on: none
- [x] 1.1 `core.mjs` `resolveProjectRoot`: derive the root without `process.cwd()`. Order: `CLAUDE_PROJECT_DIR` → its git toplevel (a non-git dir holding `craftsman.workspace.json` stays itself as a workspace root); else a session pin written at SessionStart, keyed by `CLAUDE_CODE_SESSION_ID`, under `os.tmpdir()`. A bare CLI with neither keeps today's cwd toplevel as an explicit last resort, never reached by a hook. → accept: `core.test.mjs` spawns `core.mjs` from 4 cwds (repo, subdir, unrelated git repo, non-git parent) with one `CLAUDE_PROJECT_DIR` and gets one identical `PROJECT_ROOT`.
- [x] 1.2 Above-repo session: `CLAUDE_PROJECT_DIR` non-git with no workspace manifest → `enabled()` is false and session-context prints one notice; with a manifest → the workspace root resolves. → accept: two fixture tests.
- [x] 1.4 `scope.mjs` `scopeFile`/`requiredFile`: key by the unit's worktree (from `tool_input` path, worktree binding or `input.cwd` resolved to its git worktree), falling back to the session scope. → accept: `scope.test.mjs` shows two worktrees holding two independent active scopes, and no-worktree falling back to the session scope.
- [x] 1.5 Sub-project grants and scopes live under the ROOT project's `sessions/<sid>/` keyed by project id; no hook resolves a project by cwd. → accept: test asserts the sub-project grant path sits under the root state dir; grep test: no hook script outside `core.mjs` calls `process.cwd()` to resolve a project.
- [x] 1.7 Full suite. → accept: `node --test scripts/*.test.mjs scripts/lib/*.test.mjs` exit 0.

### Step 1b — state-root-pin-grants (., JavaScript, high)
Split from Step 1 by the ARCH-ENGINE-08 size check (9.1); shipped with it in 1e4601b.
Tooling: implementer · gates security-auditor · guards pre-guard, quality-gate
Depends on: none
- [x] 1.3 Grants (`agentGrantFile`, `grantAgent`, `spendAgentGrant`) compute the path from (sid, project id) on the pinned root only. → accept: orchestrate-scope-guard writes the `/idea` grant from cwd A; agent-mode-guard spends it from cwd B; a second spend is blocked.
- [x] 1.6 Test that `hooks/hooks.json` has no `SubagentStop` key (STATE-07). → accept: test passes.

### Step 2 — telemetry (., JavaScript, normal)
Tooling: implementer · gates observability-reviewer
Depends on: state-root-pin
- [x] 2.1 New `scripts/telemetry.mjs`: a hook (Stop) and CLI that reads only a bounded tail (≤256 KB) of the hook input's `transcript_path`, takes the last assistant `usage` (input + cache_read + cache_creation) as root-context tokens, computes percent of the context window, and appends `{ev:"context", sid, phase, unit, tokens, percent, cost}` through `logEvent`. `phase`/`unit` come from the active scope or CLI args. Feature detection only, no version strings. → accept: `telemetry.test.mjs` feeds a fixture transcript and asserts the exact event.
- [x] 2.2 `stats.mjs`: add a "root context per run" section (per sid: samples, peak tokens, final tokens, peak percent). → accept: `stats.test.mjs` with fixture events asserts the section.
- [x] 2.3 `hooks/hooks.json`: register `telemetry.mjs` on Stop (timeout ≤10). → accept: wiring sees the entry; full suite exit 0.

### Step 3 — baseline-run (live evidence)
Depends on: telemetry (merged and installed)
- [x] 3.1 After `telemetry` lands and `/craftsman:upgrade` installs it, record the root-only run that executes later units in this session (`agentMode: root-only`). Capture `node scripts/stats.mjs` root-context rows: sid, peak and final tokens, percent, units covered. → accept: `docs/plans/autonomous-e2e-loop-evidence.md` has a "Baseline (root-only)" table with real numbers from `events.jsonl`.

### Step 4 — auto-command (., Markdown + JavaScript, high)
Tooling: implementer · gates security-auditor
Depends on: state-root-pin, telemetry
- [x] 4.1 New `commands/auto.md`: `## Phase A — Ask` (idea → architect → plan question rounds; every open decision asked, defaults only for conventional choices, AUTO-02); `## Phase B — Run` (compose the goal per instruction.md's template, write `.craftsman/instructions/<slug>.goal.txt`, launch it; turn cap from the remaining rows using instruction.md's bands, AUTO-05; fallback: print the paste-ready goal, AUTO-07); `## Phase C — Ask again` (one consolidated round: parked decisions, scrutinise findings needing judgement, remaining rows); `## Finish` (list the remaining rows for the slug and prompt to continue, AUTO-03; repeat B–C until all rows are COMPLETE). State the git authority (LAND-01) and its limits (LAND-05). → accept: `auto-command.test.mjs` asserts the four headings, the no-default rule text, the final list-and-prompt step and the fallback text.
- [x] 4.2 `orchestrate-scope-guard.mjs`: extend the invocation regex to `auto` (bare and `craftsman:`), treated like `/orchestrate`: arm scope-required and adopt acceptance ownership; also write an `auto-active` session marker. A mention is not an invocation. → accept: tests for typed, Skill and SlashCommand payloads, plus a non-invocation mention.
- [x] 4.3 `pre-guard.mjs`: while `auto-active` exists for the session, block Bash `git push --force|-f|--force-with-lease` and `+refspec` force pushes (`git push origin +main`), `git reset --hard` and `git worktree remove --force|-f`; unchanged otherwise; `git push origin HEAD:main` stays allowed. → accept: `pre-guard.test.mjs` cases for each form, both with and without the marker.
- [x] 4.4 `commands/instruction.md`: the goal template's "Done when" gains "parked rows whose decisions Phase C asked = met stop"; composition still enforces ≤4000 by `wc -c` (AUTO-04). → accept: test extracts the template and asserts the clause plus `BLOCKED ON USER`; a sample composed goal measures ≤4000.
- [x] 4.5 `commands/merge.md`: an `/auto` section: standing approval across registered projects (LAND-01); each repo lands via its own `repo-exec` merge in plan-graph order (LAND-02); a submodule pointer bump is a dependent parent unit (LAND-03); only registered projects plus `git submodule status`, never scanning (LAND-04). → accept: test asserts these clauses.
- [x] 4.6 `plan-graph.test.mjs`: a fixture where sub-repo unit B precedes parent bump unit P, which precedes consumer C; `plan-graph` order lands B, P, C. → accept: test passes.
- [x] 4.7 Full suite exit 0.

### Step 5 — mod-launcher (., mod JS/TS, high)
Tooling: implementer · gates security-auditor · skills plugin-authoring
Depends on: auto-command, telemetry
- [x] 5.1 `hooks/register.js` mod: launch only, observe, draw (MOD-01). On turn end, a new `.craftsman/instructions/<slug>.goal.txt` → `command.run("goal", …)`, else `prompt.submit`, else register `/auto-go` (MOD-02). A band shows plan, unit, tracker % and context %; context samples go to `scripts/telemetry.mjs` (MOD-03). Mod and workflow support are feature-detected (MOD-04). Register no `tool.call`, `tool.check` or `agent.spawn`. → accept: `hooks/register.test.ts` covers each launch path under `claude plugin test`.
- [x] 5.2 `.claude-plugin/plugin.json`: declare the mod entry; commit `docs/mod-manifest.txt` from `claude plugin validate .`. → accept: `scripts/mod-manifest.test.mjs` asserts the manifest lists no `tool.call`/`tool.check`/`agent.spawn`, and that `plugin.json` parses.
- [x] 5.3 `.github/workflows/ci.yml`: a mod-test step running `claude plugin test`, skipped with a notice when `claude` < 2.1.287 (MOD-05). → accept: the step exists and is gated; the YAML is valid.
- [x] 5.4 `commands/auto.md` Phase B: when the mod is absent (`-p`, `disableAllHooks`, no mod support), print the paste-ready goal (AUTO-07). → accept: auto-command test still passes.

### Step 6 — workflow-spike (live evidence; ENGINE-02 gate)
Tooling: skills workflow-authoring
Depends on: state-root-pin, telemetry, auto-command (merged and installed)
- [x] 6.1 `agents/unit-runner.md`: one-unit protocol. Gate smoke run first (TRACKER-05) → implementer → separate fresh reviewer → at most 2 fix rounds → return `{unit,status,evidence,sha|pr,parked[]}`. → accept: file exists; ENGINE-04 single protocol.
- [x] 6.2 `workflows/spike.js`: orchestration only (ENGINE-03); one `agent()` with a schema running unit-runner on a throwaway 1-file unit in its own worktree; a second forced-park unit. → accept: script passes the ENGINE-03 lint (step 8.4).
- [x] 6.3 Run the spike live. Record in the evidence doc: hook events from agent sessions (pre-guard/quality-gate in `events.jsonl`); scope activation keyed by the agent's worktree; a quality-gate event; repo-exec prepare/merge sha; a tracker transition; the park path (decision in `parked[]`); root tokens. End with an explicit verdict: **GO** (workflow default) or **FAIL**. A FAIL is a `BLOCKED ON USER` stop, since ENGINE-01 fixes the default and only the user can amend it. → accept: the evidence doc's "Spike" section has every item and a verdict.

### Step 7 — engine-guards (., JavaScript, high)
Depends on: workflow-spike
- [x] 7.1 `hooks/hooks.json` matcher `Task|Agent|Workflow`; `agent-mode-guard.mjs` allows Workflow only for a script under `${CLAUDE_PLUGIN_ROOT}/workflows/` (or the plugin's named workflow) while `execution.engine` is `"workflow"`, and blocks ad-hoc scripts. → accept: test blocks an inline script and allows `workflows/run.js` only under engine=workflow.
- [x] 7.3 `/auto` grants its per-unit runner dispatches (`unit-runner`, `implementer`, reviewer) through the grant mechanism; spent on use (AUTO-06). → accept: guard test shows an `/auto` session allowed one runner dispatch per grant, and a non-`/auto` session blocked.
- [x] 7.4 STATE-07 test still green; full suite exit 0.

### Step 7b — engine-guards-stop (., JavaScript, high)
Split from Step 7 by the ARCH-ENGINE-08 size check (9.1); shipped with it in 21ca2d6.
Depends on: workflow-spike
- [x] 7.2 `stop-gate.mjs`: when Stop input `background_tasks` lists an in-flight workflow or subagent, skip only the acceptance block; the secrets and regression checks stay armed. → accept: `stop-gate.test.mjs` case with `background_tasks` shows the acceptance block skipped and the secrets block still firing.

### Step 8 — engine (., JS + Markdown + JSON, normal)
Depends on: workflow-spike, engine-guards
- [x] 8.1 `craftsman.config.json`: `execution.engine: "workflow"` (enum workflow|subagent|root) and `execution.unitContextBytes: 122880`. → accept: test asserts the default and the enum.
- [x] 8.2 `workflows/run.js`: `pipeline()` over plan-graph order (ENGINE-09); per unit, implementer `agent()` then reviewer `agent()`, at most 2 fix rounds, then PARK (ENGINE-05); every `agent()` has the result schema (ENGINE-06); an open decision → PARK with a decision and leave dependants PENDING (ENGINE-07); root keeps per-unit summaries ≤2k tokens. → accept: `engine.test.mjs` loads the script with a stub runtime and asserts the bounds and pipeline order.
- [x] 8.3 `commands/_shared-execution.md` + `commands/auto.md`: engine selection. `workflow` → launch `/craftsman:run`; workflow unavailable → `subagent` (unit-runner per unit via Agent), never silently `root`; `root` is explicit opt-in only (ENGINE-01). Both engines cite `agents/unit-runner.md` (ENGINE-04). → accept: `wiring.test.mjs` asserts both references and the fallback text.
- [x] 8.4 `wiring.test.mjs`: lint `workflows/*.js`: no `fs`, `child_process`, `import(`, `Date.now`, `Math.random` or `new Date`; every `agent(` call passes `schema`. → accept: the lint passes the real scripts and fails a fixture.
- [x] 8.5 `git mv scripts/workflow.test.mjs scripts/loop-smoke.test.mjs` (ENGINE-11). → accept: old file absent; renamed suite green.
- [x] 8.6 Full suite exit 0.

### Step 9 — plan-fit-and-measure (., JS + Markdown, normal)
Depends on: engine, baseline-run
- [x] 9.1 `arch-check.mjs scope`: refuse a step whose `scope.read` + `scope.docs` bytes + task text exceed `execution.unitContextBytes` (ENGINE-08). → accept: `arch-check.test.mjs` refuses an oversized fixture and passes this plan's steps.
- [x] 9.2 `commands/plan.md` + plan-template: name the size check in the dry-run duty. → accept: text present.
- [x] 9.3 Live: run one unit (or the remaining units) through `/craftsman:auto` on the workflow engine; record root-context tokens next to the baseline, and the Phase A round and the final prompt-to-continue observed. → accept: the evidence doc has a "Baseline vs workflow" table with both numbers and the observed `/auto` phases.

### Step 10 — run-manifest-parked (., JS, normal)
Depends on: engine
- [ ] 10.1 `tracker.mjs`: transitions accept an optional `decision {question, options[], recommended?}` (validated) and an `autonomous` flag; an autonomous PARKED without a valid decision is refused; an autonomous CANCELLED is refused; events gain fields and never lose them; `renderBlock` output is unchanged. → accept: `tracker.test.mjs` covers the decision, the refusals and a renderBlock snapshot.
- [ ] 10.2 New `scripts/run-manifest.mjs`: derive `.craftsman/runs/<slug>.json` (features: unit, status, criteria ticked/total, decision) from the ledger plus acceptance.md, regenerated on every transition. → accept: `run-manifest.test.mjs` shows it matches the ledger after transitions, and that a hand edit is overwritten.
- [ ] 10.3 `repo-exec.mjs`: merge conflict, ff-only failure, rejected push and pr auto-merge error each return `{parked:true, decision}` for Phase C (LAND-06). → accept: `repo-exec.test.mjs` fixture for conflict and rejected push.
- [ ] 10.4 `commands/auto.md` Phase C + `agents/unit-runner.md`: Phase C builds its round from ledger decisions; the runner parks through `tracker.mjs` with a decision. → accept: auto-command test asserts the Phase C source.
- [ ] 10.5 Full suite exit 0.

### Step 11 — description-diet (., Markdown, normal)
Depends on: run-manifest-parked, mod-launcher, plan-fit-and-measure
- [ ] 11.1 Measure `claude plugin details craftsman` always-on tokens before. Shorten every `description:` in `commands/*.md`, `agents/*.md` and `skills/*/SKILL.md` to ≤200 chars. Underscore-prefixed shared docs get `disable-model-invocation: true` and a ≤80-char description. Meaning is unchanged (auto.md and instruction.md keep AUTO-01's single-entry wording). → accept: new `descriptions.test.mjs` asserts ≤200 chars each and a combined cap below the measured "before" total.
- [ ] 11.2 Record before/after always-on tokens in the evidence doc. → accept: numbers present, with after < before.

### Step 12 — release-notes (., Markdown, normal)
Depends on: description-diet
- [ ] 12.1 README: `/craftsman:auto` row; `execution.engine` and `unitContextBytes` config; root-context-first for autonomous runs supersedes the total-token rationale (ENGINE-10). EXTENDING: the two config keys. → accept: text present.
- [ ] 12.2 CHANGELOG `## [Unreleased]`: one entry for the feature, including the ENGINE-10 supersession of `CHANGELOG.md:453-457`. → accept: one bullet group present.

## Sequencing
The user fixed this order: state → telemetry → baseline → /auto → mod → spike → engine (guards, then engine) → measure → manifest → diet → notes. Root pinning comes first because every unattended grant depends on it (idea R6). Telemetry must exist before any baseline. The spike gates the workflow default (ENGINE-02). Guards go in before the engine so no Workflow call is ever unguarded. PARKED decisions persist in step 10; until then they travel in the runner's `parked[]` JSON (ENGINE-06).

## Verification background
- Root resolution trusts cwd first — `scripts/lib/core.mjs:33-47`.
- Grant path from `sessionDir(sid, context)` — `scripts/lib/core.mjs:163-190`; spent by `scripts/agent-mode-guard.mjs:49-51`.
- Invocation regex — `scripts/orchestrate-scope-guard.mjs:42`.
- The Agent guard matches only `Task|Agent` — `hooks/hooks.json:10`.
- Stop acceptance block — `scripts/stop-gate.mjs:283-310`.
- Transition table, no decision field — `scripts/tracker.mjs:11-20`; renderBlock — `scripts/tracker.mjs:103-127`.
- Goal template + 4000 cap — `commands/instruction.md:40-58`; turn bands — `commands/instruction.md:36`.
- `CLAUDE_PROJECT_DIR` reaches hooks but not Bash-tool subprocesses (observed this session: unset in Bash, `CLAUDE_CODE_SESSION_ID` set), hence the session-keyed pin in 1.1.
- `claude plugin details craftsman` reports always-on ~3,535 tokens (observed 2026-10-09).

CONSUMERS:
- `PROJECT_ROOT` / `STATE_DIR` — scripts/quality-gate.mjs:10, scripts/scope.mjs:7, scripts/arch-check.mjs:25,221, scripts/stop-gate.mjs:10, scripts/session-context.mjs:10, scripts/baseline.mjs:17-19, scripts/pre-guard.mjs:12,74,106,155, scripts/lib/core.test.mjs:13, scripts/stop-gate.test.mjs:19, scripts/orchestrate-scope-guard.test.mjs:26.
- `agentGrantFile`/`grantAgent`/`spendAgentGrant` — scripts/orchestrate-scope-guard.mjs:23,66-70, scripts/agent-mode-guard.mjs:20,50.
- `requiredFile`/`scopeFile` — scripts/orchestrate-scope-guard.mjs:24,53, scripts/pre-guard.mjs (requiredFile(input)).
- tracker transition input — scripts/tracker.mjs (CLI stdin), commands/plan.md, commands/_shared-execution.md, scripts/stop-gate.mjs (ledgerPath), scripts/digest.mjs, scripts/tracker-sync.mjs.
- `process.cwd()` in hooks — scripts/scope.mjs:66, scripts/pre-guard.mjs:38,204 (path resolution, not project resolution; keep it but resolve the project from the pinned root).

## Risk & rollback
- Root pinning changes which `.craftsman/` a worktree session writes to. Mitigation: the worktree-binding fallback plus the 4-cwd tests; revert the `state-root-pin` merge commit.
- The workflow engine is a preview feature. `execution.engine: "subagent"` is the config-only rollback; `root` is the explicit opt-in.
- Mod: ships inert where unsupported (feature detection); remove the `plugin.json` entry to roll back.
- Every unit lands as its own merge commit; revert per unit.

## Out of scope
- Parallel unit execution (ENGINE-09 keeps a pipeline until STATE-03 isolation is proven in parallel).
- Idea Rec 7's cross-artifact `analyze` gate and the reviewer-scope wording change. They are not in the user's fixed order and no decided rule requires them.
- Changing `/orchestrate`'s root-only default for non-autonomous runs.
