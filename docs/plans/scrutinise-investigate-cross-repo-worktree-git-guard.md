---
slug: scrutinise-investigate-cross-repo-worktree-git-guard
goal: The worktree git guard allows only git calls it can prove run in the bound worktree, still lets read-only git through, and a release refusal names a fix that works
level: feature
priority: P1
classification: in-scope # round 3 of an isolated /scrutinise of investigate-cross-repo-worktree-git-guard (round 1: 868d87f, 0a9f48d, 2a172cb; round 2: 0d1e0a7, 226ff0f; round 3: db9bff5, c50c033)
tracker_rows: [TRACKER#fix-guard-chain, TRACKER#fix-release-message, TRACKER#fix-guard-prove-all, TRACKER#fix-release-wording, TRACKER#guard-allowlist, TRACKER#release-wording-2, TRACKER#followup-guard-redesign, TRACKER#followup-release-message, TRACKER#followup-sandbox-verify, TRACKER#doc-guard-glob-clean, TRACKER#doc-guard-any-glob, TRACKER#doc-guard-structural, TRACKER#doc-guard-shell-quoting, TRACKER#doc-guard-wrapper-config, TRACKER#doc-guard-nul-quote, TRACKER#doc-guard-name-forms, TRACKER#doc-guard-name-anywhere]
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
  - id: doc-guard-name-forms
    scope_id: doc-guard-name-forms
    project: .
    depends_on: []
    module: scripts/pre-guard.mjs
    language: javascript
    security: high
    scope:
      read: []   # pre-guard.mjs ~95 KB: grep -n gitSub, super-prefix, CONFIG_INDIRECT, ENV_CONFIG_NAME, envConfigIn, ownConfig, ENV_SETTER first, then read by range (ARCH-ENGINE-08)
      docs: [docs/architecture/state.rules.md, docs/architecture/docs.rules.md, docs/architecture/safety.rules.md, docs/plans/scrutinise-investigate-cross-repo-worktree-git-guard.md]
      write: [scripts/pre-guard.mjs, scripts/pre-guard-docclean.test.mjs, docs/architecture/safety.rules.md, docs/architecture/state.rules.md]   # rules docs: `cite:` line ranges only
    arch: [ARCH-STATE-16, ARCH-DOCS-07, ARCH-SAFETY-03]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [test-driven-development], guards: [arch-check], mcp: [] }
  - id: doc-guard-name-anywhere
    scope_id: doc-guard-name-anywhere
    project: .
    depends_on: []
    module: scripts/pre-guard.mjs
    language: javascript
    security: high
    scope:
      read: []   # pre-guard.mjs ~95 KB: grep -n DYN_NAME_HINT, dynamicName, NAME_SETTERS, ENV_CONFIG_NAME, ENV_SETTER, envConfigIn, GIT_VALUED_OPTS first, then read by range (ARCH-ENGINE-08)
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
| 9 | 9e122b1..96c8740 (doc-guard-wrapper-config) | 1 Critical · 3 Warning · 3 Suggestion · 0 UNMET | doc-guard-nul-quote (b6d932a) merged |
| 10 | 068b974..b6d932a (doc-guard-nul-quote) | 0 Critical · 3 Warning · 2 Suggestion · 0 UNMET | doc-guard-name-forms (1824ffd) merged |
| 11 | bb64c17..1824ffd (doc-guard-name-forms) | 0 Critical · 2 Warning · 2 Suggestion · 0 UNMET | doc-guard-name-anywhere |

## Round 11 findings
Isolated scrutineer on bb64c17..1824ffd; root re-ran W1 and W2 on a 1824ffd extract: each exits 0. Neither is a regression (bb64c17, b6d932a also exit 0); real git 2.56 ran a planted alias. No disputes.
- **W1 [Security]** `scripts/pre-guard.mjs:358` (`DYN_NAME_HINT`) — the hint needs the `$`/backtick at the start of the word, so a literal-prefixed name never reaches `dynamicName` (`:371-382`): `x=ME; printf -v HO${x} %s /tmp/h; git claen -fdx`, `x=ME; printf -v HO$x %s /tmp/h; git claen -fdx`, `x=ME; export HO${x}=/tmp/h; git claen -fdx`, `x=ME; declare HO${x}=/tmp/h; git claen -fdx`, `x=ME; typeset -x HO${x}=/tmp/h; git claen -fdx`, `x=OM; export H${x}E=/tmp/h; git claen -fdx`, `x=ME; getopts a HO${x}; git claen -fdx`.
- **W2 [Security]** `:363` (`ENV_CONFIG_NAME`), `:366` (`ENV_SETTER`), `:358` — arithmetic assignment sets HOME (git reads a relative HOME against the cwd): `let HOME=1; git claen -fdx`, `n=HO; let ${n}ME=1; git claen -fdx`, `n=HO; (( ${n}ME = 1 )); git claen -fdx`, `n=HO; : $(( ${n}ME = 1 )); git claen -fdx`. Decision (root, 2026-11-02): fix, not accept.
- **S1 [Correctness]** `:391-392` — the `GIT_VALUED_OPTS` comment says every option takes the next word; bare `--exec-path` prints and exits git, so skipping the next word is harmless (`git --exec-path clean -fdx` now exits 0, was 2; git never runs it).
- **S2 [Test-coverage]** `scripts/pre-guard-docclean.test.mjs:267` — `for $x in /tmp/h; do …` is invalid bash; no mid-word `$` cases; `read -p "$prompt" ans; git lfs pull` now exits 2 (accepted cost) and is not pinned.

## Earlier rounds
Rounds 1-4 (worktree git guard: guard-allowlist merged d9e257a and reverted aa8f34d, owner decision 2026-10-28; release-wording-2 merged 4147f95) and their findings are in git history. The round-3/4 bypasses still live on main are follow-up F1 below.

## Scope Steps (executable core)

### Step 1 — guard-allowlist (., javascript, high)
REVERTED: merged d9e257a, reverted aa8f34d (owner decision 2026-10-28, round 4); the guard design moved to follow-up F1. Task text: git history.

### Step 2 — release-wording-2 (., javascript, normal)
MERGED 4147f95 (round 3). Task text: git history.

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
MERGED b6d932a (round 9). The gate reads the cut, uncut and undecoded `$'...'` text; `--attr-source` takes a value; a `HOME`/`XDG_CONFIG_HOME` name that is not a plain read is config indirection. Task text: git history.

### Step 9 — doc-guard-name-forms (., javascript, high)
MERGED 1824ffd (round 10). One value-option list (`GIT_VALUED_OPTS`, with `--shallow-file`); a `$`-built name where a setter takes a name, and `GIT_CONFIG*` names, are config indirection. Task text: git history.

### Step 10 — doc-guard-name-anywhere (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor · skills test-driven-development · guards arch-check
Depends on: none (Step 9 merged at 1824ffd)
Fixes round-11 W1, W2, S1, S2. Out of scope (F1/F3): user/global gitconfig, shell aliases, persistent-shell exports from earlier calls, sourced files, unlisted wrappers, `wait -p`/`coproc` names.
- [ ] 10.1 Failing tests in `scripts/pre-guard-docclean.test.mjs` (same harness): refuse (exit 2, `/doc-write authority/`) every round-11 W1, W2 command; replace the invalid `for $x in` case with a valid shape or drop it; pin `git --exec-path clean -fdx` at exit 0 and `read -p "$prompt" ans; git lfs pull` at exit 2 (accepted cost); keep all earlier cases. → accept: the W1, W2 cases exit 0 on 1824ffd.
- [ ] 10.2 `DYN_NAME_HINT` matches a `$`/backtick anywhere in a word after `printf -v`, in `getopts`' name, and after `export`/`declare`/`typeset`/`local`/`readonly`; `dynamicName` decides. → accept: W1 passes; `export PATH=$PATH:/x; git lfs pull`, `declare -a arr=($x); git status` and `export X=1; (cd $d && git lfs pull)` still exit 0.
- [ ] 10.3 `let` and arithmetic `((…))`/`$((…))`: a `HOME`/`XDG_CONFIG_HOME`/`GIT_CONFIG*` name or a `$`/backtick word in them counts as config indirection (`let` joins the setters and the hint; arithmetic text joins the hint and the check). → accept: W2 passes; `(( i++ )); git lfs pull` and `let i=i+1; git lfs pull` still exit 0.
- [ ] 10.4 Reword the `GIT_VALUED_OPTS` comment: bare `--exec-path` ends git, so skipping its next word is harmless. → accept: comment matches git 2.56 behaviour.
- [ ] 10.5 Re-point every moved `cite: scripts/pre-guard.mjs:` range (cite lines only). Run `node --test scripts/*.test.mjs` and `node scripts/arch-check.mjs lint`. → accept: exit 0 and PASS.

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
