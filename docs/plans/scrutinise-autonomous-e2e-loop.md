---
slug: scrutinise-autonomous-e2e-loop
goal: An unattended /craftsman:auto run records every park and block in the ledger, lands from a linked worktree, and leaves no stale scope, marker or grant behind.
parent: docs/plans/autonomous-e2e-loop.md
classification: in-scope # /scrutinise findings on 9b34cc3..01e12a7; every fix stays inside a decided rule
tracker_rows: [engine-close, scope-release, auto-marker, mod-goal-since, land-linked-worktree, core-hardening, land-holder, force-block-live, runner-block-trigger, force-block-quoted, land-holder-untracked, force-block-substitution, land-locale]
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
    module: repo-exec git under LC_ALL=C
    language: JavaScript (Node ESM, node:test)
    security: normal
    scope:
      read: [scripts/repo-exec.mjs, scripts/repo-exec.test.mjs, scripts/arch-check.test.mjs, docs/plans/autonomous-e2e-loop.md, docs/plans/scrutinise-autonomous-e2e-loop.md]
      docs: [docs/architecture/landing.rules.md]
      write: [scripts/repo-exec.mjs, scripts/repo-exec.test.mjs, docs/plans/scrutinise-autonomous-e2e-loop.md]
    arch: [ARCH-LAND-02, ARCH-LAND-06]
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
- [ ] 12.1 A commit/tag message operand holding `$(` or a backtick is not skipped; it is checked as a command, since it runs (R4-W1). This over-blocks only a message that holds both a substitution and a destructive phrase. → accept: `git commit -m "$(bash -c 'git push -f origin main')"`, `git commit -m "$(sh -c 'git reset --hard')"` and `git tag -am "$(bash -c 'git push -f')" v1` join `DESTRUCTIVE`; the plain commit/tag message cases stay in `ALLOWED`.
- [ ] 12.2 `gitInvocations` splits segments only on separators outside quotes (R4-S1). → accept: `git -C "/a;b" push --force origin main` and `git -C "/a&b" reset --hard` join `DESTRUCTIVE`; every existing wrapped form (`$( )`, backticks, subshells, `bash -c`) stays blocked.
- [ ] 12.3 Every step of `docs/plans/autonomous-e2e-loop.md` stays within `execution.unitContextBytes`; full suite exit 0; each new `DESTRUCTIVE` form fails on the pre-change guard.

## Step 13 — land-locale (., JavaScript, normal)
- [ ] 13.1 `repo-exec` `run()` runs every git call with `LC_ALL=C`, so the untracked-refusal match (and every parsed git output) holds under a localised git (R4-S2). → accept: repo-exec.test runs the untracked-holder case with a non-C `LANG`/`LC_ALL` in `process.env` and it still throws.
- [ ] 13.2 Every step of `docs/plans/autonomous-e2e-loop.md` stays within `execution.unitContextBytes`; full suite exit 0.

## Not driven (recorded)
- **Round 2:** `unit-runner` `block` releases the claim while `_shared-execution.md` step 11 keeps a PARKED/BLOCKED claim until the hand-off records the branch — align in a later pass. Residual risks: `session.usage.startedAt` availability in the real mod runtime; `autoActive` reads the ledger per Bash call; a stale `.spent-` file adds a 200 ms deny delay.
- **Round 3:** the force block stays lexical — a heredoc into `bash`, a script file, `GIT_*` env tricks and persistent `~/.gitconfig` aliases escape it; only runtime enforcement would close that. The holder's cleanliness is checked once before the merge lock, so a concurrent human edit is caught only by git's own refusal. `autoForceBlock` stays live up to 24 h while CANCELLED/PARKED/BLOCKED rows remain (intended: Phase C answers them).
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
