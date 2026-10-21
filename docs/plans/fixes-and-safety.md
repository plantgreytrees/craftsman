---
slug: fixes-and-safety
goal: Craftsman fails closed and loud, cannot be switched off by the model, reports unpushed work, and the review's quick fixes land, with outside-root protection left to the Claude Code sandbox.
level: feature
priority: P1
classification: in-scope # user request 2026-10-21 built from the 20 Oct review and the 18 Oct safety audit
tracker_rows: [] # not registered: the ledger renders into the main checkout TRACKER.md, which holds your uncommitted change; register at /orchestrate once resolved
guards:
  blast_radius: done
  completeness_sweep: done
  blind_rederivation: done(Explore read-only; added tool-names files, snapshot.mjs, routing files; repo-exec non-repo fallback judged out of scope)
coverage:
  contract:      4.1 | 5.1 | 9.1 | 14.1 # hook matcher names, hooks.json launcher form, SessionEnd event, pre-guard `if`; no exported API
  data:          N/A(no persistence; new files are .craftsman/sweep-log.jsonl and session state tokens, covered 10.2 and 12.1)
  config:        8.3 | 9.3 | 10.3 | 11.3 | 21.2 # every new key has a safe default in craftsman.config.json and a README Safety row
  security:      5.1 | 6.1 | 8.1 | 10.1 | 11.1 | 12.1 | 13.1 # fail-closed, no self-disable, safe sweep, goal provenance
  tests:         every step # each new case is run red on origin/main first (task N.0)
  observability: 7.1 | 9.2 | 13.2 # visible once-per-session notices and the SessionStart/Stop reports
  interface:     16.1 | 17.1 | 18.1 | 13.1 # / menu, descriptions, one instruction story, init settings merge
  docs:          20.1 | 21.1 | 21.3 # tick steps 24-26, README Safety, ARCH-SAFETY rules, CHANGELOG
  rollback:      every step is one commit; revert it. Config keys default to today's behaviour except where a step says otherwise
units:
  - id: eslint-json
    scope_id: eslint-json
    project: .
    depends_on: []
    module: craftsman.config.json
    language: javascript
    security: normal
    scope:
      read: [craftsman.config.json, scripts/lib/core.mjs, scripts/lib/core.test.mjs, scripts/quality-gate.mjs]
      docs: [docs/architecture/state.rules.md, docs/architecture/engine.rules.md]
      write: [craftsman.config.json, scripts/lib/core.mjs, scripts/lib/core.test.mjs, scripts/quality-gate.mjs]
    arch: [ARCH-STATE-01, ARCH-ENGINE-08]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [arch-check], mcp: [] }
  - id: ci-home-test
    scope_id: ci-home-test
    project: .
    depends_on: []
    module: scripts/pre-guard.test.mjs
    language: javascript
    security: normal
    scope: { read: [scripts/pre-guard.test.mjs], docs: [], write: [scripts/pre-guard.test.mjs] }
    arch: []
    tooling: { implementer: implementer, gates: [], skills: [], guards: [], mcp: [] }
  - id: stop-gate-gated
    scope_id: stop-gate-gated
    project: .
    depends_on: []
    module: scripts/quality-gate.mjs
    language: javascript
    security: normal
    scope:
      read: [scripts/quality-gate.mjs, scripts/stop-gate.mjs, scripts/stop-gate.test.mjs]
      docs: [docs/architecture/state.rules.md]
      write: [scripts/quality-gate.mjs, scripts/stop-gate.test.mjs]
    arch: [ARCH-STATE-04]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [arch-check], mcp: [] }
  - id: tool-names
    scope_id: tool-names
    project: .
    depends_on: [ci-home-test]
    module: hooks/hooks.json
    language: json
    security: normal
    scope:
      read: [hooks/hooks.json, scripts/wiring.test.mjs, scripts/orchestrate-scope-guard.mjs, scripts/orchestrate-scope-guard.test.mjs, scripts/pre-guard.mjs]
      docs: [docs/architecture/state.rules.md, docs/architecture/slim.rules.md, docs/architecture/auto.rules.md, docs/architecture/engine.rules.md, docs/architecture/plan.rules.md, docs/architecture/docs.rules.md, docs/architecture/tracker.rules.md]
      write: [hooks/hooks.json, scripts/wiring.test.mjs, scripts/orchestrate-scope-guard.mjs, scripts/orchestrate-scope-guard.test.mjs, scripts/pre-guard.mjs, commands/understand.md, commands/plan.md, commands/investigate.md, commands/architect.md, commands/fix-tests.md, commands/auto.md, commands/builtin-check.md, commands/orchestrate.md, commands/idea.md, commands/_scrutinise-deep.md, commands/sync-docs.md, commands/scrutinise.md, scripts/tracker-sync.mjs, docs/builtins.md, scripts/doc-size-policy.mjs]
    arch: [ARCH-STATE-05, ARCH-SLIM-02, ARCH-AUTO-06, ARCH-ENGINE-08, ARCH-PLAN-06, ARCH-DOCS-07, ARCH-TRACKER-01]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [arch-check, doc-size-policy], mcp: [] }
  - id: launcher
    scope_id: launcher
    project: .
    depends_on: [tool-names]
    module: hooks/run.sh
    language: shell
    security: high
    scope:
      read: [hooks/hooks.json, scripts/wiring.test.mjs, scripts/lib/core.mjs]
      docs: [docs/architecture/state.rules.md, docs/architecture/engine.rules.md]
      write: [hooks/run.sh, hooks/hooks.json, scripts/wiring.test.mjs, scripts/launcher.test.mjs, docs/architecture/safety.rules.md, docs/architecture/safety.md]
    arch: [ARCH-STATE-05, ARCH-STATE-07, ARCH-ENGINE-08]
    tooling: { implementer: implementer, gates: [security-auditor], skills: [], guards: [arch-check], mcp: [] }
  - id: failclosed-guards
    scope_id: failclosed-guards
    project: .
    depends_on: [launcher]
    module: scripts/pre-guard.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/pre-guard.mjs, scripts/agent-mode-guard.mjs, scripts/orchestrate-scope-guard.mjs, hooks/hooks.json]
      docs: [docs/architecture/state.rules.md, docs/architecture/safety.rules.md, docs/architecture/auto.rules.md]
      write: [scripts/pre-guard.mjs, scripts/agent-mode-guard.mjs, scripts/orchestrate-scope-guard.mjs, scripts/pre-guard.test.mjs, scripts/agent-mode-guard.test.mjs, scripts/orchestrate-scope-guard.test.mjs, hooks/hooks.json, docs/architecture/safety.rules.md]
    arch: [ARCH-STATE-06, ARCH-AUTO-06]
    tooling: { implementer: implementer, gates: [security-auditor, code-reviewer], skills: [], guards: [arch-check], mcp: [] }
  - id: loud-advisory
    scope_id: loud-advisory
    project: .
    depends_on: [launcher]
    module: scripts/session-context.mjs
    language: javascript
    security: normal
    scope:
      read: [scripts/session-context.mjs, scripts/quality-gate.mjs, scripts/stop-gate.mjs, scripts/builtin-skill-context.mjs, scripts/lib/core.mjs]
      docs: [docs/architecture/state.rules.md, docs/architecture/safety.rules.md]
      write: [scripts/session-context.mjs, scripts/session-context.test.mjs, scripts/quality-gate.mjs, scripts/stop-gate.mjs, scripts/builtin-skill-context.mjs, scripts/builtin-skill-context.test.mjs, scripts/lib/core.mjs, scripts/lib/core.test.mjs, docs/architecture/safety.rules.md]
    arch: [ARCH-STATE-01]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [arch-check], mcp: [] }
  - id: self-disable
    scope_id: self-disable
    project: .
    depends_on: [failclosed-guards, eslint-json, loud-advisory]
    module: scripts/pre-guard.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/pre-guard.mjs, scripts/lib/core.mjs]
      docs: [docs/architecture/state.rules.md, docs/architecture/safety.rules.md, docs/architecture/engine.rules.md]
      write: [scripts/pre-guard.mjs, scripts/pre-guard.test.mjs, scripts/lib/core.mjs, scripts/lib/core.test.mjs, craftsman.config.json, docs/architecture/safety.rules.md]
    arch: [ARCH-STATE-02, ARCH-ENGINE-08]
    tooling: { implementer: implementer, gates: [security-auditor, code-reviewer], skills: [], guards: [arch-check], mcp: [] }
  - id: unpushed-report
    scope_id: unpushed-report
    project: .
    depends_on: [stop-gate-gated, launcher]
    module: scripts/lib/unpushed.mjs
    language: javascript
    security: normal
    scope:
      read: [scripts/stop-gate.mjs, scripts/worktree-sweep.mjs, scripts/lib/core.mjs, hooks/hooks.json]
      docs: [docs/architecture/state.rules.md, docs/architecture/safety.rules.md, docs/architecture/engine.rules.md]
      write: [scripts/lib/unpushed.mjs, scripts/lib/unpushed.test.mjs, scripts/session-end.mjs, scripts/session-end.test.mjs, scripts/stop-gate.mjs, scripts/stop-gate.test.mjs, hooks/hooks.json, craftsman.config.json, docs/architecture/safety.rules.md]
    arch: [ARCH-STATE-04, ARCH-STATE-07, ARCH-ENGINE-08]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [arch-check], mcp: [] }
  - id: sweep-safety
    scope_id: sweep-safety
    project: .
    depends_on: [launcher]
    module: scripts/worktree-sweep.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/worktree-sweep.mjs, scripts/worktree-sweep.test.mjs, craftsman.config.json]
      docs: [docs/architecture/landing.rules.md, docs/architecture/safety.rules.md, docs/architecture/engine.rules.md]
      write: [scripts/worktree-sweep.mjs, scripts/worktree-sweep.test.mjs, craftsman.config.json, docs/architecture/safety.rules.md]
    arch: [ARCH-LAND-09, ARCH-LAND-05, ARCH-ENGINE-08]
    tooling: { implementer: implementer, gates: [security-auditor, code-reviewer], skills: [], guards: [arch-check], mcp: [] }
  - id: outside-git
    scope_id: outside-git
    project: .
    depends_on: [self-disable]
    module: scripts/lib/core.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/lib/core.mjs, scripts/pre-guard.mjs, scripts/session-context.mjs]
      docs: [docs/architecture/state.rules.md, docs/architecture/safety.rules.md]
      write: [scripts/lib/core.mjs, scripts/lib/core.test.mjs, scripts/pre-guard.mjs, scripts/pre-guard.test.mjs, scripts/session-context.mjs, scripts/workspace.test.mjs, docs/architecture/safety.rules.md]
    arch: [ARCH-STATE-01]
    tooling: { implementer: implementer, gates: [security-auditor, code-reviewer], skills: [], guards: [arch-check], mcp: [] }
  - id: goal-token
    scope_id: goal-token
    project: .
    depends_on: []
    module: hooks/register.js
    language: javascript
    security: high
    scope:
      read: [hooks/register.js, hooks/register.test.ts, commands/instruction.md, commands/auto.md, commands/auto-go.md]
      docs: [docs/architecture/mod.rules.md, docs/architecture/safety.rules.md, docs/architecture/auto.rules.md, docs/architecture/plan.rules.md, docs/architecture/slim.rules.md]
      write: [hooks/register.js, hooks/register.test.ts, scripts/goal-token.mjs, scripts/goal-token.test.mjs, commands/instruction.md, commands/auto.md, docs/architecture/safety.rules.md, scripts/doc-size-policy.mjs]
    arch: [ARCH-MOD-02, ARCH-SLIM-02, ARCH-AUTO-07, ARCH-PLAN-06]
    tooling: { implementer: implementer, gates: [security-auditor, code-reviewer], skills: [], guards: [arch-check, doc-size-policy], mcp: [] }
  - id: platform
    scope_id: platform
    project: .
    depends_on: [unpushed-report, loud-advisory]
    module: scripts/init.mjs
    language: javascript
    security: normal
    scope:
      read: [scripts/init.mjs, scripts/init.test.mjs, commands/init.md, scripts/session-context.mjs, scripts/stop-gate.mjs]
      docs: [docs/architecture/slim.rules.md, docs/architecture/safety.rules.md, docs/architecture/plan.rules.md, docs/architecture/state.rules.md]
      write: [scripts/init.mjs, scripts/snapshot.mjs, scripts/session-context.test.mjs, scripts/init.test.mjs, commands/init.md, scripts/lib/settings-merge.mjs, scripts/lib/settings-merge.test.mjs, scripts/session-context.mjs, scripts/stop-gate.mjs, scripts/stop-gate.test.mjs, scripts/doc-size-policy.mjs, docs/architecture/safety.rules.md]
    arch: [ARCH-SLIM-02, ARCH-STATE-04, ARCH-PLAN-04, ARCH-STATE-01]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [arch-check, doc-size-policy], mcp: [] }
  - id: guard-filter
    scope_id: guard-filter
    project: .
    depends_on: [launcher, self-disable]
    module: hooks/hooks.json
    language: json
    security: high
    scope:
      read: [hooks/hooks.json, hooks/run.sh, scripts/pre-guard.test.mjs]
      docs: [docs/architecture/state.rules.md, docs/architecture/safety.rules.md]
      write: [hooks/hooks.json, hooks/run.sh, scripts/launcher.test.mjs, scripts/pre-guard.test.mjs, docs/architecture/safety.rules.md]
    arch: [ARCH-STATE-05, ARCH-STATE-03]
    tooling: { implementer: implementer, gates: [security-auditor, code-reviewer], skills: [], guards: [arch-check], mcp: [] }
  - id: bypass-flags
    scope_id: bypass-flags
    project: .
    depends_on: [self-disable]
    module: scripts/pre-guard.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/pre-guard.mjs, scripts/lib/shell-words.mjs, scripts/pre-guard.test.mjs]
      docs: [docs/architecture/state.rules.md]
      write: [scripts/pre-guard.mjs, scripts/pre-guard.test.mjs]
    arch: [ARCH-STATE-06]
    tooling: { implementer: implementer, gates: [security-auditor], skills: [], guards: [arch-check], mcp: [] }
  - id: invocable-partials
    scope_id: invocable-partials
    project: .
    depends_on: [tool-names]
    module: commands/
    language: markdown
    security: normal
    scope:
      read: [scripts/descriptions.test.mjs, scripts/doc-size-policy.mjs]
      docs: [docs/architecture/slim.rules.md, docs/architecture/engine.rules.md]
      write: [commands/_architect-backfill.md, commands/_architect-maintain.md, commands/_architecture.md, commands/_features.md, commands/_scrutinise-deep.md, commands/_shared-analysis.md, commands/_shared-execution.md, commands/_shared-machinery.md, commands/_sync-docs-prune.md, scripts/wiring.test.mjs, scripts/doc-size-policy.mjs]
    arch: [ARCH-SLIM-01, ARCH-SLIM-02, ARCH-ENGINE-08]
    tooling: { implementer: implementer, gates: [], skills: [], guards: [doc-size-policy], mcp: [] }
  - id: descriptions
    scope_id: descriptions
    project: .
    depends_on: [invocable-partials]
    module: commands/ agents/
    language: markdown
    security: normal
    scope:
      read: [scripts/descriptions.test.mjs]
      docs: [docs/architecture/slim.rules.md]
      write: ["commands/*.md (frontmatter description only)", "agents/*.md (frontmatter description only)", scripts/descriptions.test.mjs, scripts/doc-size-policy.mjs]
    arch: [ARCH-SLIM-09, ARCH-SLIM-02]
    tooling: { implementer: implementer, gates: [], skills: [], guards: [doc-size-policy], mcp: [] }
  - id: instruction-consistency
    scope_id: instruction-consistency
    project: .
    depends_on: [descriptions, failclosed-guards]
    module: commands/ agents/
    language: markdown
    security: normal
    scope:
      read: [commands/plan.md, commands/_shared-machinery.md, commands/_shared-execution.md, agents/unit-runner.md, agents/implementer.md, scripts/agent-mode-guard.mjs]
      docs: [docs/architecture/slim.rules.md, docs/architecture/engine.rules.md, docs/architecture/plan.rules.md]
      write: [commands/plan.md, commands/orchestrate.md, agents/review-router.md, scripts/gate-select.test.mjs, commands/_shared-machinery.md, commands/_shared-execution.md, agents/unit-runner.md, agents/implementer.md, scripts/wiring.test.mjs, scripts/doc-size-policy.mjs]
    arch: [ARCH-SLIM-05, ARCH-SLIM-06, ARCH-ENGINE-04, ARCH-PLAN-06]
    tooling: { implementer: implementer, gates: [standards-keeper], skills: [], guards: [doc-size-policy], mcp: [] }
  - id: release-identity
    scope_id: release-identity
    project: .
    depends_on: [instruction-consistency]
    module: .claude-plugin/plugin.json
    language: json
    security: normal
    scope:
      read: [.claude-plugin/plugin.json, CHANGELOG.md, CONTRIBUTING.md, scripts/changelog.test.mjs]
      docs: [docs/architecture/mod.rules.md]
      write: [.claude-plugin/plugin.json, scripts/changelog.test.mjs, CONTRIBUTING.md]
    arch: [ARCH-MOD-04]
    tooling: { implementer: implementer, gates: [], skills: [], guards: [], mcp: [] }
  - id: reconcile-24-26
    scope_id: reconcile-24-26
    project: .
    depends_on: []
    module: docs/plans/scrutinise-feature-branch-plans.md
    language: markdown
    security: normal
    scope:
      read: [docs/plans/scrutinise-feature-branch-plans.md, scripts/pre-guard.test.mjs]
      docs: []
      write: [docs/plans/scrutinise-feature-branch-plans.md]
    arch: []
    tooling: { implementer: implementer, gates: [], skills: [], guards: [], mcp: [] }
  - id: docs-final
    scope_id: docs-final
    project: .
    depends_on: [launcher, failclosed-guards, loud-advisory, self-disable, unpushed-report, sweep-safety, outside-git, goal-token, platform, guard-filter, bypass-flags, release-identity, reconcile-24-26]
    module: README.md
    language: markdown
    security: normal
    scope:
      read: [README.md, CHANGELOG.md, docs/architecture/safety.rules.md, craftsman.config.json]
      docs: [docs/architecture/slim.rules.md]
      write: [README.md, CHANGELOG.md, docs/architecture/safety.rules.md, docs/architecture/safety.md, docs/architecture/README.md]
    arch: [ARCH-SLIM-08]
    tooling: { implementer: implementer, gates: [docs-curator], skills: [], guards: [arch-check, doc-size-policy], mcp: [] }
  - id: pr
    scope_id: pr
    project: .
    depends_on: [docs-final]
    module: pull request
    language: markdown
    security: normal
    scope: { read: [docs/plans/fixes-and-safety.md], docs: [], write: [] }
    arch: []
    tooling: { implementer: implementer, gates: [], skills: [], guards: [], mcp: [] }
---

# Plan: fixes and safety

## Outcome
Craftsman keeps every guard on or says loudly that it is off, a model cannot switch the guards off, unpushed work is reported at Stop and SessionEnd, the review's quick fixes land, and outside-root protection stays with the Claude Code sandbox.

## Decisions for you before `/orchestrate` (details in Risk)
1. **Order change.** Step 4 (tool names) runs before the launcher (A). Wrapping hooks.json in run.sh first would force a second rewrite of every matcher. Everything else keeps your order.
2. **Read/Glob/Grep filter (step 14).** pre-guard also acts on Read, Glob and Grep when a unit scope is active (`pre-guard.mjs:793-876`), so a pure `if` or matcher change would lose that. Plan: the run.sh launcher skips node for those three tools when no scope file exists (a shell file test, ~2 ms). Behaviour stays identical, proved by the existing tables. Say if you would rather drop scope enforcement on reads.
3. **Splits.** A becomes three commits (5, 6, 7) because it cannot fit one 120 KB context. The ARCH-SAFETY rules are written inside the step that creates the behaviour, not in one late step, so arch-check keeps each cite live.
4. **Minimum versions** (recorded in README Safety, step 21): `onFailure` 2.1.295 (changelog, verified). SessionEnd stderr-only, no decision control, 1.5 s budget raisable to 60 s by `timeout` (hooks doc, verified); its systemMessage display is unconfirmed, so step 9 tests it empirically. Hook `if`: documented for tool events only, one permission rule, `Read(path)` rules cover Read/Grep/Glob, but no minimum version is documented. Exec-form `args` and `user-invocable` on plugin `commands/*.md`: also no documented minimum. Each is proved by `claude plugin test .` on 2.1.306 and gated behind a feature check, never a version string (ARCH-MOD-04 style).

## Scope Steps (executable core)

Every step: task N.0 first, red-before-green. Run the new tests against `origin/main` code in a throwaway worktree (`git worktree add "$TMPDIR/base" origin/main`, copy only the new test files in) and record which cases fail. Last task of each step: the full CI set (`node --check` every script; `node --test scripts/*.test.mjs scripts/lib/*.test.mjs`; `model-policy.mjs`; `doc-size-policy.mjs`; `arch-check.mjs lint`; `claude plugin validate .`; `claude plugin test .`; `git diff --check`), then one commit. Tests that run destructive commands set `HOME` and `USERPROFILE` to a temp dir and assert it.

### Step 1 — eslint-json (., javascript, normal)
Depends on: none
- [ ] 1.0 Write failing tests first and record the red run → accept: the cases in 1.1-1.3 fail on origin/main
- [ ] 1.1 `craftsman.config.json:163,168` use `eslint --no-color --format json {file}`; add `parseEslintJson` in `scripts/lib/core.mjs` beside `extractSig` that turns the JSON into the same `path:line:col: message [Error/rule]` lines the baseline already keys on → accept: core.test: a fixture JSON gives lines whose `extractSig` is the rule id; baseline new-issues-only result is identical to the old unix-format fixture
- [ ] 1.2 A tool crash, unparseable output, or exit code 2 is "tool unavailable": skipped, never findings; report once per session and cache the failure for the session (`quality-gate.mjs`) → accept: core.test and a quality-gate spawn test: crash twice, one notice, zero findings, no block
- [ ] 1.3 Update `core.test.mjs:132-137` to the JSON path → accept: the unix-format assertions are gone and the suite is green
- [ ] 1.4 Full CI set, commit `fix(quality): eslint 9 json format, tool crash is unavailable` → accept: all green

### Step 2 — ci-home-test (., javascript, normal)
Depends on: none
- [ ] 2.0 Reproduce the Linux failure: run `pre-guard.test.mjs` with the temp dir outside `$HOME` → accept: the `rm -rf ~` case fails on origin/main
- [ ] 2.1 The `rm -rf ~` and `$HOME` cases (`pre-guard.test.mjs:~605`) spawn with `HOME` and `USERPROFILE` set to a mkdtemp dir and assert the env they passed → accept: passes with TMPDIR inside and outside the real `$HOME`; asserts HOME !== real home
- [ ] 2.2 Full CI set, commit `test(pre-guard): pin HOME for rm ~ cases`

### Step 3 — stop-gate-gated (., javascript, normal)
Depends on: none
- [ ] 3.0 Failing tests first → accept: recorded red
- [ ] 3.1 `quality-gate.mjs:53` writes the `dirty` marker only when `detectLang(file)` is a language with a check or a test mapping and the file is not ignored; the acceptance-file short circuit stays → accept: stop-gate.test: a turn that edits only `docs/x.md` leaves no `dirty`, the stop gate runs no test command; a `.mjs` edit still sets it and runs tests
- [ ] 3.2 Full CI set, commit `fix(stop-gate): docs-only turns do not rerun the suite`

### Step 4 — tool-names (., json, normal)
Depends on: ci-home-test
- [ ] 4.0 Failing tests first: a wiring test that every `hooks.json` matcher token and every `allowed-tools` entry is in the verified current list → accept: red on origin/main for MultiEdit, SlashCommand, TodoWrite
- [ ] 4.1 `hooks/hooks.json`: drop `MultiEdit`; PostToolUse `SlashCommand|Skill` becomes `Skill`; update the `ARCH-STATE-05` cite → accept: wiring.test; `arch-check.mjs lint`
- [ ] 4.2 `pre-guard.mjs` and `orchestrate-scope-guard.mjs` drop MultiEdit/SlashCommand branches only where they are dead; keep reading a `tool_input.command` for the Skill shape → accept: orchestrate-scope-guard.test sends the `Skill` payload and still arms the guard
- [ ] 4.3 Every `allowed-tools` list: `SlashCommand` removed (a `/plan` delegation uses `Skill`); `TodoWrite` becomes `TaskCreate, TaskUpdate` (TodoWrite is off by default; `CLAUDE_CODE_ENABLE_TASKS=0` re-enables it) → accept: wiring.test lists none of the dead names; `claude plugin validate .`
- [ ] 4.3b The same swap in orchestrate.md, idea.md, _scrutinise-deep.md, sync-docs.md, scrutinise.md, tracker-sync.mjs (tool-name list) and docs/builtins.md → accept: grep for MultiEdit, SlashCommand and TodoWrite finds none outside docs/ideas, docs/plans and CHANGELOG
- [ ] 4.4 Prose that tells the model to use "SlashCommand tool" in `understand.md`, `investigate.md` is reworded to "Skill tool" without raising any doc cap → accept: `doc-size-policy.mjs`
- [ ] 4.5 Full CI set, commit `fix(hooks): use current tool names`

### Step 5 — launcher (., shell, high)
Depends on: tool-names
- [ ] 5.0 Failing tests first → accept: `scripts/launcher.test.mjs` red (no `run.sh`)
- [ ] 5.1 `hooks/run.sh <script>`: POSIX sh; if `node` is absent, a safety hook (a fixed list: pre-guard, agent-mode-guard, orchestrate-scope-guard) prints `craftsman: node not found, guards cannot run` to stderr and exits 2; every other hook prints one `craftsman disabled: node not found` warning (once per session via a marker file) and exits 0; otherwise `exec node "$CLAUDE_PLUGIN_ROOT/scripts/<script>"` with stdin forwarded → accept: launcher.test spawns it with a PATH lacking node: safety hooks exit 2 with the message, advisory hooks exit 0 with one warning on the first call and none on the second; with node present the stdin JSON reaches the script unchanged
- [ ] 5.2 Every `hooks.json` command goes through `run.sh` (exec form or `sh`-form, whichever 2.1.306 validates); add `onFailure: "block"` to the pre-guard and agent-mode-guard entries only (no effect on Stop, so not added there) → accept: wiring.test; `claude plugin validate .`; `claude plugin test .`
- [ ] 5.3 Create `docs/architecture/safety.rules.md` (`governs:` hooks/run.sh, scripts/pre-guard.mjs, scripts/agent-mode-guard.mjs, scripts/orchestrate-scope-guard.mjs, scripts/session-context.mjs, scripts/worktree-sweep.mjs, scripts/session-end.mjs) and its human `safety.md`, with ARCH-SAFETY-01 (outside-root writes, deletes and credential reads are delegated to the Claude Code sandbox; craftsman adds no guard for them) and ARCH-SAFETY-02 (safety hooks fail closed: node missing, bad JSON or an exception denies) → accept: `arch-check.mjs lint`; each rule has a check and a live file:line cite
- [ ] 5.4 Windows: launcher.test skips the PATH-less case with a notice on `win32`; CI still runs it on Linux and macOS → accept: test file shows the skip reason
- [ ] 5.5 Full CI set, commit `feat(hooks): run.sh launcher, node-missing is loud`

### Step 6 — failclosed-guards (., javascript, high)
Depends on: launcher
- [ ] 6.0 Failing tests first → accept: red
- [ ] 6.1 `pre-guard.mjs:21`, `agent-mode-guard.mjs:57`, `orchestrate-scope-guard.mjs:73`: bad JSON on stdin denies (exit 2 and a reason), as does any exception thrown inside the safety path (wrap the main body once) → accept: each guard spawned with `not json`, empty stdin and a forced throw (env hook used only by the test) exits 2 and names the guard; the existing DESTRUCTIVE/ALLOWED tables are unchanged and green
- [ ] 6.2 The projectContext() call is wrapped (plugin-overhaul Slice A): a throw there denies in a git project and is reported once, not silently off → accept: test with an unreadable `craftsman.config.json`
- [ ] 6.3 ARCH-SAFETY-03 (fail closed in process, onFailure block recorded as a defence in depth needing 2.1.295+) → accept: `arch-check.mjs lint`
- [ ] 6.4 Full CI set, commit `fix(guards): bad input or exception denies`

### Step 7 — loud-advisory (., javascript, normal)
Depends on: launcher
- [ ] 7.0 Failing tests first → accept: red
- [ ] 7.1 `quality-gate.mjs:18`, `stop-gate.mjs:19`, `builtin-skill-context.mjs:19` keep failing open but write one visible `craftsman: <hook> skipped (bad input), advisory only` per session (marker file in session state) → accept: tests: bad JSON twice gives exit 0 and exactly one notice
- [ ] 7.2 SessionStart reports the state once: guards on, or off and why (node missing seen by the launcher marker, `enabled:false`, `CRAFTSMAN_SAFETY=off`, not anchored) → accept: session-context.test covers each reason string
- [ ] 7.3 ARCH-SAFETY-04 (advisory hooks fail open but never silently) → accept: lint
- [ ] 7.4 Full CI set, commit `feat(hooks): advisory failures and guard state are visible`

### Step 8 — self-disable (., javascript, high)
Depends on: failclosed-guards, eslint-json, loud-advisory
- [ ] 8.0 Failing tests first, in the DESTRUCTIVE/ALLOWED style → accept: red
- [ ] 8.1 pre-guard denies Bash/Write/Edit that creates `.craftsman/off`, edits the safety keys in `craftsman.config.json` (the new `safety` block and `stopGate`), edits `hooks/hooks.json`, or runs `toggle.mjs off` or `doc-write.mjs on`, unless the command comes from a craftsman command that legitimately holds the grant. Find the existing grant path first (`hasDocWriteGrant`, the toggle command) and keep it working → accept: table: each form blocked; `/craftsman:toggle` and `/plan`'s grant call still pass; no new shell parsing, token match only
- [ ] 8.2 `enabled()` (`core.mjs:575`) is split: the quality/doc side keeps `CRAFTSMAN=off` and `.craftsman/off`; a new `safetyEnabled()` ignores both and is false only when `CRAFTSMAN_SAFETY=off` is in the environment; SessionStart reports that case → accept: core.test and pre-guard.test: `CRAFTSMAN=off` and a `.craftsman/off` file leave pre-guard blocking; `CRAFTSMAN_SAFETY=off` lets the call through (the SessionStart line for it is step 7.2, asserted here via its reason string)
- [ ] 8.3 ARCH-SAFETY-05 (only `CRAFTSMAN_SAFETY=off` from the user's environment disables safety) → accept: lint
- [ ] 8.4 Full CI set, commit `feat(guard): the model cannot disable safety`

### Step 9 — unpushed-report (., javascript, normal)
Depends on: stop-gate-gated, launcher
- [ ] 9.0 Failing tests first against mkdtemp repos with a bare remote → accept: red
- [ ] 9.1 `scripts/lib/unpushed.mjs`: for the main checkout and every worktree, report uncommitted changes, stashes, branches ahead of upstream, branches with no upstream, and detached commits → accept: unit tests build each situation in a temp repo and assert the report lines; no network access (local refs only)
- [ ] 9.2 `stop-gate.mjs` appends the report as a `systemMessage`; blocks only when `stopGate.blockOnUnpushed` is true (default false in `craftsman.config.json`) → accept: stop-gate.test both modes
- [ ] 9.3 New `scripts/session-end.mjs` and a SessionEnd entry (no matcher, `timeout` 20) print the report and the existing hand-off to stderr, which the docs say the user sees; test empirically whether `systemMessage` also shows with `claude plugin test .` and record the result in `safety.md`. No SubagentStop (ARCH-STATE-07) → accept: session-end.test; wiring.test asserts no SubagentStop
- [ ] 9.4 ARCH-SAFETY-06 (Stop and SessionEnd report unpushed work in every worktree) → accept: lint
- [ ] 9.5 Full CI set, commit `feat(stop): report unpushed work at Stop and SessionEnd`

### Step 10 — sweep-safety (., javascript, high)
Depends on: launcher
- [ ] 10.0 Failing tests first → accept: red
- [ ] 10.1 `baseRefs` (`worktree-sweep.mjs:43-48`) returns only remote-tracking refs (`origin/<head>`), never local `main`/`master`; a branch merged only into local main is kept; with no remote ref nothing is "merged" → accept: test: branch merged to local main but not origin/main is not swept
- [ ] 10.2 Skip any worktree with ignored files other than disposable ones; new key `worktrees.disposable` defaults to the build dirs already in `ignore` (node_modules, dist, build, target, coverage, caches) → accept: test: a worktree holding an ignored `.env` or `data/local.db` is skipped with a reason; a worktree with only `node_modules` is swept
- [ ] 10.3 Before every `branch -D` (`:144-146`) append `{branch, sha, reason, time}` to `.craftsman/sweep-log.jsonl`; if the append fails the branch is not deleted → accept: test: log line exists with the pre-delete sha, and `git branch <name> <sha>` restores it; unwritable log keeps the branch
- [ ] 10.4 `.claude/worktrees/*` is never swept unless `worktrees.sweepClaudeWorktrees` is true (default false) → accept: test both values
- [ ] 10.5 ARCH-SAFETY-07 (the sweep is evidence-based and reversible) → accept: lint
- [ ] 10.6 Full CI set, commit `fix(sweep): remote-merged only, keep local data, log deletions`

### Step 11 — outside-git (., javascript, high)
Depends on: self-disable
- [ ] 11.0 Failing tests first, including a precedence test (safety check runs before the unanchored return) → accept: red
- [ ] 11.1 When the session starts outside a git repo (`core.mjs:575-581`) the protected-path and fail-closed checks stay active; only quality, doc and tracker machinery returns off → accept: pre-guard.test from a non-git mkdtemp dir: a protected-path write and a bad-JSON call still deny; quality-gate and stop-gate stay quiet
- [ ] 11.2 `session-context` says so in one line → accept: session-context.test
- [ ] 11.3 ARCH-SAFETY-08 (safety does not depend on git anchoring) → accept: lint
- [ ] 11.4 Full CI set, commit `fix(guard): safety stays on outside a git repo`

### Step 12 — goal-token (., javascript, high)
Depends on: none
- [ ] 12.0 Failing tests first → accept: red
- [ ] 12.1 A craftsman command that writes `.craftsman/instructions/*.goal.txt` (`/instruction`, `/auto`) also records a token in session state through `scripts/goal-token.mjs`; `register.js:94-110` submits only a goal whose name and mtime match a token recorded in this session, otherwise it surfaces the file name and does not submit → accept: register.test.ts and goal-token.test: a goal file written by something else is not submitted and is shown; one written via the token path is submitted
- [ ] 12.2 ARCH-SAFETY-09 (the mod submits only craftsman-authored goals) and the ARCH-MOD-02 text updated to match → accept: lint
- [ ] 12.3 Full CI set, commit `fix(mod): submit a goal only if craftsman wrote it this session`

### Step 13 — platform (., javascript, normal)
Depends on: unpushed-report, loud-advisory
- [ ] 13.0 Failing tests first → accept: red
- [ ] 13.1 `/craftsman:init` offers to merge, never overwrite, a block into project `.claude/settings.json` (`sandbox.enabled: true`, ask rules for `rm -r(f)`, `sudo`, `git push --force`, `git reset --hard`, `git clean`), via `scripts/lib/settings-merge.mjs`; shows the diff before writing and writes nothing without a yes → accept: tests: existing keys and arrays are preserved, duplicate rules not added, invalid JSON aborts, a no leaves the file byte-identical
- [ ] 13.2 SessionStart adds one line when the sandbox is enabled in no settings scope (user, project, local, managed) → accept: session-context.test
- [ ] 13.3a session-context.mjs records the working-tree status and sha1 of every guarded doc path into session state at start (snapshot.mjs) → accept: session-context.test: snapshot file lists the guarded docs
- [ ] 13.3 At Stop, compare `git status` and hashes of guarded docs with the session-start snapshot and report changes the guard did not see (informational unless `stopGate.blockOnUnpushed`-style key is added; default report only) → accept: stop-gate.test: an out-of-band edit to a guarded doc is reported
- [ ] 13.4 ARCH-SAFETY-10 (post-hoc detection reports, it does not replace the guard) → accept: lint
- [ ] 13.5 Full CI set, commit `feat(init): sandbox settings merge, sandbox notice, post-hoc doc check`

### Step 14 — guard-filter (., json, high)
Depends on: launcher, self-disable
- [ ] 14.0 Failing tests first (timing and parity) → accept: red
- [ ] 14.1 For `Read|Glob|Grep` the launcher skips node when no unit scope file exists; Write, Edit, NotebookEdit and Bash always run pre-guard. Use hook `if` only if `claude plugin test .` proves it on 2.1.306 and it keeps parity; otherwise the launcher check is the mechanism → accept: parity test: every existing DESTRUCTIVE/ALLOWED case produces the same exit code with and without the filter; a Read with an active scope still hits the scope allow-list
- [ ] 14.2 Timing test through `run.sh` (not node alone): added work for the filtered path stays under ~20 ms p95 over 200 runs, measured as a delta against a no-op hook; the test prints the numbers and fails above the budget with a generous CI margin noted → accept: test passes locally, number recorded in the commit message
- [ ] 14.3 ARCH-SAFETY-11 (a filter may skip pre-guard only where it cannot act) → accept: lint
- [ ] 14.4 Full CI set, commit `perf(guard): skip pre-guard on reads when no scope is active`

### Step 15 — bypass-flags (., javascript, high)
Depends on: self-disable
- [ ] 15.0 Failing tests first → accept: red
- [ ] 15.1 The hook-bypass check (`pre-guard.mjs:842`) also blocks `git commit -n`, `git commit -an` and other clustered `-n`, `git -c core.hooksPath=… commit`, and `git -ccore.hooksPath=…`, by token matching on `shell-words.mjs` output, no new parser; existing allowed forms (`git commit -m "…-n…"`, `-F`) stay allowed → accept: table cases blocked/allowed; a command `shell-words` cannot tokenise falls through to the existing text check
- [ ] 15.2 Full CI set, commit `fix(guard): catch short hook-bypass flags`

### Step 16 — invocable-partials (., markdown, normal)
Depends on: tool-names
- [ ] 16.0 Failing test first: every `commands/_*.md` has `user-invocable: false` → accept: red
- [ ] 16.1 Add the key to the nine `_*.md` files, lowering no cap and raising none (each addition is offset by trimming the same file) → accept: `doc-size-policy.mjs`; `claude plugin validate .`; `claude plugin test .` shows the partials absent from the command list, and a command that reads a partial still loads it
- [ ] 16.2 Full CI set, commit `fix(commands): hide internal partials from the / menu`

### Step 17 — descriptions (., markdown, normal)
Depends on: invocable-partials
- [ ] 17.0 Failing test first: every command and agent `description` is ~80 characters (limit set in `descriptions.test.mjs`) → accept: red
- [ ] 17.1 Rewrite each description to routing-sentence length; lower the file caps that shrink → accept: `descriptions.test.mjs` and `doc-size-policy.mjs` green; no cap raised
- [ ] 17.2 Full CI set, commit `docs(commands): shorter descriptions`

### Step 18 — instruction-consistency (., markdown, normal)
Depends on: descriptions, failclosed-guards
- [ ] 18.0 Failing tests first: no command says "delegate" to an agent the default root-only mode blocks without naming the exception; unit-runner and implementer agree on who commits → accept: red
- [ ] 18.1 `commands/plan.md` and the shared machinery state one root-only default with the subagent path as the stated alternative; agent dispatch prose appears once → accept: wiring.test greps
- [ ] 18.2 `unit-runner.md` and `implementer.md`: one rule on committing (the unit-runner commits through repo-exec; the implementer never commits) → accept: test asserts both files
- [ ] 18.3 The routing criteria currently in three places live in one (`_shared-machinery.md`); the other two point to it → accept: grep finds one copy; no cap raised
- [ ] 18.4 Full CI set, commit `docs(loop): one root-only instruction story`

### Step 19 — release-identity (., json, normal)
Depends on: instruction-consistency
- [ ] 19.0 Failing test first: `metadata.release` must equal the newest `## [x.y.z]` heading in CHANGELOG.md → accept: red (2.1.0 vs 2.2.0)
- [ ] 19.1 CHANGELOG is the source of truth; `metadata.release` is set to match and `changelog.test.mjs` fails on drift; no `version` field added; CONTRIBUTING says the release is derived from the changelog → accept: test green; plugin.json has no `version`
- [ ] 19.2 Full CI set, commit `fix(release): one release identity`

### Step 20 — reconcile-24-26 (., markdown, normal)
Depends on: none
- [ ] 20.0 Confirm each criterion in `docs/plans/scrutinise-feature-branch-plans.md` Steps 24-26 against code and tests on main (commits 54eb11e, ffba86b, 3c9a10b) → accept: a table of criterion → test name or file:line in the commit message
- [ ] 20.1 Tick 24.x, 25.x, 26.x that have evidence; tick 24.2 citing the round-14 user acceptance of the six over-blocks; leave unticked, with a note, any criterion without evidence → accept: no tick without a cited test
- [ ] 20.2 Full CI set, commit `docs(plans): tick merged guard-failclosed steps`

### Step 21 — docs-final (., markdown, normal)
Depends on: everything above
- [ ] 21.0 Check that every new config key from steps 8-13 is in `craftsman.config.json` with a safe default → accept: a test lists the new keys and their defaults
- [ ] 21.1 README `Safety` section: what is enforced where (sandbox versus craftsman), every new key, `CRAFTSMAN_SAFETY`, the minimum Claude Code versions table from Decision 4, and how to recover a swept branch → accept: docs-curator verifies each cite resolves
- [ ] 21.2 Finish `safety.rules.md` and `safety.md`; list in `docs/architecture/README.md` → accept: `arch-check.mjs lint`; ARCH-SAFETY-01 through 11 present with check and cite
- [ ] 21.3 CHANGELOG `[Unreleased]`: one entry per feature area (fix and safety), including the steps 24-26 line; total under 8 KB (ARCH-SLIM-08) → accept: `changelog.test.mjs`
- [ ] 21.4 Full CI set, commit `docs: safety section, rules and changelog`

### Step 22 — pr (., markdown, normal)
Depends on: docs-final
- [ ] 22.1 Push `feat/fixes-and-safety` (never main) and open a PR with a table of item → commit → tests, the minimum-version table, and a list of what is deliberately left out → accept: PR URL recorded
- [ ] 22.2 PR "Not done" list: outside-root write and delete guard, credential read denial, destructive-git ask outside /auto, interpreter-deletion detection (the sandbox owns them, ARCH-SAFETY-01); the review's restructure (one dispatcher per event, orchestration over /batch, tracker/ARCH/doc guard as an optional add-on) named as the next step → accept: both lists in the PR body

## Sequencing
Your order, with one swap: 1, 2, 3, then 4 (tool names), then A as 5, 6, 7, then B 8, D 9, E 10, then C 11, F 12, G 13, then the rest of Part 1 as 14-19, reconcile 20, docs 21, PR 22. Steps 20 and 12 depend on nothing and can move earlier if you want them out of the way. Steps share hooks.json, pre-guard.mjs, core.mjs and stop-gate.mjs, so none run in parallel. Each step lowers or holds every cap.

## Verification background
- Steps 24-26 code merged, boxes unticked — `docs/plans/scrutinise-feature-branch-plans.md:484-503`, `git log` 54eb11e ffba86b 3c9a10b
- CHANGELOG has no failclosed line — `CHANGELOG.md` `[Unreleased]` is empty
- `enabled()` honours `CRAFTSMAN=off` and `.craftsman/off` and returns false outside a git root — `scripts/lib/core.mjs:570-581`
- pre-guard parses stdin and exits 0 on failure — `scripts/pre-guard.mjs:21`; the scope read-allow-list that Read/Glob/Grep still need — `scripts/pre-guard.mjs:793-876`
- Hook-bypass check — `scripts/pre-guard.mjs:842-851`
- Dirty marker written for every edit — `scripts/quality-gate.mjs:47-53`; read in `scripts/stop-gate.mjs:139-140,274`
- Sweep refs and branch delete — `scripts/worktree-sweep.mjs:43-48,144-146`
- Goal submit — `hooks/register.js:94-110`
- ESLint formatter — `craftsman.config.json:163,168`; `scripts/lib/core.test.mjs:132-137`
- Dead tool names in matchers — `hooks/hooks.json:9,17,19,21`; in allowed-tools — `commands/understand.md:4`, `plan.md:5`, `investigate.md:4`, `architect.md:5`, `fix-tests.md:4`, `auto.md:5`, `builtin-check.md:4`
- Claude Code facts used: tools reference (no MultiEdit or SlashCommand; Skill; TodoWrite off by default), hooks reference (`onFailure` values and non-effect on Stop, SessionEnd matchers and 1.5 s budget, `if` limited to tool events), changelog (`onFailure` 2.1.295, SessionEnd fix 2.1.300), skills reference (`user-invocable: false`)
- CONSUMERS: `hooks.json` matcher names are consumed by `scripts/wiring.test.mjs`, `orchestrate-scope-guard.test.mjs:38,50,85,156` (SlashCommand payloads); `enabled()` is consumed by every hook script (`pre-guard`, `quality-gate`, `stop-gate`, `session-context`, `tracker-sync`, `telemetry`); `baseRefs` by `worktree-sweep.mjs` and its test; `ARCH-STATE-05` cites `hooks/hooks.json:11-12`

## Risk & rollback
- run.sh adds a process in front of every hook. Step 14 measures through it and fails the build above budget.
- `enabled()` is edited by steps 7, 8 and 11. Step 11's precedence test pins that the safety check runs before the outside-git return.
- Wrapping every hook in the launcher means a broken launcher blocks every safety hook. Mitigation: launcher.test, plus Step 5 ships the minimal form and the CI `claude plugin test .` exercises it.
- Steps 8 and 15 touch security text matching. Both stay token-level and add no shell parsing; anything unparseable stays with the sandbox.
- Rollback: one commit per step, revert in reverse order.

## Out of scope
Outside-root write and delete guard, credential read denial, destructive-git ask outside /auto, interpreter-deletion detection (sandbox, ARCH-SAFETY-01). The review's restructure (one dispatcher per event, orchestration over /batch, tracker/ARCH/doc guard as an add-on) is the next step after this PR.
