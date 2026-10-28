---
slug: scrutinise-investigate-cross-repo-worktree-git-guard
goal: The worktree git guard allows only git calls it can prove run in the bound worktree, still lets read-only git through, and a release refusal names a fix that works
level: feature
priority: P1
classification: in-scope # round 3 of an isolated /scrutinise of investigate-cross-repo-worktree-git-guard (round 1: 868d87f, 0a9f48d, 2a172cb; round 2: 0d1e0a7, 226ff0f; round 3: db9bff5, c50c033)
tracker_rows: [TRACKER#fix-guard-chain, TRACKER#fix-release-message, TRACKER#fix-guard-prove-all, TRACKER#fix-release-wording, TRACKER#guard-allowlist, TRACKER#release-wording-2]
guards:
  blast_radius: done
  completeness_sweep: done
  blind_rederivation: skipped(config:never)
coverage:
  contract:      N/A(no exported API or CLI change; pre-guard exit-2 contract and message prefix kept)
  data:          N/A(no persistence; binding and scope files unchanged)
  config:        N/A(no config key or flag)
  security:      1.2 (read-only allowlist; every other git call must be proven in W), 1.3 (unprovable constructs block), 1.4 (doc guard glob-spelled git)
  tests:         1.1, 1.5, 2.1
  observability: N/A(no new event; existing git_guard_blocked kept)
  interface:     1.2 (block message names `git -C <W>`), 2.1 (release message wording)
  docs:          1.5 (cite ranges in safety.rules.md and state.rules.md)
  rollback:      each unit is one merge commit; revert it
units:
  - id: guard-allowlist
    scope_id: guard-allowlist
    project: .
    depends_on: []
    module: scripts/pre-guard.mjs
    language: javascript
    security: high
    scope:
      read: []   # pre-guard.mjs is ~95 KB: grep -n gitTargets, MUTATING_VERBS, NAMES_MUTATION, namesMutation, unresolvedConstruct, usesAlternateGitRoot, plainWords, removalGate first, then read by range (ARCH-ENGINE-08)
      docs: [docs/architecture/state.rules.md, docs/architecture/safety.rules.md, docs/architecture/docs.rules.md, docs/plans/scrutinise-investigate-cross-repo-worktree-git-guard.md]
      write: [scripts/pre-guard.mjs, scripts/pre-guard-worktree.test.mjs, docs/architecture/safety.rules.md, docs/architecture/state.rules.md]   # rules docs: `cite:` line ranges only
    arch: [ARCH-STATE-06, ARCH-STATE-16, ARCH-SAFETY-03, ARCH-DOCS-07]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [test-driven-development], guards: [arch-check], mcp: [] }
  - id: release-wording-2
    scope_id: release-wording-2
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
Under a worktree binding, read-only git runs anywhere; every other git call passes only when the guard proves it runs in the bound worktree, and anything it cannot prove blocks with a message naming `git -C <W>`. The doc-deletion guard refuses `git clean` it cannot prove safe, glob-spelled `git` included. `scope.mjs release` on an unreadable worktree names a fix that works.

## Rolling summary
| Round | Reviewed | Findings | Result |
|---|---|---|---|
| 1 | 868d87f, 0a9f48d, 2a172cb | 0 Critical · 5 Warning · 3 Suggestion · 1 UNMET | fix-guard-chain (0d1e0a7), fix-release-message (226ff0f) merged |
| 2 | 0d1e0a7, 226ff0f | 1 Critical · 4 Warning · 3 Suggestion · 1 UNMET | fix-guard-prove-all (db9bff5), fix-release-wording (c50c033) merged |
| 3 | db9bff5, c50c033 | 0 Critical · 5 Warning · 3 Suggestion · 0 UNMET | units guard-allowlist, release-wording-2 |

Floor at round 3 (main db9bff5): `node --test scripts/*.test.mjs` 1228/1228, doc-size PASS, `arch-check lint` PASS. No disputes. Root reproduced W1, W3 and W4 (exit 0 under a binding, cwd = B's main checkout). All acceptance criteria ticked; `[unit:guard-target-resolution]` 1.5(a)-(k) MET (`pre-guard-worktree.test.mjs:87-142`).

Owner decision (2026-10-28, "Allowlist round 4"): every round found new spellings of a deny-list, so the default flips — git calls are allowed by a read-only allowlist, everything else needs proof.

## Round 3 findings
- **W1 [Warning][Security]** `scripts/pre-guard.mjs:1360-1369,1380-1390` — a `cd` inside a `function NAME { … }` body is unseen (`function` shifted as reserved, `{` not words[0], `}` drops depth to -1 and clears `reserved`): from cwd W `function f { cd A; }; f; git commit -m x` exits 0; real bash commits into A.
- **W2 [Warning][Security]** `:1385-1388` — a relative `cd` resolves against the cwd, ignoring CDPATH: `CDPATH=A cd .worktrees/w1 && git commit -m x` and `export CDPATH=A; cd …` exit 0; an inherited CDPATH misleads with nothing in the text.
- **W3 [Warning][Security]** `:1333` (unresolvedConstruct), `:51` (usesAlternateGitRoot) — GIT_DIR caught only as `NAME=value`: `for GIT_DIR in A/.git; do export GIT_DIR; git -C W commit -m x; done`, `set -a; printf -v GIT_DIR %s A/.git; git -C W commit -m x`, `read GIT_DIR <<< A/.git; export GIT_DIR; git -C W commit -m x` exit 0.
- **W4 [Warning][Security]** `:1408` (`-c` value skipped), `:1320-1321` (verb list) — `git -C A -c alias.ci=commit ci -m x` and `git -C W -c core.worktree=A add f` exit 0; `git -C A pull`, `tag v1`, `update-ref refs/heads/main HEAD~1`, `branch -f main HEAD`, `am x.patch` exit 0 (verbs missing; pre-existing).
- **W5 [Warning][Security]** `:1323` (namesMutation), `:346-347` (plainWords/removalGate) — glob-spelled git hides from both guards: `/usr/bin/g[i]t -C A commit -m x`, `/usr/bin/gi? …` exit 0; doc guard `/usr/bin/g[i]t clean -fdx` exits 0. ARCH-DOCS-07, ARCH-STATE-16.
- **S6 [Suggestion][Security]** `:1393-1395` — command strings run by non-shell runners pass: `script -qc '…' /dev/null`, `flock /tmp/l -c '…'`, `fish -c`, `su -c`, `watch -n1 '…'` (pre-existing).
- **S7 [Suggestion][Test-coverage]** `scripts/pre-guard-worktree.test.mjs:87-113` — block cases assert exit status only.
- **S8 [Suggestion][Correctness]** `scripts/scope.mjs:224` — "remove it (then `git worktree prune`), then release again" reads awkwardly.

## Scope Steps (executable core)

### Step 1 — guard-allowlist (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor · skills test-driven-development · guards arch-check
Depends on: none
- [ ] 1.1 Add failing tests to `scripts/pre-guard-worktree.test.mjs` (existing harness; A a separate repo, binding on B's worktree W, cwd = B's main checkout unless stated). Every block case asserts exit 2 AND stderr `/Git mutation blocked/`; add that stderr assertion to the existing block-case table too (S7). → accept: the run log shows each new block case exits 0 on current main.
  - Block: `function f { cd A; }; f; git commit -m x` (cwd W); `CDPATH=A cd .worktrees/w1 && git commit -m x`; `export CDPATH=A; cd .worktrees/w1 && git commit -m x`; `for GIT_DIR in A/.git; do export GIT_DIR; git -C W commit -m x; done`; `read GIT_DIR <<< A/.git; export GIT_DIR; git -C W commit -m x`; `printf -v GIT_DIR %s A/.git; git -C W commit -m x`; `git -C A -c alias.ci=commit ci -m x`; `git -C W -c core.worktree=A add f`; `git -C A pull`; `git -C A tag v1`; `git -C A update-ref refs/heads/main HEAD~1`; `git -C A branch -f main HEAD`; `git -C A am x.patch`; `git -C A ci -m x` (unknown subcommand); `/usr/bin/g[i]t -C A commit -m x`; `/usr/bin/gi? -C A commit -m x`; `script -qc 'git -C A commit -m x' /dev/null`; `flock /tmp/l -c 'git -C A commit -m x'`; `fish -c 'git -C A commit -m x'`; `su -c 'git -C A commit -m x'`; `watch -n1 'git -C A commit -m x'`.
  - Doc guard (cwd a repo with `docs/`, no binding): `/usr/bin/g[i]t clean -fdx` and `/usr/bin/gi? clean -fdx` exit 2; `echo clean` and `git status; echo clean` exit 0.
  - Still exit 0 under the binding: `git -C W add f`, `cd W && git commit -m x`, `(cd W && git status)`, `git status`, `git log --oneline -1`, `git -C A status`, `git -C A log`, `for f in $(git ls-files); do wc -c "$f"; done`, `if git diff --quiet; then echo clean; fi`, `time git status`, `! git diff --quiet`, `echo clean`, `git branch --show-current`, `git worktree list`.
- [ ] 1.2 Allowlist: under a binding, treat as a git call every command word whose de-quoted basename is `git`. Find its subcommand (skip global options; `-C`, `-c`, `--git-dir`, `--work-tree`, `--namespace`, `--config-env`, `--attr-source`, `--super-prefix`, `--exec-path` take a value). A call needs no proof only when the subcommand is on a READ-ONLY ALLOWLIST — status, diff, log, show, ls-files, rev-parse, branch (no args, or only `--show-current`/`--list`/`-a`/`-r`/`-v`), remote (no args or `-v`), config (`--get*`/`--list`), cat-file, grep, blame, describe, shortlog, for-each-ref, ls-tree, ls-remote, merge-base, worktree list, stash list, reflog (no args or `show`), help, version — AND it carries no `-c` whose key is `alias.*`, `core.worktree`, `core.bare` or `include*`. Every other git call (unknown subcommands and aliases included) must resolve to W through the existing per-call `cd`/`-C` proof, else block with the existing `git -C <W>` message. Replace the `MUTATING_VERBS`/`NAMES_MUTATION` deny-list decision in the worktree gate with this. → accept: 1.1 W4 cases block; read-only controls pass.
- [ ] 1.3 Unprovable constructs: when the command holds any git call that is not allowlisted, or any command word that could expand to git (contains `*`, `?`, `[`, `{`, `$` or a backtick), block if it also holds any of: a tokenize failure; a function definition (`function` keyword or `NAME()`); `CDPATH` anywhere in the text, or `process.env.CDPATH` set with a relative `cd`/`pushd`; any word matching `^GIT_[A-Z_]+` (assignment, `export`, `read`, `for`, `printf -v`, `declare`, bare); `eval`, `source`, `.`, `builtin`; a command-string runner (`sh`, `bash`, `zsh`, `dash`, `ksh`, `fish`, `tcsh`, `csh`, `ash`, `script`, `su`, `runuser`, `watch`, `flock … -c`, `env -S`/`--split-string`, `xargs`). A glob- or `$`-spelled command word together with a mutating-looking text blocks on its own. → accept: 1.1 W1, W2, W3, W5 and S6 cases block; every control passes.
- [ ] 1.4 Doc guard: `plainWords` (`:346-347`) also treats a command word containing `*`, `?`, `[`, `{` or `~` as dynamic, so a glob-spelled `git … clean` keeps the old `REMOVAL_WORD` test. → accept: 1.1 doc-guard cases.
- [ ] 1.5 Last: re-point every `cite: scripts/pre-guard.mjs:<range>` in `docs/architecture/safety.rules.md` and `docs/architecture/state.rules.md` that the edit moved; rule text, ids, status and `check:` unchanged; check state.rules.md's pre-guard cites by hand. Run `node --test scripts/*.test.mjs` (all `pre-guard*.test.mjs` suites must stay green: read-only git elsewhere must not regress) and `node scripts/arch-check.mjs lint`. → accept: exit 0 and PASS; `git diff` of both rules docs touches only `cite:` ranges. A collision with another session's edit to either file → PARK with a decision; never overwrite it.

### Step 2 — release-wording-2 (., javascript, normal)
Tooling: implementer implementer · gates code-reviewer · guards arch-check
Depends on: none
- [ ] 2.1 In `refuseDirtyWorktree` (`scripts/scope.mjs:224`) change the unreadable-worktree message to `craftsman: scope release refused: <path> is not a readable git worktree — remove it, run \`git worktree prune\`, and release again.`; update the matching `scripts/scope.test.mjs` assertion (still no `fatal:`). Keep `scope.mjs` growth to a few bytes (ARCH-ENGINE-08 headroom). Run `node --test scripts/scope.test.mjs scripts/arch-check.test.mjs` and `node scripts/arch-check.mjs lint`. → accept: green.

## Sequencing
Independent: no shared files or cites. Step 1 is the security fix and goes first when run one at a time; its cite re-pointing (1.5) is last.

## Verification background
- Worktree gate and `gitTargets`: `scripts/pre-guard.mjs:1344-1455`; `namesMutation` `:1323`; `unresolvedConstruct` `:1333`; `usesAlternateGitRoot` `:51`; doc guard `plainWords`/`removalGate` `:346-347`.
- Release refusal: `scripts/scope.mjs:216-224`.
- ARCH-STATE-16 (`state.rules.md:26`): blocks name the fix; parsing that cannot be proven fails closed. ARCH-SAFETY-03: fail closed. ARCH-DOCS-07 (`docs.rules.md:17`): deleting a guarded doc path needs the grant. ARCH-SAFETY-01: interpreters are the sandbox's job.

CONSUMERS:
- The stderr prefix `Git mutation blocked outside the active worktree` is asserted in `scripts/pre-guard.test.mjs` and `scripts/pre-guard-worktree.test.mjs`; kept unchanged.
- `scope.mjs release` callers (`commands/_features.md`, `commands/_shared-execution.md`, `agents/unit-runner.md`) see only exit codes and stderr; unchanged.

## Risk & rollback
Step 1 flips the guard's default; the risk is a false block on a legitimate non-allowlisted git call outside W (e.g. `git -C <other> fetch`). That is intended under a binding — the message names `git -C <W>` — and the allowlist covers the read-only calls units use. Rollback: revert the unit's merge commit.

## Out of scope
- Interpreters (`node -e`, `python -c`), renamed git binaries and gitconfig aliases are textually undetectable; ARCH-SAFETY-01 leaves them to the sandbox.

## Follow-ups
- Not registered: verify the sandbox blocks writes into a sibling repo from an interpreter (ARCH-SAFETY-01).
- The guard's own `git rev-parse` runs in the hook's environment, not the command's (exported `GIT_*`/`GIT_CONFIG_*`); covered by 1.3's `GIT_*` rule for in-command exports only.
