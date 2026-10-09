---
slug: scrutinise-autonomous-e2e-loop
goal: An unattended /craftsman:auto run records every park and block in the ledger, lands from a linked worktree, and leaves no stale scope, marker or grant behind.
parent: docs/plans/autonomous-e2e-loop.md
classification: in-scope # /scrutinise findings on 9b34cc3..01e12a7; every fix stays inside a decided rule
tracker_rows: [engine-close, scope-release, auto-marker, mod-goal-since, land-linked-worktree, core-hardening, land-holder, force-block-live, runner-block-trigger, force-block-quoted, land-holder-untracked, force-block-substitution, land-locale, force-block-escape, force-block-shell-words, force-block-forms, force-block-closed, force-block-bounded, verify-bypass-bounded, land-submodule-bump]
guards:
  blast_radius: done # grep sweep below (CONSUMERS)
  completeness_sweep: done
  blind_rederivation: skipped(config:never) # craftsman.config.json planning.blindRederivation
  decomposition: fixed by the scrutineer's findings — one unit per file cluster, no alternatives to weigh
coverage:
  contract:      1.1 | 1.2 | 3.1   # run.js close() roles; new unit-runner `block` role; auto-active marker shape
  data:          N/A(no database; .craftsman/ state files only)
  config:        N/A(no new keys)
  security:      3.1 | 3.2 | 3.3 | 4.1 | 6.1   # marker expiry, runner-grant spend, force-block bypass, stale goal launch, root pin lstat
  tests:         every unit — each step ends in `node --test scripts/*.test.mjs scripts/lib/*.test.mjs` exit 0
  observability: N/A(no new events beyond the tracker transitions 1.1/1.2 now emit)
  interface:     N/A(no user-facing surface change)
  docs:          1.2   # agents/unit-runner.md block role
  rollback:      every unit is a revertable fast-forward commit on main
units:
  - id: engine-close
    scope_id: engine-close
    project: .
    depends_on: []
    module: workflow close(), unit-runner block role
    language: JavaScript (workflow script) + Markdown protocol
    security: normal
    scope:
      read: [workflows/run.js, scripts/engine.test.mjs, agents/unit-runner.md]
      docs: [docs/architecture/engine.rules.md, docs/architecture/tracker.rules.md, docs/architecture/landing.rules.md]
      write: [workflows/run.js, scripts/engine.test.mjs, agents/unit-runner.md, scripts/wiring.test.mjs]
    arch: [ARCH-ENGINE-05, ARCH-ENGINE-06, ARCH-ENGINE-07, ARCH-TRACKER-03, ARCH-LAND-06]
    tooling: { implementer: implementer, gates: [], skills: [], guards: [pre-guard, quality-gate] }
  - id: scope-release
    scope_id: scope-release
    project: .
    depends_on: []
    module: scope release lifecycle
    language: JavaScript (Node ESM, node:test)
    security: high
    scope:
      read: [scripts/scope.mjs, scripts/scope.test.mjs]
      docs: [docs/architecture/state.rules.md]
      write: [scripts/scope.mjs, scripts/scope.test.mjs]
    arch: [ARCH-STATE-03, ARCH-STATE-06]
    tooling: { implementer: implementer, gates: [security-auditor], skills: [], guards: [pre-guard, quality-gate] }
  - id: auto-marker
    scope_id: auto-marker
    project: .
    depends_on: []
    module: /auto marker liveness, grant spend, force block
    language: JavaScript (Node ESM, node:test)
    security: high
    scope:
      read: [scripts/orchestrate-scope-guard.mjs, scripts/pre-guard.mjs, scripts/agent-mode-guard.mjs, scripts/lib/core.mjs, scripts/orchestrate-scope-guard.test.mjs, scripts/pre-guard.test.mjs]
      docs: [docs/architecture/auto.rules.md, docs/architecture/landing.rules.md, docs/architecture/state.rules.md]
      write: [scripts/orchestrate-scope-guard.mjs, scripts/pre-guard.mjs, scripts/agent-mode-guard.mjs, scripts/lib/core.mjs, scripts/orchestrate-scope-guard.test.mjs, scripts/pre-guard.test.mjs, scripts/agent-mode-guard.test.mjs, scripts/lib/core.test.mjs]
    arch: [ARCH-AUTO-06, ARCH-LAND-05, ARCH-STATE-02]
    tooling: { implementer: implementer, gates: [security-auditor], skills: [], guards: [pre-guard, quality-gate] }
  - id: mod-goal-since
    scope_id: mod-goal-since
    project: .
    depends_on: []
    module: mod goal launch window, scope name pattern
    language: JavaScript (Claude Code mod) + TypeScript test
    security: high
    scope:
      read: [hooks/register.js, hooks/register.test.ts]
      docs: [docs/architecture/mod.rules.md]
      write: [hooks/register.js, hooks/register.test.ts]
    arch: [ARCH-MOD-02, ARCH-MOD-03]
    tooling: { implementer: implementer, gates: [], skills: [], guards: [pre-guard, quality-gate], checks: ["claude plugin test ."] }
  - id: land-linked-worktree
    scope_id: land-linked-worktree
    project: .
    depends_on: []
    module: repo-exec merge from a linked worktree
    language: JavaScript (Node ESM, node:test)
    security: high
    scope:
      read: [scripts/repo-exec.mjs, scripts/repo-exec.test.mjs]
      docs: [docs/architecture/landing.rules.md]
      write: [scripts/repo-exec.mjs, scripts/repo-exec.test.mjs]
    arch: [ARCH-LAND-01, ARCH-LAND-06]
    tooling: { implementer: implementer, gates: [security-auditor], skills: [], guards: [pre-guard, quality-gate] }
  - id: core-hardening
    scope_id: core-hardening
    project: .
    depends_on: [auto-marker]
    module: root pin lstat, runner spend retry
    language: JavaScript (Node ESM, node:test)
    security: high
    scope:
      read: [scripts/lib/core.mjs, scripts/lib/core.test.mjs]
      docs: [docs/architecture/state.rules.md]
      write: [scripts/lib/core.mjs, scripts/lib/core.test.mjs]
    arch: [ARCH-STATE-01, ARCH-STATE-02]
    tooling: { implementer: implementer, gates: [security-auditor], skills: [], guards: [pre-guard, quality-gate] }
  - id: land-holder
    scope_id: land-holder
    project: .
    depends_on: [land-linked-worktree]
    module: repo-exec lands in the base holder
    language: JavaScript (Node ESM, node:test)
    security: high
    scope:
      read: [scripts/repo-exec.mjs, scripts/repo-exec.test.mjs]
      docs: [docs/architecture/landing.rules.md]
      write: [scripts/repo-exec.mjs, scripts/repo-exec.test.mjs]
    arch: [ARCH-LAND-02, ARCH-LAND-06]
    tooling: { implementer: implementer, gates: [security-auditor], skills: [], guards: [pre-guard, quality-gate] }
  - id: force-block-live
    scope_id: force-block-live
    project: .
    depends_on: [core-hardening]
    module: force block alias + Phase C liveness
    language: JavaScript (Node ESM, node:test)
    security: high
    scope:
      read: [scripts/pre-guard.mjs, scripts/pre-guard.test.mjs, scripts/lib/core.mjs, scripts/lib/core.test.mjs, scripts/agent-mode-guard.test.mjs]
      docs: [docs/architecture/landing.rules.md, docs/architecture/auto.rules.md, docs/architecture/state.rules.md]
      write: [scripts/pre-guard.mjs, scripts/pre-guard.test.mjs, scripts/lib/core.mjs, scripts/lib/core.test.mjs, scripts/agent-mode-guard.test.mjs]
    arch: [ARCH-LAND-05, ARCH-AUTO-06, ARCH-STATE-02]
    tooling: { implementer: implementer, gates: [security-auditor], skills: [], guards: [pre-guard, quality-gate] }
  - id: runner-block-trigger
    scope_id: runner-block-trigger
    project: .
    depends_on: [engine-close]
    module: unit-runner block trigger
    language: Markdown (agent protocol)
    security: normal
    scope:
      read: [agents/unit-runner.md, scripts/auto-command.test.mjs]
      docs: [docs/architecture/engine.rules.md]
      write: [agents/unit-runner.md, scripts/auto-command.test.mjs]
    arch: [ARCH-ENGINE-04]
    tooling: { implementer: implementer, gates: [], skills: [], guards: [pre-guard, quality-gate] }
  - id: force-block-quoted
    scope_id: force-block-quoted
    project: .
    depends_on: [force-block-live]
    module: force block quoted strings, &, alias chains
    language: JavaScript (Node ESM, node:test)
    security: high
    scope:
      read: [scripts/pre-guard.mjs, scripts/pre-guard.test.mjs, scripts/orchestrate-scope-guard.mjs, scripts/lib/core.mjs, scripts/arch-check.test.mjs, docs/plans/autonomous-e2e-loop.md, docs/plans/scrutinise-autonomous-e2e-loop.md]
      docs: [docs/architecture/landing.rules.md, docs/architecture/auto.rules.md, docs/architecture/state.rules.md]
      write: [scripts/pre-guard.mjs, scripts/pre-guard.test.mjs, scripts/orchestrate-scope-guard.mjs, scripts/lib/core.mjs, docs/plans/scrutinise-autonomous-e2e-loop.md]
    arch: [ARCH-LAND-05, ARCH-AUTO-06, ARCH-STATE-02]
    tooling: { implementer: implementer, gates: [security-auditor], skills: [], guards: [pre-guard, quality-gate] }
  - id: land-holder-untracked
    scope_id: land-holder-untracked
    project: .
    depends_on: [land-holder]
    module: holder landing refusals + tests
    language: JavaScript (Node ESM, node:test)
    security: high
    scope:
      read: [scripts/repo-exec.mjs, scripts/repo-exec.test.mjs, scripts/arch-check.test.mjs, docs/plans/autonomous-e2e-loop.md, docs/plans/scrutinise-autonomous-e2e-loop.md]
      docs: [docs/architecture/landing.rules.md, docs/architecture/engine.rules.md]
      write: [scripts/repo-exec.mjs, scripts/repo-exec.test.mjs, docs/plans/autonomous-e2e-loop.md, docs/plans/scrutinise-autonomous-e2e-loop.md]  # re-scoped: 11.3 splits run-manifest-parked per ARCH-ENGINE-08
    arch: [ARCH-LAND-02, ARCH-LAND-06, ARCH-ENGINE-08]
    tooling: { implementer: implementer, gates: [security-auditor], skills: [], guards: [pre-guard, quality-gate] }
  - id: force-block-substitution
    scope_id: force-block-substitution
    project: .
    depends_on: [force-block-quoted]
    module: force block message substitutions, quoted separators
    language: JavaScript (Node ESM, node:test)
    security: high
    scope:
      read: [scripts/pre-guard.mjs, scripts/pre-guard.test.mjs, scripts/arch-check.test.mjs, docs/plans/autonomous-e2e-loop.md, docs/plans/scrutinise-autonomous-e2e-loop.md]
      docs: [docs/architecture/landing.rules.md, docs/architecture/auto.rules.md, docs/architecture/state.rules.md]
      write: [scripts/pre-guard.mjs, scripts/pre-guard.test.mjs, docs/plans/scrutinise-autonomous-e2e-loop.md]
    arch: [ARCH-LAND-05, ARCH-AUTO-06, ARCH-STATE-02]
    tooling: { implementer: implementer, gates: [security-auditor], skills: [], guards: [pre-guard, quality-gate] }
  - id: land-locale
    scope_id: land-locale
    project: .
    depends_on: [land-holder-untracked]
    module: repo-exec under LC_ALL=C
    language: JavaScript (Node ESM, node:test)
    security: normal
    scope:
      read: [scripts/repo-exec.mjs, scripts/repo-exec.test.mjs, scripts/arch-check.test.mjs, docs/plans/autonomous-e2e-loop.md, docs/plans/scrutinise-autonomous-e2e-loop.md]
      docs: [docs/architecture/landing.rules.md]
      write: [scripts/repo-exec.mjs, scripts/repo-exec.test.mjs, docs/plans/scrutinise-autonomous-e2e-loop.md]
    arch: [ARCH-LAND-02, ARCH-LAND-06]
    tooling: { implementer: implementer, gates: [], skills: [], guards: [pre-guard, quality-gate] }
  - id: force-block-escape
    scope_id: force-block-escape
    project: .
    depends_on: [force-block-substitution]
    module: force block escaped quotes and comments
    language: JavaScript (Node ESM, node:test)
    security: high
    scope:
      read: [scripts/pre-guard.mjs, scripts/pre-guard.test.mjs, scripts/arch-check.test.mjs, docs/plans/autonomous-e2e-loop.md, docs/plans/scrutinise-autonomous-e2e-loop.md]
      docs: [docs/architecture/landing.rules.md, docs/architecture/auto.rules.md, docs/architecture/state.rules.md]
      write: [scripts/pre-guard.mjs, scripts/pre-guard.test.mjs, docs/plans/scrutinise-autonomous-e2e-loop.md]
    arch: [ARCH-LAND-05, ARCH-AUTO-06, ARCH-STATE-02]
    tooling: { implementer: implementer, gates: [security-auditor], skills: [], guards: [pre-guard, quality-gate] }
  - id: force-block-shell-words
    scope_id: force-block-shell-words
    project: .
    depends_on: [force-block-escape]
    module: force block bash word splitting
    language: JavaScript (Node ESM, node:test)
    security: high
    scope:
      read: [scripts/pre-guard.mjs, scripts/pre-guard.test.mjs, scripts/lib/shell-words.mjs, scripts/lib/shell-words.test.mjs, scripts/arch-check.test.mjs, docs/plans/autonomous-e2e-loop.md, docs/plans/scrutinise-autonomous-e2e-loop.md]
      docs: [docs/architecture/landing.rules.md, docs/architecture/auto.rules.md, docs/architecture/state.rules.md]
      write: [scripts/pre-guard.mjs, scripts/pre-guard.test.mjs, scripts/lib/shell-words.mjs, scripts/lib/shell-words.test.mjs, docs/plans/scrutinise-autonomous-e2e-loop.md]
    arch: [ARCH-LAND-05, ARCH-AUTO-06, ARCH-STATE-02]
    tooling: { implementer: implementer, gates: [security-auditor], skills: [], guards: [pre-guard, quality-gate] }
  - id: force-block-forms
    scope_id: force-block-forms
    project: .
    depends_on: [force-block-shell-words]
    module: force block module, redirections, prefixes, git-<sub>
    language: JavaScript (Node ESM, node:test)
    security: high
    scope:
      read: [scripts/pre-guard.mjs, scripts/pre-guard.test.mjs, scripts/lib/force-block.mjs, scripts/lib/shell-words.mjs, scripts/lib/shell-words.test.mjs, scripts/arch-check.test.mjs, docs/plans/autonomous-e2e-loop.md, docs/plans/scrutinise-autonomous-e2e-loop.md]
      docs: [docs/architecture/landing.rules.md, docs/architecture/auto.rules.md, docs/architecture/state.rules.md]
      write: [scripts/pre-guard.mjs, scripts/pre-guard.test.mjs, scripts/lib/force-block.mjs, scripts/lib/shell-words.mjs, scripts/lib/shell-words.test.mjs, docs/plans/scrutinise-autonomous-e2e-loop.md]
    arch: [ARCH-LAND-05, ARCH-AUTO-06, ARCH-STATE-02]
    tooling: { implementer: implementer, gates: [security-auditor], skills: [], guards: [pre-guard, quality-gate] }
  - id: force-block-closed
    scope_id: force-block-closed
    project: .
    depends_on: [force-block-forms]
    module: force block fails closed, &> redirects, bounded braces
    language: JavaScript (Node ESM, node:test)
    security: high
    scope:
      read: [scripts/pre-guard.mjs, scripts/pre-guard.test.mjs, scripts/lib/force-block.mjs, scripts/lib/shell-words.mjs, scripts/lib/shell-words.test.mjs, scripts/arch-check.test.mjs, docs/plans/autonomous-e2e-loop.md, docs/plans/scrutinise-autonomous-e2e-loop.md]
      docs: [docs/architecture/landing.rules.md, docs/architecture/auto.rules.md, docs/architecture/state.rules.md]
      write: [scripts/pre-guard.mjs, scripts/pre-guard.test.mjs, scripts/lib/force-block.mjs, scripts/lib/shell-words.mjs, scripts/lib/shell-words.test.mjs, docs/plans/scrutinise-autonomous-e2e-loop.md]
    arch: [ARCH-LAND-05, ARCH-AUTO-06, ARCH-STATE-02]
    tooling: { implementer: implementer, gates: [security-auditor], skills: [], guards: [pre-guard, quality-gate] }
  - id: force-block-bounded
    scope_id: force-block-bounded
    project: .
    depends_on: [force-block-closed]
    module: force block bounded in time and memory
    language: JavaScript (Node ESM, node:test)
    security: high
    scope:
      read: [scripts/pre-guard.mjs, scripts/pre-guard.test.mjs, scripts/lib/force-block.mjs, scripts/lib/shell-words.mjs, scripts/lib/shell-words.test.mjs, scripts/arch-check.test.mjs, hooks/hooks.json, docs/plans/autonomous-e2e-loop.md, docs/plans/scrutinise-autonomous-e2e-loop.md]
      docs: [docs/architecture/landing.rules.md, docs/architecture/auto.rules.md, docs/architecture/state.rules.md]
      write: [scripts/pre-guard.mjs, scripts/pre-guard.test.mjs, scripts/lib/force-block.mjs, scripts/lib/shell-words.mjs, scripts/lib/shell-words.test.mjs, docs/plans/scrutinise-autonomous-e2e-loop.md]
    arch: [ARCH-LAND-05, ARCH-AUTO-06, ARCH-STATE-02]
    tooling: { implementer: implementer, gates: [security-auditor], skills: [], guards: [pre-guard, quality-gate] }
  - id: verify-bypass-bounded
    scope_id: verify-bypass-bounded
    project: .
    depends_on: [force-block-bounded]
    module: verify-bypass check bounded; force-block test seams
    language: JavaScript (Node ESM, node:test)
    security: high
    scope:
      read: [scripts/pre-guard.mjs, scripts/pre-guard.test.mjs, scripts/lib/force-block.mjs, scripts/arch-check.test.mjs, hooks/hooks.json, docs/plans/autonomous-e2e-loop.md, docs/plans/scrutinise-autonomous-e2e-loop.md]
      docs: [docs/architecture/landing.rules.md, docs/architecture/auto.rules.md, docs/architecture/state.rules.md]
      write: [scripts/pre-guard.mjs, scripts/pre-guard.test.mjs, scripts/lib/force-block.mjs, docs/plans/scrutinise-autonomous-e2e-loop.md]
    arch: [ARCH-LAND-05, ARCH-AUTO-06, ARCH-STATE-02]
    tooling: { implementer: implementer, gates: [security-auditor], skills: [], guards: [pre-guard, quality-gate] }
  - id: land-submodule-bump
    scope_id: land-submodule-bump
    project: .
    depends_on: [verify-bypass-bounded]
    module: plan-graph enforces the submodule bump unit
    language: JavaScript (Node ESM, node:test)
    security: normal
    scope:
      read: [scripts/plan-graph.mjs, scripts/plan-graph.test.mjs, scripts/lib/core.mjs, scripts/auto-command.test.mjs, commands/merge.md, skills/language-aware-planning/references/plan-template.md, CHANGELOG.md, docs/plans/autonomous-e2e-loop-evidence.md]
      docs: [docs/architecture/landing.rules.md, docs/architecture/engine.rules.md]
      write: [scripts/plan-graph.mjs, scripts/plan-graph.test.mjs, scripts/lib/plan-submodules.mjs, scripts/lib/plan-submodules.test.mjs, commands/orchestrate.md, commands/merge.md, skills/language-aware-planning/references/plan-template.md, CHANGELOG.md, docs/architecture/landing.rules.md, docs/architecture/engine.rules.md, docs/plans/scrutinise-autonomous-e2e-loop.md]
    arch: [ARCH-LAND-02, ARCH-LAND-03, ARCH-LAND-04, ARCH-ENGINE-02]
    tooling: { implementer: implementer, gates: [], skills: [], guards: [pre-guard, quality-gate] }
---

# Plan: scrutinise fixes for autonomous-e2e-loop

Fix round for `/scrutinise autonomous-e2e-loop` (range `9b34cc3..01e12a7`, one isolated scrutineer): 0 Critical, 6 Warning, 9 Suggestion. ARCH-TRACKER-03 and ARCH-LAND-06 were judged violated in practice (W1).

## Step 1 — engine-close (., JavaScript, normal)
- [x] 1.1 `workflows/run.js` `close()`: a land result of `PARKED` runs the `park` role with its `parked` decision, as an implement park does (W1). → accept: `engine.test.mjs` case where land returns PARKED shows a `park` call carrying the decision and a PARKED result.
- [x] 1.2 Every other non-MERGED, non-PENDING terminal result (`BLOCKED` from implement, review or land, and `dead()`) runs a new `block` role: `S tracker` → `BLOCKED` with the evidence, commit work as `wip:`, `S repo-exec` cleanup, `S claim` release (W2). Add `## block` to `agents/unit-runner.md` (≤3,800 chars). → accept: `engine.test.mjs` cases for an implement BLOCKED and a dead land agent each show one `block` call; doc-size policy passes.
- [x] 1.3 Full suite exit 0.

## Step 2 — scope-release (., JavaScript, high)
- [x] 2.1 `scope.mjs` `release` unlinks that worktree's `scopeFile` and `requiredFile` along with the binding (W3). → accept: scope.test — after release, neither file exists.
- [x] 2.2 `readScope` ignores a worktree scope whose `worktree_path` no longer exists, and `scopeRequired` ignores a marker naming a missing worktree. → accept: scope.test — two units activated, worktrees removed, a root-target read resolves to no unit scope (not `scope_ambiguous`).
- [x] 2.3 Full suite exit 0.

## Step 3 — auto-marker (., JavaScript, high)
- [x] 3.1 `/auto` writes `auto-active` as JSON `{plan, at}`. One `core.mjs` helper `autoActive(sid, context)` says it is live only when it is younger than 24 h and that plan's ledger has a PENDING or IN_PROGRESS row; a legacy timestamp-only marker is not live (W4). `orchestrate-scope-guard` and `pre-guard` read it only through the helper. → accept: core.test cases for live, aged-out, plan-finished and legacy markers.
- [x] 3.2 `orchestrate-scope-guard` re-grants runners on `/orchestrate` only while the marker is live; `agent-mode-guard` spends a runner grant only while it is live. `planUnitCount` counts `- id:` lines inside the front matter only (S5). → accept: guard tests — `/orchestrate` after the plan's rows are all MERGED grants nothing and a leftover grant is not spent.
- [x] 3.3 `pre-guard`'s force block applies while the marker is live, and also catches `git` inside `bash -c`/`sh -c` strings, after `(`/`$(`/backtick, and a `git -c alias.*=` whose value holds a blocked form (S1, LAND-05). → accept: pre-guard.test cases for each form blocked while live, and plain `git push` allowed once the marker is dead.
- [x] 3.4 Full suite exit 0.

## Step 4 — mod-goal-since (., JavaScript, high)
- [x] 4.1 `register.js`: with no `session.usage.startedAt`, launch nothing — a goal file counts as new only when written after the session started (W5; auto.md Phase B step 3 "written this session"). → accept: register.test.ts case — no startedAt, a goal file present, nothing launched.
- [x] 4.2 The band's scope-name pattern matches core's (`@[A-Za-z0-9_-]+`), so hyphenated project ids are found (S6). → accept: register.test.ts case with `scope@my-app-<hash>.json`; `claude plugin test .` passes.
- [x] 4.3 Full suite exit 0.

## Step 5 — land-linked-worktree (., JavaScript, high)
- [x] 5.1 `repo-exec` merge: when base cannot be checked out in `context.root` because another worktree holds it, merge in a temporary detached worktree at the base tip and push `HEAD:<base>`; never move a branch ref another worktree has checked out. With no remote, PARK with a decision instead (W6, LAND-06). The temporary worktree is removed on every path. → accept: repo-exec.test — a linked-worktree root whose base is checked out by the primary lands on the remote base; the no-remote case parks with a decision.
- [x] 5.2 A rejected `direct` push park reports `merged_locally:true`; delete the unreachable `auto_merge_error` spread in `landPullRequest` (S4). → accept: repo-exec.test rejected-push case asserts `merged_locally`.
- [x] 5.3 Full suite exit 0.

## Step 6 — core-hardening (., JavaScript, high)
- [x] 6.1 Root pin: `lstatSync` and reject anything but a regular file owned by the current uid; check the `craftsman-roots` directory's uid and that it is not group/world-writable before reading or writing (S2). → accept: core.test — a symlinked pin entry and a foreign-mode directory are both ignored.
- [x] 6.2 `spendRunnerDispatch` retries the rename claim a few times before denying (S3). → accept: core.test — two sequential spends of a 2-count grant both succeed, a third is denied.
- [x] 6.3 Full suite exit 0.

## Round 2 — `/scrutinise` of `01e12a7..1779c2f`
One isolated scrutineer: 0 Critical, 5 Warning (one Architecture), 6 Suggestion. Steps 7–9 fix every Warning and the folded Suggestions; ARCH-LAND-05 and ARCH-LAND-06 were judged VIOLATED, ARCH-ENGINE-04 violated in practice. The ARCH-LAND-06 finding is fixed in code, never by editing the rule.

## Step 7 — land-holder (., JavaScript, high)
- [x] 7.1 `repo-exec` merge with base held by another worktree: with a remote and pushing, keep the detached temp-worktree landing; with no remote, or `push:false`, land by merging inside the holder checkout itself (pull `--ff-only` first when there is a remote and `pull` isn't false), exactly as the primary-root path does in its own checkout. Conflict → `merge --abort` in the holder, PARK `conflict`; ff-only failure → PARK `ff-only`; an in-progress merge in the holder or a dirty holder whose merge git refuses → throw, as a dirty root does. Delete the `base-checked-out` park reason so ARCH-LAND-06's four reasons stand (R2-A1, R2-W1). → accept: repo-exec.test — no-remote linked root lands into the holder's base (merged:true, base advanced, holder still on base); `push:false` with a remote lands locally into the holder with origin untouched; a holder conflict parks `conflict` with the holder clean.
- [x] 7.2 `landDetached` is only ever reached with a remote and a push, so it never reports `merged:true` for a discarded merge (R2-W1). → accept: covered by 7.1's `push:false` case.
- [x] 7.3 Every step of `docs/plans/autonomous-e2e-loop.md` stays within `execution.unitContextBytes` (arch-check.test); full suite exit 0.

## Step 8 — force-block-live (., JavaScript, high)
- [x] 8.1 `pre-guard` maps each `git -c alias.<name>=<value>` name to its value, and a subcommand matching a recorded alias is replaced by the alias's words before the destructive check, so `git -c alias.p=push p --force`, `p -f`, `p +HEAD:main` and `alias.p=reset p --hard` are blocked (R2-W2). → accept: the four forms join `DESTRUCTIVE` in pre-guard.test.
- [x] 8.2 A quoted string is checked as its own command only as the argument of `sh|bash|zsh -c` or `eval`; `git commit -m "… git reset --hard …"` is allowed (suggestion). → accept: pre-guard.test allows two commit messages naming destructive forms; `bash -c '…'` forms stay blocked.
- [x] 8.3 `core.mjs` adds `autoForceBlock(sid, context, now)`: live while the marker is under 24 h and its plan has no ledger rows yet or any row not MERGED/COMPLETE (so PARKED/BLOCKED rows awaiting Phase C keep it on); `pre-guard` uses it, runner grants keep `autoActive` (R2-W3). → accept: core.test and pre-guard.test — an all-PARKED plan keeps the force block and denies runner grants; a no-rows plan keeps both live; an all-MERGED plan lapses both.
- [x] 8.4 `planStatuses` compares plan slugs through `planSlugOf`, so a bare-slug ledger row counts; `RUNNER_DISPATCHES_PER_UNIT` = 8 (implement + 3 reviews + 2 fix rounds + land + park/block) with its comment (suggestions). → accept: core.test bare-slug row case; agent-mode-guard.test still passes.
- [x] 8.5 Every step of `docs/plans/autonomous-e2e-loop.md` stays within `execution.unitContextBytes`; full suite exit 0.

## Step 9 — runner-block-trigger (., Markdown, normal)
- [x] 9.1 `agents/unit-runner.md` states that any `BLOCKED` return from implement, review or land → root runs `block`, so the subagent engine closes a blocked unit as the workflow engine does (R2-W4, ARCH-ENGINE-04); stays ≤3,800 chars. → accept: doc-size policy passes; a unit-runner.md test (or wiring test) asserts the trigger line.
- [x] 9.2 Full suite exit 0.

## Round 3 — `/scrutinise` of `38c7786..ad2ce10`
One isolated scrutineer: 0 Critical, 1 Warning (Security), 5 Suggestion; every rule HOLDS, ARCH-LAND-05 weaker than at 38c7786 against interpreter-wrapped forms. Steps 10–11 fix the Warning and fold the Suggestions.

## Step 10 — force-block-quoted (., JavaScript, high)
- [x] 10.1 `destructiveGit` recurses into every quoted string again (as 38c7786 did), skipping only a quoted operand that directly follows a message option (`-m`, `-<flags>m`, `--message[=]`, `-F`, `--file[=]`) of a `git commit` or `git tag` in the same segment (R3-W1). → accept: `python3 -c "import subprocess; subprocess.run('git push -f', shell=True)"` and `git log -1 & bash --norc -c 'git push -f origin main'` join `DESTRUCTIVE`, as does `git commit -m "$(git push -f origin main)"` (a substitution inside a message still runs); the two commit-message cases and `git tag -m "git push -f is banned" v1` stay in `ALLOWED`.
- [x] 10.2 `gitInvocations` splits on a lone `&` and keeps a quoted word whole, so `git status & git push --force origin main` and `git -C "/a b" push --force origin main` are blocked (R3-S1). → accept: both join `DESTRUCTIVE`.
- [x] 10.3 Aliases resolve to a fixed point (bounded by the alias count), and `git config alias.<n> "<value>"` is checked like `-c alias.<n>=<value>` (R3-S5). → accept: `git -c alias.p=reset -c alias.q=p q --hard` and `git config alias.p "push --force"` join `DESTRUCTIVE`.
- [x] 10.4 `orchestrate-scope-guard.mjs:75-77` comment names `autoForceBlock` for pre-guard and `autoActive` for runner grants, no longer than now (R3-S4). → accept: grep shows both names in the comment.
- [x] 10.5 Every step of `docs/plans/autonomous-e2e-loop.md` stays within `execution.unitContextBytes` (trim comments in `pre-guard.mjs`/`core.mjs` only, no behaviour change); full suite exit 0; each new `DESTRUCTIVE` form fails on the pre-change guard.

## Step 11 — land-holder-untracked (., JavaScript, high)
- [x] 11.1 A holder merge that git refuses because untracked working-tree files would be overwritten throws (as a dirty holder does) instead of parking `conflict`; ARCH-LAND-06's four park reasons stand (R3-S3). → accept: repo-exec.test — an untracked file in the holder at a path the branch adds makes merge throw, with no PARKED result and the holder's base unmoved.
- [x] 11.2 repo-exec.test covers a holder with `MERGE_HEAD` set (throws) and an `ff-only` park inside the holder (remote, `push:false`, holder base behind and diverged from origin) (R3-S6). → accept: both cases pass.
- [x] 11.3 Every step of `docs/plans/autonomous-e2e-loop.md` stays within `execution.unitContextBytes`; full suite exit 0; 11.1's test fails on the pre-change code. Met by ARCH-ENGINE-08's own remedy, not comment trimming: the new tests need ~2 KB and `repo-exec*.mjs` holds only ~2.5 KB of comments, so task 10.3 (landing parks) moves from run-manifest-parked into its own Step 10b `run-manifest-land` (shipped in e125c60), as Steps 1b and 7b were split before.

## Round 4 — `/scrutinise` of `ad2ce10..d1cc8fd`
One isolated scrutineer: 0 Critical, 1 Warning (Security), 3 Suggestion. ARCH-LAND-05 was judged VIOLATED as a narrow regression from Step 10: a skipped message operand hid an interpreter inside `$( )`. Every other rule HOLDS.

## Step 12 — force-block-substitution (., JavaScript, high)
- [x] 12.1 A commit/tag message operand holding `$(` or a backtick is not skipped; it is checked as a command, since it runs (R4-W1). This over-blocks only a message that holds both a substitution and a destructive phrase. → accept: `git commit -m "$(bash -c 'git push -f origin main')"`, `git commit -m "$(sh -c 'git reset --hard')"` and `git tag -am "$(bash -c 'git push -f')" v1` join `DESTRUCTIVE`; the plain commit/tag message cases stay in `ALLOWED`.
- [x] 12.2 `gitInvocations` splits segments only on separators outside quotes (R4-S1). → accept: `git -C "/a;b" push --force origin main` and `git -C "/a&b" reset --hard` join `DESTRUCTIVE`; every existing wrapped form (`$( )`, backticks, subshells, `bash -c`) stays blocked.
- [x] 12.3 Every step of `docs/plans/autonomous-e2e-loop.md` stays within `execution.unitContextBytes`; full suite exit 0; each new `DESTRUCTIVE` form fails on the pre-change guard.

## Step 13 — land-locale (., JavaScript, normal)
- [x] 13.1 `repo-exec` `run()` runs every git call with `LC_ALL=C`, so the untracked-refusal match (and every parsed git output) holds under a localised git (R4-S2). → accept: repo-exec.test runs the untracked-holder case with a non-C `LANG`/`LC_ALL` in `process.env` and it still throws.
- [x] 13.2 Every step of `docs/plans/autonomous-e2e-loop.md` stays within `execution.unitContextBytes`; full suite exit 0.

## Round 5 — `/scrutinise` of `d1cc8fd..a8394d1`
One isolated scrutineer: 0 Critical, 1 Warning (Security), 1 Suggestion. ARCH-LAND-05 was judged VIOLATED again: Step 12.2's quote-aware split does not model backslash escapes or `#` comments, so a region the shell runs as unquoted reads as quoted — after `-m`/`-F` it is skipped as a message, and its separators no longer split. Every other rule HOLDS.

## Step 14 — force-block-escape (., JavaScript, high)
- [x] 14.1 `gitInvocations` also splits on every separator regardless of quotes (the pre-12.2 `split(/&&|\|\||[;|&\n()`]/)`), and a destructive form found in either split blocks (R5-W1). Fails safe: an over-block needs a separator inside a quoted operand followed by a destructive phrase. → accept: `git commit -m "a\" -m " ; git push -f origin main ; echo "b"`, `git commit -m "a\" -m " && git reset --hard && echo "b"`, `git tag -m "a\" -m "⏎git push --force⏎echo "b" v1`, `echo #git commit -m "⏎git push -f origin main⏎#"` and `true #git commit -m "⏎git reset --hard⏎#"` (⏎ = newline) join `DESTRUCTIVE`; `git -C "/a;b" push --force origin main` stays blocked; every `ALLOWED` case still passes.
- [x] 14.2 Every step of `docs/plans/autonomous-e2e-loop.md` stays within `execution.unitContextBytes`; full suite exit 0; each new `DESTRUCTIVE` form fails on the pre-change guard.

## Round 6 — `/scrutinise` of `a8394d1..18c3f3e`
One isolated scrutineer: 0 Critical, 1 Warning (Security), 1 Suggestion. ARCH-LAND-05 was judged VIOLATED: both segment passes still read `\"…\"` as one quoted word, so a destructive flag between escaped quotes with no separator stays hidden, and `{a,b}` brace expansion is not modelled. Rounds 4–6 each patched one lexical gap, so this round replaces patching with bash's own word splitting. Every other rule HOLDS.

## Step 15 — force-block-shell-words (., JavaScript, high)
- [x] 15.1 New `scripts/lib/shell-words.mjs` exports `shellSegments(value)`: bash word splitting into one word list per command — single quotes literal; double quotes honour `\" \\ \$ \``; an unquoted `\` escapes the next character; a word-initial `#` comments to end of line; `; & | && || ( ) \`` and newline outside quotes split; one level of `{a,b}` brace expansion; `$( )` or a backtick inside double quotes is split as a command of its own. Its own module because `state-root-pin` reads `pre-guard.mjs` with 25 bytes to spare and needs no lexer. → accept: `shell-words.test.mjs` pins each rule above with one case each.
- [x] 15.2 `pre-guard` `gitInvocations` also checks every `shellSegments` word list, alongside its two existing passes; any pass finding a destructive form blocks (R6-W1). → accept: `git --namespace=\"x reset --hard #\"`, `git --namespace=\"x push -f origin main #\"`, `git push --receive-pack=\"x -f origin main --receive-pack=x\"`, `git -c a.b=\"x worktree remove --force ../w #\"` and `git push {-f,origin} main` join `DESTRUCTIVE`, each exit 0 on the pre-change guard; every `ALLOWED` case still passes.
- [x] 15.3 Pin Step 14.1's accepted over-block (R6-S1). → accept: `git commit -m "fix; git push -f is banned"` sits in `DESTRUCTIVE` under a comment saying it is blocked by design.
- [x] 15.4 Every step of `docs/plans/autonomous-e2e-loop.md` stays within `execution.unitContextBytes`; full suite exit 0.

## Round 7 — `/scrutinise` of `18c3f3e..fcd89fb`
One isolated scrutineer: 0 Critical, 6 Warning (Security), 2 Suggestion. ARCH-LAND-05 was judged VIOLATED by six plain-command classes, each confirmed against git 2.56: redirections glued to a flag, a second `git` word, long-option prefixes git accepts, `git-<sub>` programs, `$'\u…'`/`$"…"`, and multiple or nested brace groups. Every other rule HOLDS.

## Step 16 — force-block-forms (., JavaScript, high)
- [x] 16.1 Move `gitInvocations`, `shortFlag`, `MESSAGE_OPERAND` and `destructiveGit` from `pre-guard.mjs` to new `scripts/lib/force-block.mjs` (exports `destructiveGit`; sole consumer `pre-guard.mjs:251`). `state-root-pin` reads `pre-guard.mjs` and needs none of it. → accept: behaviour unchanged — every existing `DESTRUCTIVE`/`ALLOWED` case passes before 16.2–16.3 land.
- [x] 16.2 `shellSegments`: an unquoted `<`/`>` (with `>>`, `<<<`, `&>`, `>&`, an all-digit fd word) ends the word and drops the redirect target; `$"…"` reads as `"…"`; ANSI-C decodes `\u`, `\U`, `\c`; brace groups and `{x..y}` char/integer sequences expand until none remain, capped (R7-W1, W5, W6). → accept: `shell-words.test.mjs` pins each rule with one case.
- [x] 16.3 `force-block`: every word that is `git`, ends `/git` or is `git-<sub>` starts an invocation; after the global-option skip, the word after an argument-taking position is tried as the subcommand too; long options match any prefix of ≥3 characters (`--har`, `--force-with`, `--forc`); short-flag bundles may hold digits (R7-W2, W3, W4, S1). → accept: `git push -f>/dev/null origin main`, `git reset --hard>/dev/null`, `git reset --hard</dev/null`, `git worktree remove --force>/dev/null ../w`, `git push origin main -f2>/dev/null`, `exec -a git git reset --hard`, `git reset --har`, `git push --force-with o HEAD:main`, `git worktree remove --forc ../wt`, `/usr/lib/git-core/git-push -f o HEAD:main`, `git reset $'--hard'`, `git reset $"--hard"`, `git reset {--hard,--hard}{,}`, `git reset {{--hard,--hard},--hard}`, `git reset --har{d..d}` and `git --attr-source HEAD push -f origin main` join `DESTRUCTIVE`, each exit 0 on the pre-change guard; every `ALLOWED` case still passes.
- [x] 16.4 Every step of `docs/plans/autonomous-e2e-loop.md` stays within `execution.unitContextBytes`; full suite exit 0.

## Round 8 — `/scrutinise` of `fcd89fb..0098065`
One isolated scrutineer: 0 Critical, 3 Warning (Security), 3 Suggestion. ARCH-LAND-05 was judged VIOLATED: `&>` split a command at its `&`; a deep brace payload overflowed the recursive expander and the hook failed open on the throw; and `bash -cm '…'` inside `$( )` after a message flag read as a message. Every other rule HOLDS.

## Step 17 — force-block-closed (., JavaScript, high)
- [x] 17.1 `pre-guard` blocks when `destructiveGit` throws: a command the force block cannot read is not run (R8-W2, S3). → accept: a 6,000-group brace payload ahead of `git push -f origin main` exits 2.
- [x] 17.2 `shellSegments` reads `&>`/`&>>` as a redirect; `braces` expands iteratively with one budget over emitted words and pending work, appending `UNEXPANDED` when it runs out; a `{x..y}` past the cap emits `UNEXPANDED` (R8-W1, W2, S2). → accept: `shell-words.test.mjs` expects `e &>x f` as one command, a 6,000-group word to return without throwing, and `{1..300}` to end in `UNEXPANDED`.
- [x] 17.3 `force-block`: both regex splitters treat `&` before `>` as part of a redirect, `MESSAGE_OPERAND` stops at `( ) \` $`, and any ≥3-character prefix of `--mirror` blocks a push (R8-W1, W3, S1). → accept: `git push &>/dev/null -f origin main`, `git reset &>/dev/null --hard`, `git reset &>>log --hard`, `git worktree remove &>/dev/null --force ../w`, `git commit --allow-empty -m x $(bash -cm 'git push -f origin main')`, ``git commit --allow-empty -m x `bash -cm 'git reset --hard'` ``, `git tag -m x v1 $(sh -cm 'git reset --hard')` and `git push --mirror origin` join `DESTRUCTIVE`, each exit 0 on the pre-change guard; every `ALLOWED` case still passes.
- [x] 17.4 Every step of `docs/plans/autonomous-e2e-loop.md` stays within `execution.unitContextBytes`; full suite exit 0.

## Round 9 — `/scrutinise` of `0098065..2d43fbc`
One isolated scrutineer: 0 Critical, 2 Warning (Security), 2 Suggestion. ARCH-LAND-05 was judged VIOLATED. Fail-closed covered only a JS throw, but a hook that times out (10 s, `hooks/hooks.json:10`) or aborts out of heap also fails open. The verify-bypass regex (`pre-guard.mjs:180`) backtracks exponentially and runs before the force block. It takes 22.8 s on a 150-byte command. Invocation collection is quadratic in memory: 80 KB of `git ` words aborts V8, exit 134. Nested braces are quadratic in time: 52 KB takes 16 s. An in-process `setTimeout` cannot fire while a synchronous regex holds the thread, so the check moves to a worker the main thread awaits. Every other rule HOLDS.

## Step 18 — force-block-bounded (., JavaScript, high)
- [x] 18.1 `pre-guard`'s verify-bypass option group is unambiguous and linear: `(?:-[A-Za-z]+(?:=\S+|\s+[^-\s]\S*)?\s+)*` in place of `(?:(?:-[A-Za-z]+(?:[=\s]\S+)?)\s+)*` (R9-W1). → accept: `git` + 40×`-a ` + `x --no-verify commit` is decided in under 1 s with no /auto run, and `git -C dir commit --no-verify` is still blocked.
- [x] 18.2 While `autoForceBlock` is live, the force block runs before every other Bash check in `pre-guard` (R9-W1). → accept: `git` + 40×`-a ` + `x; git push -f origin main` exits 2 within the hook timeout, and exits non-2 or exceeds 10 s on the pre-change guard.
- [x] 18.3 `forceBlocked` runs `destructiveGit` in a `worker_threads` Worker with a deadline well inside the hook timeout and a heap limit (`resourceLimits`). The main thread awaits it. A deadline miss, a worker error or a non-zero worker exit blocks, as a throw does (R9-W2). `pre-guard` awaits it. → accept: a child-process test shows a stalled check (an endless loop) and an exhausted heap each block with exit 2 inside the deadline.
- [x] 18.4 Bounds: `forceBlocked` blocks outright any command over 16 KB while /auto is live. `invocationsIn`/`gitInvocations` stop collecting past a fixed word budget, with a sentinel that blocks, so memory stays linear (R9-W2). → accept: 20,000×`git ` + `push -f` (80 KB) and a 26,000-deep nested brace group + `; git push -f` (52 KB) each exit 2 within the hook timeout; each exits non-2 or exceeds 10 s on the pre-change guard.
- [x] 18.5 Hook-level tests replace the in-process-only fail-closed check (R9-S2). The 6,000-group case stays in `DESTRUCTIVE`. → accept: every `DESTRUCTIVE` case still exits 2 and every `ALLOWED` case exits 0.
- [x] 18.6 Every step of `docs/plans/autonomous-e2e-loop.md` stays within `execution.unitContextBytes`. The worker logic lives in `scripts/lib/force-block.mjs`, and `pre-guard.mjs` comments are trimmed if needed. Full suite exit 0.

## Round 10 — `/scrutinise` of `2d43fbc..6245e57`
One isolated scrutineer found 0 Critical, 1 Warning (Security) and 3 Suggestions. ARCH-LAND-05, ARCH-STATE-02 and ARCH-AUTO-06 HOLD.

The Warning sits outside /auto. The verify-bypass regex is linear for one `git` word, but `RegExp.test` retries from every `\bgit`. That makes it quadratic in the number of `git` words: a 315 KB command takes 13.9 s, and the hook times out and fails open.

## Step 19 — verify-bypass-bounded (., JavaScript, high)
- [x] 19.1 `pre-guard`'s verify-bypass check tests the linear bypass-flag regex first, then blocks outright when the command is over 16 KB. Only a shorter command reaches the commit/push regex (R10-W1). → accept: `("git -a ").repeat(45000) + "x; git commit --no-verify -m y"` with no /auto run exits 2 within the hook timeout, and exits non-2 or runs past 10 s on the pre-change guard. A many-`git` command with no bypass flag exits 0 quickly.
- [x] 19.2 `forceBlocked`'s worker takes `execArgv: []`, so inherited flags (`--input-type`) cannot stop it starting. Its size verdict says to split the command (R10-S2, S3). → accept: a child-process test run under `--input-type=module` gets `null` for `git status` from the real worker, and the stall case takes at least its deadline.
- [x] 19.3 The R9 hook tests assert which mechanism blocked (R10-S1). Over 16 KB, stderr names the size. A benign `("a git ").repeat(2000)` with no destructive form is unreadable through the word budget. → accept: both stderr assertions pass.
- [x] 19.4 Every step of `docs/plans/autonomous-e2e-loop.md` stays within `execution.unitContextBytes`; full suite exit 0.

## Round 12 — `/architect --update` of `8e9f06d`
A fresh check of all 42 rules found 39 HOLD, none VIOLATED. ARCH-ENGINE-01 is superseded by ENGINE-12. ARCH-ENGINE-02 cites the idea doc, not the spike evidence. ARCH-LAND-03 is UNPROVEN: only `commands/merge.md` §5a states it, and `plan-graph.mjs` orders steps with no knowledge of submodules. The user chose to enforce LAND-03 in code.

## Step 20 — land-submodule-bump (., JavaScript, normal)
- [ ] 20.1 `plan-graph.mjs` `validateSteps` (through `scripts/lib/plan-submodules.mjs`, keeping `plan-graph.mjs` inside the `auto-command` step budget) treats a registered project whose `root` lies inside another registered project's root as a submodule of the nearest enclosing one. A step may declare `bumps: "<submodule id>"`. It refuses: a `bumps` naming a project that is not a submodule of the step's own project; a plan with steps in a submodule but no bump step in its parent; and a bump step that does not depend, directly or transitively, on every step of that submodule. With no workspace manifest it checks nothing new (ARCH-LAND-03, LAND-04). → accept: `scripts/lib/plan-submodules.test.mjs` cases for each refusal fail on the pre-change code; the valid sub → bump → consumer order passes.
- [ ] 20.2 `commands/merge.md` §5a and `plan-template.md` name the `bumps` field and say `plan-graph.mjs` refuses a plan without the bump unit; `auto-command.test.mjs` phrases still match. → accept: full suite exit 0.
- [ ] 20.3 LAND-03 cites the new check; ENGINE-02 cites the spike evidence (`docs/plans/autonomous-e2e-loop-evidence.md`). → accept: `arch-check lint` PASS.
- [ ] 20.4 One CHANGELOG clause on the existing `/craftsman:auto` entry; full suite exit 0.

## Round 13 — `/scrutinise` of `8e9f06d..fd258d0`
One isolated scrutineer: 0 Critical, 2 Warning, 2 Suggestion; the criterion is MET; LAND-02, LAND-03, LAND-04, ENGINE-02 and ENGINE-08 HOLD.
- R13-W1 [Correctness] `plan-submodules.mjs:8-20` treats any registered project nested in another's root as a submodule. A nested independent clone, or every project when one is rooted at the workspace root (`workspace-init.mjs:46` allows that), would be refused without a bump it cannot make. ARCH-LAND-04 says submodules are those git reports.
- R13-W2 [Cross-unit] `commands/orchestrate.md:29` lists the stdin fields as id, scope_id, project, depends_on and the old refusals only. An orchestrator following it drops `bumps`.
- R13-S1 [Test-coverage] `plan-graph.test.mjs:28-36`'s LAND-02/03 test uses `path`, so it exercises no submodule and its bump step has no `bumps`.
- R13-S2 [Correctness] A bump step's `project` must be the parent's registered id; "." is refused, and nothing says so.

## Step 21 — land-submodule-bump, round 13 fixes (., JavaScript, normal)
- [ ] 21.1 A nested pair counts as a submodule only when the parent's index holds a gitlink (mode 160000) at the child's relative path; the check is injectable (`isGitlink`) for tests (R13-W1). → accept: a nested project with no gitlink, and a project rooted at the workspace root, need no bump; a real `git init` parent with a gitlink child is detected.
- [ ] 21.2 `commands/orchestrate.md:29` names `bumps` and the bump refusals (R13-W2), within its size budget.
- [ ] 21.3 `plan-graph.test.mjs`'s LAND-02/03 test uses `root` and `bumps` (R13-S1); `plan-template.md` says the bump's `project` is the parent's registered id (R13-S2). → accept: full suite exit 0; lint PASS.

## Round 14 — `/scrutinise` of `8e9f06d..3951593`
One isolated scrutineer: 0 Critical, 1 Warning, 4 Suggestion; the criterion is MET; LAND-02, LAND-03 (for registered parents), LAND-04, ENGINE-02 and ENGINE-08 HOLD.
- R14-W1 [Correctness] `plan-submodules.mjs:20-31`: a registered project whose gitlink lives in an unregistered superproject at the workspace root has no registered parent, so its steps pass with no bump.
- R14-S2 `gitlinkAt` swallows git errors and returns false (fails open). R14-S3 the path is a pathspec, so `:`-prefixed names are read as magic. R14-S4 `landing.rules.md` `governs` lacks `scripts/lib/plan-submodules.mjs`. R14-S5 the template's `units:` skeleton has no `bumps:` key.

## Step 22 — land-submodule-bump, round 14 fixes (., JavaScript, normal)
- [ ] 22.1 A registered project with no registered parent, whose gitlink is held by the workspace root (itself unregistered), is refused with "register the superproject" (R14-W1). → accept: test fails on `3951593`.
- [ ] 22.2 `gitlinkAt` throws when git fails, and passes `--literal-pathspecs` (R14-S2, S3). → accept: real-git test of a `:`-prefixed gitlink and of an unreadable parent.
- [ ] 22.3 `governs` lists the lib file; the template skeleton shows `bumps:` (R14-S4, S5). → accept: lint PASS; full suite exit 0.

## Not driven (recorded)
- **Round 2:** `unit-runner` `block` releases the claim while `_shared-execution.md` step 11 keeps a PARKED/BLOCKED claim until the hand-off records the branch — align in a later pass. Residual risks: `session.usage.startedAt` availability in the real mod runtime; `autoActive` reads the ledger per Bash call; a stale `.spent-` file adds a 200 ms deny delay.
- **Round 3:** the force block stays lexical — a heredoc into `bash`, a script file, `GIT_*` env tricks and persistent `~/.gitconfig` aliases escape it; only runtime enforcement would close that. The holder's cleanliness is checked once before the merge lock, so a concurrent human edit is caught only by git's own refusal. `autoForceBlock` stays live up to 24 h while CANCELLED/PARKED/BLOCKED rows remain (intended: Phase C answers them).
- **Round 5:** the lexical class also covers `$'…'` ANSI-C quoting, line continuations and `${var}` inside a message — same residual, same remedy. The `repo-exec.test` locale case proves the fix only where git's German catalogue is installed (it is on the dev host); a host-conditional skip would be a skipped test, so it stays as is.
- **Round 6:** `eval`, `printf`-built arguments and `IFS` changes are runtime constructs a lexer cannot see — they join the round-3 lexical residual. `landing.rules.md` ARCH-LAND-05's `pre-guard.mjs` line cite is stale — doc drift for `/sync-docs`.
- **Round 7:** `help.autocorrect` subcommand guessing is config (the gitconfig residual); `[[ ]]`, `case`, extglob and an `alias` defined in the same command join the lexical residual. A server-side `receive.denyNonFastForwards` or a pre-push hook would stop force pushes however they are spelled — a decision change for `/architect`, not a fix here.
- **Round 8:** `MESSAGE_OPERAND`'s nested quantifiers take ~1.2 s on a 20,000-quote input — a slow hook, not a bypass. A brace group whose commas are quoted (`{"a,b"}`) over-expands relative to bash; with the cap and fail-closed it can only over-block.
- **Round 9:** `MESSAGE_OPERAND` stopping at `(`/`$` anywhere in the prefix over-blocks a later message that names a destructive form. Examples: `git commit -m "feat(guard): x" -m "blocks git push -f now"`, and `git -C "$WT" commit -m "…git reset --hard…"`. This direction is safe and is accepted, like Step 14.1's. The worker adds a few tens of ms to each Bash call, but only while /auto is live.
- **Round 11** (`6245e57..a8ced0d`): 0 Critical, 0 Warning, 0 Architecture, 0 UNMET; every rule HOLDS. Three Suggestions, not driven:
  - A flagged command over 16 KB that is not a commit or push is blocked with the commit/push message, which says nothing about its size.
  - The 16 KB limit appears twice: in `pre-guard` it counts code units, and in `force-block` it counts bytes.
  - No test sends a flagged command just under 16 KB to time the commit/push regex. The scrutineer's probe of that regex at ~16 KB took ≤45 ms.
- **`/architect --update` (2026-10-09), decided with the user.** ARCH-ENGINE-01 was VIOLATED: `agent-mode-guard.mjs:91-123` grants a `unit-runner` only to a live `/auto`, so a standalone `/orchestrate` had no `subagent` fallback. The user chose to amend the rule, not the code. ARCH-ENGINE-12 supersedes it, and `_shared-execution.md` and `auto.md` now cite ENGINE-12. ARCH-LAND-03 (submodule bump as a dependent unit) is UNPROVEN: only the protocol text at `commands/merge.md:98-100` enforces it, with no check in `plan-graph.mjs`. The user accepted it as protocol; there are no submodules in this scope.
- **Round 10:** `mutatesGit` and `commandDirectoryTargets` share the many-`git` shape. They run after the force block and only with a worktree binding, and they guard isolation, not a decided rule here. `pre-guard.mjs:149` exits before the force block when craftsman is off for the project, which is outside this range. Treating a hook timeout as allow is the plan's own assumption; it was not verified at runtime.
- Step 7 supersedes step 5's "no remote → park" clause: the holder landing replaces the `base-checked-out` park.
- `workflows/spike.js` still ships: it is ENGINE-02's evidence artefact and the Workflow guard allows only plugin workflows, so it grants nothing `run.js` doesn't.
- The Stop sampler and the mod both log `{ev:"context"}`, doubling `samples` in stats; peak and final are unaffected.
- `core.test.mjs:400`'s no-cwd check is a floor, not proof, for ARCH-STATE-06.
- **Disputed — `/instruction` goals auto-launch.** The scrutineer flagged that the mod launches `/instruction`'s paste-ready goal file. Decided ARCH-MOD-02 (`docs/architecture/mod.rules.md:12`, cite `commands/instruction.md:58`) makes any new goal file launch, so restricting it is a decision change for `/architect`, not a fix here.

## Sequencing
Steps 1, 2, 4 and 5 are independent. Step 6 follows step 3 because both edit `scripts/lib/core.mjs`. No CHANGELOG task: the `[Unreleased]` `/craftsman:auto` entry already describes the corrected behaviour.

## Verification background
- `close()` returns land results as is — `workflows/run.js:126-128`; `dead()` — `:95-97`.
- `release` clears only the binding — `scripts/scope.mjs:120-127`; `readScope` loads every scope file — `:79-98`.
- Marker written — `scripts/orchestrate-scope-guard.mjs:81`; read — `:89`, `scripts/pre-guard.mjs:234`.
- `since` falls back to 0 — `hooks/register.js:95`.
- Merge checks out base in root — `scripts/repo-exec.mjs:231`.

CONSUMERS:
- `readScope` → `scripts/stop-gate.mjs:19`, `scripts/quality-gate.mjs:19`, `scripts/telemetry.mjs:93`, `scripts/pre-guard.mjs:177`.
- `auto-active` marker → `scripts/orchestrate-scope-guard.mjs:81,89`, `scripts/pre-guard.mjs:234`; step 3 adds `scripts/agent-mode-guard.mjs`.
- `spendRunnerDispatch` → `scripts/agent-mode-guard.mjs`.
- unit-runner roles → `workflows/run.js` (`run(role, …)`), `agents/unit-runner.md`; `wiring.test.mjs` lints run.js.
- `repo-exec` merge result → `workflows/run.js` land via `agents/unit-runner.md` land step 3.
