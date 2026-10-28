---
slug: scrutinise-investigate-cross-repo-worktree-git-guard
goal: The worktree git guard allows only git calls it can prove run in the bound worktree, still lets read-only git through, and a release refusal names a fix that works
level: feature
priority: P1
classification: in-scope # round 2 of an isolated /scrutinise of investigate-cross-repo-worktree-git-guard (round 1: 868d87f, 0a9f48d, 2a172cb; round 2: 0d1e0a7, 226ff0f)
tracker_rows: [TRACKER#fix-guard-chain, TRACKER#fix-release-message, TRACKER#fix-guard-prove-all, TRACKER#fix-release-wording]
guards:
  blast_radius: done
  completeness_sweep: done
  blind_rederivation: skipped(config:never)
coverage:
  contract:      N/A(no exported API or CLI change; pre-guard exit-2 contract and message prefix kept)
  data:          N/A(no persistence; binding and scope files unchanged)
  config:        N/A(no config key or flag)
  security:      1.2 (a named git mutation passes only when every git call is proven in W), 1.3 (alternate git roots incl. GIT_COMMON_DIR), 1.4 (doc guard `clean` fails closed on dynamic words)
  tests:         1.1, 1.6, 2.1
  observability: N/A(no new event; existing git_guard_blocked kept)
  interface:     1.2 (block message names `git -C <W>`), 1.5 (message for a cd after shell syntax), 2.1 (release message names a fix that works)
  docs:          1.6 (cite ranges in safety.rules.md and state.rules.md)
  rollback:      each unit is one merge commit; revert it
units:
  - id: fix-guard-prove-all
    scope_id: fix-guard-prove-all
    project: .
    depends_on: []
    module: scripts/pre-guard.mjs
    language: javascript
    security: high
    scope:
      read: []   # pre-guard.mjs is 94 KB: grep -n gitTargets, mutatesGit, usesAlternateGitRoot, NAMES_MUTATION, gitThenClean, REMOVAL_WORD, `const bare` first, then read by range (ARCH-ENGINE-08)
      docs: [docs/architecture/state.rules.md, docs/architecture/safety.rules.md, docs/architecture/docs.rules.md, docs/plans/scrutinise-investigate-cross-repo-worktree-git-guard.md]
      write: [scripts/pre-guard.mjs, scripts/pre-guard-worktree.test.mjs, docs/architecture/safety.rules.md, docs/architecture/state.rules.md, docs/plans/autonomous-e2e-loop.md]   # rules docs: `cite:` line ranges only; e2e plan: run-manifest-land scope trim only (task 1.0, owner decision 2026-10-28)
    arch: [ARCH-STATE-06, ARCH-STATE-16, ARCH-SAFETY-03, ARCH-DOCS-07]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [test-driven-development], guards: [arch-check], mcp: [] }
  - id: fix-release-wording
    scope_id: fix-release-wording
    project: .
    depends_on: []
    module: scripts/scope.mjs
    language: javascript
    security: normal
    scope:
      read: [scripts/scope.mjs, scripts/scope.test.mjs]
      docs: [docs/architecture/state.rules.md, docs/plans/scrutinise-investigate-cross-repo-worktree-git-guard.md]
      write: [scripts/scope.mjs, scripts/scope.test.mjs]
    arch: [ARCH-STATE-16]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [arch-check], mcp: [] }
---

# Plan: close the gaps the scrutiny rounds found in the worktree git guard

## Outcome
Under a worktree binding, a command that names a git mutation passes only when the guard proves every git call in it runs in the bound worktree; anything it cannot prove blocks with a message naming `git -C <W>`. Read-only git inside `for`/`if`/`time`/`!` passes. The doc-deletion guard refuses `git clean` it cannot prove safe. `scope.mjs release` on an unreadable worktree names a fix that works.

## Rolling summary
| Round | Reviewed | Findings | Result |
|---|---|---|---|
| 1 | 868d87f, 0a9f48d, 2a172cb | 0 Critical · 5 Warning · 3 Suggestion · 1 UNMET | fix-guard-chain (0d1e0a7), fix-release-message (226ff0f) merged |
| 2 | 0d1e0a7, 226ff0f | 1 Critical · 4 Warning · 3 Suggestion · 1 UNMET | units fix-guard-prove-all, fix-release-wording |

Floor at round 2 (main 226ff0f): `node --test scripts/*.test.mjs` 999/999, doc-size PASS, `arch-check lint` PASS. No disputes. Root reproduced C1, W3, W4 and W5 with a live probe (exit 0 under a binding, cwd = B's main checkout). Acceptance `[unit:guard-target-resolution]` 1.5(a)-(k) stays UNMET: the subshell class leaks.

## Round 2 findings
- **C1 [Critical][Security]** `scripts/pre-guard.mjs:1387` — when `tokenize` fails (`(`, `)`, `;;`), `gitTargets` returns `{why, unparsed:true}`; the gate ignores that `why` and falls back to raw `mutatesGit`, whose anchor needs `git` at line start or after `;&|`. Exit 0: `(git -C A commit -m x)`, `( git -C A commit -m x )`, `true && (git -C A commit -m x)`, `case a in a) git -C A commit -m x;; esac`, `f() { git -C A commit -m x; }; f`. ARCH-SAFETY-03, ARCH-STATE-16.
- **W2 [Warning][Security]** `:342-345` (2cc1a84, round-1 W3 fix) — `gitThenClean` counts `clean` only after a literal `git` in the same segment, so the doc-deletion guard passes `G=git; $G clean -fdx` and `x=clean; git $x -fdx` (exit 2 before 2cc1a84). ARCH-STATE-16 ("a removal word the parser cannot prove safe stays refused"), ARCH-DOCS-07.
- **W3 [Warning][Security]** `:1383` — the gate keys on raw `/\bgit\b/`; `g''it -C A commit -m x` exits 0. The doc guard already de-quotes (`bare`, `:482`). ARCH-SAFETY-03.
- **W4 [Warning][Security]** `:1351-1354` — the `gitAt < 0` fallback joins words with spaces, so `mutatesGit`'s anchor never matches: `setsid git -C A commit`, `flock /tmp/l git -C A commit`, `env -S 'git -C A commit'`, `G=git; $G -C A commit`, `$(command -v git) -C A commit` exit 0. ARCH-SAFETY-03, ARCH-STATE-16.
- **W5 [Warning][Security]** `:51-53` — `usesAlternateGitRoot` misses `GIT_COMMON_DIR`, `GIT_OBJECT_DIRECTORY`, `GIT_INDEX_FILE`: `GIT_COMMON_DIR=A/.git git -C W commit -m x` exits 0 and writes A's refs and objects.
- **S6 [Suggestion][Correctness]** `:1319,1330` — `reserved` never resets: `if true; then :; fi; cd W && git add f` blocks (fail closed, misleading message).
- **S7 [Suggestion][Correctness]** `scripts/scope.mjs:224` — "remove it or run `git worktree prune`": prune alone never removes the directory, and `refuseDirtyWorktree` returns early only when the directory is gone (`:218`). ARCH-STATE-16.
- **S8 [Suggestion][Test-coverage]** `scripts/pre-guard-worktree.test.mjs:101-128` — case (d) is tested only as `(cd W && git add f)`, which the raw regex catches; no C1/W3/W4/W5 shapes, no doc-guard `clean` cases.

## Scope Steps (executable core)

### Step 1 — fix-guard-prove-all (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor · skills test-driven-development · guards arch-check
Depends on: none
Design (two rounds of deny-list leaks): invert the burden. Once a command names a git mutation, it passes only when everything in it is proven; anything unproven blocks.
- [ ] 1.0 Owner decision (2026-10-28, after the unit BLOCKED on a red main): `scripts/arch-check.test.mjs` "every step of docs/plans/autonomous-e2e-loop.md fits the default budget" fails — unit `run-manifest-land` needs 123,047 bytes > 122,880 (ARCH-ENGINE-08) after another plan's commit 2982d0f grew `scripts/repo-exec.mjs`. In `docs/plans/autonomous-e2e-loop.md`, trim only `run-manifest-land`'s scope (the unit already shipped): measure it with the test's own extraction (`arch-check.test.mjs:233-247`, `checkUnitContext`), then make the smallest change that fits — e.g. `read: []` with its existing YAML comment extended to say `repo-exec.mjs` is read by range. Touch nothing else in that plan. → accept: `node --test scripts/arch-check.test.mjs` exits 0 and `node scripts/arch-check.mjs lint` PASS; `git diff` of that plan touches only `run-manifest-land`'s scope lines.
- [ ] 1.1 Add failing tests to `scripts/pre-guard-worktree.test.mjs` (reuse its harness; A is a separate repo, binding on B's worktree W, cwd = B's main checkout unless stated). → accept: the run log shows each block case exits 0 on current main.
  - Block (C1): `(git -C A commit -m x)`, `( git -C A commit -m x )`, `true && (git -C A commit -m x)`, `case a in a) git -C A commit -m x;; esac`, `f() { git -C A commit -m x; }; f`.
  - Block (W3/W4): `g''it -C A commit -m x`, `"git" -C A commit -m x`, `setsid git -C A commit -m x`, `flock /tmp/l git -C A commit -m x`, `env -S 'git -C A commit -m x'`, `G=git; $G -C A commit -m x`, `$(command -v git) -C A commit -m x`.
  - Block (W5): `GIT_COMMON_DIR=A/.git git -C W commit -m x`, `GIT_OBJECT_DIRECTORY=A/.git/objects git -C W commit -m x`, `GIT_INDEX_FILE=/tmp/i git -C W add f`.
  - Doc guard (W2), cwd a repo with `docs/`, no binding needed: `G=git; $G clean -fdx` and `x=clean; git $x -fdx` exit 2; `echo clean` and `git status; echo clean` exit 0.
  - Still allowed under the binding: `git -C W add f`, `cd W && git commit -m x`, `(cd W && git status)`, `for f in $(git ls-files); do wc -c "$f"; done`, `if git diff --quiet; then echo clean; fi`, `time git status`, `! git diff --quiet`, `if true; then :; fi; cd W && git add f` (S6).
- [ ] 1.2 C1/W3/W4: in the worktree gate (`:1383-1392`), compute `named` = `NAMES_MUTATION` (`:1309`) tested on the raw text OR the de-quoted text (strip `'`, `"`, `\`, as `bare` does at `:482`). Engage the gate when `named` (not only on raw `/\bgit\b/`). When `named`, block unless ALL hold: `tokenize` succeeded (no `unparsed`); every git call was found by `gitTargets` and resolved to W; no unresolved construct appeared — a dynamic command word (`$`, backtick, `$(`), a non-git command word followed later by a `git` word (unknown wrapper such as `setsid`/`flock`), `env -S`/`--split-string`, `sh|bash|zsh -c`, `eval`, `source`, `.`, or any `GIT_[A-Z_]*=` assignment. Block with the existing `git -C <W>` message. Not `named` → the gate stays silent. Remove the dead joined-words fallback at `:1351-1354`. → accept: 1.1 C1/W3/W4 cases block; every allowed control passes.
- [ ] 1.3 W5: extend `usesAlternateGitRoot` (`:51-53`) with `GIT_COMMON_DIR`, `GIT_OBJECT_DIRECTORY` and `GIT_INDEX_FILE` (1.2's `GIT_[A-Z_]*=` rule also covers them). → accept: 1.1 W5 cases block.
- [ ] 1.4 W2: in the doc guard (`:342-345`), exclude `clean` from the removal gate only when the whole command tokenizes and no word is dynamic (`$`, backtick); otherwise use the old `REMOVAL_WORD` test. → accept: 1.1 W2 cases.
- [ ] 1.5 S6: reset `reserved` (`:1319,1330`) once the matching `fi`/`done`/`esac`/`}` closes at depth 0, so a later `cd W && git …` resolves. → accept: the S6 control passes.
- [ ] 1.6 Last: re-point every `cite: scripts/pre-guard.mjs:<range>` in `docs/architecture/safety.rules.md` and `docs/architecture/state.rules.md` that the edit moved (ARCH-STATE-16 → the auto-force block). Rule text, ids, status and `check:` unchanged; check state.rules.md's pre-guard cites by hand (no test reads them). Run `node --test scripts/*.test.mjs` and `node scripts/arch-check.mjs lint`. → accept: exit 0 and PASS; `git diff` of both rules docs touches only `cite:` ranges. A collision with another session's edit to either file → PARK with a decision; never overwrite it.

### Step 2 — fix-release-wording (., javascript, normal)
Tooling: implementer implementer · gates code-reviewer · guards arch-check
Depends on: none
- [ ] 2.1 In `refuseDirtyWorktree` (`scripts/scope.mjs:224`), change the unreadable-worktree message to `craftsman: scope release refused: <path> is not a readable git worktree — remove it (then \`git worktree prune\`), then release again.` Update the matching assertion in `scripts/scope.test.mjs`, which must still require `git worktree prune` and no `fatal:`. Keep `scope.mjs` growth to a few bytes (`docs/plans/autonomous-e2e-loop.md` `workflow-spike` headroom, ARCH-ENGINE-08). Run `node --test scripts/scope.test.mjs scripts/arch-check.test.mjs` and `node scripts/arch-check.mjs lint`. → accept: green.

## Sequencing
Independent: no shared files or cites. Step 1 is the security fix and goes first when run one at a time; its cite re-pointing (1.6) is last because every code edit moves the cited lines.

## Verification background
- Worktree gate: `scripts/pre-guard.mjs:1383-1392`; `gitTargets` `:1312`; `NAMES_MUTATION` `:1309`; `mutatesGit` `:46`; `usesAlternateGitRoot` `:51-53`; doc guard `clean` gate `:342-345`; `bare` `:482`.
- Release refusal: `scripts/scope.mjs:216-224`.
- ARCH-STATE-16 (`state.rules.md:26`): blocks name the fix; a removal word the parser cannot prove safe stays refused. ARCH-SAFETY-03: fail closed. ARCH-DOCS-07 (`docs.rules.md:17`): deleting a guarded doc path needs the grant.

CONSUMERS:
- The stderr prefix `Git mutation blocked outside the active worktree` is asserted in `scripts/pre-guard.test.mjs` and `scripts/pre-guard-worktree.test.mjs`; kept unchanged.
- `scope.mjs release` callers (`commands/_features.md`, `commands/_shared-execution.md`, `agents/unit-runner.md`) see only exit codes and stderr; unchanged.

## Risk & rollback
Step 1 tightens the guard: a command naming a mutating verb now needs a full proof. The risk is new false blocks on unusual but safe shapes; the allowed controls in 1.1 bound it, and the block message names the working form (`git -C <W>`). Rollback: revert the unit's merge commit.

## Out of scope
- Resolving `eval`, `source`, `sh -c` or function bodies: they block when a mutation is named.

## Follow-ups
- Not registered; ask the owner: `mutatesGit`/`NAMES_MUTATION` omit pull, am, tag, update-ref, notes, branch -f/-m/-M and config, so `git -C A pull` and `git -C A branch -f main HEAD` pass under a binding. Options: extend the verb list, or invert to a read-only allowlist.
