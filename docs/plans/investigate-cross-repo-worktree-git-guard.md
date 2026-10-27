---
slug: investigate-cross-repo-worktree-git-guard
goal: A unit bound to a sibling repo's worktree can commit with `git -C <worktree>`, and the guard checks the branch where git actually runs
level: feature
priority: P1
classification: in-scope # /investigate 2026-10-27, reproduced from Loost workspace session dba1cae1 (unit gallery-sync)
tracker_rows: [TRACKER#guard-target-resolution, TRACKER#account-switch-same-repo, TRACKER#scope-release-clean]
guards:
  blast_radius: done
  completeness_sweep: done
  blind_rederivation: skipped(config:never)
coverage:
  contract:      N/A(no exported API, type or CLI change; pre-guard's exit-2 contract and message prefix are kept, 1.6)
  data:          N/A(no persistence; binding files unchanged)
  config:        N/A(no config key or flag)
  security:      1.2, 1.3, 1.4 (fail-closed target resolution, toplevel equality, branch check in target), 3.2 (release refuses a dirty worktree, fail closed)
  tests:         1.1, 1.5, 1.7, 3.1, 3.5
  observability: 1.6 (git_guard_blocked event gains the resolved target)
  interface:     1.6 (guard message names `git -C <worktree>`), 2.1 (account-switch restore step), 3.2 (release refusal message)
  docs:          2.1, 3.3 (park/block commits `wip:` before the release)
  rollback:      each unit is one merge commit; revert it
units:
  - id: guard-target-resolution
    scope_id: guard-target-resolution
    project: .
    depends_on: []
    module: scripts/pre-guard.mjs
    language: javascript
    security: high
    scope:
      read: []   # the write files are the only ones touched; reading pre-guard.mjs (94 KB) + pre-guard.test.mjs (143 KB) whole overflows unitContextBytes (ARCH-ENGINE-08) — read pre-guard.mjs:30-75, :124-215, :386-492 (tokenize) and :1060-1335 by range
      docs: [docs/architecture/state.rules.md, docs/architecture/safety.rules.md, docs/plans/investigate-cross-repo-worktree-git-guard.md]
      write: [scripts/pre-guard.mjs, scripts/pre-guard-worktree.test.mjs]
    arch: [ARCH-STATE-06, ARCH-STATE-16, ARCH-SAFETY-03]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [test-driven-development], guards: [arch-check], mcp: [] }
  - id: account-switch-same-repo
    scope_id: account-switch-same-repo
    project: .
    depends_on: []
    module: commands/account-switch.md
    language: markdown
    security: normal
    scope:
      read: [commands/account-switch.md, scripts/doc-size-policy.mjs]
      docs: [docs/architecture/slim.rules.md, docs/plans/investigate-cross-repo-worktree-git-guard.md]
      write: [commands/account-switch.md]
    arch: [ARCH-SLIM-01, ARCH-SLIM-02]
    tooling: { implementer: implementer, gates: [], skills: [], guards: [doc-size-policy], mcp: [] }
  - id: scope-release-clean
    scope_id: scope-release-clean
    project: .
    depends_on: []
    module: scripts/scope.mjs
    language: javascript + markdown
    security: high
    scope:
      read: [scripts/scope.mjs, scripts/scope.test.mjs, commands/_features.md]
      docs: [docs/architecture/state.rules.md, docs/architecture/engine.rules.md, docs/architecture/slim.rules.md, docs/plans/investigate-cross-repo-worktree-git-guard.md]
      write: [scripts/scope.mjs, scripts/scope.test.mjs, commands/_features.md]
    arch: [ARCH-STATE-09, ARCH-ENGINE-04, ARCH-SLIM-01, ARCH-SLIM-02]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [test-driven-development], guards: [arch-check, doc-size-policy], mcp: [] }
---

# Plan: git mutations may target the bound worktree explicitly

## Outcome
A unit bound to a worktree in another repository of a workspace can stage and commit with `git -C <worktree>` (or `cd <worktree> && git …` in the same command). Every other target is still refused, and the branch check runs in the worktree git actually runs in.

## Scope Steps (executable core)

### Step 1 — guard-target-resolution (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor · skills test-driven-development · guards arch-check
Depends on: none
- [ ] 1.1 Create `scripts/pre-guard-worktree.test.mjs` (harness copied from `pre-guard.test.mjs:1-30`: `run`, `worktreeBindingPath`) with failing regression tests. Set up two repos A and B, with the binding on B's worktree W on branch `feat/w`. Run the guard from cwd = B primary and from cwd = A's worktree. Allow: `git -C W add f`; `cd W && git add f && git commit -m x`; `git -C "<W with space>" add f`; `pushd W && git add f`. Block: the 11 cases in 1.5. → accept: the allow cases exit 2 on the pre-fix code (captured in the run log), and every block case exits 2.
- [ ] 1.2 Replace the cwd-OR test at `scripts/pre-guard.mjs:1313-1323` with per-call resolution. Parse with the existing strict `tokenize(stripHeredocs(command), fail)` (`:407`, `:124`), not new regexes: a `fail` (subshell, lone `&`, unclosed quote) blocks. Resolve paths with the existing `realResolve` (`:201`). For each mutating `git` call, start at `process.cwd()` and apply the chained `cd`/`pushd`/`popd` before it, in order, joined only by `&&` or `;`. Then apply each `-C`, composing them. A call is allowed only when its resolved directory is proven. Anything unprovable blocks: a `$`, `~`, backtick or `$(` in a target; a subshell `( … )` or brace group; `&` or `|` between the `cd` and the `git`; a missing path; or `usesAlternateGitRoot`. → accept: 1.1 and 1.5 pass, and no allow case passes through `commandDirectoryTargets` alone.
- [ ] 1.3 Require, for each resolved directory, that `git -C <dir> rev-parse --show-toplevel` realpath-equals realpath(W). A nested repo or submodule under W blocks, and so does a `rev-parse` or `realpath` failure (fail closed, ARCH-SAFETY-03). The `git` spawn runs only when there is a binding and `mutatesGit` is true, so hook latency is unchanged for every other call (ARCH-SLIM-07). → accept: test 1.5(i) blocks, and a deleted-W case blocks.
- [ ] 1.4 Run the branch check (`:1324-1333`) in the resolved directory, not `process.cwd()`. → accept: test 1.5(j) blocks while the cwd repo is on a branch with the bound name.
- [ ] 1.5 Cover the block cases in `scripts/pre-guard-worktree.test.mjs`. → accept: each exits 2.
  - (a) `git add f; git -C W commit -m x` (mixed targets)
  - (b) `cd W && cd .. && git add f`, from outside and from cwd = W (closes the `:60` resolution hole)
  - (c) `cd $WT && git add f`, `cd ~/x && …`, and backtick and `$(…)` targets
  - (d) `(cd W && git add f)` and `{ cd W; git add f; }`
  - (e) `pushd W && popd && git add f`
  - (f) `cd W & git add f` and `cd W | git add f`
  - (g) `git -C W -C .. add f`
  - (h) `cd W && git add f; cd /other && git commit -m x`
  - (i) a nested repo under W
  - (j) W on the wrong branch, reached through `-C` from outside
  - (k) `--git-dir` or `GIT_DIR=` combined with `-C W`
- [ ] 1.6 Reword the block message (`:1318-1321`). Keep the prefix `Git mutation blocked outside the active worktree (<W>).` and follow it with "Run each git call in it: `git -C <W> …`, or `cd <W> && git …` in the same command." Drop the "release the binding" clause and any mention of EnterWorktree. Add the resolved `target` to the `git_guard_blocked` logEvent. → accept: a test asserts stderr contains `git -C` and contains neither `release` nor `EnterWorktree`.
- [ ] 1.7 Run `node --test scripts/pre-guard.test.mjs scripts/pre-guard-worktree.test.mjs scripts/pre-guard-narrow.test.mjs scripts/scope.test.mjs`. → accept: everything is green, and the existing tests at `pre-guard.test.mjs:171-235` are unchanged and pass.

### Step 2 — account-switch-same-repo (., markdown, normal)
Tooling: implementer implementer · guards doc-size-policy
Depends on: none
- [ ] 2.1 Reword `commands/account-switch.md:73-74` (Restore step 3) so it enters only a snapshot worktree under **this repo's** `.claude/worktrees/` with `EnterWorktree`. Any other worktree, including one in a sibling repo, is worked from the recorded root, with `git -C`. → accept: `wc -c commands/account-switch.md` ≤ 8257, and `node scripts/doc-size-policy.mjs` prints PASS.

### Step 3 — scope-release-clean (., javascript + markdown, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor · skills test-driven-development · guards arch-check, doc-size-policy
Depends on: none
Owner decision (2026-10-27, F1): `release` refuses a dirty worktree, and feature-mode park/block commits `wip:` first. There is no `force` flag, so a prompt cannot bypass the refusal; the refusal names the fix (ARCH-STATE-16).
- [ ] 3.1 Add failing tests to `scripts/scope.test.mjs` (helpers `repoWithWorktrees`, `hook`, `manifest` at the top of the file). With a worktree-keyed scope active, `release` with `worktree_path`: modified tracked file → exit 2; untracked non-ignored file → exit 2; in both the binding and scope files still exist and stderr names the worktree and says to commit. After `git commit` the same release → exit 0 and the scope is gone. Also: only a gitignored file → exit 0; a `worktree_path` that no longer exists (swept) → exit 0; a `worktree_path` that is not a git repo → exit 2 (fail closed); a release without `worktree_path` is unaffected. → accept: the two refusal cases fail on the pre-fix code (run log shows it), and the existing release tests at `scope.test.mjs:85-139` stay green unchanged.
- [ ] 3.2 In `scripts/scope.mjs:139-151`, after the ownership check and before `clearWorktreeBinding`, when `input.worktree_path` is set and the directory exists, run `git -C <path> status --porcelain` (the same test `repo-exec.mjs:359` uses). Non-empty output, or a git failure, writes `craftsman: scope release refused: <path> has uncommitted changes — commit them (wip: when parking or blocking), then release again.` to stderr, logs a `scope_release_refused` event and exits 2 with the binding and scope untouched. No `force` flag. Do not route it through the activation catch (its text is "scope activation failed"). → accept: 3.1 passes.
- [ ] 3.3 In `commands/_features.md` § park and block, replace "First `S scope` release (…)" with an order that commits `wip:` (unit-runner park step 2) before the `S scope` release, and says the release refuses a dirty worktree. → accept: `wc -c commands/_features.md` ≤ 3496 (currently 3481; caps only ratchet down, ARCH-SLIM-02, `scripts/doc-size-policy.mjs:47`) and `node scripts/doc-size-policy.mjs` prints PASS.
- [ ] 3.4 Confirm the other release callers need no change: land (`agents/unit-runner.md` land step 2, `commands/_shared-execution.md:42`) releases only after the implement commit, and `repo-exec.mjs:359` already refuses a dirty worktree at merge. → accept: no edit to those files (`_shared-execution.md` is exactly at its cap, 12766 bytes; `unit-runner.md` has 7 bytes of headroom).
- [ ] 3.5 Run `node --test scripts/scope.test.mjs scripts/wiring.test.mjs scripts/doc-size-policy.test.mjs`, `node scripts/doc-size-policy.mjs` and `node scripts/arch-check.mjs lint`. → accept: all green.

## Sequencing
The three steps are independent and can run in parallel (step 3 writes `scope.mjs`, `scope.test.mjs` and `_features.md`, which steps 1 and 2 do not touch). Step 1 is the root-cause fix: the new message names `git -C`, which is only true once the resolution logic exists, so the message and the logic land together (ARCH-STATE-16). Step 2 is a doc-only change with its own failure mode (the byte cap), kept separate so neither can block the other.

## Verification background
- Guard blocks on cwd regardless of explicit target: `scripts/pre-guard.mjs:1313-1323`. Reproduced: `git -C <Bwt> add f` and `cd <Bwt> && git add f` exit 2 from cwd = B primary and from cwd = A's worktree, and exit 0 only from cwd = B's worktree (throwaway node test, 2026-10-27).
- `commandDirectoryTargets` already validates `-C`/`cd`/`pushd` targets: `scripts/pre-guard.mjs:51-69`. It resolves every target against `process.cwd()` (`:60`), not the chained directory.
- Branch check runs in cwd: `scripts/pre-guard.mjs:1324-1333`.
- Binding comes from the active scope, not cwd: `scripts/pre-guard.mjs:1077-1080`.
- Hooks must not address a workspace project by cwd: ARCH-STATE-06, `docs/architecture/state.rules.md:16`. Block messages must name the fix, and parsing that is not proven fails closed: ARCH-STATE-16, `state.rules.md:26`.
- Incident: the Loost workspace session `dba1cae1` was blocked at transcript lines 5763 and 5767. Its `EnterWorktree` call was refused at 5787, because Claude Code limits switching to this repo's `.claude/worktrees`. It then released the binding mid-unit at 5795, after which `git -C … add` passed.
- No stale artifact: the installed plugin's `scripts/pre-guard.mjs` is byte-identical to the repo copy.
- No decided rule requires cwd-only: `docs/plans/scrutinise-autonomous-e2e-loop.md:518` describes this check as isolation, not a decided rule.
- `commands/account-switch.md` is at its cap: `scripts/doc-size-policy.mjs:54` sets 8257, and the file is 8257 bytes (ARCH-SLIM-02, ratchet-only).

CONSUMERS:
- The guard's stderr prefix `Git mutation blocked outside the active worktree` is asserted at `scripts/pre-guard.test.mjs:189,211` and kept unchanged.
- `scope.mjs` `release` callers: `commands/_shared-execution.md:42` (land path, clean by then; unchanged), `commands/_features.md:23` (feature-mode park/block; reordered by 3.3), `agents/unit-runner.md:27` (land step 2, clean after the implement commit at step 8; unchanged). `scripts/scope.test.mjs:93,138` call `release` on clean worktrees and stay green.

## Risk & rollback
The risk is loosening a safety guard. It is mitigated by per-call resolution, toplevel equality and fail-closed handling of every construct the parser can't prove (1.2-1.5). Rollback: revert the unit's merge commit, which restores the stricter cwd-only behaviour.

Step 3 changes when a failure shows up: `release` now refuses a dirty worktree, so a unit that leaves untracked non-ignored files fails at release instead of at the merge (`repo-exec.mjs:359` already refused it there). Park/block commit `wip:` first, so they are unaffected. ARCH-STATE-09's text ("land, park and block each release the worktree scope") still holds; only the order inside park/block changes, so no rule amendment is needed. Rollback: revert the unit's merge commit.

## Out of scope
- Claude Code's `EnterWorktree` restriction to this repo's `.claude/worktrees`. It is harness behaviour and intended.
- A new `_shared-execution.md` line about `git -C`. Under ARCH-SLIM-05 the hook's own message carries the instruction (1.6).

## Follow-ups
- F1 resolved: the owner chose "Refuse + wip commit" (2026-10-27); built as unit `scope-release-clean`.
