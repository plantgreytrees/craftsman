---
slug: scrutinise-artist-ui-gate
goal: The ui gate really reaches Artist: _shared-execution.md calls ui-gate.mjs with its arguments in the right order, and ui-gate.mjs passes the critic exact screenshots, ignores stale reports and tests its timeout path
level: feature
priority: P1
classification: in-scope # round 1 of an isolated /scrutinise of artist-ui-gate (ranges c60bc4b^1..c60bc4b, 6fcf864^1..6fcf864)
tracker_rows: [TRACKER#fix-ui-gate-script, TRACKER#fix-ui-gate-wiring]
guards:
  blast_radius: done
  completeness_sweep: done
  blind_rederivation: skipped(config:never)
coverage:
  contract:      2.1, 2.2 (the ui-gate.mjs CLI argument order in its only consumer)
  data:          N/A(no persistence; run dirs are gitignored session state)
  config:        1.5 (test-only timeout override env var)
  security:      1.2 (report screenshot names resolved inside the run dir only)
  tests:         1.1-1.6, 2.2
  observability: 1.1 (reason "worktree not found: <path>")
  interface:     2.1 (CLI order), 2.3 (lens name in shared docs)
  docs:          2.3
  rollback:      every unit is one merge commit; revert it
units:
  - id: fix-ui-gate-script
    scope_id: fix-ui-gate-script
    project: .
    depends_on: []
    module: scripts/ui-gate.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/ui-gate.mjs, scripts/ui-gate.test.mjs, scripts/lib/core.mjs]
      docs: [docs/architecture/gates.rules.md, docs/plans/scrutinise-artist-ui-gate.md]
      write: [scripts/ui-gate.mjs, scripts/ui-gate.test.mjs]
    arch: [ARCH-GATES-02, ARCH-GATES-03, ARCH-GATES-04, ARCH-GATES-05]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [test-driven-development], guards: [arch-check], mcp: [] }
  - id: fix-ui-gate-wiring
    scope_id: fix-ui-gate-wiring
    project: .
    depends_on: [fix-ui-gate-script]
    module: commands/_shared-execution.md
    language: markdown + javascript
    security: normal
    scope:
      read: [commands/_shared-execution.md, commands/_shared-machinery.md, commands/_scrutinise-deep.md, scripts/doc-size-policy.mjs, scripts/ui-gate.mjs, scripts/entry-surface.test.mjs]
      docs: [docs/architecture/gates.rules.md, docs/architecture/slim.rules.md, docs/architecture/engine.rules.md, docs/architecture/docs.rules.md]
      write: [commands/_shared-execution.md, commands/_shared-machinery.md, commands/_scrutinise-deep.md, scripts/doc-size-policy.mjs, scripts/entry-surface.test.mjs]
    arch: [ARCH-GATES-01, ARCH-SLIM-01, ARCH-SLIM-02, ARCH-ENGINE-04, ARCH-DOCS-09]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [verification-before-completion], guards: [arch-check, doc-size-policy], mcp: [] }
---

# Plan: scrutinise-artist-ui-gate — round 1 fixes

## Outcome
The ui gate actually reaches Artist: _shared-execution.md calls ui-gate.mjs with its arguments in the right order, and ui-gate.mjs passes the critic exact screenshots, ignores stale reports and tests its timeout path.

## Scope Steps (executable core)

### Step 1 — fix-ui-gate-script (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor · skills test-driven-development · guards arch-check
Depends on: none
Every task writes its failing test in `scripts/ui-gate.test.mjs` first and records the red run.
- [ ] 1.1 Nonexistent worktree (finding 4, `scripts/ui-gate.mjs:109-116`): before `git rev-parse`, fall back with reason `worktree not found: <path>` when the path is not a directory → accept: a test passing a missing path gets that reason, not "spawn git ENOENT".
- [ ] 1.2 Exact screenshots (finding 5, `:21-23`, ARCH-GATES-04): parse the chosen `report.json`; take its `screenshots` values (file names relative to the report's directory, per Artist `scripts/verify.mjs`), resolve each with `path.resolve(dir, name)` and keep only paths inside that directory that exist; set `critic.screenshots` (absolute paths) and name them in the critic step instead of `<dir>/ screenshots`. Unparseable report, no `screenshots` key, or no surviving path → no critic, `a11y: true` → accept: tests for a valid report (absolute paths in field and step), a `../escape.png` entry dropped, and an unparseable report falling back to a11y.
- [ ] 1.3 Stale reports (finding 6, `:88-105,162-165`): ignore a report whose mtime is older than the worktree HEAD commit time (`git log -1 --format=%ct`) → accept: a test with a report touched before HEAD's commit yields no critic and `a11y: true`.
- [ ] 1.4 Prune run dirs (finding 7, `:135-137`): before `mkdtemp`, remove `<main>/.craftsman/ui-gate/run-*` directories older than 7 days; never follow symlinks, never touch other names → accept: a test with an old and a fresh `run-*` dir (mtime set via `fs.utimesSync`) keeps only the fresh one and a non-`run-` dir.
- [ ] 1.5 Timeout and odd exits (finding 8, `:17,146,151`): read the timeout from env `CRAFTSMAN_UI_GATE_TIMEOUT_MS` when it is a positive integer, else 60000 → accept: a sleeping stub with the env at 200 falls back with a timeout reason; a stub exiting 3 falls back; a stub killing itself with a signal falls back; all exit 0.
- [ ] 1.6 Project-tier precedence (finding 9, `ui-gate.test.mjs:111-121`) → accept: project `false` over user `true` falls back "not enabled"; local `true` over project `false` passes detection; `node --test scripts/ui-gate.test.mjs` green.

### Step 2 — fix-ui-gate-wiring (., markdown + javascript, normal)
Tooling: implementer implementer · gates code-reviewer · skills verification-before-completion · guards arch-check, doc-size-policy
Depends on: fix-ui-gate-script
- [ ] 2.2 FIRST, red: in `scripts/entry-surface.test.mjs` add a test that reads `commands/_shared-execution.md`, extracts the `ui-gate.mjs` invocation, and asserts its argument placeholders are `<worktree> <merge-base>`, matching the `usage:` line printed by `scripts/ui-gate.mjs` (run it with no args, read stderr) → accept: the test fails on the current doc.
- [ ] 2.1 Critical (finding 1/2, `commands/_shared-execution.md:33`, ARCH-GATES-01): swap to `ui-gate.mjs" <worktree> <merge-base>` (byte-neutral) → accept: 2.2 passes; `node scripts/ui-gate.mjs $PWD HEAD~1` reaches detection.
- [ ] 2.3 Lens name (finding 10): in `commands/_scrutinise-deep.md:20` and `commands/_shared-machinery.md:51` replace the `ui-gate` lens/gate name with `ui-ux-reviewer` (the a11y floor; Artist steps come from ui-gate.mjs); both files are at their caps, so trim at least the added bytes elsewhere in the same file without dropping a MUST sentence (ARCH-SLIM-06); lower each cap in `scripts/doc-size-policy.mjs` to the new size if it shrank → accept: `grep -n '\bui-gate\b' commands/_scrutinise-deep.md commands/_shared-machinery.md` finds only `ui-gate.mjs` mentions or nothing; `node scripts/doc-size-policy.mjs` PASS; `node --test scripts/*.test.mjs` green.

## Sequencing
Script fixes first (the critic step text changes shape), then the wiring line and its test, which reads the script's usage line.

## Verification background
- Usage `<worktree> <base-ref>` — `scripts/ui-gate.mjs:6,176`; consumer passes `<merge-base> <worktree>` — `commands/_shared-execution.md:33`; reproduced: documented order → `{"route":"fallback","reason":"not a git worktree: spawn git ENOENT"}`, correct order → detection reached.
- Caps at 0 headroom: `_shared-execution.md` 12766/12766, `_shared-machinery.md` 6897/6897, `_scrutinise-deep.md` 5459/5459 (`scripts/doc-size-policy.mjs`).
- Critic inputs are the report's screenshots — `docs/architecture/gates.rules.md:14` (ARCH-GATES-04).

CONSUMERS:
- `scripts/ui-gate.mjs` CLI → `commands/_shared-execution.md:33` (only consumer; `rg ui-gate.mjs commands agents workflows hooks`).
- `ui-gate` lens name → `commands/_scrutinise-deep.md:20`, `commands/_shared-machinery.md:51`.

## Findings (round 1, isolated scrutineer)
Critical 1 (Correctness: arg order) · Warning 2 (Architecture ARCH-GATES-01; Test-coverage: no wiring test) · Suggestion 7 (worktree check, exact screenshots, stale report, run-dir prune, timeout/odd-exit tests, project-tier tests, lens name). Disputed: none. Residual risk noted: managed/enterprise settings and `--plugin-dir` installs are not modelled; repo-controlled `.artist/runs/<name>` text reaches a model-facing step string.
Out of scope, reported to the user: `agents/unit-runner.md`'s `S` helper sets `CLAUDE_PROJECT_DIR` inline, which `scripts/pre-guard.mjs` blocks, so unit-runners cannot run their land steps.

## Risk & rollback
Behaviour change: the critic step names files instead of a directory; stale or malformed reports now keep the a11y floor on. Revert the merge commits.

## Out of scope
The unit-runner `S` helper vs pre-guard conflict; modelling managed settings; Artist repo changes.
