---
slug: scrutinise-sandbox-auto-flow-phase-2
goal: The phase 2 guards close the holes an isolated review found: a submodule project's push queue and the queue's parent directory are protected, a hard link cannot carry a scoped Write or Edit to protected state, a per-unit hand-off keeps the scope requirement alive after compaction, and no refused queue entry leaves without a PARK.
level: feature
parent: sandbox-auto-flow-phase-2
priority: P1
classification: /scrutinise round 1 of sandbox-auto-flow-phase-2 (isolated scrutineer, 2026-11-03, range 55faf53..2b32191, committed state d87a8cf); 4 Warning, 5 Suggestion, 0 Critical, 0 Disputed
tracker_rows: [TRACKER#handoff-arming, TRACKER#drain-rejected, TRACKER#prettier-test-copy, TRACKER#queue-protection, TRACKER#scratch-write-hardening, TRACKER#heredoc-limits]
guards:
  blast_radius: done
  completeness_sweep: done
  blind_rederivation: skipped(config:never)
coverage:
  contract:      1.3 (new export handoffArmsScope in lib/core.mjs; handoff.mjs refuses a unit hand-off without remaining_units), 2.2 (drainQueue error and return shape), 5.3 (WRITER_VERBS gains link); consumers in CONSUMERS
  data:          N/A(no persistence or migration; an old hand-off file without remaining_units is only read, never rewritten)
  config:        N/A(no config key)
  security:      4.1-4.3 (W1, W2: the queue and its parent), 5.1-5.4 (W3 hard link, S8 new-file Write), 6.1-6.3 (S7 heredoc bodies); security-auditor gate on units 2, 4, 5 and 6
  tests:         every unit starts with red rows (1.1, 2.1, 3.1, 4.1, 5.1, 6.1); mutation checks 4.4, 5.5, 6.4
  observability: 2.1-2.2 (a refused entry that cannot park is still logged drain_refused exactly once)
  interface:     1.4 (commands/_shared-execution.md step 12 asks for remaining_units)
  docs:          1.5, 2.4, 4.5, 5.6, 6.5 (cites re-pointed by the unit that moves them); the two wording gaps in the human docs are sync-docs work (Out of scope)
  rollback:      one merge commit per unit; units 4, 5 and 6 are separate so one bypass found in review reverts alone
units:
  - id: 1
    scope_id: handoff-arming
    project: .
    depends_on: []
    module: scripts/handoff.mjs, scripts/session-context.mjs, scripts/account-switch.mjs, scripts/lib/core.mjs
    language: javascript
    security: normal
    scope:
      read: [scripts/handoff.mjs, scripts/session-context.mjs, scripts/account-switch.mjs, commands/_shared-execution.md]   # core.mjs is 60 KB: grep -n "^export" first, read by range with Bash
      docs: [docs/architecture/auto.rules.md, docs/architecture/slim.rules.md, docs/architecture/state.rules.md, docs/architecture/safety.rules.md, docs/architecture/engine.rules.md]
      write: [scripts/handoff.mjs, scripts/handoff.test.mjs, scripts/session-context.mjs, scripts/session-context.test.mjs, scripts/account-switch.mjs, scripts/account-switch.test.mjs, scripts/lib/core.mjs, commands/_shared-execution.md, docs/architecture/auto.rules.md]   # rules docs: cite: line ranges only
    arch: [ARCH-AUTO-11, ARCH-SLIM-02, ARCH-STATE-02, ARCH-SAFETY-04, ARCH-ENGINE-08]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [test-driven-development], guards: [arch-check], mcp: [] }
  - id: 2
    scope_id: drain-rejected
    project: .
    depends_on: []
    module: scripts/lib/network.mjs drainQueue
    language: javascript
    security: high
    scope:
      read: [scripts/lib/network.mjs, scripts/network.test.mjs]   # repo-exec.mjs is 50 KB and repo-exec.test.mjs 67 KB: grep -n "drainQueue\|networkAction\|landingPark" first, read by range with Bash
      docs: [docs/architecture/landing.rules.md]
      write: [scripts/lib/network.mjs, scripts/network.test.mjs, scripts/repo-exec.mjs, scripts/repo-exec.test.mjs, docs/architecture/landing.rules.md]   # rules docs: cite: line ranges only
    arch: [ARCH-LAND-36, ARCH-LAND-19]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [test-driven-development], guards: [arch-check], mcp: [] }
  - id: 3
    scope_id: prettier-test-copy
    project: .
    depends_on: []
    module: scripts/prettier-ignore.test.mjs
    language: javascript
    security: normal
    scope:
      read: [scripts/prettier-ignore.test.mjs]
      docs: []
      write: [scripts/prettier-ignore.test.mjs]
    arch: []
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [test-driven-development], guards: [], mcp: [] }
  - id: 4
    scope_id: queue-protection
    project: .
    depends_on: []
    module: scripts/lib/self-protect.mjs SELF_NEVER and holds, scripts/pre-guard.mjs path judgement
    language: javascript
    security: high
    scope:
      read: [scripts/lib/self-protect.mjs, scripts/lib/self-protect.test.mjs, scripts/pre-guard-queue.test.mjs]   # pre-guard.mjs is 140 KB and pre-guard.test.mjs 172 KB: grep -n first, read by range with Bash (ARCH-ENGINE-08)
      docs: [docs/architecture/safety.rules.md, docs/architecture/state.rules.md]
      write: [scripts/lib/self-protect.mjs, scripts/lib/self-protect.test.mjs, scripts/pre-guard.mjs, scripts/pre-guard-queue.test.mjs, docs/architecture/safety.rules.md]   # rules docs: cite: line ranges only
    arch: [ARCH-SAFETY-13, ARCH-STATE-16]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [test-driven-development], guards: [arch-check], mcp: [] }
  - id: 5
    scope_id: scratch-write-hardening
    project: .
    depends_on: [queue-protection]
    module: scripts/pre-guard.mjs insideScratchRoots, scripts/lib/self-protect.mjs WRITER_VERBS
    language: javascript
    security: high
    scope:
      read: [scripts/lib/self-protect.mjs]   # pre-guard.mjs and pre-guard.test.mjs: grep -n "insideScratchRoots\|verb === \"ln\"" first, read by range
      docs: [docs/architecture/safety.rules.md, docs/architecture/state.rules.md]
      write: [scripts/pre-guard.mjs, scripts/pre-guard.test.mjs, scripts/lib/self-protect.mjs, scripts/lib/self-protect.test.mjs, docs/architecture/safety.rules.md, docs/architecture/state.rules.md]   # rules docs: cite: line ranges only
    arch: [ARCH-STATE-18, ARCH-SAFETY-13]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [test-driven-development], guards: [arch-check], mcp: [] }
  - id: 6
    scope_id: heredoc-limits
    project: .
    depends_on: [scratch-write-hardening]
    module: scripts/pre-guard.mjs blankInertHeredocs
    language: javascript
    security: high
    scope:
      read: []   # pre-guard.mjs and pre-guard-heredoc.test.mjs: grep -n "blankInertHeredocs\|REACHES_SHELL\|NODE_E_LIVE" first, read by range
      docs: [docs/architecture/safety.rules.md, docs/architecture/state.rules.md]
      write: [scripts/pre-guard.mjs, scripts/pre-guard-heredoc.test.mjs, docs/architecture/safety.rules.md]   # rules docs: cite: line ranges only
    arch: [ARCH-SAFETY-15, ARCH-SAFETY-13, ARCH-STATE-16]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [test-driven-development], guards: [arch-check], mcp: [] }
---

# Plan: scrutinise sandbox-auto-flow-phase-2 (round 1)

## Outcome
The eight phase 2 units are merged and the suite is green, but the isolated reviewer found four Warnings that this plan closes: the queue protection stops at a repo whose git dir is literally `.git` (a submodule's is `.git/modules/<name>`) and ignores the queue's parent directory; a hard link under a scratch root can carry a scoped Write or Edit to a protected file; and a mid-run unit hand-off no longer re-arms the scope requirement. Five Suggestions ride along in the same files. Done = `/scrutinise sandbox-auto-flow-phase-2` returns 0 Critical, 0 Warning, no UNMET.

## Round 1 findings (verified by root at file:line before planning)
| id | class / severity | where | unit |
|---|---|---|---|
| W1 | Security / Warning | `scripts/lib/self-protect.mjs:24` pattern misses `.git/modules/<name>/.craftsman/network/` (`network.mjs:83` uses `info.common_git_dir`) | 4 |
| W2 | Security / Warning | `self-protect.mjs:141-148` `holds()`: a `**/` pattern has an empty literal base, so `rm -rf .git/.craftsman` and `mv .git/.craftsman x` exit 0 | 4 |
| W3 | Security / Warning | `pre-guard.mjs:1322`, `insideScratchRoots` (~1967): realpath misses hard links; `link` is not in `WRITER_VERBS` (`self-protect.mjs:101`) | 5 |
| W4 | Correctness / Warning | `session-context.mjs:166-172` with `_shared-execution.md:50` and `handoff.mjs:29`: the unit hand-off never asks for `remaining_units`, and a missing field becomes `[]` | 1 |
| S5 | Cross-unit / Suggestion | `account-switch.mjs:501-507` arms the marker for any restored hand-off | 1 |
| S6 | Correctness / Suggestion | `network.mjs:175-193`: a refused entry followed by an unreachable one is sliced out of the queue and its PARK is lost | 2 |
| S7 | Security / Suggestion | `pre-guard.mjs:1993-2053`, `:1997`, `:1781`: node and python bodies blanked unconditionally; `REACHES_SHELL` gaps; case-pattern `)` miscounts `$(` depth | 6 |
| S8 | Correctness / Suggestion | `pre-guard.mjs:1970`: a scoped Write cannot create a new scratch file | 5 |
| S9 | Test-coverage / Suggestion | `prettier-ignore.test.mjs:36-46` runs `prettier --write` on the live `core.mjs` in parallel with other tests | 3 |

Acceptance verdicts: `[unit:guard-paths]` UNMET (W1; its tick was reverted), the whole-plan line UNMET (evidence: root task R below), the other seven unit lines MET.

## Scope Steps (executable core)

### Step 1 — handoff-arming (., javascript, normal)
Tooling: implementer implementer · gates code-reviewer · skills test-driven-development
Depends on: none
- [ ] 1.1 RED rows in `scripts/handoff.test.mjs`: `normalizeHandoff` throws a message naming `remaining_units` when `unit` is set and `remaining_units` is not an array; `[]` and a non-empty array are accepted; a hand-off with no `unit` and no field is still accepted → accept: the refusal rows fail on main
- [ ] 1.2 RED rows in `scripts/session-context.test.mjs` and `scripts/account-switch.test.mjs`: one shared predicate decides arming: SessionStart and `adopt` both arm for a non-empty `remaining_units` and neither arms for `[]`, a missing field or a non-array (the adopt rows for `[]` and for a missing field are new) → accept: the adopt rows fail on main
- [ ] 1.3 Add `export const handoffArmsScope = (handoff) => Array.isArray(handoff?.remaining_units) && handoff.remaining_units.length > 0` to `scripts/lib/core.mjs`; use it at `session-context.mjs:169` and in the `adopt` action of `account-switch.mjs` (~:501-507, arm only when it is true; keep the hand-off copy itself); make `normalizeHandoff` (`handoff.mjs:~17`) refuse the unit-without-array case → accept: 1.1 and 1.2 green
- [ ] 1.4 `commands/_shared-execution.md` step 12 (line 50): name `remaining_units` (ids, `[]` on the last unit) in the list of hand-off contents. The file is exactly at its 12,766-byte cap (ARCH-SLIM-02: caps only go down), so trim non-MUST prose in the same file to net growth <= 0; `commands/account-switch.md:47` points at step 12 and needs no edit → accept: `node scripts/doc-size-policy.mjs` PASS and `wc -c commands/_shared-execution.md` <= 12766
- [ ] 1.5 Re-point the ARCH-AUTO-11 cite into `session-context.mjs` if 1.3 moved it (cite text only) → accept: `node scripts/arch-check.mjs lint` and `node --test scripts/safety-cites.test.mjs scripts/safety-claims.test.mjs scripts/safety-docs.test.mjs` pass
- [ ] 1.6 Run `node --test scripts/*.test.mjs scripts/lib/*.test.mjs` → accept: exit 0

### Step 2 — drain-rejected (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor · skills test-driven-development
Depends on: none
- [ ] 2.1 RED rows in `scripts/network.test.mjs`: a queue of [entry refused by `drainVerdict`, entry whose push is unreachable] and one of [entry origin-rejected, entry unreachable]: after the drain throws, the first entry is not lost: it is either still in the queue file or carried on the thrown error's `rejected` list, and `drain_refused` is logged once per refused entry → accept: the new rows fail on main
- [ ] 2.2 In `drainQueue` (`scripts/lib/network.mjs:165-197`) make no entry leave the queue without being pushed or reaching a PARK decision. Either attach `rejected` to the thrown NetworkError and have `networkAction` (`repo-exec.mjs:~835`) turn them into the same `landingPark` decisions before it returns `needs_network`, or keep the refused and rejected entries until the drain ends; a pin is deleted only once its entry is final → accept: 2.1 green and the existing `network.test.mjs` rows stay green
- [ ] 2.3 One `repo-exec.test.mjs` row: a drain that refuses one entry and then loses the network returns the PARK for the first and keeps the rest queued → accept: the row is green and fails with the 2.2 change removed (one temporary mutation, shown and restored by copying a saved copy back, not committed)
- [ ] 2.4 Re-point cites into `network.mjs` and `repo-exec.mjs` that moved, in `landing.rules.md` (cite text only; ARCH-LAND-36 cites `network.mjs:145-171`-shaped ranges) → accept: lint passes; then run `node --test scripts/*.test.mjs scripts/lib/*.test.mjs` → accept: exit 0

### Step 3 — prettier-test-copy (., javascript, normal)
Tooling: implementer implementer · gates code-reviewer · skills test-driven-development
Depends on: none
- [ ] 3.1 RED row: the `prettier --write` test must not touch the live `scripts/lib/core.mjs`: copy `scripts/lib/core.mjs` and `.prettierignore` into a temp directory (under `os.tmpdir()`), run `prettier --write` there with that directory as cwd, assert the copy is byte-identical; the row stays skipped without prettier. Show the row is meaningful by running it once with the copy's `.prettierignore` emptied (one scratch demonstration, not committed) → accept: the new test passes with the ignore file and fails when the copy's `.prettierignore` is empty, and no run touches `scripts/lib/core.mjs`
- [ ] 3.2 Run `node --test scripts/*.test.mjs scripts/lib/*.test.mjs` → accept: exit 0

### Step 4 — queue-protection (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor · skills test-driven-development
Depends on: none (guard units last; a conflict with the other session's `pre-guard.mjs` rounds PARKs this unit with its branch kept)
- [ ] 4.1 RED rows in `scripts/pre-guard-queue.test.mjs` with a throwaway superproject plus a registered submodule `sub`: a Write and `echo x >>` to `.git/modules/sub/.craftsman/network/queue.jsonl` exit 2 from the superproject root and from the submodule root; `rm -rf .git/.craftsman` and `mv .git/.craftsman x` exit 2 while a queue exists; `rm -rf .git/.craftsman/network` still exits 2; ordinary directories (`docs`, `src/.github`, `.gitignore`) stay allowed; a Read of the queue still exits 0; `enqueuePush` run by node still writes the file → accept: the submodule and parent-directory rows fail on main
- [ ] 4.2 Add `**/.git/modules/**/.craftsman/network/**` to `SELF_NEVER` (`self-protect.mjs:~24`) and make `holds()` (`:141-148`) test the literal base of a `**/` pattern's remainder (`.git/.craftsman/network`): the entry itself, an ancestor of it (`.git`, `.git/.craftsman`) or a path ending in `/<ancestor>` is held. If this changes an existing refusal row, restrict the rule to the network patterns; if the submodule root's view of the superproject's `.git/modules` needs `pre-guard.mjs` (`mainRelOf` ~:170), make that change too → accept: 4.1 green and `scripts/lib/self-protect.test.mjs` plus `scripts/pre-guard*.test.mjs` stay green
- [ ] 4.3 The ordinary-directory rows of 4.1 are the false-positive guard: paths that hold no queue pattern keep their current verdict → accept: the rows pass before and after
- [ ] 4.4 Mutation checks, each with one temporary edit shown red then restored by copying a saved copy back (never git checkout, restore or reset): drop the modules pattern; drop the base test in `holds()` → accept: each turns its own rows red; `git status` clean after
- [ ] 4.5 Re-point cites into `self-protect.mjs` and `pre-guard.mjs` this unit moved in `safety.rules.md` (cite text only) → accept: lint and the three safety doc tests pass; then run `node --test scripts/*.test.mjs scripts/lib/*.test.mjs` → accept: exit 0

### Step 5 — scratch-write-hardening (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor · skills test-driven-development
Depends on: queue-protection (same files)
- [ ] 5.1 RED rows in `scripts/pre-guard.test.mjs` (the scratch Write/Edit group near the `insideScratchRoots` rows): with an active unit scope and the scratch dir on the same filesystem as the project, a hard link of the scope manifest (made with `fs.linkSync` in the test) under the scratch root: a Write and an Edit of it exit 2; a Bash `link <manifest> <scratch>/h.json` exits 2 like `ln`; a Write of a NEW file whose nearest existing ancestor is the scratch root exits 0; a new file below a symlinked directory that leads out, a new file with `..` out, a new file inside a governed root, a relative path and an env file (`protectedPaths`) still exit 2; an Edit or a Read of a missing file still exits 2; NotebookEdit, Glob and Grep still exit 2 → accept: the hard-link, `link` and new-file rows fail on main (the pinned "file that does not exist" row is flipped for Write only)
- [ ] 5.2 In `insideScratchRoots` (`pre-guard.mjs:~1967`) take the tool name: return false for an existing Write or Edit target with `nlink > 1`; for Write only, when the target does not exist resolve the nearest existing ancestor with `realpathSync.native` and judge `ancestor + remainder` by the same containment and governed-root tests, rejecting a remainder holding `..`; update the call at `:1322` and the two comments → accept: 5.1 green
- [ ] 5.3 Add `link` to `WRITER_VERBS` (`self-protect.mjs:101`) and judge it like `ln` in the source/destination branch (`pre-guard.mjs:~941`) → accept: the `link` rows of 5.1 green and the `WRITER_VERBS` row in `scripts/lib/self-protect.test.mjs` updated
- [ ] 5.4 Check that the later Write/Edit checks (doc-write guard, `selfKind` by real path, `protectedPaths`) still run for a new-file target → accept: rows for a new file named like a protected path and a new `.env` file exit 2
- [ ] 5.5 Mutation checks, each shown red then restored by copying a saved copy back: drop the `nlink` test; drop the nearest-ancestor containment test → accept: each turns its own rows red; `git status` clean after
- [ ] 5.6 Re-point cites into `pre-guard.mjs` this unit moved in `safety.rules.md` and `state.rules.md` (cite text only; ARCH-STATE-18 cites `:1957-1975`-shaped ranges) → accept: lint and the three safety doc tests pass; then run `node --test scripts/*.test.mjs scripts/lib/*.test.mjs` → accept: exit 0

### Step 6 — heredoc-limits (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor · skills test-driven-development
Depends on: scratch-write-hardening (same file)
- [ ] 6.1 RED rows in `scripts/pre-guard-heredoc.test.mjs`: `node - <<'EOF'` and `python3 - <<'EOF'` whose body assigns a safety variable the way a live program does (`process.env.CRAFTSMAN_SAFETY='off'`, `os.environ['CRAFTSMAN_SAFETY']='off'`) exit 2 like the same `node -e` literal; prose that merely names the variable in a `cat <<'EOF'` body still exits 0; a body written by `cat <<'EOF' > f` and then run with `. f`, `source f`, `bash f`, `eval "$(cat f)"` or `coproc` exits 2 or is recorded as a stated limit (decide per spelling with the test, not the reverse); a `$(case a in a) ... cat <<'EOF' ... ;; esac)` form exits 2 → accept: the live-program, run-later and case-pattern rows fail on main
- [ ] 6.2 In `pre-guard.mjs` (`blankInertHeredocs` ~:1993-2053, `REACHES_SHELL` ~:1997, `NODE_E_LIVE` ~:1781): keep the body visible to the setter check when the command word is node or python and the body matches `NODE_E_LIVE` or a python analogue; add `source`, `eval`, `coproc` and a leading `.` to `REACHES_SHELL`; make the `$(` depth count ignore a case-pattern `)`. Whatever 6.1 leaves allowed is written down as a stated limit in the ARCH-SAFETY-15 / ARCH-SAFETY-13 rules text, never silently → accept: 6.1 green and the 8 existing heredoc rows stay green
- [ ] 6.3 A `--no-verify` inside a quoted body is still refused by the ARCH-STATE-16 whole-command scan → accept: the existing row stays green
- [ ] 6.4 Mutation checks, each shown red then restored by copying a saved copy back: drop the node/python live-body test; drop the new `REACHES_SHELL` words → accept: each turns its own rows red; `git status` clean after
- [ ] 6.5 Re-point cites into `pre-guard.mjs` this unit moved in `safety.rules.md` (cite text only); a stated-limit sentence is the only prose change → accept: lint and the three safety doc tests pass; then run `node --test scripts/*.test.mjs scripts/lib/*.test.mjs` → accept: exit 0

### Root task R — per-merge verification of sandbox-auto-flow-phase-2 (no unit, no worktree)
- [x] R.1 Root extracts each merge sha (728fef9 53d0b28 ad83507 3d80366 72b890d e60fcbf 80a8846 2b32191) into a fresh scratch directory under the job tmp dir, runs the full suite, `arch-check.mjs lint` and `doc-size-policy.mjs` there, and records the table under Verification background → accept: every row is green

## Sequencing
Units run in plan-graph order: 1, 2, 3 first (independent, no guard files), then 4, 5, 6 (guard units last, each on the one before). After the run: `/scrutinise sandbox-auto-flow-phase-2` again until 0 Critical and 0 Warning; then `/sync-docs --all sandbox-auto-flow-phase-2` (it also re-points ARCH-APPROVAL-05's `session-context.mjs` cite and aligns ARCH-SAFETY-13's wording with python and the dash form), `/architect --update safety state landing auto`, and `/craftsman:merge`.

## Verification background   (citations — for the reviewer, not the executor)
CONSUMERS:
- `normalizeHandoff` / `handoff.json` fields: written by `scripts/handoff.mjs`; read by `session-context.mjs:162-172` (arming), `session-end.mjs:20-21` (plan, unit, next_action only), `account-switch.mjs:495-510` (copy and arm); documented by `commands/_shared-execution.md:50`, `commands/orchestrate.md:50`, `commands/account-switch.md:47`. Tests: `handoff.test.mjs`, `session-context.test.mjs`, `session-end.test.mjs`, `account-switch.test.mjs`.
- `handoffArmsScope` (new): `session-context.mjs`, `account-switch.mjs` only.
- `drainQueue(root, info, { directLand })`: one caller, `repo-exec.mjs:835`; it returns `{ pushed, rejected }` and throws a NetworkError on an unreachable or auth failure.
- `insideScratchRoots(target, project, hookInput)`: one caller, `pre-guard.mjs:1322`.
- `WRITER_VERBS`: `pre-guard.mjs:16,558,568,569`; the `ln` source/destination branch at `:941`; tests `scripts/lib/self-protect.test.mjs`.
- `SELF_NEVER`: `self-protect.mjs`, `pre-guard.mjs` (`selfKind`, `mainRelOf`), `scripts/safety-cites.test.mjs` HOLDS keys.
Per-merge table (root task R.1, run 2026-11-03 on `git archive` copies with a fresh `git init`; `node --test scripts/*.test.mjs scripts/lib/*.test.mjs`, `arch-check.mjs lint`, `doc-size-policy.mjs`):

| merge sha | unit | tests | fail | lint | doc-size |
|---|---|---|---|---|---|
| 728fef9 | prettier-ignore | 1520 | 0 | PASS (211 rules) | PASS |
| 53d0b28 | command-records | 1523 | 0 | PASS | PASS |
| ad83507 | marker-lifecycle | 1550 | 0 | PASS | PASS |
| 3d80366 | init-settings | 1577 | 0 | PASS | PASS |
| 72b890d | network-drain | 1604 | 0 | PASS | PASS |
| e60fcbf | guard-paths | 1616 | 0 | PASS | PASS |
| 80a8846 | guard-heredoc | 1624 | 0 | PASS | PASS |
| 2b32191 | phase2-changelog | 1624 | 0 | PASS | PASS |

Every row has one skipped test, `ratchet: no cap rises versus the merge-base (skips without git)`: a copy has no merge-base. The real checkout at 2b32191 and d87a8cf runs 1624 tests, 0 skipped.

The same check for this plan's own merges (run 2026-11-03 after the six units landed; the real checkout at 1c3f51c runs 1660 tests, 0 skipped, gitleaks clean):

| merge sha | unit | tests | fail | lint | doc-size |
|---|---|---|---|---|---|
| 4b5623d | handoff-arming | 1634 | 0 | PASS (211 rules) | PASS |
| aa73e33 | drain-rejected | 1638 | 0 | PASS | PASS |
| 346d74d | prettier-test-copy | 1638 | 0 | PASS | PASS |
| 771da11 | queue-protection | 1648 | 0 | PASS | PASS |
| 466710c | scratch-write-hardening | 1654 | 0 | PASS | PASS |
| 1c3f51c | heredoc-limits | 1660 | 0 | PASS | PASS |

## Risk & rollback
Units 4 to 6 edit the 140 KB `pre-guard.mjs`; another session may have touched it, so a conflict PARKs the unit with its branch kept. A `holds()` change that is too broad refuses ordinary deletes; 4.1/4.3 pin the allowed directories. Unit 5 loosens one thing (a new scratch file may be created) and tightens another (hard links), each mutation-checked. Rollback is one revert per unit.

## Out of scope
`ARCH-APPROVAL-05` cites `session-context.mjs:283-301` (approval.rules.md is not in any unit's write list: `/sync-docs`). The human-doc wording of ARCH-SAFETY-13 (python, the dash form) is `/architect --update` work. Whether Claude Code honours `sandbox.network.allowedDomains` and how the auto-mode classifier reads `NETWORK_STEP_ALLOW` cannot be checked from this repo.
