---
slug: investigate-stop-gate-foreign-acceptance
goal: A session is held only by acceptance criteria of plans it worked, and read-only sed/grep commands are no longer hard-denied by pre-guard
level: feature
priority: P1
classification: in-scope — /investigate 2026-10-27, reproduced in Gleam (.craftsman/acceptance.md:705 binding two sessions of other plans)
tracker_rows: [acc-core, acc-stop-gate, acc-consumers, acc-docs, preguard-sed, preguard-quoted-literals, auto-scope-flip, sandbox-ask-policy]
guards:
  blast_radius: done
  completeness_sweep: done
  blind_rederivation: skipped(config:never)
coverage:
  contract:      1.1, 1.2, 3.1, 3.2 (acceptanceCriteria gains `plan`; consumers in CONSUMERS below)
  data:          N/A(no persistence; .craftsman/acceptance.md format is additive — legacy lines still parse)
  config:        9.1 (the sandbox settings block init offers; no new craftsman config key — stopGate.requireAcceptanceCriteria unchanged)
  security:      5.1-5.4, 6.1-6.4, 7.1-7.3, 8.1-8.4 (pre-guard, force-block and scope-guard changes; ARCH-SAFETY-05, ARCH-STATE-16, ARCH-AUTO-10 — security-auditor gate each)
  tests:         1.4, 2.4, 3.3, 5.3, 6.3, 7.2, 8.2, 9.2 (each RED on old code)
  observability: 2.3 (stop-acceptance-legacy event + notice naming untouched legacy lines)
  interface:     2.2 (Stop block reason names the owning plan per line)
  docs:          4.1-4.3 (command wording); rules amendment for a [plan:] rule → /sync-docs --all then /architect --update
  rollback:      revert the merge commits; legacy untagged files keep parsing on both sides
units:
  - id: 1
    scope_id: acc-core
    project: .
    depends_on: []
    module: scripts/lib/core.mjs acceptance parser
    language: javascript
    security: normal
    scope:
      read: [scripts/lib/core.mjs]
      docs: [docs/architecture/state.rules.md, docs/architecture/tracker.rules.md]
      write: [scripts/lib/core.mjs, scripts/acceptance-plan-scope.test.mjs]
    arch: [ARCH-TRACKER-08, ARCH-TRACKER-15, ARCH-STATE-04]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [test-driven-development], guards: [], mcp: [] }
  - id: 2
    scope_id: acc-stop-gate
    project: .
    depends_on: [acc-core]
    module: scripts/stop-gate.mjs acceptance block
    language: javascript
    security: normal
    scope:
      read: [scripts/stop-gate.mjs, scripts/stop-gate.test.mjs]
      docs: [docs/architecture/state.rules.md, docs/architecture/tracker.rules.md]
      write: [scripts/stop-gate.mjs, scripts/stop-gate-plan-scope.test.mjs]
    arch: [ARCH-STATE-04, ARCH-STATE-08, ARCH-TRACKER-15, ARCH-TRACKER-16]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [test-driven-development], guards: [], mcp: [] }
  - id: 3
    scope_id: acc-consumers
    project: .
    depends_on: [acc-core]
    module: scripts/tracker.mjs reconcileAcceptance, scripts/repo-exec.mjs land-feature
    language: javascript
    security: normal
    scope:
      read: [scripts/tracker.mjs, scripts/repo-exec.mjs]
      docs: [docs/architecture/tracker.rules.md, docs/architecture/landing.rules.md]
      write: [scripts/tracker.mjs, scripts/repo-exec.mjs, scripts/acceptance-plan-consumers.test.mjs, scripts/tracker.test.mjs, scripts/acceptance-trigger.test.mjs]
    arch: [ARCH-TRACKER-06, ARCH-TRACKER-08, ARCH-TRACKER-15, ARCH-LAND-06]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [test-driven-development], guards: [], mcp: [] }
  - id: 4
    scope_id: acc-docs
    project: .
    depends_on: [acc-stop-gate, acc-consumers, preguard-quoted-literals, force-block-quoted, auto-scope-flip, sandbox-ask-policy]
    module: commands/plan.md, commands/instruction.md, commands/merge.md
    language: markdown
    security: normal
    scope:
      read: [commands/plan.md, commands/instruction.md, commands/merge.md, scripts/doc-size-policy.mjs]
      docs: [docs/architecture/plan.rules.md, docs/architecture/slim.rules.md, docs/architecture/landing.rules.md, docs/architecture/auto.rules.md]
      write: [commands/plan.md, commands/instruction.md, commands/merge.md, CHANGELOG.md]
    arch: [ARCH-SLIM-01, ARCH-SLIM-02, ARCH-SLIM-08, ARCH-AUTO-04, ARCH-PLAN-06, ARCH-LAND-06]
    tooling: { implementer: implementer, gates: [], skills: [], guards: [doc-size-policy], mcp: [] }
  - id: 5
    scope_id: preguard-sed
    project: .
    depends_on: []
    module: scripts/pre-guard.mjs self-protection writer detection
    language: javascript
    security: high
    scope:
      read: [scripts/pre-guard.mjs, scripts/lib/shell-words.mjs]
      docs: [docs/architecture/safety.rules.md, docs/architecture/state.rules.md]
      write: [scripts/pre-guard.mjs, scripts/pre-guard-sed.test.mjs]
    arch: [ARCH-SAFETY-05, ARCH-SAFETY-03, ARCH-STATE-15]
    tooling: { implementer: implementer, gates: [security-auditor, code-reviewer], skills: [test-driven-development], guards: [], mcp: [] }
  - id: 6
    scope_id: preguard-quoted-literals
    project: .
    depends_on: [preguard-sed]
    module: scripts/pre-guard.mjs text checks that match inside quoted literals
    language: javascript
    security: high
    scope:
      read: [scripts/pre-guard.mjs]
      docs: [docs/architecture/safety.rules.md, docs/architecture/state.rules.md]
      write: [scripts/pre-guard.mjs, scripts/pre-guard-quoted.test.mjs]
    arch: [ARCH-SAFETY-05, ARCH-SAFETY-03, ARCH-STATE-15]
    tooling: { implementer: implementer, gates: [security-auditor, code-reviewer], skills: [test-driven-development], guards: [], mcp: [] }
  - id: 7
    scope_id: force-block-quoted
    project: .
    depends_on: []
    module: scripts/lib/force-block.mjs destructive-git match inside quoted text
    language: javascript
    security: high
    scope:
      read: [scripts/lib/force-block.mjs]
      docs: [docs/architecture/state.rules.md]
      write: [scripts/lib/force-block.mjs, scripts/force-block-quoted.test.mjs]
    arch: [ARCH-STATE-16]
    tooling: { implementer: implementer, gates: [security-auditor, code-reviewer], skills: [test-driven-development], guards: [], mcp: [] }
  - id: 8
    scope_id: auto-scope-flip
    project: .
    depends_on: []
    module: scripts/orchestrate-scope-guard.mjs /auto no longer sets scope-required
    language: javascript
    security: high
    scope:
      read: [scripts/orchestrate-scope-guard.mjs, scripts/orchestrate-scope-guard.test.mjs]
      docs: [docs/architecture/auto.rules.md, docs/architecture/safety.rules.md, docs/architecture/state.rules.md]
      write: [scripts/orchestrate-scope-guard.mjs, scripts/orchestrate-scope-guard.test.mjs]
    arch: [ARCH-AUTO-10, ARCH-SAFETY-05, ARCH-STATE-03]
    tooling: { implementer: implementer, gates: [security-auditor, code-reviewer], skills: [test-driven-development], guards: [], mcp: [] }
  - id: 9
    scope_id: sandbox-ask-policy
    project: .
    depends_on: []
    module: scripts/lib/settings-merge.mjs sandbox block without rm asks
    language: javascript
    security: normal
    scope:
      read: [scripts/lib/settings-merge.mjs, scripts/lib/settings-merge.test.mjs, scripts/init.test.mjs]
      docs: [docs/architecture/safety.rules.md]
      write: [scripts/lib/settings-merge.mjs, scripts/lib/settings-merge.test.mjs, scripts/init.test.mjs]
    arch: [ARCH-SAFETY-12, ARCH-SAFETY-10, ARCH-SAFETY-01]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [test-driven-development], guards: [], mcp: [] }
---

# Plan: Stop gate holds a session only to its own plans' criteria; pre-guard stops denying read-only sed

## Outcome
A session is held only by acceptance criteria of plans it worked, and read-only sed/grep commands are no longer hard-denied by pre-guard.

## Scope Steps (executable core)

### Step 1 — acc-core (., javascript, normal)
Tooling: implementer · gates code-reviewer · skills test-driven-development
Depends on: none
- [ ] 1.1 In `acceptanceCriteria` (core.mjs:506-514) parse the leading tags `[unit:<id>]`, `[feature:<id>]`, `[plan:<slug>]` in ANY order and return `{ line, unit, feature, plan, done }`; `plan` is normalised with `planSlugOf` → accept: `- [ ] [plan:a] [unit:u] x` and `- [ ] [unit:u] [plan:a] x` both yield unit "u", plan "a"; every existing core.test/tracker.test acceptance case still passes
- [ ] 1.2 Add `featureCriteria(text, featureId, isLast, plan = null)`: when `plan` is given, a `[plan:X]` line with X ≠ plan never matches; legacy untagged lines keep ARCH-TRACKER-08 behaviour → accept: a `[plan:other]` untagged-unit line does not gate plan "mine"'s last feature; existing featureCriteria tests unchanged
- [ ] 1.3 Add exported `bindingAcceptance(text, { units, plans })` → `{ binding, legacy }`: `[unit:X]` binds iff X ∈ units; `[plan:X]` (no unit) binds iff X ∈ plans; a line with neither unit nor plan tag (legacy untagged) binds iff `plans` is empty, else goes to `legacy` (decision D-legacy below). Precedence: a line with `[unit:]` is decided by its unit alone (a `[plan:]` beside it is informational) → accept: table test in 1.4, including a `[unit:x] [plan:b]` line with x untouched and b touched → not binding
- [ ] 1.4 Write `scripts/acceptance-plan-scope.test.mjs` (RED on old code: `plan` field absent, `bindingAcceptance` missing) covering 1.1-1.3, including a Gleam-shaped two-plan fixture where plan A's untagged line and plan B's `[plan:b]` line coexist → accept: `node --test scripts/acceptance-plan-scope.test.mjs scripts/lib/core.test.mjs scripts/tracker.test.mjs` exit 0

### Step 2 — acc-stop-gate (., javascript, normal)
Tooling: implementer · gates code-reviewer · skills test-driven-development
Depends on: acc-core
- [ ] 2.1 In stop-gate.mjs:340-358 collect the session's touched plans (`planSlugOf(event.plan)` for its ledger events) next to touchedUnits and replace the inline filter with `bindingAcceptance(ac, { units: touchedUnits, plans: touchedPlans })`. Fail closed: an unreadable/missing ledger leaves both sets empty, so legacy untagged lines bind exactly as today → accept: test 2.4 cases A and E (no ledger file + unchecked untagged line → blocks)
- [ ] 2.2 Group the block reason by owner: each unchecked line prefixed with its plan (or unit's plan from the ledger; "untagged" otherwise) and the instruction names the plan → accept: reason text contains the owning plan slug
- [ ] 2.3 When `legacy` is non-empty and nothing else blocks, add a notice to `systemMessage` naming the count and the file, suggesting `[plan:<slug>]` tags, and log `stop-acceptance-legacy` → accept: test 2.4 case C
- [ ] 2.4 Write `scripts/stop-gate-plan-scope.test.mjs` (harness modelled on stop-gate.test.mjs) RED on old code: (A) owner session whose ledger names only plan b, file has plan a's unchecked untagged line → Stop passes; (B) same session, unchecked `[plan:b]` line → Stop blocks and reason names b; (C) case A also prints the legacy notice; (D) session with no ledger plan events and an unchecked untagged line → blocks as today → accept: `node --test scripts/stop-gate-plan-scope.test.mjs scripts/stop-gate.test.mjs` exit 0

### Step 3 — acc-consumers (., javascript, normal)
Tooling: implementer · gates code-reviewer · skills test-driven-development
Depends on: acc-core
- [ ] 3.1 tracker.mjs:384 `planWideOpen` becomes per row: open `[plan:<slug of row.plan>]` lines hold that row's COMPLETE promotion; legacy untagged lines hold no row (they are reported, not enforced, per D-legacy) → accept: test 3.3 case A
- [ ] 3.2 repo-exec.mjs:577-580 pass `planSlug` to `featureCriteria`, and restrict the fail-closed untagged check to legacy untagged lines plus `[plan:<planSlug>]` lines → accept: test 3.3 case B
- [ ] 3.3 Write `scripts/acceptance-plan-consumers.test.mjs` RED on old code: (A) plan b's row MERGED with all its unit lines ticked and plan a's open untagged/`[plan:a]` line → reconcile promotes b to COMPLETE; an open `[plan:b]` line holds it; (B) featureCriteria call shape for land-feature ignores `[plan:a]` when landing plan b → accept: `node --test scripts/acceptance-plan-consumers.test.mjs scripts/tracker.test.mjs scripts/repo-exec.test.mjs` exit 0
- [ ] 3.4 (amendment 2026-10-28, park resolved) `scripts/tracker.test.mjs` (fixtures near lines 55 and 101-111) and `scripts/acceptance-trigger.test.mjs` (near lines 28 and 77) assert that an open untagged whole-plan line holds a MERGED row, which ARCH-TRACKER-15 retired. Retag those fixture lines `[plan:<slug of the fixture plan>]` so each test keeps asserting the same hold; delete or loosen no assertion. Grep for the lines; do not read either file whole → accept: both files pass and each still asserts the row stays MERGED while the `[plan:]` line is open

### Step 4 — acc-docs (., markdown, normal)
Depends on: every other step (it writes CHANGELOG.md once, last)
- [ ] 4.1 commands/plan.md:36 — whole-plan criteria are tagged `[plan:<slug>]`, never left untagged; "the Stop gate holds only sessions that worked that plan" → accept: file ≤ its doc-size-policy cap (8988; byte-neutral)
- [ ] 4.2 commands/instruction.md:55 — evidence clause reads "for <slug>'s [unit:] or [plan:<slug>] lines" → accept: ≤ cap 8547
- [ ] 4.3 commands/merge.md:42-44 — same wording → accept: ≤ cap 6173; `node --test scripts/doc-size-policy.test.mjs scripts/descriptions.test.mjs` exit 0
- [ ] 4.4 CHANGELOG.md `## [Unreleased]` → `### Fixed`: one bullet per feature area: Stop gate plan scoping, pre-guard/force-block quoted-text false positives, /auto no longer locking Phase A, the sandbox block without rm asks → accept: [Unreleased] < 8 KB (ARCH-SLIM-08)

### Step 5 — preguard-sed (., javascript, HIGH)
Tooling: implementer · gates security-auditor, code-reviewer · skills test-driven-development
Depends on: none
- [ ] 5.1 pre-guard.mjs:371 — `WRITE_TEXT` counts `sed`/`perl` only in their in-place form (`-i`/`-…i`), matching the 1376 test → accept: test 5.3 case A
- [ ] 5.2 pre-guard.mjs:1376 — compute the sed/perl `-i` verb from command-position words (lib/shell-words.mjs), not raw text, so `grep -n "sed -i" … craftsman.config.json` is not a writer → accept: test 5.3 case B
- [ ] 5.3 Write `scripts/pre-guard-sed.test.mjs` (harness: spawn `node scripts/pre-guard.mjs` in a git-init temp dir set as the project dir, stdin `{session_id, tool_name:"Bash", tool_input:{command}}`, assert exit status) RED on old code: (A) `sed -n 1,5p README.md; for f in ~/.claude/settings.json; do echo "$f"; done` → exit 0; (B) `grep -n "sed -i" scripts/x.mjs; cat craftsman.config.json` → exit 0; still blocked: (C) `sed -i s/a/b/ craftsman.config.json`, (D) `for f in x; do sed -i s/a/b/ .craftsman/off; done`, (E) `perl -pi -e s/a/b/ hooks/hooks.json` → accept: `node --test scripts/pre-guard-sed.test.mjs scripts/pre-guard.test.mjs scripts/pre-guard-narrow.test.mjs` exit 0
- [ ] 5.4 security-auditor review: no previously denied write to SELF_NEVER/SELF_SCOPED becomes allowed (quote tricks: `s""ed -i`, `$(echo sed) -i`, `xargs sed -i`) → accept: auditor PASS, each bypass attempt a test case

### Step 6 — preguard-quoted-literals (., javascript, HIGH)
Tooling: implementer implementer · gates security-auditor, code-reviewer · skills test-driven-development
Depends on: preguard-sed (same file; runs after it)
Owner decision 2026-10-27: folded into this run, not parked. Split from Step 5 only because pre-guard.mjs is 93 KB and one unit may not exceed the context budget.
- [ ] 6.1 `SETS_SAFETY_VAR` (the check that refuses a command setting the session-id, project-dir or safety variables) reads command words, not quoted string literals: a quoted `node -e` argument or a `grep` pattern that merely contains `NAME=` is allowed; a real assignment (`NAME=x cmd`, `env NAME=x cmd`, `export NAME=x`) is still refused → accept: test 6.3 cases A-D
- [ ] 6.2 The removal-word check no longer treats the `rm` text inside a quoted `grep`/`printf`/`echo` argument as a removal when the surrounding command also has a `for`/`while` construct; a real removal inside a loop (`for f in x; do rm .craftsman/off; done`) is still refused → accept: test 6.3 cases E-F
- [ ] 6.3 Write `scripts/pre-guard-quoted.test.mjs` (same harness as 5.3) RED on old code: allowed (exit 0): (A) `node -e 'console.log("NAME=1")'` with NAME each of the three variables, (B) `grep -n "NAME=" README.md`, (C) `printf '%s' "text NAME=x"`, (D) `echo "export NAME=x"`, (E) `grep -n "rm -f" README.md; for f in a b; do echo $f; done`, (F) `printf '%s' "rm .craftsman/x" | cat`; still refused (exit 2): `NAME=x node a.mjs`, `env NAME=x node a.mjs`, `export NAME=x`, `for f in x; do rm .craftsman/off; done`, `sh -c 'NAME=x node a.mjs'` → accept: `node --test scripts/pre-guard-quoted.test.mjs scripts/pre-guard.test.mjs scripts/pre-guard-narrow.test.mjs scripts/pre-guard-sed.test.mjs` exit 0
- [ ] 6.4 security-auditor: no previously refused assignment or removal becomes allowed (quote-split names, `eval`, `$(…)`, here-strings, `xargs`) → accept: auditor PASS, each attempt a test case

### Step 7 — force-block-quoted (., javascript, HIGH)
Tooling: implementer implementer · gates security-auditor, code-reviewer · skills test-driven-development
Depends on: none
- [ ] 7.1 `forceBlocked` (scripts/lib/force-block.mjs) matches destructive git (force push, hard reset, clean) only in command words of a git invocation, not in a quoted `grep`/`printf`/`echo` argument or heredoc prose that merely names it; real invocations (also after `&&`, `;`, `sh -c`, `env`, `git -C <dir>`) stay blocked → accept: test 7.2
- [ ] 7.2 Write `scripts/force-block-quoted.test.mjs` RED on old code: allowed: `grep -n "git reset --hard" scripts/x.mjs`, `printf '%s' "do not git push --force"`, `echo "git clean -fd is blocked"`; blocked: `git reset --hard`, `git -C w push --force`, `a && git clean -fd`, `sh -c 'git push -f'`, `env X=1 git reset --hard HEAD~1` → accept: `node --test scripts/force-block-quoted.test.mjs scripts/lib/force-block.test.mjs scripts/pre-guard-narrow.test.mjs` exit 0
- [ ] 7.3 security-auditor review → accept: auditor PASS; lease-push-to-own-branch behaviour (ARCH-LAND-31) unchanged
- [ ] 7.4 (amendment 2026-10-28, review findings on b2a2099) quoted text inside a command substitution `$(…)` or backticks is live code, never prose, and `printf -v`/`read` into a variable later expanded as a command counts as an invocation: `x=$(echo "git reset --hard"); $x`, its backtick form, and `printf -v c 'git reset --hard'; $c` stay blocked; when the guard cannot prove a quoted span is a plain argument of grep/printf/echo it blocks (fail closed) → accept: each form a blocked case in `scripts/force-block-quoted.test.mjs`; auditor PASS

### Step 8 — auto-scope-flip (., javascript, HIGH)
Tooling: implementer implementer · gates security-auditor, code-reviewer · skills test-driven-development
Depends on: none
Implements ARCH-AUTO-10 (supersedes AUTO-06).
- [ ] 8.1 In orchestrate-scope-guard.mjs (the block at the `/auto executes a plan exactly as /orchestrate does` comment) only `/orchestrate` writes the scope-required file; `/auto` does not. Everything else in the `orchestrate || auto` branch stays for `/auto`: the auto marker, acceptance ownership, runner grants → accept: test 8.2 case A
- [ ] 8.2 Extend `orchestrate-scope-guard.test.mjs` RED on old code: (A) a `/auto <slug>` prompt leaves no scope-required file for the session, still writes the auto marker, records acceptance ownership and grants runners; (B) a following `/orchestrate <slug>` writes scope-required; (C) with /auto active, Write/Edit under docs/ passes pre-guard while /auto has not yet run /orchestrate → accept: `node --test scripts/orchestrate-scope-guard.test.mjs scripts/auto-command.test.mjs scripts/pre-guard.test.mjs` exit 0
- [ ] 8.3 Update the comments in this file that cite ARCH-AUTO-06 for the scope flip to ARCH-AUTO-10; do not touch other files' comments → accept: grep shows no `ARCH-AUTO-06` in orchestrate-scope-guard.mjs
- [ ] 8.4 security-auditor: with `/auto` no longer setting scope-required, a session that runs `/auto` and edits source files before any `/orchestrate` is still held to ARCH-AUTO-09's flow (Phase B's goal starts with /orchestrate); no guard other than the scope flip changes → accept: auditor PASS

### Step 9 — sandbox-ask-policy (., javascript, normal)
Tooling: implementer implementer · gates code-reviewer · skills test-driven-development
Depends on: none
Implements ARCH-SAFETY-12.
- [ ] 9.1 In settings-merge.mjs remove `Bash(rm -r *)` and `Bash(rm -rf *)` from `SANDBOX_BLOCK.permissions.ask`; keep sudo, `git push --force`, `git reset --hard`, `git clean` and `sandbox.enabled`; keep the cited lines 8-11 and 23-34 holding `SANDBOX_BLOCK` and `function merge` (scripts/safety-cites.test.mjs) → accept: test 9.2
- [ ] 9.2 Update `settings-merge.test.mjs` (the `ASK` constant at line 9, the SANDBOX_BLOCK deep-equal and the union expectation at line 39) and `init.test.mjs`, RED on old code: SANDBOX_BLOCK holds no rm ask; a file that already has `Bash(rm -rf *)` in its ask list keeps exactly one copy after a merge (never removed); the init preview lists no rm ask → accept: `node --test scripts/lib/settings-merge.test.mjs scripts/init.test.mjs scripts/safety-cites.test.mjs` exit 0

## Sequencing
acc-core first (parser + pure helper, the shared contract) → acc-stop-gate and acc-consumers in parallel order (both consume it) → acc-docs last (wording must match shipped behaviour) . preguard-sed is independent and may run first; preguard-quoted-literals follows it (same file). force-block-quoted, auto-scope-flip and sandbox-ask-policy are independent of everything. auto-scope-flip should run early: once it lands, `/auto` stops locking its own Phase A. acc-docs runs last and writes CHANGELOG.md once. The split keeps each unit under unitContextBytes: the parser is a pure helper so the stop-gate unit does not need to read core.mjs (59 KB), and every RED test lives in a new small file instead of the 50-140 KB existing suites.

## Decisions
- **Owner decisions 2026-10-27** (answered via AskUserQuestion, recorded as rules): `[plan:<slug>]` tag → ARCH-TRACKER-15; legacy untagged lines bind only plan-less sessions → ARCH-TRACKER-16; `/auto` stops setting scope-required (supersedes AUTO-06) → ARCH-AUTO-10; sandbox block drops the rm asks → ARCH-SAFETY-12; quoted-literal false positives fixed in this run (Steps 6 and 7), not parked.
- **D-legacy** — an untagged line (no `[unit:]`, no `[plan:]`) binds a session only when that session's ledger names no plan at all; otherwise it is reported (notice + event), not enforced. Section headers are NOT used to attribute lines: Gleam acceptance.md:707-708 (`[unit:qsc-conn-*]`, studio-core-sql) sit under the investigate-pg-query-ignores-configured-schema header. Trade-off: a legacy whole-plan line of a plan the session did work is no longer enforced; new plans avoid it by tagging `[plan:]` (Step 4).
- **Park resolutions 2026-10-28** — acc-consumers: the two pre-rule test files join its write scope (the only option that keeps ARCH-TRACKER-15; the other edits a decided rule). force-block-quoted: the review bypasses become task 7.4. sandbox-ask-policy: the stale ARCH-SAFETY-06 cite was already fixed on main; re-run unchanged. preguard-sed: open owner decision (test 24.2 pin), asked in Phase C.
- **C1 (whole-file ownership on Edit / on /orchestrate)** — kept as the outer gate; no code change. Once binding is per unit/plan via the ledger, ownership no longer over-blocks.

## Verification background
- Whole-file ownership: `ownsAcceptance` compares a hash of the entire file — `scripts/lib/core.mjs:496-500`; recorded on any acceptance.md Edit `scripts/quality-gate.mjs:33-35` and on /orchestrate|/scrutinise `scripts/orchestrate-scope-guard.mjs:169-171`.
- Untagged lines bind every owner — `scripts/stop-gate.mjs:351`.
- Block text has no plan — `scripts/stop-gate.mjs:352-357`.
- Same defect in tracker promotion — `scripts/tracker.mjs:384` (`planWideOpen` across the whole file) and land-feature — `scripts/repo-exec.mjs:577-580`.
- Ledger events carry `plan` as passed (path or slug) — `scripts/tracker.mjs:342`; normalise with `planSlugOf` — `scripts/lib/core.mjs:352-356`.
- Reproduction (Gleam, 2026-10-27): two live sessions' acceptance.ref match the file identity; the only unchecked untagged line is acceptance.md:705 (investigate-pg-query-ignores-configured-schema).
- pre-guard false positives: `WRITE_TEXT` includes bare sed/perl — `scripts/pre-guard.mjs:371`; unreadable+writes+protected → deny `:1381-1383`; raw-text `-i` verb + mentioned scoped file → deny `:1376,1404`. Both reproduced by piping hook input to pre-guard (exit 2 vs exit 0 with `cat`).
- stop_hook_active is honoured — `scripts/stop-gate.mjs:80` (intended; not changed).

CONSUMERS:
- `acceptanceCriteria` (gains `plan`, tag order free) → scripts/stop-gate.mjs:351 (via uncheckedAcceptance), scripts/tracker.mjs:98,114,382, scripts/run-manifest.mjs:27 (filters `c.unit` — unaffected), scripts/run-args.mjs:55, scripts/repo-exec.mjs:580, scripts/builtin-skill-context.mjs:35 (count only — unaffected)
- `featureCriteria` (new optional `plan` arg) → scripts/repo-exec.mjs:577
- `bindingAcceptance` (new) → scripts/stop-gate.mjs (Step 2)

## Risk & rollback
Behaviour loosens for legacy untagged lines (D-legacy) and for sed/perl without `-i`; Step 5 is the security-sensitive change, so it gets security-auditor and bypass test cases. Rollback: revert the merge commits. The file format is additive, so old and new code both read either form.

## Out of scope
- Removing `rm` asks from users' existing settings files (the merge never removes an ask; the owner edits `~/.claude/settings.json` and project settings by hand).
- `scope.mjs` run from a shell command without a session id writes to `sessions/shared/` instead of the caller's session; registered as PENDING follow-up `scope-shell-sid`.
- Re-pointing `ARCH-AUTO-06` cites in `core.mjs` and `agent-mode-guard.mjs` comments (comment-only; those files belong to other units).
- Rewriting existing Gleam acceptance.md lines into `[plan:]` form (the owner's own sessions can tag them).
- Claude Code's /goal evaluator behaviour (not traceable from this repo).
- User-side config: Gleam `.claude/settings.local.json` `sandbox.excludedCommands` holds a path list (`".craftsman/, docs/plans/, src/**"`) in a command field.
