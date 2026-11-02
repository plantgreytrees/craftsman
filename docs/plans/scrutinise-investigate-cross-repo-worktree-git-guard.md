---
slug: scrutinise-investigate-cross-repo-worktree-git-guard
goal: The worktree git guard allows only git calls it can prove run in the bound worktree, still lets read-only git through, and a release refusal names a fix that works
level: feature
priority: P1
classification: in-scope # round 3 of an isolated /scrutinise of investigate-cross-repo-worktree-git-guard (round 1: 868d87f, 0a9f48d, 2a172cb; round 2: 0d1e0a7, 226ff0f; round 3: db9bff5, c50c033)
tracker_rows: [TRACKER#fix-guard-chain, TRACKER#fix-release-message, TRACKER#fix-guard-prove-all, TRACKER#fix-release-wording, TRACKER#guard-allowlist, TRACKER#release-wording-2, TRACKER#followup-guard-redesign, TRACKER#followup-release-message, TRACKER#followup-sandbox-verify, TRACKER#doc-guard-glob-clean, TRACKER#doc-guard-any-glob, TRACKER#doc-guard-structural, TRACKER#doc-guard-shell-quoting, TRACKER#doc-guard-wrapper-config, TRACKER#doc-guard-nul-quote, TRACKER#doc-guard-name-forms, TRACKER#doc-guard-name-anywhere, TRACKER#doc-guard-arith-context, TRACKER#doc-guard-arith-reach]
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
  - id: doc-guard-arith-context
    scope_id: doc-guard-arith-context
    project: .
    depends_on: []
    module: scripts/pre-guard.mjs
    language: javascript
    security: high
    scope:
      read: []   # pre-guard.mjs ~95 KB: grep -n DYN_NAME_HINT, dynamicName, configIndirectGit, configIndirectIn, envConfigIn, tokenize first, then read by range (ARCH-ENGINE-08)
      docs: [docs/architecture/state.rules.md, docs/architecture/docs.rules.md, docs/architecture/safety.rules.md, docs/plans/scrutinise-investigate-cross-repo-worktree-git-guard.md]
      write: [scripts/pre-guard.mjs, scripts/pre-guard-docclean.test.mjs, docs/architecture/safety.rules.md, docs/architecture/state.rules.md]   # rules docs: `cite:` line ranges only
    arch: [ARCH-STATE-16, ARCH-DOCS-07, ARCH-SAFETY-03]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [test-driven-development], guards: [arch-check], mcp: [] }
  - id: doc-guard-arith-reach
    scope_id: doc-guard-arith-reach
    project: .
    depends_on: []
    module: scripts/pre-guard.mjs
    language: javascript
    security: high
    scope:
      read: []   # pre-guard.mjs ~95 KB: grep -n arithDyn, LET_CMD, dynNameHint, mayReachGit, leadDyn, function tokenize first, then read by range (ARCH-ENGINE-08)
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
| 11 | bb64c17..1824ffd (doc-guard-name-forms) | 0 Critical · 2 Warning · 2 Suggestion · 0 UNMET | doc-guard-name-anywhere (c4a7988) merged |
| 12 | e2548f4..c4a7988 (doc-guard-name-anywhere) | 0 Critical · 3 Warning · 2 Suggestion · 0 UNMET | doc-guard-arith-context (1f2339c) merged |
| 13 | dbfe758..1f2339c (doc-guard-arith-context) | 0 Critical · 5 Warning · 2 Suggestion · 0 UNMET | doc-guard-arith-reach |

## Round 13 findings
Isolated scrutineer on dbfe758..1f2339c; root re-ran one case per Warning on c4a7988 and 1f2339c extracts. No disputes. Real bash 5.3.9 and git 2.56 ran a planted alias for W1-W4.
- **W1 [Security] REGRESSION** `scripts/pre-guard.mjs:468` (`mayReachGit`, with `:469`, `:435`) — unparseable text with `env -S` passes: `\bgit\b` cannot match inside `-Sgit` and `leadDyn` skips the option. `(HOME=1 env -Sgit\ claen -fdx)`, `f() { HOME=1 env -Sgit\ claen -fdx; }; f`, `(export HOME=1; env -Sgit\ claen -fdx)`, `(n=HO; (( ${n}ME = 1 )); env -Sgit\ claen -fdx)` → 2 on c4a7988, 0 on 1f2339c.
- **W2 [Security]** `:374` — the parameter-name class `[\w#!@*[]` omits `-`, `$`, `?`: `n=HO; : ${-:${n}ME=1}; git claen -fdx`, `${$:…}`, `${?:…}`, `n=HO; : ${-:$n'ME=1'}; git claen -fdx` → 0 (c4a7988 also 0).
- **W3 [Security]** `:366` — `LET_CMD` sees `let` only at a command start or after do/then/else: `n=HO; v=$n"ME=1"; if let v; then git claen -fdx; fi` and `while`/`until`/`elif`/`!`/`time`/`builtin`/`command let v` → 0 (c4a7988 also 0).
- **W4 [Security]** `:391`, `:398` — a value arithmetic reads, built without `$`, is not seen: `v=HO; v+=ME=1; let v; git claen -fdx`, `printf -v v %s%s HO ME=1; let v; git claen -fdx`, `v=HO; v+=ME=1; s=abc; : ${s:v}; git claen -fdx`, `v=HO; v+=ME=1; : $((v)); git claen -fdx`, `read v <<< HOME=1; let v; git claen -fdx` → 0 (c4a7988 also 0).
- **W5 [Security]** tokenizer (`:469` path) — bash 5.3 `${ cmd; }` runs `cmd` in the current shell but is not read as commands: `: ${ HOME=1; }; git claen -fdx` → 0 (c4a7988 also 0).
- **S1 [Test-coverage]** `scripts/pre-guard-docclean.test.mjs:331-370` lacks the W1-W5 cases. **S2** `:446` — "Arithmetic runs no command" is false for a value arithmetic reads (`x='a[$(cmd)]'; (( x ))`); no impact found.
- Residual (not this range): slow paths that cost the same on c4a7988 (`"${s:".repeat(20000)+"$"` ~10 s, `"$((".repeat(20000)` ~14 s, `"a[".repeat(20000)+"$"` ~2.5 s); `trap '…'` strings are F1.

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
MERGED c4a7988 (round 11). A `$` anywhere in a setter's name word, `let`, and an assigning `((…))` open the config-indirection check. Task text: git history.

### Step 11 — doc-guard-arith-context (., javascript, high)
MERGED 1f2339c (round 12). Any arithmetic context holding a `$`, or reading a name beside a `$`-built value, opens the config-indirection check; unparseable text fails closed only when it can reach git (`mayReachGit`); the hint scans are linear. Task text: git history.

### Step 12 — doc-guard-arith-reach (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor · skills test-driven-development · guards arch-check
Depends on: none (Step 11 merged at 1f2339c)
Fixes round-13 W1-W5, S1, S2. Out of scope (F1/F3): user/global gitconfig, shell aliases, persistent-shell exports, sourced files, unlisted wrappers and string runners (`trap`, `watch`), `wait -p`/`coproc` names, the pre-existing slow paths.
- [ ] 12.1 Failing tests in `scripts/pre-guard-docclean.test.mjs` (same harness): refuse (exit 2, `/doc-write authority/`) every round-13 W1-W5 command; keep all earlier cases. → accept: the W1 cases exit 2 on c4a7988 and 0 on 1f2339c; the W2-W5 cases exit 0 on 1f2339c.
- [ ] 12.2 `mayReachGit` (`:468`): an `env` word with a `-…S` or `--split-string` option can reach git. → accept: W1 refused.
- [ ] 12.3 `arithDyn` (`:374`): a one-character special parameter (`-` `$` `?` `!` `#` `@` `*` or a digit) right after `${`, then a `:` not followed by `-` `=` `+` `?`, is a substring; `LET_CMD` (`:366`) matches `let` as a word anywhere (`(?:^|[\s;&|({!])let\s`). → accept: W2, W3 refused.
- [ ] 12.4 When arithmetic reads a name, a `NAME+=` append outside arithmetic, `printf -v`, or `read`/`mapfile`/`readarray` counts as a possibly built value with no `$` required; `dynNameHint` (`:398`) runs `arithDyn` before its `$`/backtick precheck. → accept: W4 refused; `(( i++ )); git lfs pull` and `let i=i+1; git lfs pull` still pass.
- [ ] 12.5 The tokenizer fails on `${` followed by whitespace or `|` (a current-shell substitution) and the hint treats it as dynamic. → accept: W5 refused.
- [ ] 12.6 Reword the `:446` comment: arithmetic runs a command held in a value it reads. → accept: the comment no longer says arithmetic runs no command.
- [ ] 12.7 Re-point every moved `cite: scripts/pre-guard.mjs:` range (cite lines only). Run `node --test scripts/*.test.mjs` and `node scripts/arch-check.mjs lint`. → accept: exit 0 and PASS.

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
