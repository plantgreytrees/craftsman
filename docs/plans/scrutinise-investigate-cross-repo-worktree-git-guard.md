---
slug: scrutinise-investigate-cross-repo-worktree-git-guard
goal: The worktree git guard allows only git calls it can prove run in the bound worktree, still lets read-only git through, and a release refusal names a fix that works
level: feature
priority: P1
classification: in-scope # round 3 of an isolated /scrutinise of investigate-cross-repo-worktree-git-guard (round 1: 868d87f, 0a9f48d, 2a172cb; round 2: 0d1e0a7, 226ff0f; round 3: db9bff5, c50c033)
tracker_rows: [TRACKER#fix-guard-chain, TRACKER#fix-release-message, TRACKER#fix-guard-prove-all, TRACKER#fix-release-wording, TRACKER#guard-allowlist, TRACKER#release-wording-2, TRACKER#followup-guard-redesign, TRACKER#followup-release-message, TRACKER#followup-sandbox-verify, TRACKER#doc-guard-glob-clean, TRACKER#doc-guard-any-glob, TRACKER#doc-guard-structural, TRACKER#doc-guard-shell-quoting, TRACKER#doc-guard-wrapper-config, TRACKER#doc-guard-nul-quote, TRACKER#doc-guard-name-forms, TRACKER#doc-guard-name-anywhere, TRACKER#doc-guard-arith-context, TRACKER#doc-guard-arith-reach, TRACKER#doc-guard-env-abbrev, TRACKER#doc-guard-blank-reach, TRACKER#doc-guard-join-flow, TRACKER#doc-guard-decode-flow, TRACKER#doc-guard-array-default]
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
      read: []
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
      read: []
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
      read: []
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
      read: []
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
      read: []
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
      read: []
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
      read: []
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
      read: []
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
      read: []
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
      read: []
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
      read: []
      docs: [docs/architecture/state.rules.md, docs/architecture/docs.rules.md, docs/architecture/safety.rules.md, docs/plans/scrutinise-investigate-cross-repo-worktree-git-guard.md]
      write: [scripts/pre-guard.mjs, scripts/pre-guard-docclean.test.mjs, docs/architecture/safety.rules.md, docs/architecture/state.rules.md]   # rules docs: `cite:` line ranges only
    arch: [ARCH-STATE-16, ARCH-DOCS-07, ARCH-SAFETY-03]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [test-driven-development], guards: [arch-check], mcp: [] }
  - id: doc-guard-env-abbrev
    scope_id: doc-guard-env-abbrev
    project: .
    depends_on: []
    module: scripts/pre-guard.mjs
    language: javascript
    security: high
    scope:
      read: []
      docs: [docs/architecture/state.rules.md, docs/architecture/docs.rules.md, docs/architecture/safety.rules.md, docs/plans/scrutinise-investigate-cross-repo-worktree-git-guard.md]
      write: [scripts/pre-guard.mjs, scripts/pre-guard-docclean.test.mjs, docs/architecture/safety.rules.md, docs/architecture/state.rules.md]   # rules docs: `cite:` line ranges only
    arch: [ARCH-STATE-16, ARCH-DOCS-07, ARCH-SAFETY-03]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [test-driven-development], guards: [arch-check], mcp: [] }
  - id: doc-guard-blank-reach
    scope_id: doc-guard-blank-reach
    project: .
    depends_on: []
    module: scripts/pre-guard.mjs
    language: javascript
    security: high
    scope:
      read: []
      docs: [docs/architecture/state.rules.md, docs/architecture/docs.rules.md, docs/architecture/safety.rules.md, docs/plans/scrutinise-investigate-cross-repo-worktree-git-guard.md]
      write: [scripts/pre-guard.mjs, scripts/pre-guard-docclean.test.mjs, docs/architecture/safety.rules.md, docs/architecture/state.rules.md]   # rules docs: `cite:` line ranges only
    arch: [ARCH-STATE-16, ARCH-DOCS-07, ARCH-SAFETY-03]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [test-driven-development], guards: [arch-check], mcp: [] }
  - id: doc-guard-join-flow
    scope_id: doc-guard-join-flow
    project: .
    depends_on: []
    module: scripts/pre-guard.mjs
    language: javascript
    security: high
    scope:
      read: []
      docs: [docs/architecture/state.rules.md, docs/architecture/docs.rules.md, docs/architecture/safety.rules.md, docs/plans/scrutinise-investigate-cross-repo-worktree-git-guard.md]
      write: [scripts/pre-guard.mjs, scripts/pre-guard-docclean.test.mjs, docs/architecture/safety.rules.md, docs/architecture/state.rules.md]   # rules docs: `cite:` line ranges only
    arch: [ARCH-STATE-16, ARCH-DOCS-07, ARCH-SAFETY-03]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [test-driven-development], guards: [arch-check], mcp: [] }
  - id: doc-guard-decode-flow
    scope_id: doc-guard-decode-flow
    project: .
    depends_on: []
    module: scripts/pre-guard.mjs
    language: javascript
    security: high
    scope:
      read: []
      docs: [docs/architecture/state.rules.md, docs/architecture/docs.rules.md, docs/architecture/safety.rules.md, docs/plans/scrutinise-investigate-cross-repo-worktree-git-guard.md]
      write: [scripts/pre-guard.mjs, scripts/pre-guard-docclean.test.mjs, docs/architecture/safety.rules.md, docs/architecture/state.rules.md]   # rules docs: `cite:` line ranges only
    arch: [ARCH-STATE-16, ARCH-DOCS-07, ARCH-SAFETY-03]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [test-driven-development], guards: [arch-check], mcp: [] }
  - id: doc-guard-array-default
    scope_id: doc-guard-array-default
    project: .
    depends_on: []
    module: scripts/pre-guard.mjs
    language: javascript
    security: high
    scope:
      read: []
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
| 13 | dbfe758..1f2339c (doc-guard-arith-context) | 0 Critical · 5 Warning · 2 Suggestion · 0 UNMET | doc-guard-arith-reach (654fd72) merged |
| 14 | ceb060b..654fd72 (doc-guard-arith-reach) | 1 Critical · 2 Warning · 2 Suggestion · 0 UNMET | doc-guard-env-abbrev (03a1b5c) merged |
| 15 | f8cb084..a054c0f (doc-guard-env-abbrev) | 1 Critical · 2 Warning · 1 Suggestion · 0 UNMET | doc-guard-blank-reach (2215ff1) merged |
| 16 | ac527a1..2215ff1 (doc-guard-blank-reach) | 0 Critical · 2 Warning · 2 Suggestion · 0 UNMET | doc-guard-join-flow (17a58d1) merged |
| 17 | c4a4857..17a58d1 (doc-guard-join-flow) | 0 Critical · 3 Warning · 3 Suggestion · 0 UNMET | doc-guard-decode-flow (b9d8709) merged |
| 18 | 325443e..b9d8709 (doc-guard-decode-flow) | 0 Critical · 2 Warning · 3 Suggestion · 0 UNMET | doc-guard-array-default (c313905) merged; owner: stated limits |
| 19 | 94bf285..c313905 (doc-guard-array-default) | 0 Critical · 1 Warning · 2 Suggestion · 0 UNMET | owner: stated limit (none driven) |

## Round 19 findings
Isolated scrutineer on 94bf285..c313905; root re-ran W1 on 94bf285 and c313905 extracts. No disputes. Real bash confirmed W1.
- **W1 [Warning][Security]** `scripts/pre-guard.mjs:366` (`SETTER`) — the subscript class `[^\]]*` stops at the first `]`, so a nested subscript in a default assignment is not a setter: `read -r l < f; : ${z[a[1]]=l}; (( z )); git status`, `: ${z[a[0]+1]=l}; (( z[1] ))`, `${z[b[c[0]]]=l}`, quoted `"${z[a[1]]=l}"` → 0 on both. **Owner decision 2026-11-02: stated limit** (ARCH-SAFETY-15); not fixed.
- **S1 [Correctness]** `:366` — `[^\]]*` runs over `[`, so `"${a[".repeat(n)` is quadratic (the regex alone 712 ms at n=20000; the whole guard 10.4 s against 9.9 s before, on an 80 KB input it already refused): a stated limit with the pre-existing slow paths. **S2 [Test-coverage]** `scripts/pre-guard-docclean.test.mjs:549-562` pins no nested subscript and no passing `: ${opts[verbose]:=0}; git log --oneline` (0 on both): not driven.
- Floor: the round-12 linearity test (`:372`, 200 ms) failed once under full-suite load (220 ms) and passed on re-run; `"let ".repeat(20000)` costs 60-80 ms over baseline since b9d8709, against 50-57 ms before.
- **Owner decision 2026-11-02 ends the scrutinise loop.** Next: `/sync-docs --all investigate-cross-repo-worktree-git-guard`, then `/craftsman:merge`.

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
MERGED 654fd72 (round 13). `env -S` reaches git in unparseable text; special-parameter substrings, `let` anywhere and values set without a `$` (`+=`, `printf -v`, `read`/`mapfile`/`readarray`/`getopts`, `for`/`select`) open the config-indirection check; the tokenizer refuses `${ cmd; }` / `${| cmd; }`. Task text: git history.

### Step 13 — doc-guard-env-abbrev (., javascript, high)
MERGED 03a1b5c (round 14). One `ENV_SPLIT` reads every abbreviation of `env --split-string`; `declare`/`typeset`/`local -u` counts as a value set without a `$`; text that only arithmetic makes unreadable is re-read with `blankArith` so a built-in git subcommand passes. Task text: git history.

### Step 14 — doc-guard-blank-reach (., javascript, high)
MERGED 2215ff1 (round 15). `blankArith` never blanks a current-shell substitution, which fails closed with `mayReachGit`; `readArith` fails closed when arithmetic reads a name set by `read`/`mapfile`/`readarray`/`getopts` or an expanded `for` list; `configIndirectGit`'s hints also read backslash-newline-joined text. Task text: git history.

### Step 15 — doc-guard-join-flow (., javascript, high)
MERGED 17a58d1 (round 16). `bare` reads the backslash-newline-joined command; `readArith` seeds names set beside a command substitution and lets every word of an assigning command flow into its names; `${#name}` is not a value read. Task text: git history.

### Step 16 — doc-guard-decode-flow (., javascript, high)
MERGED b9d8709 (round 17). The gate and `configIndirectGit` read both ANSI-C decodings of the joined text; `SETS` shares `SETTER` and reads a `for` list, a default assignment and `set`'s positional parameters; `GIT_DIR`, `GIT_COMMON_DIR` and `--git-dir` are config indirection; the self-disable scan reads joined text. Task text: git history.

### Step 17 — doc-guard-array-default (., javascript, high)
MERGED c313905 (round 18). `SETTER`'s default-assignment arm takes an optional subscript. Task text: git history.

## Sequencing
Independent: no shared files or cites. Step 1 is the security fix and goes first when run one at a time; its cite re-pointing (1.5) is last.

## Verification background
- Worktree gate and `gitTargets`: `scripts/pre-guard.mjs:1344-1455`; `namesMutation` `:1323`; `unresolvedConstruct` `:1333`; `usesAlternateGitRoot` `:51`; doc guard `plainWords`/`removalGate` `:346-347`.
- Release refusal: `scripts/scope.mjs:216-224`.
- ARCH-STATE-16 (`state.rules.md:26`): blocks name the fix; parsing that cannot be proven fails closed. ARCH-SAFETY-03: fail closed. ARCH-DOCS-07 (`docs.rules.md:17`): deleting a guarded doc path needs the grant. ARCH-SAFETY-01: interpreters are the sandbox's job.

CONSUMERS:
- The stderr prefix `Git mutation blocked outside the active worktree` is asserted in `scripts/pre-guard.test.mjs` and `scripts/pre-guard-worktree.test.mjs`; kept unchanged.
- The env split-string predicate (`scripts/pre-guard.mjs:444`, `:467`, `:1120`, `:1505`; `WRAPPER_VALUE_LONG` `:1306`) is internal to the guard; only `scripts/pre-guard-docclean.test.mjs` exercises it.
- `scope.mjs release` callers (`commands/_features.md`, `commands/_shared-execution.md`, `agents/unit-runner.md`) see only exit codes and stderr; unchanged.

## Risk & rollback
Step 1 flips the guard's default; the risk is a false block on a legitimate non-allowlisted git call outside W (e.g. `git -C <other> fetch`). That is intended under a binding — the message names `git -C <W>` — and the allowlist covers the read-only calls units use. Rollback: revert the unit's merge commit.

## Out of scope
- Interpreters (`node -e`, `python -c`), renamed git binaries and gitconfig aliases are textually undetectable; ARCH-SAFETY-01 leaves them to the sandbox.
- Stated limits (owner, 2026-11-02, ARCH-SAFETY-15) of the doc guard: an alias in another repository's config reached through `git -C <dir>` or an earlier `cd`/`pushd`; the self-disable scan reading `$'…'`/`$"…"`-decoded names; one shared "as bash reads it" views helper; positional parameters set other than by `set` (a function call); a nested array subscript in a default assignment (`${z[a[1]]=l}`); the cost of the `${a[` subscript scan. A scrutinise finding in one of these classes is out of scope.

## Follow-ups (PENDING tracker rows, not driven by this run)
- **F1 `followup-guard-redesign`** — the worktree git guard reads command text, and each of four fix rounds opened new holes. Live on main: the round-3 bypasses above (nested/`function` cd, CDPATH, `for`/`read`/`printf -v` GIT_DIR, `-c alias.*`/`core.worktree`, verbs pull/tag/update-ref/branch -f/am, glob-spelled `/usr/bin/g[i]t` incl. doc-guard `git clean`, `script -c`/`flock -c`/`su -c`/`watch`) plus round 4's git-as-runner options and `trap`/`alias` rebinding. Route to `/idea` → `/architect` for a design decision (e.g. judge git after shell expansion, or rely on the sandbox per ARCH-SAFETY-01) before any more code.
- **F2 `followup-release-message`** — `scripts/scope.mjs:224` names `git worktree prune`, which the guard blocks while the binding is still active, and prune is not needed (`refuseDirtyWorktree` returns once the directory is gone). Reword to "remove it, release again, then run `git worktree prune`".
- **F3 `followup-sandbox-verify`** — verify the sandbox blocks writes into a sibling repo from an interpreter (`node -e`, `python -c`) under a binding (ARCH-SAFETY-01). Also note the guard's own `git rev-parse` runs in the hook's environment, not the command's.
