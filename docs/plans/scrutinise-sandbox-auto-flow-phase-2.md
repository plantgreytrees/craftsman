---
slug: scrutinise-sandbox-auto-flow-phase-2
goal: The phase 2 guards close the holes isolated reviews found: every push queue (a submodule's, and from any linked worktree) and its parent directory is protected, a hard link cannot carry a scoped Write or Edit to protected state through the tools or through cp -l, a per-unit hand-off keeps the scope requirement alive after compaction, and no refused queue entry leaves without a PARK that root acts on.
level: feature
parent: sandbox-auto-flow-phase-2
priority: P1
classification: /scrutinise rounds 1 and 2 of sandbox-auto-flow-phase-2 (isolated scrutineer, 2026-11-03; round 1 range 55faf53..2b32191, round 2 range d87a8cf..1c3f51c, committed state 6b04842); round 1: 4 Warning, 5 Suggestion; round 2: 0 Critical, 3 Warning, 5 Suggestion, 0 Disputed; round 3 (range 6b04842..cbb14e1): 0 Critical, 4 Warning, 4 Suggestion, 0 Disputed
tracker_rows: [TRACKER#handoff-arming, TRACKER#drain-rejected, TRACKER#prettier-test-copy, TRACKER#queue-protection, TRACKER#scratch-write-hardening, TRACKER#heredoc-limits, TRACKER#network-consumer-doc, TRACKER#submodule-worktree-queue, TRACKER#cp-link-sources, TRACKER#ln-check-safe-exemption, TRACKER#submodule-git-surface, TRACKER#followup-heredoc-spellings]
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
---

# Plan: scrutinise sandbox-auto-flow-phase-2 (rounds 1 and 2)

## Outcome
Round 1 (4 Warning) is fixed by units 1-6, all MERGED. Round 2 re-reviewed those merges (0 Critical, 3 Warning, 5 Suggestion) and found three holes the fixes left: the new `parked[]` on a drain's exit-3 payload contradicts the one doc that tells root to "park nothing", a session in a linked worktree of a submodule can still write the queue with plain Bash, and `cp -l` hard-links exactly like `ln` but its source is never judged. Units 7-9 close them. Round 3 (0 Critical, 4 Warning) found two regressions of unit 9's own narrowing of the ln text check (an exponential regex, and weaker refusals for unlisted wrappers) and two older gaps on the submodule surface (git config and hooks, rsync --link-dest); units 10-11 close them. Done = `/scrutinise sandbox-auto-flow-phase-2` returns 0 Critical, 0 Warning, no UNMET.

## Round 1 (history: this file at 6b04842 holds the full findings table and the six step texts)
Units 1-6 are MERGED: handoff-arming 4b5623d (W4, S5), drain-rejected aa73e33 (S6), prettier-test-copy 346d74d (S9), queue-protection 771da11 (W1, W2), scratch-write-hardening 466710c (W3, S8), heredoc-limits 1c3f51c (S7, partly; see Out of scope).

## Round 2 findings (isolated scrutineer, 2026-11-03, state 1c3f51c; all three Warnings re-verified by root: probe p5 reproduced, code read)
| id | class / severity | where | unit |
|---|---|---|---|
| R2-W1 | Correctness / Warning | `commands/_network.md:13` says to PARK each `parked[]` entry, while the drain-failure sentence in the `needs_network` section says "park nothing"; `repo-exec.mjs:835-841,876-878` puts the PARKs of already-removed entries into the exit-3 payload | 7 |
| R2-W2 | Security / Warning | `pre-guard.mjs:181-206` `superprojectRoots` / `outerRelWhere`: in a linked worktree of a submodule project `git rev-parse --show-superproject-working-tree` prints nothing, so `echo >>`, `echo >`, `printf >>`, `cat >>` onto `.git/modules/<name>/.craftsman/network/queue.jsonl`, and `rm`/`mv` of its directory, exit 0 (Write and Edit are refused only by accident) | 8 |
| R2-W3 | Security / Warning | `pre-guard.mjs:876-880` `copyTargets`: `cp -l`, `cp --link` (and `-s`) never judge the source, so a hard link to a scope manifest or the queue can be made and then overwritten (the round-1 W3 class, through Bash) | 9 |

Suggestions: R2-S4 (the text check matched a search for the word) and R2-S5 (stale ARCH-STATE-16 cite) are closed by unit 9, R2-S6 (no submodule linked-worktree row) by unit 8; R2-S7 (heredoc spellings) goes to followup-heredoc-spellings and R2-S8 (ARCH-STATE-18 text) to `/architect --update`.

## Round 3 findings (isolated scrutineer, 2026-11-03, state cbb14e1; all five criteria MET; W1 and W4 re-verified by root on merged main)
| id | class / severity | where | unit |
|---|---|---|---|
| R3-W1 | Security / Warning | `pre-guard.mjs:604-605` WRAPPED/LINK_AT_COMMAND backtracks exponentially: a harmless command with 26 `1=1` tokens after `sudo` takes 10 s (the pre-guard hook timeout, `hooks/hooks.json:10`); the check runs before the concrete refusals at :1799+ (reproduced) | 10 |
| R3-W4 | Architecture / Warning | the same narrowing weakens refusals that existed: `setsid`, `chrt`, `flock`, `taskset`, `strace`, `unshare`, `fakeroot` or `watch` in front of ln into the state dir went from exit 2 to exit 0 (reproduced); ARCH-SAFETY-15 narrows only where text is provably inert | 10 |
| R3-W2 | Security / Warning (older gap) | `self-protect.mjs:18-31` SELF_NEVER: a submodule's `.git/modules/<name>/config`, `config.worktree`, `hooks/**` and `worktrees/*/config*` are writable from every root; root pushes with the user's credentials (`network.mjs:57-58`) | 11 |
| R3-W3 | Security / Warning | `pre-guard.mjs:~1178` rsync goes to `copyTargets`: `--link-dest=DIR` hard-links unchanged files from DIR, the R2-W3 class through rsync | 11 |
| R3-S5 | Security / Suggestion | `self-protect.mjs:188-197` commonRel: a queue under `.git/worktrees/<wt>/modules/<name>/.craftsman/network` has no pattern | 11 |
| R3-S6 | Cross-unit / Suggestion | `pre-guard.mjs:~900-1006` a cp that links does not get the ln branch's check that the link NAME lands in the state dir (`cp -s /tmp/x .craftsman/x` exits 0) | 11 |
| R3-S7 | Architecture / Suggestion | ARCH-SAFETY-13 text still says only "ln"; `/architect --update` after the run, carry R2-S8 and these | /architect |
| R3-S8 | Test-coverage / Suggestion | no unlisted-wrapper row and no latency row in `pre-guard.test.mjs:628-649` | 10 |

## Scope Steps (executable core)

### Step 7 — network-consumer-doc (., javascript, normal)
Tooling: implementer implementer · gates code-reviewer · skills test-driven-development
Depends on: none
- [ ] 7.1 RED row in `scripts/network.test.mjs` (next to the existing `_network.md` wording row): the doc text tells root that a drain which exits 3 with `parked[]` PARKs each entry (as step 3 does) and then stops, and the `needs_network` section no longer says to park nothing for that case → accept: the row fails on main
- [ ] 7.2 Edit `commands/_network.md` (2,571 of its 2,573-byte cap, ARCH-SLIM-02: net growth <= 2 bytes, so trim non-MUST prose in the same file; no MUST sentence leaves, ARCH-SLIM-06): the drain-failure sentence names `parked[]` → accept: 7.1 green and `node scripts/doc-size-policy.mjs` PASS
- [ ] 7.3 Re-point cites into `_network.md` if any moved → accept: lint and the three safety doc tests pass; then run `node --test scripts/*.test.mjs scripts/lib/*.test.mjs` → accept: exit 0

### Step 8 — submodule-worktree-queue (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor · skills test-driven-development
Depends on: none (guard units last; a conflict with another session's `pre-guard.mjs` rounds PARKs this unit with its branch kept)
- [ ] 8.1 RED rows in `scripts/pre-guard-queue.test.mjs` (extend `repoWithSubmodule`): add a linked worktree of the submodule inside `sub/.claude/worktrees/wt` and one beside it (`<base>/sub-wt`); from each, a Write, an Edit, `echo >>`, `echo >`, `printf >>`, `cat f >>`, `tee -a`, `cp` and `sed -i` onto the queue (absolute and relative path), and `rm -rf`, `mv` of `<common>/.craftsman/network` and `<common>/.craftsman` exit 2; a Read exits 0; `enqueuePush` run by node still writes; ordinary directories stay allowed → accept: the `>>`, `>` and `rm`/`mv` rows fail on main (probes p5, p10 of the round 2 audit)
- [ ] 8.2 In `pre-guard.mjs` judge the session's real git common dir directly: resolve `realpath(git rev-parse --git-common-dir)` once (memoised, failing open to today's behaviour) and refuse a write inside `<common>/.craftsman/network/**` and the removal or move of `<common>/.craftsman/network`, `<common>/.craftsman` or `<common>` by containment, in both the redirect and the writer-verb paths (or apply `selfKind` and `heldNever` to the absolute real path in `foldedSelf` and `target()`, as the Write path already does; pick one and say why) → accept: 8.1 green and `scripts/lib/self-protect.test.mjs`, `scripts/pre-guard*.test.mjs` stay green
- [ ] 8.3 Mutation checks, each with one temporary edit shown red then restored by copying a saved copy back (never git checkout, restore or reset): drop the common-dir containment test; drop the redirect branch → accept: each turns its own rows red; `git status` clean after
- [ ] 8.4 Re-point cites into `pre-guard.mjs` and `self-protect.mjs` this unit moved in `safety.rules.md` (cite text only) → accept: lint and the three safety doc tests pass; then run `node --test scripts/*.test.mjs scripts/lib/*.test.mjs` → accept: exit 0

### Step 9 — cp-link-sources (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor · skills test-driven-development
Depends on: submodule-worktree-queue (same file)
- [ ] 9.1 RED rows in `scripts/pre-guard.test.mjs` (the hard-link group): with an active unit scope and the scratch dir on the project's filesystem, `cp -l <manifest> <scratch>/h.json`, `cp --link`, `cp -al`, `cp -sl`-style clusters and `cp -s <manifest> <scratch>/s.json` exit 2 like `ln`; the same for the push queue as source; `cp <ordinary> <scratch>/x` stays allowed; `grep -n link .craftsman/acceptance.md` and `rg -n link .craftsman/` exit 0 → accept: the `cp -l`/`--link` rows and the two search rows fail on main (probes p1, p11, p12)
- [ ] 9.2 In `copyTargets`/`writeTargets` (`pre-guard.mjs:~876`) treat `cp` with `-l`, `--link`, `-s`, `--symbolic-link` (or a short-option cluster containing `l` or `s`) like `ln`: judge each source through the same `target(aimed, ..., "write")` path as the `ln`/`link` branch (`:~970-990`) → accept: the `cp` rows of 9.1 green
- [ ] 9.3 Give the `ln`/`link` text check (`:~1778`) a command-position anchor (the `AT_COMMAND` pattern the other verbs use) so a search for the word `link` is not a link → accept: the search rows of 9.1 green and the existing `ln` rows stay green
- [ ] 9.4 Mutation checks, each shown red then restored by copying a saved copy back: drop the `cp -l` source judgement; drop the anchor (the search rows go red) → accept: each turns its own rows red; `git status` clean after
- [ ] 9.5 Recompute every `scripts/pre-guard.mjs` cite in `safety.rules.md` and `state.rules.md` against the final file (ARCH-STATE-16's `:1350-1367` is stale since queue-protection added 29 lines at `:177-206`; cite text only) → accept: lint and the three safety doc tests pass; every cited range opens on the construct its rule names; then run `node --test scripts/*.test.mjs scripts/lib/*.test.mjs` → accept: exit 0

### Step 10 — ln-check-safe-exemption (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor · skills test-driven-development
Depends on: cp-link-sources (same file)
- [ ] 10.1 RED rows in `scripts/pre-guard.test.mjs` next to the cp/ln group: (a) `setsid`, `chrt 5`, `flock /x`, `taskset 1`, `strace -f`, `unshare -r`, `fakeroot` and `watch` in front of an ln whose link name or source is under the state dir exit 2 (the listed wrappers stay 2); (b) read-only searches that only name the word (`grep -n link .craftsman/acceptance.md`, `rg -n link .craftsman/`, `echo ln .craftsman`, `printf`, `cat`, `git log` heads) exit 0; a mixed command whose second segment is a real ln exits 2; (c) latency: the guard finishes in under 300 ms on `sudo` followed by 40 `1=1` tokens, `nice` followed by 40 digits, and 400 spaces → accept: the (a) and (c) rows fail on main (`setsid` exits 0; 26 tokens take 10 s)
- [ ] 10.2 In `pre-guard.mjs` (`:601-609`, check at `~:1798`) replace WRAPPED and LINK_AT_COMMAND by the old unanchored check as the default (a command naming the state dir and the word ln or link as a whole word is refused) plus a linear exemption: split on `;`, `&&`, `||`, `|` and newlines with plain string operations; exempt the command only when every segment that holds the word starts with a read-only head from a fixed list (grep, egrep, fgrep, rg, echo, printf, cat, git log); no regex with nested or overlapping quantifiers → accept: 10.1 green and the existing cp/ln rows stay green
- [ ] 10.3 Smoke the other Bash-path regexes with the latency rows' style (long runs of spaces, digits, `=`, quotes, parentheses): one-line fixes are made here, anything bigger is a PENDING row → accept: no input of 4 KB takes over 300 ms
- [ ] 10.4 Mutation checks, each shown red then restored by copying a saved copy back (never git checkout, restore or reset): drop the head list (the search rows go red); drop the every-segment rule (the mixed row goes red) → accept: each turns its own rows red; `git status` clean after
- [ ] 10.5 Re-point cites into `pre-guard.mjs` this unit moved in `safety.rules.md` and `state.rules.md` (cite text only) → accept: lint and the three safety doc tests pass; then run `node --test scripts/*.test.mjs scripts/lib/*.test.mjs` → accept: exit 0

### Step 11 — submodule-git-surface (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor · skills test-driven-development
Depends on: ln-check-safe-exemption (same file)
- [ ] 11.1 RED rows in `scripts/pre-guard-queue.test.mjs` and `scripts/lib/self-protect.test.mjs`: from the superproject root, the submodule root, both submodule linked worktrees and the superproject's linked worktree, a Write and an `echo >>` onto `.git/modules/sub/config`, `.git/modules/sub/config.worktree`, `.git/modules/sub/hooks/pre-push` and `.git/modules/sub/worktrees/wt/config` exit 2 (the plain-repo `.git/config` and `.git/hooks` rows already do); the queue of a submodule checked out inside a superproject linked worktree (`.git/worktrees/<wt>/modules/sub/.craftsman/network/queue.jsonl`): Write, `>>` and `rm -rf` of its directory exit 2; a Read exits 0; ordinary directories stay allowed → accept: the config, hooks and worktree-modules rows fail on main
- [ ] 11.2 Add to `SELF_NEVER` (`self-protect.mjs:18-31`) `**/.git/modules/**/config`, `**/.git/modules/**/config.worktree`, `**/.git/modules/**/hooks/**`, `**/.git/modules/**/worktrees/*/config*` and `**/.git/worktrees/*/modules/**/.craftsman/network/**`; check that `holds()` refuses the removal of their parents the way it does for the queue → accept: 11.1 green and `self-protect.test.mjs`, `pre-guard*.test.mjs` stay green
- [ ] 11.3 RED rows in `scripts/pre-guard.test.mjs`: `rsync -a --link-dest=<dir> src/ out/` and `--link-dest <dir>` exit 2 when `<dir>` is the state dir or holds a protected state file; the same rsync without `--link-dest` and with an ordinary dir stays allowed; `cp -s /tmp/x .craftsman/x` and `cp -l /tmp/x .craftsman/x` exit 2 like `ln -s` → accept: the new rows fail on main (probes of the round 3 audit)
- [ ] 11.4 In `pre-guard.mjs` judge `--link-dest[=]DIR` in the rsync branch (`~:1178`) as a linking source (`target(DIR, st, "holds", env)` and the linked-sources path used for cp), and run the ln branch's state-dir name containment (`~:997-1006`) over the destination names of a cp that links → accept: 11.3 green
- [ ] 11.5 Record in the ARCH-SAFETY-13 rules text, as stated limits (ARCH-SAFETY-15), what stays unjudged: `cpio -pdl`, `pax -l`, an unlisted wrapper in front of a writer, quote-split names; one sentence, no other prose change → accept: lint and the three safety doc tests pass
- [ ] 11.6 Mutation checks, each shown red then restored by copying a saved copy back: drop the modules config/hooks patterns; drop the `--link-dest` judgement; drop the cp name containment → accept: each turns its own rows red; `git status` clean after
- [ ] 11.7 Re-point cites into `self-protect.mjs` and `pre-guard.mjs` this unit moved (cite text only) → accept: lint and the three safety doc tests pass; then run `node --test scripts/*.test.mjs scripts/lib/*.test.mjs` → accept: exit 0

### Root tasks (no unit, no worktree)
- [x] R.1 Per-merge verification of sandbox-auto-flow-phase-2 and of units 1-6 (tables below) → accept: every row green
- [x] R.2 Register `followup-heredoc-spellings` (PENDING, plan `sandbox-auto-flow.md`) for R2-S7 → accept: the row shows PENDING with the spellings listed
- [x] R.3 After units 7-9 merge, run the per-merge check for their three merge shas and append the rows → accept: every row green
- [x] R.4 After units 10-11 merge, run the per-merge check for their two merge shas and append the rows; then judge the plan's whole-plan line again → accept: every row green

## Sequencing
Units run in plan-graph order: 7 (docs, independent), then 8 and 9 (guard units last, 9 on 8), then 10 and 11 (11 on 10). After the run: `/scrutinise sandbox-auto-flow-phase-2` again until 0 Critical and 0 Warning; then `/sync-docs --all sandbox-auto-flow-phase-2` (it also re-points ARCH-APPROVAL-05's `session-context.mjs` cite and aligns ARCH-SAFETY-13's wording), `/architect --update safety state landing auto` (ARCH-STATE-18's text and check clause gain the `nlink` refusal and the new-file Write), and `/craftsman:merge`.

## Verification background   (citations — for the reviewer, not the executor)
CONSUMERS:
- exit-3 `needs_network` payload (`repo-exec.mjs:~876-880`, gains `parked[]`): documented consumer `commands/_network.md` (sections "Around a workflow run" and "A run returns needs_network"); tests `repo-exec.test.mjs:~1194`, `network.test.mjs` wording row.
- `superprojectRoots`/`outerRelWhere`/`mainRelOf` (`pre-guard.mjs:~170-206`): used by `mainStateRel` and the removal path; tests `pre-guard-queue.test.mjs`.
- `copyTargets`/`writeTargets`/the `ln` branch (`pre-guard.mjs:~876, ~970-990`) and the text check at `~1778`: tests `pre-guard.test.mjs`, `self-protect.test.mjs` (`WRITER_VERBS`).
- Round 1 consumers (`normalizeHandoff`, `handoffArmsScope`, `drainQueue`, `insideScratchRoots`, `WRITER_VERBS`, `SELF_NEVER`) are unchanged by units 7-9.

Per-merge table of sandbox-auto-flow-phase-2 (root task R.1, run 2026-11-03 on `git archive` copies with a fresh `git init`; `node --test scripts/*.test.mjs scripts/lib/*.test.mjs`, `arch-check.mjs lint`, `doc-size-policy.mjs`; every row has one skipped test, `ratchet: no cap rises versus the merge-base (skips without git)`, because a copy has no merge-base; the real checkout runs 0 skipped):

tests per merge sha, 0 failures, lint PASS (211 rules) and doc-size PASS at each: 728fef9 prettier-ignore 1520 · 53d0b28 command-records 1523 · ad83507 marker-lifecycle 1550 · 3d80366 init-settings 1577 · 72b890d network-drain 1604 · e60fcbf guard-paths 1616 · 80a8846 guard-heredoc 1624 · 2b32191 phase2-changelog 1624.

The same for units 1-11 of this plan (real checkout at 1ef4081: 1680 tests, 0 skipped, gitleaks clean):

tests per merge sha, 0 failures, lint and doc-size PASS at each: 4b5623d handoff-arming 1634 · aa73e33 drain-rejected 1638 · 346d74d prettier-test-copy 1638 · 771da11 queue-protection 1648 · 466710c scratch-write-hardening 1654 · 1c3f51c heredoc-limits 1660 · 9d360dc network-consumer-doc 1661 · 65a9c40 submodule-worktree-queue 1667 · cbb14e1 cp-link-sources 1670 · 1b8699c ln-check-safe-exemption 1672 · 1ef4081 submodule-git-surface 1680.

## Risk & rollback
Units 8 and 9 edit the 150 KB `pre-guard.mjs`; another session may have touched it, so a conflict PARKs the unit with its branch kept. Unit 8's common-dir containment must not refuse an ordinary repo's `.git` writes outside the queue (8.1 pins the allowed paths). Unit 9 widens one text check and narrows another: the anchor (9.3) must not weaken the existing `ln` refusals. Rollback is one revert per unit.

## Out of scope
R2-S7 heredoc spellings (`'source' f`, `\. f`, `time -p case`, NFKC identifiers) are a stated limit today and go to the follow-up row. R2-S8 (ARCH-STATE-18 text) is `/architect --update` work, not a unit. `ARCH-APPROVAL-05`'s `session-context.mjs` cite and ARCH-SAFETY-13's wording are `/sync-docs`. The scratch-Write root pin at `<tmpdir>/craftsman-roots/<sid>` (writable by a scoped scratch Write; the reviewer found no bypass) is recorded as residual risk. Whether Claude Code honours `sandbox.network.allowedDomains` and how the auto-mode classifier reads `NETWORK_STEP_ALLOW` cannot be checked from this repo. Round 3 stated limits (cpio -l, pax -l, unlisted wrappers before a writer, quote-split names) are recorded by unit 11 in ARCH-SAFETY-13, not fixed; the ARCH-SAFETY-13 wording for cp, the submodule common dir and the anchored check is `/architect --update` work.
