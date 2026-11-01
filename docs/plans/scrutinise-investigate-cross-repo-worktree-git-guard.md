---
slug: scrutinise-investigate-cross-repo-worktree-git-guard
goal: The worktree git guard allows only git calls it can prove run in the bound worktree, still lets read-only git through, and a release refusal names a fix that works
level: feature
priority: P1
classification: in-scope # round 3 of an isolated /scrutinise of investigate-cross-repo-worktree-git-guard (round 1: 868d87f, 0a9f48d, 2a172cb; round 2: 0d1e0a7, 226ff0f; round 3: db9bff5, c50c033)
tracker_rows: [TRACKER#fix-guard-chain, TRACKER#fix-release-message, TRACKER#fix-guard-prove-all, TRACKER#fix-release-wording, TRACKER#guard-allowlist, TRACKER#release-wording-2, TRACKER#followup-guard-redesign, TRACKER#followup-release-message, TRACKER#followup-sandbox-verify, TRACKER#doc-guard-glob-clean, TRACKER#doc-guard-any-glob, TRACKER#doc-guard-structural, TRACKER#doc-guard-shell-quoting, TRACKER#doc-guard-wrapper-config, TRACKER#doc-guard-nul-quote]
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
  - id: doc-guard-glob-clean
    scope_id: doc-guard-glob-clean
    project: .
    depends_on: []
    module: scripts/pre-guard.mjs
    language: javascript
    security: high
    scope:
      read: []   # pre-guard.mjs ~95 KB: grep -n gitThenClean, removalGate, REMOVAL_WORD, plainWords, globWord, leadOf first, then read by range (ARCH-ENGINE-08)
      docs: [docs/architecture/state.rules.md, docs/architecture/docs.rules.md, docs/architecture/safety.rules.md, docs/plans/scrutinise-investigate-cross-repo-worktree-git-guard.md]
      write: [scripts/pre-guard.mjs, scripts/pre-guard-docclean.test.mjs, docs/architecture/safety.rules.md, docs/architecture/state.rules.md]   # rules docs: `cite:` line ranges only
    arch: [ARCH-STATE-16, ARCH-DOCS-07, ARCH-SAFETY-03]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [test-driven-development], guards: [arch-check], mcp: [] }
  - id: doc-guard-any-glob
    scope_id: doc-guard-any-glob
    project: .
    depends_on: []
    module: scripts/pre-guard.mjs
    language: javascript
    security: high
    scope:
      read: []   # pre-guard.mjs ~95 KB: grep -n plainWords, leadWord, removalGate, gitThenClean, REMOVAL_WORD first, then read by range (ARCH-ENGINE-08)
      docs: [docs/architecture/state.rules.md, docs/architecture/docs.rules.md, docs/architecture/safety.rules.md, docs/plans/scrutinise-investigate-cross-repo-worktree-git-guard.md]
      write: [scripts/pre-guard.mjs, scripts/pre-guard-docclean.test.mjs, docs/architecture/safety.rules.md, docs/architecture/state.rules.md]   # rules docs: `cite:` line ranges only
    arch: [ARCH-STATE-16, ARCH-DOCS-07, ARCH-SAFETY-03]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [test-driven-development], guards: [arch-check], mcp: [] }
  - id: doc-guard-structural
    scope_id: doc-guard-structural
    project: .
    depends_on: []
    module: scripts/pre-guard.mjs
    language: javascript
    security: high
    scope:
      read: []   # pre-guard.mjs ~95 KB: grep -n globSpellsClean, removalGate, plainWords, GIT_CONFIG, config-env first, then read by range (ARCH-ENGINE-08)
      docs: [docs/architecture/state.rules.md, docs/architecture/docs.rules.md, docs/architecture/safety.rules.md, docs/plans/scrutinise-investigate-cross-repo-worktree-git-guard.md]
      write: [scripts/pre-guard.mjs, scripts/pre-guard-docclean.test.mjs, docs/architecture/safety.rules.md, docs/architecture/state.rules.md]   # rules docs: `cite:` line ranges only
    arch: [ARCH-STATE-16, ARCH-DOCS-07, ARCH-SAFETY-03]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [test-driven-development], guards: [arch-check], mcp: [] }
  - id: doc-guard-shell-quoting
    scope_id: doc-guard-shell-quoting
    project: .
    depends_on: []
    module: scripts/pre-guard.mjs
    language: javascript
    security: high
    scope:
      read: []   # pre-guard.mjs ~95 KB: grep -n tokenize, globbedGit, configIndirectGit, CONFIG_INDIRECT, globMayBeGit, GIT_BUILTINS, gitSub first, then read by range (ARCH-ENGINE-08)
      docs: [docs/architecture/state.rules.md, docs/architecture/docs.rules.md, docs/architecture/safety.rules.md, docs/plans/scrutinise-investigate-cross-repo-worktree-git-guard.md]
      write: [scripts/pre-guard.mjs, scripts/pre-guard-docclean.test.mjs, docs/architecture/safety.rules.md, docs/architecture/state.rules.md]   # rules docs: `cite:` line ranges only
    arch: [ARCH-STATE-16, ARCH-DOCS-07, ARCH-SAFETY-03]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [test-driven-development], guards: [arch-check], mcp: [] }
  - id: doc-guard-wrapper-config
    scope_id: doc-guard-wrapper-config
    project: .
    depends_on: []
    module: scripts/pre-guard.mjs
    language: javascript
    security: high
    scope:
      read: []   # pre-guard.mjs ~95 KB: grep -n configIndirectIn, configIndirectGit, cmdIndex, gitWordAt, GIT_BUILTINS, ansiCDecode, decodeAnsiC, tokenize first, then read by range (ARCH-ENGINE-08)
      docs: [docs/architecture/state.rules.md, docs/architecture/docs.rules.md, docs/architecture/safety.rules.md, docs/plans/scrutinise-investigate-cross-repo-worktree-git-guard.md]
      write: [scripts/pre-guard.mjs, scripts/pre-guard-docclean.test.mjs, docs/architecture/safety.rules.md, docs/architecture/state.rules.md]   # rules docs: `cite:` line ranges only
    arch: [ARCH-STATE-16, ARCH-DOCS-07, ARCH-SAFETY-03]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [test-driven-development], guards: [arch-check], mcp: [] }
  - id: doc-guard-nul-quote
    scope_id: doc-guard-nul-quote
    project: .
    depends_on: []
    module: scripts/pre-guard.mjs
    language: javascript
    security: high
    scope:
      read: []   # pre-guard.mjs ~95 KB: grep -n ansiCDecode, decodeAnsiC, tokenize, bare, gitSub, super-prefix, CONFIG_INDIRECT, configIndirectIn first, then read by range (ARCH-ENGINE-08)
      docs: [docs/architecture/state.rules.md, docs/architecture/docs.rules.md, docs/architecture/safety.rules.md, docs/plans/scrutinise-investigate-cross-repo-worktree-git-guard.md]
      write: [scripts/pre-guard.mjs, scripts/pre-guard-docclean.test.mjs, docs/architecture/safety.rules.md, docs/architecture/state.rules.md]   # rules docs: `cite:` line ranges only
    arch: [ARCH-STATE-16, ARCH-DOCS-07, ARCH-SAFETY-03]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [test-driven-development], guards: [arch-check], mcp: [] }
---

# Plan: close the gaps the scrutiny rounds found in the worktree git guard

## Outcome
Under a worktree binding, read-only git runs anywhere; every other git call passes only when the guard proves it runs in the bound worktree, and anything it cannot prove blocks with a message naming `git -C <W>`. The doc-deletion guard refuses `git clean` it cannot prove safe, glob-spelled `git` included. `scope.mjs release` on an unreadable worktree names a fix that works.

## Rolling summary
| Round | Reviewed | Findings | Result |
|---|---|---|---|
| 1 | 868d87f, 0a9f48d, 2a172cb | 0 Critical · 5 Warning · 3 Suggestion · 1 UNMET | fix-guard-chain (0d1e0a7), fix-release-message (226ff0f) merged |
| 2 | 0d1e0a7, 226ff0f | 1 Critical · 4 Warning · 3 Suggestion · 1 UNMET | fix-guard-prove-all (db9bff5), fix-release-wording (c50c033) merged |
| 3 | db9bff5, c50c033 | 0 Critical · 5 Warning · 3 Suggestion · 0 UNMET | guard-allowlist (d9e257a), release-wording-2 (4147f95) merged |
| 4 | d9e257a, 4147f95 | 1 Critical · 9 Warning · 2 Suggestion | guard-allowlist REVERTED (aa8f34d, owner decision 2026-10-28); release-wording-2 kept; follow-ups F1-F3 |
| 5 | cb2cdf8..2112630 (doc-guard-glob-clean) | 0 Critical · 3 Warning · 1 Suggestion · 0 UNMET | doc-guard-any-glob (72a9faf) merged |
| 6 | 6e97536..72a9faf (doc-guard-any-glob) | 0 Critical · 2 Warning · 1 Suggestion · 0 UNMET | doc-guard-structural (1d795e1) merged |
| 7 | 1e44f9e..1d795e1 (doc-guard-structural) | 3 Critical · 1 Warning · 4 Suggestion · 0 UNMET | doc-guard-shell-quoting (c41ad91) merged (root decision: fail closed; owner unanswered) |
| 8 | ec66464..c41ad91 (doc-guard-shell-quoting) | 2 Critical · 4 Warning · 1 Suggestion · 0 UNMET | doc-guard-wrapper-config (96c8740) merged |
| 9 | 9e122b1..96c8740 (doc-guard-wrapper-config) | 1 Critical · 3 Warning · 3 Suggestion · 0 UNMET | doc-guard-nul-quote |

## Round 9 findings
Isolated scrutineer on 9e122b1..96c8740; root re-ran C1, W1 and W2 against 96c8740 and c41ad91. No disputes. C1 is a regression of 6ac6430: c41ad91 refused it.
- **C1 [Critical][Security] REGRESSION** `scripts/pre-guard.mjs:428-440,541` — `ansiCDecode` cuts a `$'...'` body at NUL and `decodeAnsiC` runs quote-unaware on the raw text that `bare` (`:541`) gates, so a `$'` inside double quotes swallows the next command: `echo "$'\0"; git c\lean -fdx; echo "'"`, and the same shape with `r''m -rf docs` and `m''v docs /tmp/zz` → exit 0 on 96c8740, 2 on c41ad91.
- **W1 [Security]** `:372` (`gitSub`), `:806` (doc-guard `git()` option parse) — `--attr-source <tree-ish>` is not skipped as a two-word option: `HOME=/tmp/h git --attr-source status claen -fdx` → 0 (predates 96c8740).
- **W2 [Security]** `:356` — `CONFIG_INDIRECT` sees `HOME`/`XDG_CONFIG_HOME` only as `NAME=`: `for HOME in /tmp/h; do git claen -fdx; done`, `read HOME <<< /tmp/h; git claen -fdx`, `printf -v HOME %s /tmp/h; git claen -fdx`, `for XDG_CONFIG_HOME in /tmp/h; do git claen -fdx; done` → 0 (predates 96c8740).
- **W3 [Test-coverage]** `scripts/pre-guard-docclean.test.mjs` — no double-quoted `"$'\0"` cases, no `--attr-source` cases.
- **S1** unlisted wrappers: `G=git; HOME=/tmp/h setsid $G claen -fdx`. **S2** false blocks, accepted as the fail-closed cost: `export XDG_CONFIG_HOME=/tmp/x; cp -r src/git dest`, `export HOME=/tmp/h; $EDITOR notes.txt`. **S3** ARCH-SAFETY-08 cites `scripts/pre-guard.mjs:1129-1135`; it means `:1131-1137`.

## Round 4 / close-out
Round 4 (isolated scrutineer on d9e257a, 4147f95; root reproduced the Critical and three false blocks):
- **Critical [Security]** `scripts/pre-guard.mjs:1377-1408` (`crudeGit`) — when the tokenizer gives up, `crudeGit` does not split on backticks: `` (true) && echo `git -C A commit -m x` `` exits 0 (round-2 guard: 2). Regression.
- **Warnings** — bypasses: nested `function` (`if …; then function f { cd A; }; fi; f; git commit`), git options that run commands (`rebase -x`, `ls-remote --upload-pack`, `-c diff.external`, `grep -O`), `trap 'cd A' DEBUG`, `alias git='git -C A'`, glob-spelled git with unlisted verbs (`stage`, `bisect`, `replace`), doc guard glob git after `{`/`if`/`!`. False blocks: any `sh`/`bash` script call, commit messages naming `CDPATH`/`GIT_*`, read-only `rev-list`, `show-ref`, `check-ignore`, `config user.name`, `branch -vv`, `remote get-url`. Release message: the binding blocks the `git worktree prune` it names.

Owner decision (2026-10-28): revert guard-allowlist (merge d9e257a) — commit aa8f34d. On main after the revert: `node --test scripts/*.test.mjs` 1228/1228, lint PASS, doc-size PASS; round-2 block cases still exit 2, the backtick case exits 2 again, the three false blocks exit 0. The round-3 findings below are live again and move to follow-up F1.

## Round 3 findings (live again after the revert — follow-up F1)
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
REVERTED: merged as d9e257a, reverted by aa8f34d (owner decision 2026-10-28, round 4). Not re-driven; the guard design moves to follow-up F1.
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

### Step 3 — doc-guard-glob-clean (., javascript, high)
MERGED 2112630. A glob-spelled git command word makes `clean` a removal word again (owner decision 2026-10-28, after `/architect --update` found ARCH-STATE-16/ARCH-DOCS-07 VIOLATED). Task text: git history.

### Step 4 — doc-guard-any-glob (., javascript, high)
MERGED 72a9faf (round 5). A glob in any word makes a command not plain; `help.autocorrect` opens the gate. Task text: git history.

### Step 5 — doc-guard-structural (., javascript, high)
MERGED 1d795e1 (round 6). The gate opens structurally on a globbed git word and on config indirection; `git()` decides. Task text: git history.

### Step 6 — doc-guard-shell-quoting (., javascript, high)
MERGED c41ad91 (round 7). Decision: fail closed (root, 2026-11-01; owner unanswered). `$'...'` decoded; `+=` assignments and bracket-glob command words fail closed. Task text: git history.

### Step 7 — doc-guard-wrapper-config (., javascript, high)
MERGED 96c8740 (round 8). Config indirection is found past wrappers; alias-overridable subcommands left `GIT_BUILTINS`; `$'...'` stops at NUL and `$"` reads as `"`; `env -S` under config indirection fails closed. Task text: git history.

### Step 8 — doc-guard-nul-quote (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor · skills test-driven-development · guards arch-check
Depends on: none (Step 7 merged at 96c8740)
Fixes round-9 C1 (regression of 6ac6430), W1-W3, S3. Out of scope (F1/F3): S1, S2, user/global gitconfig, shell aliases, persistent-shell exports from earlier calls, sourced files.
- [ ] 8.1 Failing tests in `scripts/pre-guard-docclean.test.mjs` (same harness): block (exit 2, `/doc-write authority/`) every round-9 C1, W1, W2 command; keep all earlier cases. → accept: the C1 cases exit 0 on 96c8740 and exit 2 on c41ad91 (regression proof); the W1, W2 cases exit 0 on 96c8740.
- [ ] 8.2 NUL cut: apply it only to a `$'...'` word inside `tokenize()`; the raw-text gate (`bare`, `:541`) must not lose the text after a NUL: gate on both the cut and the uncut decoding, or decode quote-aware. → accept: C1 cases pass; the round-8 NUL cases (`git cl$'\0'ean -fdx` and the rest) still exit 2.
- [ ] 8.3 `--attr-source` takes the next word in `gitSub` (`:372`) and in the doc-guard `git()` option parse (`:806`). → accept: W1 passes.
- [ ] 8.4 Config indirection: a bare `HOME` or `XDG_CONFIG_HOME` word (a `for`/`read`/`printf -v`/`declare`/`export` target) counts, not only `NAME=`. → accept: W2 cases pass; `echo HOME=/x; git lfs pull` and `HOME=/tmp/h git --version` still exit 0.
- [ ] 8.5 Re-point every moved `cite: scripts/pre-guard.mjs:` range, and ARCH-SAFETY-08's to the lines it means (`:1131-1137` at 96c8740, shifted by the edit); cite lines only. Run `node --test scripts/*.test.mjs` and `node scripts/arch-check.mjs lint`. → accept: exit 0 and PASS.

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

## Follow-ups (PENDING tracker rows, not driven by this run)
- **F1 `followup-guard-redesign`** — the worktree git guard reads command text, and each of four fix rounds opened new holes. Live on main: the round-3 bypasses above (nested/`function` cd, CDPATH, `for`/`read`/`printf -v` GIT_DIR, `-c alias.*`/`core.worktree`, verbs pull/tag/update-ref/branch -f/am, glob-spelled `/usr/bin/g[i]t` incl. doc-guard `git clean`, `script -c`/`flock -c`/`su -c`/`watch`) plus round 4's git-as-runner options and `trap`/`alias` rebinding. Route to `/idea` → `/architect` for a design decision (e.g. judge git after shell expansion, or rely on the sandbox per ARCH-SAFETY-01) before any more code.
- **F2 `followup-release-message`** — `scripts/scope.mjs:224` names `git worktree prune`, which the guard blocks while the binding is still active, and prune is not needed (`refuseDirtyWorktree` returns once the directory is gone). Reword to "remove it, release again, then run `git worktree prune`".
- **F3 `followup-sandbox-verify`** — verify the sandbox blocks writes into a sibling repo from an interpreter (`node -e`, `python -c`) under a binding (ARCH-SAFETY-01). Also note the guard's own `git rev-parse` runs in the hook's environment, not the command's.
