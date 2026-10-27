---
slug: scrutinise-investigate-cross-repo-worktree-git-guard
goal: The worktree git guard allows only git calls it can prove run in the bound worktree, still lets read-only git through, and a release refusal names a fix that works
level: feature
priority: P1
classification: in-scope # round 1 of an isolated /scrutinise of investigate-cross-repo-worktree-git-guard (868d87f, 0a9f48d, 2a172cb)
tracker_rows: [TRACKER#fix-guard-chain, TRACKER#fix-release-message]
guards:
  blast_radius: done
  completeness_sweep: done
  blind_rederivation: skipped(config:never)
coverage:
  contract:      N/A(no exported API or CLI change; pre-guard exit-2 contract and message prefix kept)
  data:          N/A(no persistence; binding and scope files unchanged)
  config:        N/A(no config key or flag)
  security:      1.2 (chained cd proven only through && ; newline), 1.3 (long global options with a value), 1.5 (wrappers and unresolvable dir-changers fail closed), 2.2 (release refusal stays fail closed)
  tests:         1.1, 1.7, 2.1, 2.3
  observability: 2.2 (scope_release_refused event gains sid)
  interface:     1.4 (read-only git under shell keywords no longer gets the git-mutation message), 1.5 (block message names the fix), 2.2 (release message for an unreadable worktree)
  docs:          1.6 (cite ranges in safety.rules.md and state.rules.md)
  rollback:      each unit is one merge commit; revert it
units:
  - id: fix-guard-chain
    scope_id: fix-guard-chain
    project: .
    depends_on: []
    module: scripts/pre-guard.mjs
    language: javascript
    security: high
    scope:
      read: []   # pre-guard.mjs is 94 KB; read it by range (:30-75, :124-215, :386-492, :1095-1130, :1290-1385) — whole-file reads overflow unitContextBytes (ARCH-ENGINE-08)
      docs: [docs/architecture/state.rules.md, docs/architecture/safety.rules.md, docs/plans/scrutinise-investigate-cross-repo-worktree-git-guard.md]
      write: [scripts/pre-guard.mjs, scripts/pre-guard-worktree.test.mjs, docs/architecture/safety.rules.md, docs/architecture/state.rules.md]   # rules docs: `cite:` line ranges only
    arch: [ARCH-STATE-06, ARCH-STATE-16, ARCH-SAFETY-03]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [test-driven-development], guards: [arch-check], mcp: [] }
  - id: fix-release-message
    scope_id: fix-release-message
    project: .
    depends_on: []
    module: scripts/scope.mjs
    language: javascript
    security: normal
    scope:
      read: [scripts/scope.mjs, scripts/scope.test.mjs]
      docs: [docs/architecture/state.rules.md, docs/plans/scrutinise-investigate-cross-repo-worktree-git-guard.md]
      write: [scripts/scope.mjs, scripts/scope.test.mjs]
    arch: [ARCH-STATE-09, ARCH-STATE-16]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [test-driven-development], guards: [arch-check], mcp: [] }
---

# Plan: close the gaps the round-1 scrutiny found in the worktree git guard

## Outcome
Under a worktree binding, a mutating git call passes only when the guard can prove it runs in the bound worktree; every shape it cannot prove blocks with a message naming the fix. Read-only git inside `for`/`if`/`time`/`!` passes again. `scope.mjs release` on a worktree git cannot read says so instead of asking for a commit.

## Rolling summary
| Round | Reviewed | Findings | Result |
|---|---|---|---|
| 1 | 868d87f, 0a9f48d, 2a172cb (isolated scrutineer, ESCALATE) | 0 Critical · 5 Warning · 3 Suggestion · 1 UNMET | units fix-guard-chain, fix-release-message; S8 follow-up |

Floor at round 1: `node --test scripts/*.test.mjs` 986/986, doc-size PASS, `arch-check lint` PASS. No disputes. Acceptance `[unit:guard-target-resolution]` "every 1.5 (a)-(k) case exits 2" UNMET (space-form `--git-dir`, non-adjacent `&`/`|`) — left unticked; this round's step 1 proves it.

## Round 1 findings
- **W1 [Warning][Security]** `scripts/pre-guard.mjs:1312-1318` (gitTargets, CHAINED `:1297`) — a `cd` is trusted when only the separator before it is chained. `cd W | true; git commit -m x`, `cd W & true; git commit -m x`, `false && cd W; git commit -m x` pass from outside W. The cwd-only guard blocked them (regression).
- **W2 [Warning][Security]** `:1328-1337` + `:46-49` — `--git-dir X`, `--work-tree X`, `--config-env n=V`, `--attr-source X`, `--super-prefix X` make X read as the subcommand; the raw `mutatesGit` regex misses them too, so the gate is skipped.
- **W3 [Warning][Correctness]** `:1310` + `:1347` — a GIT_RESERVED word returns a `why` the gate blocks on before any git detection: `for f in $(git ls-files); do wc -c "$f"; done`, `if git diff --quiet; then echo clean; fi`, `time git status`, `! git diff --quiet` are blocked with the git-mutation message (regression; names an inapplicable fix, ARCH-STATE-16).
- **W4 [Warning][Security]** `:1321-1324` — the "git mutation behind another command" check never matches (words joined with spaces miss its anchor): `env|command|sudo|nice|timeout|xargs git commit`, `sh -c "git commit"` pass. `builtin cd`, `eval "cd X"`, `source f`, `. f` change directory unseen. Pre-existing.
- **W5 [Warning][Test-coverage]** `scripts/pre-guard-worktree.test.mjs:127-145` — reverting the branch check at `pre-guard.mjs:1370` from target to cwd keeps the suite green.
- **S6 [Suggestion][Correctness]** `scripts/scope.mjs:216-224` — a git failure defaults to dirty and prints "has uncommitted changes — commit them" (impossible fix; no force flag, so never releasable); git's `fatal:` line leaks; the event lacks `sid`.
- **S7 [Suggestion][Architecture]** `docs/architecture/state.rules.md:26` — ARCH-STATE-16 cites `scripts/pre-guard.mjs:1124-1128`, now the WRAPPER/COMMIT constants; the auto-force block is ~`:1104-1108`. `safety-cites.test.mjs` reads only safety.rules.md.
- **S8 [Suggestion][Security]** `:46-49` — `mutatesGit` omits pull, am, tag, update-ref, notes, branch -f/-m/-M, config. Pre-existing; follow-up, not built here.

## Scope Steps (executable core)

### Step 1 — fix-guard-chain (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor · skills test-driven-development · guards arch-check
Depends on: none
- [ ] 1.1 Add failing tests to `scripts/pre-guard-worktree.test.mjs` (reuse its harness) for every case below, from cwd outside W unless stated. → accept: the run log shows each new block case exits 0 and each W3 case exits 2 on the pre-fix code.
  - W1 block: `cd W | true; git commit -m x`, `cd W & true; git commit -m x`, `false && cd W; git commit -m x`, `cd W || x; git commit -m x`, `(cd W); git commit -m x`. Still allowed: `cd W && git commit -m x`, `cd W` newline `git commit -m x`.
  - W2 block: `git --git-dir /O/.git commit -m x`, `git --git-dir /O/.git -C W add f`, `git --work-tree /O add f`, `git --config-env n=V commit`, `git --attr-source X add f`, `git --super-prefix X add f`, an unknown long option before a mutating verb. Still allowed: `git -C W -c k=v --no-pager add f`.
  - W3 allowed under a binding: `for f in $(git ls-files); do wc -c "$f"; done`, `if git diff --quiet; then echo clean; fi`, `time git status`, `! git diff --quiet`. Still blocked: `for f in a; do git commit -m x; done`, `! git commit -m x`, `time git commit -m x`.
  - W4 block: `env A=1 git commit -m x`, `env -i git commit`, `command git commit`, `sudo -u x git commit`, `nice -n 5 git commit`, `timeout 5 git commit`, `xargs git commit`, `sh -c "git commit"`, `bash -lc "git commit"`, `eval "cd /other"; git commit`, `source f; git commit`, `. f; git commit`, and from cwd = W `builtin cd /other && git commit -m x`. Each blocked case's stderr names a fix (`git -C`).
  - W5: sibling worktree AW on the bound branch name, W on branch `other`; `git -C W add f` from cwd AW blocks (/not the bound branch/), and the reverse (W on the bound branch, cwd on `other`) allows.
- [ ] 1.2 W1: in `gitTargets` (`:1312-1318`) a `cd`/`pushd`/`popd` updates the directory only when the separator after it is `&&`, `;`, newline or end, and it is not reached through `||`, `|`, `&` or a subshell. A `cd` reached through `&&` after an earlier command is unproven once a later `;`/newline follows, so the directory becomes unknown and a later mutating git blocks. → accept: 1.1 W1 cases.
- [ ] 1.3 W2: treat `--git-dir`, `--work-tree`, `--namespace`, `--config-env`, `--attr-source`, `--super-prefix`, `--exec-path` as taking the next word; an unknown long option before the subcommand fails closed when the rest names a mutating verb. Run `usesAlternateGitRoot` whenever a binding exists and the command names `git`, not only after `mutatesGit`. → accept: 1.1 W2 cases; re-tick `[unit:guard-target-resolution]` 1.5(a)-(k).
- [ ] 1.4 W3: a GIT_RESERVED `why` blocks only when the command also holds a mutating git call (parsed, `rawMutation`, or in a substitution); otherwise the gate stays silent. → accept: 1.1 W3 cases.
- [ ] 1.5 W4: strip known wrappers (`env` incl. `NAME=V` and flags, `command`, `sudo`, `doas`, `nice`, `timeout`, `xargs`, `nohup`, `stdbuf`) with the existing `WRAPPER_VALUE_SHORT`/`WRAPPER_VALUE_LONG` tables (`:1122-1124`) and analyse the rest as the git call. Do not try to resolve `eval`, `source`, `.`, `builtin cd` or `sh|bash|zsh -c`: when one appears and the text names a mutating git verb, block with the `git -C <W>` message (ARCH-STATE-16, ARCH-SAFETY-03). → accept: 1.1 W4 cases; no read-only command without a mutating verb is newly blocked.
- [ ] 1.6 Last: re-point every `cite: scripts/pre-guard.mjs:<range>` in `docs/architecture/safety.rules.md` and `docs/architecture/state.rules.md` the edit moved, including ARCH-STATE-16 → the auto-force block. Rule text, ids, status and `check:` unchanged. state.rules.md has no cite test: check each of its pre-guard cites by hand. → accept: `node --test scripts/safety-cites.test.mjs` exits 0; `git diff` of both files touches only `cite:` ranges. A collision with another session's uncommitted edit to either file → PARK with a decision; never overwrite it.
- [ ] 1.7 Run `node --test scripts/*.test.mjs` and `node scripts/arch-check.mjs lint`. → accept: exit 0 and PASS.

### Step 2 — fix-release-message (., javascript, normal)
Tooling: implementer implementer · gates code-reviewer · skills test-driven-development · guards arch-check
Depends on: none
- [ ] 2.1 Add failing tests to `scripts/scope.test.mjs`: release with a `worktree_path` that exists but is not a git repo (or a worktree whose `.git` file points nowhere) exits 2, stderr says it is not a readable git worktree and names `git worktree prune`, contains no `fatal:` and no "uncommitted changes"; the scope and binding remain. A dirty worktree still prints "uncommitted changes". The `scope_release_refused` event carries `sid`. → accept: the new cases fail on the pre-fix code.
- [ ] 2.2 In `refuseDirtyWorktree` (`scripts/scope.mjs:216-224`): run git with `stdio: ["ignore", "pipe", "ignore"]`; on git failure print `craftsman: scope release refused: <path> is not a readable git worktree — remove it or run \`git worktree prune\`, then release again.`; keep the dirty message for non-empty output; add `sid: sidOf(input)` (or the file's existing session-id helper) to the event. Still exit 2 in both cases (fail closed). Keep the growth small: `docs/plans/autonomous-e2e-loop.md` unit `workflow-spike` has ~1.7 KB headroom under ARCH-ENGINE-08. → accept: 2.1 passes.
- [ ] 2.3 Run `node --test scripts/scope.test.mjs scripts/arch-check.test.mjs` and `node scripts/arch-check.mjs lint`. → accept: green.

## Sequencing
The steps share no files or cites and can run in parallel; step 1 is the security fix and goes first when run one at a time. Inside step 1 the cite re-pointing (1.6) is last because every code edit shifts the cited lines. All W findings stay in one unit: they edit the same ~50 lines of `gitTargets` and each moves the same cites, so splitting would double the conflicts without separating risk (plan-strategist, round 1).

## Verification background
- gitTargets and the gate: `scripts/pre-guard.mjs:1293-1381`; `mutatesGit` `:46-49`; wrapper tables `:1122-1124`; branch check `:1370`.
- Release refusal: `scripts/scope.mjs:143` (call), `:216-224` (function).
- ARCH-STATE-16 (`state.rules.md:26`): blocks name the fix; unproven parsing fails closed. ARCH-SAFETY-03: fail closed. ARCH-STATE-06: no cwd addressing of workspace projects.

CONSUMERS:
- The stderr prefix `Git mutation blocked outside the active worktree` is asserted in `scripts/pre-guard.test.mjs` and `scripts/pre-guard-worktree.test.mjs`; kept unchanged.
- `scope.mjs release` callers (`commands/_features.md`, `commands/_shared-execution.md:42`, `agents/unit-runner.md`) see only exit codes and stderr; unchanged.

## Risk & rollback
Step 1 tightens the guard; the risk is a new false block on read-only git. 1.4 and the W3 tests bound it, and 1.5 blocks only when a mutating verb is named. Rollback: revert the unit's merge commit. Step 2 only changes a message and stdio; rollback the same way.

## Out of scope
- Resolving `eval`, `source` or `sh -c` bodies — they block when they name a mutation (1.5).

## Follow-ups
- S8 (not registered; ask the owner): `mutatesGit` omits pull, am, tag, update-ref, notes, branch -f/-m/-M and config, so `git -C /other pull` passes under a binding. Options: extend the verb list, or invert to a read-only allowlist (larger design change).
