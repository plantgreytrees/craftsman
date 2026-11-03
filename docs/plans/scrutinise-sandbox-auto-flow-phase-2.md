---
slug: scrutinise-sandbox-auto-flow-phase-2
goal: The phase 2 guards close the holes isolated reviews found: every push queue (a submodule's, and from any linked worktree) and its parent directory is protected, a hard link cannot carry a scoped Write or Edit to protected state through the tools or through cp -l, a per-unit hand-off keeps the scope requirement alive after compaction, and no refused queue entry leaves without a PARK that root acts on.
level: feature
parent: sandbox-auto-flow-phase-2
priority: P1
classification: /scrutinise rounds 1 and 2 of sandbox-auto-flow-phase-2 (isolated scrutineer, 2026-11-03; round 1 range 55faf53..2b32191, round 2 range d87a8cf..1c3f51c, committed state 6b04842); round 1: 4 Warning, 5 Suggestion; round 2: 0 Critical, 3 Warning, 5 Suggestion, 0 Disputed; round 3 (range 6b04842..cbb14e1): 0 Critical, 4 Warning, 4 Suggestion, 0 Disputed; round 4 (range cbb14e1..1ef4081): 0 Critical, 4 Warning, 6 Suggestion, 0 Disputed
tracker_rows: [TRACKER#handoff-arming, TRACKER#drain-rejected, TRACKER#prettier-test-copy, TRACKER#queue-protection, TRACKER#scratch-write-hardening, TRACKER#heredoc-limits, TRACKER#network-consumer-doc, TRACKER#submodule-worktree-queue, TRACKER#cp-link-sources, TRACKER#ln-check-safe-exemption, TRACKER#submodule-git-surface, TRACKER#worktree-surface-fixes, TRACKER#bash-writer-gaps, TRACKER#followup-heredoc-spellings]
guards:
  blast_radius: done
  completeness_sweep: done
  blind_rederivation: skipped(config:never)
coverage:
  contract:      1.3 (handoffArmsScope), 2.2 (drainQueue error and return shape), 5.3 (WRITER_VERBS gains link), 7.1 (the exit-3 needs_network payload carries parked[]: its one documented consumer is commands/_network.md); consumers in CONSUMERS
  data:          N/A(no persistence or migration)
  config:        N/A(no config key)
  security:      4.x, 5.x, 6.x (round 1), 8.1-8.3 (queue from a submodule's linked worktree), 9.1-9.4 (cp -l / --link); security-auditor gate on units 2, 4, 5, 6, 8 and 9
  tests:         every unit starts with red rows; mutation checks 4.4, 5.5, 6.4, 8.3, 9.4
  observability: 2.1-2.2
  interface:     1.4 (step 12 asks for remaining_units), 7.1 (commands/_network.md)
  docs:          cites re-pointed by the unit that moves them; the last pre-guard unit (9.5) recomputes every pre-guard cite; the ARCH-STATE-18 text gap and the heredoc spellings are Out of scope
  round3:        10.1-10.4 (security + tests: the ln text check back to its old default plus a linear exemption, latency rows), 11.1-11.6 (security + tests: submodule config and hooks, rsync --link-dest, cp destination names in the state dir)
  round4:        12.1-12.3 (security + tests: holds() prefix rule, worktree-modules config and hooks, gitfile patterns, latency kept), 13.1-13.5 (security + tests: attached -tDIR, hard-link creation from the project root or a glob, a regular file named .git, link check on the heredoc view, order and case-fold)
  rollback:      one merge commit per unit; guard units are separate so one bypass found in review reverts alone
units:
  - { id: 1, scope_id: handoff-arming, project: ., depends_on: [], module: "handoff.mjs, session-context.mjs, account-switch.mjs, lib/core.mjs", language: javascript, security: normal, scope: { read: [scripts/handoff.mjs, scripts/session-context.mjs, scripts/account-switch.mjs, commands/_shared-execution.md], docs: [docs/architecture/auto.rules.md, docs/architecture/slim.rules.md, docs/architecture/state.rules.md, docs/architecture/safety.rules.md, docs/architecture/engine.rules.md], write: [scripts/handoff.mjs, scripts/handoff.test.mjs, scripts/session-context.mjs, scripts/session-context.test.mjs, scripts/account-switch.mjs, scripts/account-switch.test.mjs, scripts/lib/core.mjs, commands/_shared-execution.md, docs/architecture/auto.rules.md] }, arch: [ARCH-AUTO-11, ARCH-SLIM-02, ARCH-STATE-02, ARCH-SAFETY-04, ARCH-ENGINE-08], tooling: { implementer: implementer, gates: [code-reviewer], skills: [test-driven-development], guards: [arch-check], mcp: [] } }
  - { id: 2, scope_id: drain-rejected, project: ., depends_on: [], module: "lib/network.mjs drainQueue", language: javascript, security: high, scope: { read: [scripts/lib/network.mjs, scripts/network.test.mjs], docs: [docs/architecture/landing.rules.md], write: [scripts/lib/network.mjs, scripts/network.test.mjs, scripts/repo-exec.mjs, scripts/repo-exec.test.mjs, docs/architecture/landing.rules.md] }, arch: [ARCH-LAND-36, ARCH-LAND-19], tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [test-driven-development], guards: [arch-check], mcp: [] } }
  - { id: 3, scope_id: prettier-test-copy, project: ., depends_on: [], module: "prettier-ignore.test.mjs", language: javascript, security: normal, scope: { read: [scripts/prettier-ignore.test.mjs], docs: [], write: [scripts/prettier-ignore.test.mjs] }, arch: [], tooling: { implementer: implementer, gates: [code-reviewer], skills: [test-driven-development], guards: [], mcp: [] } }
  - { id: 4, scope_id: queue-protection, project: ., depends_on: [], module: "lib/self-protect.mjs, pre-guard.mjs", language: javascript, security: high, scope: { read: [scripts/lib/self-protect.mjs, scripts/lib/self-protect.test.mjs, scripts/pre-guard-queue.test.mjs], docs: [docs/architecture/safety.rules.md, docs/architecture/state.rules.md], write: [scripts/lib/self-protect.mjs, scripts/lib/self-protect.test.mjs, scripts/pre-guard.mjs, scripts/pre-guard-queue.test.mjs, docs/architecture/safety.rules.md] }, arch: [ARCH-SAFETY-13, ARCH-STATE-16], tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [test-driven-development], guards: [arch-check], mcp: [] } }
  - { id: 5, scope_id: scratch-write-hardening, project: ., depends_on: [queue-protection], module: "pre-guard.mjs insideScratchRoots, self-protect.mjs WRITER_VERBS", language: javascript, security: high, scope: { read: [scripts/lib/self-protect.mjs], docs: [docs/architecture/safety.rules.md, docs/architecture/state.rules.md], write: [scripts/pre-guard.mjs, scripts/pre-guard.test.mjs, scripts/lib/self-protect.mjs, scripts/lib/self-protect.test.mjs, docs/architecture/safety.rules.md, docs/architecture/state.rules.md] }, arch: [ARCH-STATE-18, ARCH-SAFETY-13], tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [test-driven-development], guards: [arch-check], mcp: [] } }
  - { id: 6, scope_id: heredoc-limits, project: ., depends_on: [scratch-write-hardening], module: "pre-guard.mjs blankInertHeredocs", language: javascript, security: high, scope: { read: [], docs: [docs/architecture/safety.rules.md, docs/architecture/state.rules.md], write: [scripts/pre-guard.mjs, scripts/pre-guard-heredoc.test.mjs, docs/architecture/safety.rules.md] }, arch: [ARCH-SAFETY-15, ARCH-SAFETY-13, ARCH-STATE-16], tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [test-driven-development], guards: [arch-check], mcp: [] } }
  - id: 7
    scope_id: network-consumer-doc
    project: .
    depends_on: []
    module: commands/_network.md, scripts/network.test.mjs
    language: javascript
    security: normal
    scope:
      read: [commands/_network.md, scripts/network.test.mjs]   # repo-exec.mjs is 50 KB: grep -n "needs_network\|parkRejected" first, read by range with Bash
      docs: [docs/architecture/landing.rules.md, docs/architecture/engine.rules.md, docs/architecture/slim.rules.md]
      write: [commands/_network.md, scripts/network.test.mjs, docs/architecture/landing.rules.md]   # rules docs: cite: line ranges only
    arch: [ARCH-LAND-36, ARCH-LAND-35, ARCH-LAND-19, ARCH-ENGINE-19, ARCH-SLIM-01, ARCH-SLIM-02]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [test-driven-development], guards: [arch-check], mcp: [] }
  - id: 8
    scope_id: submodule-worktree-queue
    project: .
    depends_on: []
    module: scripts/pre-guard.mjs superprojectRoots, outerRelWhere, mainRelOf, scripts/lib/self-protect.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/lib/self-protect.mjs, scripts/pre-guard-queue.test.mjs]   # pre-guard.mjs is 150 KB and pre-guard.test.mjs 180 KB: grep -n first, read by range with Bash (ARCH-ENGINE-08)
      docs: [docs/architecture/safety.rules.md, docs/architecture/state.rules.md]
      write: [scripts/pre-guard.mjs, scripts/pre-guard-queue.test.mjs, scripts/lib/self-protect.mjs, scripts/lib/self-protect.test.mjs, docs/architecture/safety.rules.md]   # rules docs: cite: line ranges only
    arch: [ARCH-SAFETY-13, ARCH-STATE-16]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [test-driven-development], guards: [arch-check], mcp: [] }
  - id: 9
    scope_id: cp-link-sources
    project: .
    depends_on: [submodule-worktree-queue]
    module: scripts/pre-guard.mjs copyTargets and the ln/link text check
    language: javascript
    security: high
    scope:
      read: [scripts/lib/self-protect.mjs]   # pre-guard.mjs and pre-guard.test.mjs: grep -n "copyTargets\|links into .craftsman\|verb === \"ln\"" first, read by range
      docs: [docs/architecture/safety.rules.md, docs/architecture/state.rules.md]
      write: [scripts/pre-guard.mjs, scripts/pre-guard.test.mjs, docs/architecture/safety.rules.md, docs/architecture/state.rules.md]   # rules docs: cite: line ranges only
    arch: [ARCH-SAFETY-13, ARCH-STATE-16, ARCH-STATE-18]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [test-driven-development], guards: [arch-check], mcp: [] }
  - id: 10
    scope_id: ln-check-safe-exemption
    project: .
    depends_on: [cp-link-sources]
    module: scripts/pre-guard.mjs WRAPPED and LINK_AT_COMMAND (the ln/link text check)
    language: javascript
    security: high
    scope:
      read: [scripts/lib/self-protect.mjs]   # pre-guard.mjs and pre-guard.test.mjs: grep -n "LINK_AT_COMMAND\|WRAPPED\|WRAPPERS" first, read by range
      docs: [docs/architecture/safety.rules.md, docs/architecture/state.rules.md]
      write: [scripts/pre-guard.mjs, scripts/pre-guard.test.mjs, docs/architecture/safety.rules.md, docs/architecture/state.rules.md]   # rules docs: cite: line ranges only
    arch: [ARCH-SAFETY-03, ARCH-SAFETY-13, ARCH-SAFETY-15, ARCH-STATE-16]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [test-driven-development], guards: [arch-check], mcp: [] }
  - id: 11
    scope_id: submodule-git-surface
    project: .
    depends_on: [ln-check-safe-exemption]
    module: scripts/lib/self-protect.mjs SELF_NEVER, scripts/pre-guard.mjs rsync and cp branches
    language: javascript
    security: high
    scope:
      read: [scripts/lib/self-protect.mjs, scripts/lib/self-protect.test.mjs, scripts/pre-guard-queue.test.mjs]   # pre-guard.mjs and pre-guard.test.mjs: grep -n first, read by range (ARCH-ENGINE-08)
      docs: [docs/architecture/safety.rules.md, docs/architecture/state.rules.md]
      write: [scripts/lib/self-protect.mjs, scripts/lib/self-protect.test.mjs, scripts/pre-guard.mjs, scripts/pre-guard.test.mjs, scripts/pre-guard-queue.test.mjs, docs/architecture/safety.rules.md]   # rules docs: cite: line ranges only
    arch: [ARCH-SAFETY-13, ARCH-SAFETY-15, ARCH-STATE-16]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [test-driven-development], guards: [arch-check], mcp: [] }
  - id: 12
    scope_id: worktree-surface-fixes
    project: .
    depends_on: [submodule-git-surface]
    module: scripts/lib/self-protect.mjs SELF_NEVER and holds
    language: javascript
    security: high
    scope:
      read: [scripts/lib/self-protect.mjs, scripts/lib/self-protect.test.mjs, scripts/pre-guard-queue.test.mjs]   # pre-guard.mjs and pre-guard.test.mjs: grep -n first, read by range (ARCH-ENGINE-08)
      docs: [docs/architecture/safety.rules.md, docs/architecture/state.rules.md]
      write: [scripts/lib/self-protect.mjs, scripts/lib/self-protect.test.mjs, scripts/pre-guard-queue.test.mjs, docs/architecture/safety.rules.md]   # rules docs: cite: line ranges only
    arch: [ARCH-SAFETY-13, ARCH-SAFETY-03, ARCH-STATE-16]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [test-driven-development], guards: [arch-check], mcp: [] }
  - id: 13
    scope_id: bash-writer-gaps
    project: .
    depends_on: [worktree-surface-fixes]
    module: scripts/pre-guard.mjs placements, copyTargets, target, linksIntoState
    language: javascript
    security: high
    scope:
      read: [scripts/lib/self-protect.mjs]   # pre-guard.mjs and pre-guard.test.mjs: grep -n "placements\|copyTargets\|linksIntoState\|removedDocs" first, read by range
      docs: [docs/architecture/safety.rules.md, docs/architecture/state.rules.md]
      write: [scripts/pre-guard.mjs, scripts/pre-guard.test.mjs, scripts/pre-guard-queue.test.mjs, docs/architecture/safety.rules.md, docs/architecture/state.rules.md]   # rules docs: cite: line ranges only
    arch: [ARCH-SAFETY-13, ARCH-SAFETY-15, ARCH-SAFETY-03, ARCH-STATE-16]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [test-driven-development], guards: [arch-check], mcp: [] }
---

# Plan: scrutinise sandbox-auto-flow-phase-2 (rounds 1 and 2)

## Outcome
Round 1 (4 Warning) is fixed by units 1-6, all MERGED. Round 2 re-reviewed those merges (0 Critical, 3 Warning, 5 Suggestion) and found three holes the fixes left: the new `parked[]` on a drain's exit-3 payload contradicts the one doc that tells root to "park nothing", a session in a linked worktree of a submodule can still write the queue with plain Bash, and `cp -l` hard-links exactly like `ln` but its source is never judged. Units 7-9 close them. Round 3 (0 Critical, 4 Warning) found two regressions of unit 9's own narrowing of the ln text check (an exponential regex, and weaker refusals for unlisted wrappers) and two older gaps on the submodule surface (git config and hooks, rsync --link-dest); units 10-11 close them. Round 4 (0 Critical, 4 Warning) found one regression of unit 11 (a holds() prefix rule that refuses every path under .git/worktrees), the same unit's R3-W2 only half closed, and three older Bash-guard gaps (an attached -tDIR, a hard link made from the project root or a glob, a rewritable gitfile); units 12-13 close them. Done = `/scrutinise sandbox-auto-flow-phase-2` returns 0 Critical, 0 Warning, no UNMET.

## Round 1 (history: this file at 6b04842 holds the full findings table and the six step texts)
Units 1-6 are MERGED: handoff-arming 4b5623d (W4, S5), drain-rejected aa73e33 (S6), prettier-test-copy 346d74d (S9), queue-protection 771da11 (W1, W2), scratch-write-hardening 466710c (W3, S8), heredoc-limits 1c3f51c (S7, partly; see Out of scope).

## Rounds 2 and 3 (history: this file at c5c5d0e holds the full tables and step texts)
Round 2 (3 Warning) was closed by units 7-9 and round 3 (4 Warning) by units 10-11, all MERGED: network-consumer-doc 9d360dc (the exit-3 `parked[]` contract in `_network.md`), submodule-worktree-queue 65a9c40 (the queue from a submodule's linked worktree), cp-link-sources cbb14e1 (cp -l/-s sources), ln-check-safe-exemption 1b8699c (linear text check, wrappers refused again), submodule-git-surface 1ef4081 (submodule config and hooks, rsync --link-dest, cp link names). The heredoc spellings are the follow-up row followup-heredoc-spellings; the ARCH-STATE-18 and ARCH-SAFETY-13 wording is `/architect --update` work.

## Round 4 findings (isolated scrutineer, 2026-11-03, state 1ef4081; all three criteria MET; R4-W1 re-verified by root)
| id | class / severity | where | unit |
|---|---|---|---|
| R4-W1 | Correctness / Warning (unit 11 regression) | `self-protect.mjs:29,166` the pattern `**/.git/worktrees/*/modules/**/...` has a `/**/` after its anchor, so `holds()` treats every path under `.git/worktrees` as holding state: `rm -f .git/worktrees/wt/index.lock` and `logs` went from exit 0 to 2 (reproduced); a stale lock in a unit worktree can no longer be cleared | 12 |
| R4-W2 | Security / Warning (R3-W2 half closed) | `self-protect.mjs:33` config, config.worktree, hooks/** and worktrees/*/config* under `.git/worktrees/<wt>/modules/<name>` (a submodule checked out in a superproject's linked worktree) are writable | 12 |
| R4-W3 | Security / Warning (older) | `self-protect.mjs:31-35` the gitfile (`sub/.git`, `<wt>/.git`) and `commondir`/`gitdir` files are writable from every root: re-pointing them hands root's git a forged dir's config, hooks and queue | 12 (patterns), 13 (a regular file named .git) |
| R4-W4 | Security / Warning (older) | `pre-guard.mjs:874` `placements` does not read an attached `-tDIR` or a cluster ending in `t`: `cp ../tmp/queue.jsonl -t.git/.craftsman/network` exits 0 and GNU cp honours it | 13 |
| R4-W5 | Security / Warning (older) | `pre-guard.mjs:931,817,828`, `self-protect.mjs:153` `cp -al .`, `cp -lr . ../tmp/o2`, `cp -al ../proj ../other/o3` and a glob-bearing source (`.crafts*an/...`) make hard links to state: `holds()` is false for the project root and `target()` skips glob arguments; writes through the link then pass | 13 |
| R4-S6 | Correctness / Suggestion | `pre-guard.mjs:613-614` the link check reads quoted heredoc bodies (prose naming both words is refused) | 13 |
| R4-S7 | Correctness / Suggestion | `pre-guard.mjs:1821` vs `:1830` the cheap link refusal runs after the slow `removedDocs`: 48 KB takes 12 s, past the hook timeout | 13 |
| R4-S8 | Security / Suggestion | `pre-guard.mjs:911,613` the state dir name is compared case-sensitively (`selfKind` folds) | 13 |
| R4-S9 | Security / Suggestion | `pre-guard.mjs:1037,234` the link verb judges raw words (`/bin/ln`, one operand, `-t`); `env -S'...'` attached | 13 (fix or stated limit) |
| R4-S10 | Test-coverage / Suggestion | missing rows: `.git/worktrees/<wt>/<file>` removable, wtGitDir config and hooks refused, the gitfile refused, `cp -al .` refused (`self-protect.test.mjs:258`, `pre-guard-queue.test.mjs:384`) | 12, 13 |
| R4-S11 | Correctness / Suggestion | five more `NEVER_TEXT` alternatives add latency (4 KB word 99 to 132 ms) | row followup-bash-guard-linear-cost |

## Round 5 (isolated scrutineer, 2026-11-03, state 11f3040): 0 Critical, 4 Warning, 4 Suggestion; 372 and 378 MET, 379 (bash-writer-gaps) UNMET
Units 12-13 closed R4-W1, W2, W4 and the literal spellings of R4-W3 and W5. The remainder is registered as PENDING follow-up rows, not driven (`/scrutinise` Phase 2 step 3): followup-multi-target-latency (the one finding new in unit 13), followup-gitfile-spellings, followup-last-segment-glob, followup-dynamic-link-source, followup-find-delete-stale-consumer. Five rounds found 4 to 5 fresh Warnings each, mostly spellings that predate the reviewed range, so the loop stopped for a scope decision (hardening of the Bash text guard is open-ended; ARCH-SAFETY-15 answers it with stated limits). Line 379 stays unticked until those rows are decided.

## Scope Steps (executable core)

## Merged fix units 7-13
worktree-surface-fixes 53bb13b · bash-writer-gaps 11f3040 · network-consumer-doc 9d360dc · submodule-worktree-queue 65a9c40 · cp-link-sources cbb14e1 · ln-check-safe-exemption 1b8699c · submodule-git-surface 1ef4081 (step texts: this file at c5c5d0e).

### Step 12 — worktree-surface-fixes (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor · skills test-driven-development
Depends on: submodule-git-surface (same file)
- [ ] 12.1 RED rows in `scripts/lib/self-protect.test.mjs` and `scripts/pre-guard-queue.test.mjs`: `heldNever` is false for `.git/worktrees/wt/index.lock`, `logs`, `HEAD` and a real `rm -f` of the lock exits 0 from the main checkout and from the linked worktree; it stays true for `.git/worktrees/wt/modules/sub/.craftsman/network/queue.jsonl` and each of its parent directories; a Write and an `echo >>` onto `.git/worktrees/wt/modules/sub/{config,config.worktree,hooks/pre-push,worktrees/subwt/config.worktree}`, onto `.git/worktrees/wt/{commondir,gitdir}` and `.git/modules/sub/worktrees/subwt/{commondir,gitdir}` exit 2 from the superproject root, its linked worktree, the submodule root, both submodule linked worktrees; Reads exit 0 → accept: the index.lock rows and the new-path rows fail on main (probes p2, p13 of the round 4 audit)
- [ ] 12.2 In `self-protect.mjs` (`holds()` ~:150-170, SELF_NEVER ~:18-35): for a pattern with a middle `**`, count an ancestor only up to the first `/**/` read as a glob (the prefix `.git/worktrees/*/modules`), never anything under the anchor; add the twins `**/.git/worktrees/*/modules/**/config`, `.../config.worktree`, `.../hooks/**`, `.../worktrees/*/config*` and the files `**/.git/worktrees/*/commondir`, `**/.git/worktrees/*/gitdir`, `**/.git/modules/**/worktrees/*/commondir`, `**/.git/modules/**/worktrees/*/gitdir`; fold alternatives where one pattern can cover several so `NEVER_TEXT` does not grow → accept: 12.1 green, the unit 10 latency rows stay green and a 4 KB single long word stays under 150 ms
- [ ] 12.3 Mutation checks, each shown red then restored by copying a saved copy back (never git checkout, restore or reset): drop the prefix rule (the lock rows go red); drop the twins (the new-path rows go red) → accept: each turns its own rows red; `git status` clean after
- [ ] 12.4 Re-point cites into `self-protect.mjs` this unit moved in `safety.rules.md` (cite text only) → accept: lint and the three safety doc tests pass; then run `node --test scripts/*.test.mjs scripts/lib/*.test.mjs` → accept: exit 0

### Step 13 — bash-writer-gaps (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor · skills test-driven-development
Depends on: worktree-surface-fixes (same file family; guard units last)
- [ ] 13.1 RED rows in `scripts/pre-guard.test.mjs` and `scripts/pre-guard-queue.test.mjs`: (a) `cp ../tmp/queue.jsonl -t.git/.craftsman/network`, `cp -ft.git/...`, `mv` and `install` with an attached `-tDIR` or a cluster ending in `t`, and `cp ../tmp/off -t.craftsman` exit 2 (`-t DIR` and `--target-directory=DIR` stay 2); (b) `cp -al . ../tmp/o1`, `cp -lr . ../tmp/o2`, `cp -al ../proj ../other/o3` and a glob-bearing linking source that could name state (`.crafts*an/sessions/x/scope-*`, with cp -l and with the linking verb) exit 2, while `cp -al docs ../tmp/d` stays 0; (c) a Write and `echo 'gitdir: /x' >` onto a regular file named `.git` (`sub/.git`, `<wt>/.git`) exit 2 from every root and a Read exits 0; (d) a quoted-heredoc body that names both the verb word and the state dir exits 0, a real link after it exits 2; (e) a 48 KB command of repeated link operands into the state dir is answered in under 1 s; (f) a link into `.Craftsman/approvals` exits 2; (g) `/bin/ln -s ../../tmp/approvals` run from the state dir and `"ln" -sft.craftsman` exit 2 → accept: the new rows fail on main (probes p3, p3b, p7, p9, p10, p15, p16 of the round 4 audit)
- [ ] 13.2 In `pre-guard.mjs`: read `-t<DIR>` and short-option clusters holding `t` the way getopt does in `placements` (~:874); treat a linking source that is or contains the project root, the main checkout or the git common dir, or that carries a glob character and could name state, as holding state in the cp/ln/rsync/link paths (~:931,817,828); refuse a write whose real path is a regular file named `.git` in `target()`; run `linksIntoState` on the `blankInertHeredocs` view and before `removedDocs` (~:1821); fold the state dir name case-insensitively in `inState`/`linksIntoState`; judge where an ln lands (one operand, `-t`, path-qualified verbs) → accept: 13.1 green and the existing cp/ln/rsync, queue and latency rows stay green
- [ ] 13.3 Record in the ARCH-SAFETY-13 rules text, as stated limits (ARCH-SAFETY-15), what stays unjudged: a hard link made by a tool the guard does not judge (cpio -l, pax -l, an interpreter) carrying a later Bash write, and `env -S` with an attached string if 13.2 leaves it; one sentence → accept: lint and the three safety doc tests pass
- [ ] 13.4 Mutation checks, each shown red then restored by copying a saved copy back: drop the attached `-t` reading; drop the root/glob source judgement; drop the `.git` gitfile refusal; drop the heredoc view → accept: each turns its own rows red; `git status` clean after
- [ ] 13.5 Recompute every `pre-guard.mjs` cite in `safety.rules.md` and `state.rules.md` against the final file (cite text only) → accept: lint and the three safety doc tests pass; every cited range opens on the construct its rule names; then run `node --test scripts/*.test.mjs scripts/lib/*.test.mjs` → accept: exit 0

### Root tasks (no unit, no worktree)
- [x] R.1 Per-merge verification of sandbox-auto-flow-phase-2 and of units 1-6 (tables below) → accept: every row green
- [x] R.2 Register `followup-heredoc-spellings` (PENDING, plan `sandbox-auto-flow.md`) for R2-S7 → accept: the row shows PENDING with the spellings listed
- [x] R.3 After units 7-9 merge, run the per-merge check for their three merge shas and append the rows → accept: every row green
- [x] R.4 After units 10-11 merge, run the per-merge check for their two merge shas and append the rows; then judge the plan's whole-plan line again → accept: every row green
- [x] R.5 After units 12-13 merge, run the per-merge check for their two merge shas and append the rows → accept: every row green

## Sequencing
Units run in plan-graph order: 7 (docs, independent), then 8 and 9 (guard units last, 9 on 8), then 10 and 11 (11 on 10), then 12 and 13 (13 on 12). After the run: `/scrutinise sandbox-auto-flow-phase-2` again until 0 Critical and 0 Warning; then `/sync-docs --all sandbox-auto-flow-phase-2` (it also re-points ARCH-APPROVAL-05's `session-context.mjs` cite and aligns ARCH-SAFETY-13's wording), `/architect --update safety state landing auto` (ARCH-STATE-18's text and check clause gain the `nlink` refusal and the new-file Write), and `/craftsman:merge`.

## Verification background   (citations — for the reviewer, not the executor)
CONSUMERS:
- exit-3 `needs_network` payload (`repo-exec.mjs:~876-880`, gains `parked[]`): documented consumer `commands/_network.md` (sections "Around a workflow run" and "A run returns needs_network"); tests `repo-exec.test.mjs:~1194`, `network.test.mjs` wording row.
- `superprojectRoots`/`outerRelWhere`/`mainRelOf` (`pre-guard.mjs:~170-206`): used by `mainStateRel` and the removal path; tests `pre-guard-queue.test.mjs`.
- `copyTargets`/`writeTargets`/the `ln` branch (`pre-guard.mjs:~876, ~970-990`) and the text check at `~1778`: tests `pre-guard.test.mjs`, `self-protect.test.mjs` (`WRITER_VERBS`).
- Round 1 consumers (`normalizeHandoff`, `handoffArmsScope`, `drainQueue`, `insideScratchRoots`, `WRITER_VERBS`, `SELF_NEVER`) are unchanged by units 7-9.

Per-merge table of sandbox-auto-flow-phase-2 (root task R.1, run 2026-11-03 on `git archive` copies with a fresh `git init`; `node --test scripts/*.test.mjs scripts/lib/*.test.mjs`, `arch-check.mjs lint`, `doc-size-policy.mjs`; every row has one skipped test, `ratchet: no cap rises versus the merge-base (skips without git)`, because a copy has no merge-base; the real checkout runs 0 skipped):

tests per merge sha, 0 failures, lint PASS (211 rules) and doc-size PASS at each: 728fef9 prettier-ignore 1520 · 53d0b28 command-records 1523 · ad83507 marker-lifecycle 1550 · 3d80366 init-settings 1577 · 72b890d network-drain 1604 · e60fcbf guard-paths 1616 · 80a8846 guard-heredoc 1624 · 2b32191 phase2-changelog 1624.

The same for units 1-13 of this plan (real checkout at 11f3040: 1693 tests, 0 skipped, gitleaks clean):

tests per merge sha, 0 failures, lint and doc-size PASS at each: 4b5623d handoff-arming 1634 · aa73e33 drain-rejected 1638 · 346d74d prettier-test-copy 1638 · 771da11 queue-protection 1648 · 466710c scratch-write-hardening 1654 · 1c3f51c heredoc-limits 1660 · 9d360dc network-consumer-doc 1661 · 65a9c40 submodule-worktree-queue 1667 · cbb14e1 cp-link-sources 1670 · 1b8699c ln-check-safe-exemption 1672 · 1ef4081 submodule-git-surface 1680 · 53bb13b worktree-surface-fixes 1688 · 11f3040 bash-writer-gaps 1693.

## Risk & rollback
Units 8 and 9 edit the 150 KB `pre-guard.mjs`; another session may have touched it, so a conflict PARKs the unit with its branch kept. Unit 8's common-dir containment must not refuse an ordinary repo's `.git` writes outside the queue (8.1 pins the allowed paths). Unit 9 widens one text check and narrows another: the anchor (9.3) must not weaken the existing `ln` refusals. Rollback is one revert per unit.

## Out of scope
R2-S7 heredoc spellings (`'source' f`, `\. f`, `time -p case`, NFKC identifiers) are a stated limit today and go to the follow-up row. R2-S8 (ARCH-STATE-18 text) is `/architect --update` work, not a unit. `ARCH-APPROVAL-05`'s `session-context.mjs` cite and ARCH-SAFETY-13's wording are `/sync-docs`. The scratch-Write root pin at `<tmpdir>/craftsman-roots/<sid>` (writable by a scoped scratch Write; the reviewer found no bypass) is recorded as residual risk. Whether Claude Code honours `sandbox.network.allowedDomains` and how the auto-mode classifier reads `NETWORK_STEP_ALLOW` cannot be checked from this repo. Round 3 stated limits (cpio -l, pax -l, unlisted wrappers before a writer, quote-split names) are recorded by unit 11 in ARCH-SAFETY-13, not fixed; the ARCH-SAFETY-13 wording for cp, the submodule common dir and the anchored check is `/architect --update` work.
