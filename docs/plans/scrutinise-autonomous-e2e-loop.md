---
slug: scrutinise-autonomous-e2e-loop
goal: An unattended /craftsman:auto run records every park and block in the ledger, lands from a linked worktree, and leaves no stale scope, marker or grant behind.
parent: docs/plans/autonomous-e2e-loop.md
classification: in-scope # /scrutinise findings on 9b34cc3..01e12a7; every fix stays inside a decided rule
tracker_rows: [engine-close, scope-release, auto-marker, mod-goal-since, land-linked-worktree, core-hardening]
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
---

# Plan: scrutinise fixes for autonomous-e2e-loop

Fix round for `/scrutinise autonomous-e2e-loop` (range `9b34cc3..01e12a7`, one isolated scrutineer): 0 Critical, 6 Warning, 9 Suggestion. ARCH-TRACKER-03 and ARCH-LAND-06 were judged violated in practice (W1).

## Step 1 — engine-close (., JavaScript, normal)
- [ ] 1.1 `workflows/run.js` `close()`: a land result of `PARKED` runs the `park` role with its `parked` decision, as an implement park does (W1). → accept: `engine.test.mjs` case where land returns PARKED shows a `park` call carrying the decision and a PARKED result.
- [ ] 1.2 Every other non-MERGED, non-PENDING terminal result (`BLOCKED` from implement, review or land, and `dead()`) runs a new `block` role: `S tracker` → `BLOCKED` with the evidence, commit work as `wip:`, `S repo-exec` cleanup, `S claim` release (W2). Add `## block` to `agents/unit-runner.md` (≤3,800 chars). → accept: `engine.test.mjs` cases for an implement BLOCKED and a dead land agent each show one `block` call; doc-size policy passes.
- [ ] 1.3 Full suite exit 0.

## Step 2 — scope-release (., JavaScript, high)
- [ ] 2.1 `scope.mjs` `release` unlinks that worktree's `scopeFile` and `requiredFile` along with the binding (W3). → accept: scope.test — after release, neither file exists.
- [ ] 2.2 `readScope` ignores a worktree scope whose `worktree_path` no longer exists, and `scopeRequired` ignores a marker naming a missing worktree. → accept: scope.test — two units activated, worktrees removed, a root-target read resolves to no unit scope (not `scope_ambiguous`).
- [ ] 2.3 Full suite exit 0.

## Step 3 — auto-marker (., JavaScript, high)
- [ ] 3.1 `/auto` writes `auto-active` as JSON `{plan, at}`. One `core.mjs` helper `autoActive(sid, context)` says it is live only when it is younger than 24 h and that plan's ledger has a PENDING or IN_PROGRESS row; a legacy timestamp-only marker is not live (W4). `orchestrate-scope-guard` and `pre-guard` read it only through the helper. → accept: core.test cases for live, aged-out, plan-finished and legacy markers.
- [ ] 3.2 `orchestrate-scope-guard` re-grants runners on `/orchestrate` only while the marker is live; `agent-mode-guard` spends a runner grant only while it is live. `planUnitCount` counts `- id:` lines inside the front matter only (S5). → accept: guard tests — `/orchestrate` after the plan's rows are all MERGED grants nothing and a leftover grant is not spent.
- [ ] 3.3 `pre-guard`'s force block applies while the marker is live, and also catches `git` inside `bash -c`/`sh -c` strings, after `(`/`$(`/backtick, and a `git -c alias.*=` whose value holds a blocked form (S1, LAND-05). → accept: pre-guard.test cases for each form blocked while live, and plain `git push` allowed once the marker is dead.
- [ ] 3.4 Full suite exit 0.

## Step 4 — mod-goal-since (., JavaScript, high)
- [ ] 4.1 `register.js`: with no `session.usage.startedAt`, launch nothing — a goal file counts as new only when written after the session started (W5; auto.md Phase B step 3 "written this session"). → accept: register.test.ts case — no startedAt, a goal file present, nothing launched.
- [ ] 4.2 The band's scope-name pattern matches core's (`@[A-Za-z0-9_-]+`), so hyphenated project ids are found (S6). → accept: register.test.ts case with `scope@my-app-<hash>.json`; `claude plugin test .` passes.
- [ ] 4.3 Full suite exit 0.

## Step 5 — land-linked-worktree (., JavaScript, high)
- [ ] 5.1 `repo-exec` merge: when base cannot be checked out in `context.root` because another worktree holds it, merge in a temporary detached worktree at the base tip and push `HEAD:<base>`; never move a branch ref another worktree has checked out. With no remote, PARK with a decision instead (W6, LAND-06). The temporary worktree is removed on every path. → accept: repo-exec.test — a linked-worktree root whose base is checked out by the primary lands on the remote base; the no-remote case parks with a decision.
- [ ] 5.2 A rejected `direct` push park reports `merged_locally:true`; delete the unreachable `auto_merge_error` spread in `landPullRequest` (S4). → accept: repo-exec.test rejected-push case asserts `merged_locally`.
- [ ] 5.3 Full suite exit 0.

## Step 6 — core-hardening (., JavaScript, high)
- [ ] 6.1 Root pin: `lstatSync` and reject anything but a regular file owned by the current uid; check the `craftsman-roots` directory's uid and that it is not group/world-writable before reading or writing (S2). → accept: core.test — a symlinked pin entry and a foreign-mode directory are both ignored.
- [ ] 6.2 `spendRunnerDispatch` retries the rename claim a few times before denying (S3). → accept: core.test — two sequential spends of a 2-count grant both succeed, a third is denied.
- [ ] 6.3 Full suite exit 0.

## Not driven (recorded)
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
