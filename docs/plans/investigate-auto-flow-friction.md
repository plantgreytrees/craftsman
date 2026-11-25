---
slug: investigate-auto-flow-friction
goal: An unattended /craftsman:auto run stops cleanly when work is blocked instead of looping on stale bindings, blocked units' criteria and doc-write detours, and every next step craftsman prints names the /craftsman:<name> command
level: feature
priority: P1
classification: in-scope — /craftsman:investigate 2026-11-20 (session 9d68568c: 95 of 96 goal evaluations met:false; Stop blocked 118 of 509 Stops)
tracker_rows: [r1a-stale-binding, r1b-parked-acceptance, c1-goal-template, c2-docguard-text, r2-criteria-owner, r3a-emitted-prefix, r3b-doc-prefix, r3c-doc-prefix, r3d-userdocs-prefix]
guards:
  blast_radius: done
  completeness_sweep: done
  blind_rederivation: skipped(config:never)
coverage:
  contract:      2.1 (bindingAcceptance gains a status filter; consumers in CONSUMERS), 5.1-5.4 (criterion owner tag read by plan, plan-reviewer, scrutineer, instruction, orchestrate)
  data:          N/A(no persistence change; .craftsman/sessions binding files are only deleted, by the same clearWorktreeBinding scope.mjs release uses)
  config:        N/A(no new config key; stopGate.requireAcceptanceCriteria and docWriteGuard unchanged)
  security:      1.3 (binding cleared only when its worktree is gone), 4.1-4.2 (doc-guard deny text only; authority rules unchanged, ARCH-STATE-16), 2.1 (only BLOCKED/PARKED rows are released, never IN_PROGRESS)
  tests:         1.1, 2.4, 3.2, 4.2, 5.5, 6.3, 8.2, 9.2 (each RED on the old code)
  observability: 1.3 (stop-binding-cleared event), 2.3 (stop-acceptance-held event and Stop notice naming the held units)
  interface:     2.2 (Stop block text), 3.1 (/goal condition), 4.1 (deny text), 6.1, 7.1, 8.1, 9.1 (printed command names)
  docs:          9.1 (README/EXTENDING/INSTALL next-step lines); rules text for ARCH-TRACKER-16, ARCH-AUTO-04 and ARCH-SLIM-14 → /craftsman:architect --update after merge (follow-up F3)
  rollback:      revert each unit's merge commit; every change is a filter, a message or wording, with no data to migrate
units:
  - id: 1
    scope_id: r1a-stale-binding
    project: .
    depends_on: []
    module: stop-gate binding check, unit-runner park/block
    language: javascript
    security: normal
    scope:
      read: [scripts/stop-gate.mjs, agents/unit-runner.md]   # core.mjs ~65 KB, scope.mjs and stop-gate.test.mjs ~51 KB: grep -n (clearWorktreeBinding, worktreeBindingPath, "release", a binding test) and read by range with Bash (ARCH-ENGINE-08)
      docs: [docs/architecture/state.rules.md, docs/architecture/engine.rules.md, docs/architecture/slim.rules.md]
      write: [scripts/stop-gate.mjs, scripts/lib/core.mjs, scripts/stop-gate.test.mjs, agents/unit-runner.md]
    arch: [ARCH-STATE-23, ARCH-STATE-06, ARCH-ENGINE-06, ARCH-SLIM-17]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [test-driven-development], guards: [doc-size-policy], mcp: [] }
  - id: 2
    scope_id: r1b-parked-acceptance
    project: .
    depends_on: [r1a-stale-binding]
    module: stop-gate acceptance block
    language: javascript
    security: normal
    scope:
      read: [scripts/stop-gate.mjs, scripts/stop-gate-plan-scope.test.mjs]   # core.mjs and tracker.mjs: grep -n bindingAcceptance / currentState and read by range with Bash (ARCH-ENGINE-08)
      docs: [docs/architecture/state.rules.md, docs/architecture/tracker.rules.md, docs/architecture/safety.rules.md]
      write: [scripts/stop-gate.mjs, scripts/lib/core.mjs, scripts/stop-gate-plan-scope.test.mjs, docs/architecture/safety.rules.md, docs/architecture/state.rules.md, docs/architecture/tracker.rules.md]   # rules docs: cite: line ranges only (re-point cites the stop-gate.mjs edit shifts; safety-cites.test.mjs); re-scoped 2026-11-24 after the unit BLOCKED on them
    arch: [ARCH-TRACKER-16, ARCH-TRACKER-03, ARCH-STATE-23, ARCH-SAFETY-06]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [test-driven-development], guards: [], mcp: [] }
  - id: 3
    scope_id: c1-goal-template
    project: .
    depends_on: [r1b-parked-acceptance]
    module: /instruction goal template
    language: markdown
    security: normal
    scope:
      read: [commands/instruction.md, scripts/auto-command.test.mjs, scripts/doc-size-policy.mjs]
      docs: [docs/architecture/auto.rules.md, docs/architecture/plan.rules.md, docs/architecture/slim.rules.md]
      write: [commands/instruction.md, scripts/auto-command.test.mjs]
    arch: [ARCH-AUTO-04, ARCH-PLAN-06, ARCH-SLIM-17]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [test-driven-development], guards: [doc-size-policy], mcp: [] }
  - id: 4
    scope_id: c2-docguard-text
    project: .
    depends_on: []
    module: pre-guard doc-guard deny text
    language: javascript
    security: high
    scope:
      read: [scripts/pre-guard-writes.test.mjs]   # pre-guard.mjs is ~160 KB: grep -n "Hand the change to\|DOC_WRITER_COMMANDS\|commandInvoked" and read by range with Bash (ARCH-ENGINE-08); edit by exact-match splice
      docs: [docs/architecture/safety.rules.md, docs/architecture/state.rules.md]
      write: [scripts/pre-guard.mjs, scripts/pre-guard-writes.test.mjs]
    arch: [ARCH-STATE-16, ARCH-SAFETY-13, ARCH-SAFETY-17]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [test-driven-development], guards: [], mcp: [] }
  - id: 5
    scope_id: r2-criteria-owner
    project: .
    depends_on: [c1-goal-template]
    module: criterion ownership (plan, plan-reviewer, scrutineer, instruction, orchestrate)
    language: markdown
    security: normal
    scope:
      read: [commands/plan.md, agents/plan-reviewer.md, agents/scrutineer.md, commands/instruction.md, commands/orchestrate.md, scripts/auto-command.test.mjs, scripts/doc-size-policy.mjs]
      docs: [docs/architecture/tracker.rules.md, docs/architecture/plan.rules.md, docs/architecture/slim.rules.md, docs/architecture/auto.rules.md]
      write: [commands/plan.md, agents/plan-reviewer.md, agents/scrutineer.md, commands/instruction.md, commands/orchestrate.md, scripts/criteria-owner.test.mjs]
    arch: [ARCH-TRACKER-15, ARCH-AUTO-04, ARCH-PLAN-06, ARCH-SLIM-14, ARCH-SLIM-17]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [test-driven-development], guards: [doc-size-policy], mcp: [] }
  - id: 6
    scope_id: r3a-emitted-prefix
    project: .
    depends_on: [r1b-parked-acceptance, c2-docguard-text]
    module: runtime-emitted command names
    language: javascript
    security: normal
    scope:
      read: []   # every write file: grep -n the bare names listed in task 6.1 and read by range with Bash; edit string literals by exact-match splice (ARCH-ENGINE-08)
      docs: [docs/architecture/safety.rules.md, docs/architecture/state.rules.md, docs/architecture/plan.rules.md, docs/architecture/docs.rules.md, docs/architecture/tracker.rules.md]
      write: [scripts/session-context.mjs, scripts/pre-guard.mjs, scripts/agent-mode-guard.mjs, scripts/arch-check.mjs, scripts/init.mjs, scripts/scope.mjs, scripts/digest.mjs, scripts/goal-token.mjs, scripts/doc-retire.mjs, scripts/init.test.mjs, scripts/agent-mode-guard.test.mjs, scripts/goal-token.test.mjs, scripts/scope.test.mjs, scripts/pre-guard.test.mjs, scripts/command-prefix.test.mjs]   # re-scoped 2026-11-24: three more tests assert the old bare text (expected strings only; pre-guard.test.mjs ~160 KB, grep -n and edit by range)
    arch: [ARCH-SAFETY-04, ARCH-STATE-16, ARCH-PLAN-04, ARCH-DOCS-07, ARCH-TRACKER-15]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [test-driven-development], guards: [], mcp: [] }
  - id: 7
    scope_id: r3b-doc-prefix
    project: .
    depends_on: [r2-criteria-owner, r3a-emitted-prefix]
    module: next-step lines in loop command docs
    language: markdown
    security: normal
    scope:
      read: [commands/plan.md, commands/investigate.md, commands/idea.md, commands/architect.md, commands/understand.md, commands/scrutinise.md, commands/orchestrate.md, scripts/doc-size-policy.mjs]
      docs: [docs/architecture/slim.rules.md, docs/architecture/plan.rules.md, docs/architecture/docs.rules.md, docs/architecture/views.rules.md]
      write: [commands/plan.md, commands/investigate.md, commands/idea.md, commands/architect.md, commands/understand.md, commands/scrutinise.md, commands/orchestrate.md]
    arch: [ARCH-SLIM-14, ARCH-SLIM-17, ARCH-PLAN-06, ARCH-DOCS-18, ARCH-VIEWS-06]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [doc-size-policy], mcp: [] }
  - id: 8
    scope_id: r3c-doc-prefix
    project: .
    depends_on: [c1-goal-template, r2-criteria-owner, r3b-doc-prefix]
    module: next-step lines in auto, instruction, init and architect sub-docs; prefix test part 2
    language: markdown
    security: normal
    scope:
      read: [commands/_architect-maintain.md, commands/_architect-backfill.md, commands/init.md, commands/auto.md, commands/instruction.md, scripts/command-prefix.test.mjs, scripts/doc-size-policy.mjs]
      docs: [docs/architecture/slim.rules.md, docs/architecture/plan.rules.md, docs/architecture/auto.rules.md, docs/architecture/docs.rules.md, docs/architecture/landing.rules.md, docs/architecture/views.rules.md]
      write: [commands/_architect-maintain.md, commands/_architect-backfill.md, commands/init.md, commands/auto.md, commands/instruction.md, scripts/command-prefix.test.mjs, commands/_scrutinise-deep.md, commands/digest.md, commands/merge.md, commands/sync-docs.md, scripts/auto-command.test.mjs, scripts/criteria-owner.test.mjs, scripts/views-wiring.test.mjs]   # re-scoped 2026-11-25: part 2 flags 4 more docs; 3 tests lock bare text (prefix + expected strings only)
    arch: [ARCH-SLIM-14, ARCH-SLIM-17, ARCH-PLAN-06, ARCH-AUTO-04, ARCH-DOCS-18, ARCH-LAND-06, ARCH-VIEWS-06]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [test-driven-development], guards: [doc-size-policy], mcp: [] }
  - id: 9
    scope_id: r3d-userdocs-prefix
    project: .
    depends_on: [r3c-doc-prefix]
    module: README, EXTENDING, INSTALL command references
    language: markdown
    security: normal
    scope:
      read: [README.md, EXTENDING.md, INSTALL.md, scripts/command-prefix.test.mjs]
      docs: []
      write: [README.md, EXTENDING.md, INSTALL.md, scripts/command-prefix.test.mjs]
    arch: []
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [test-driven-development], guards: [], mcp: [] }
---

# Plan: unattended /craftsman:auto runs stop cleanly, and printed commands carry the craftsman: prefix

## Outcome
An unattended `/craftsman:auto` run stops cleanly when work is blocked, instead of looping on stale worktree bindings, blocked units' criteria and doc-write detours. Every next step craftsman prints names the `/craftsman:<name>` command.

## Scope Steps (executable core)

### Step 1 — r1a-stale-binding (., javascript, normal) — ROOT CAUSE
Tooling: implementer implementer · gates code-reviewer · skills test-driven-development · guards doc-size-policy
Depends on: none
- [ ] 1.1 Add a failing test to `scripts/stop-gate.test.mjs`: a session binding file whose `worktree_path` does not exist → Stop exits 0 with no `WORKTREE BINDING ACTIVE` block and the binding file is gone → accept: the test fails on the old `stop-gate.mjs` (it blocks) and passes after 1.3.
- [ ] 1.2 Add a second test: a binding whose worktree exists and is unmerged still blocks with `WORKTREE BINDING ACTIVE` → accept: passes before and after (a guard against over-clearing).
- [ ] 1.3 In `scripts/stop-gate.mjs:97-107`, a binding whose `worktree_path` is missing on disk (also covering one the sweep at :48-52 just removed) is cleared with `clearWorktreeBinding` from `lib/core.mjs` (keyed by `worktree_path`, as `scope.mjs:144-156` does) and logged as `{ev:"stop-binding-cleared", sid, unit, worktree_path}`, never blocked; an existing worktree keeps blocking → accept: 1.1 and 1.2 pass.
- [ ] 1.4 In `agents/unit-runner.md` § park step 2 and § block step 2, run `S scope {action:"release", session_id, project, worktree_path}` before `repo-exec cleanup`; pay for the added bytes by trimming wording in the same file → accept: `node scripts/doc-size-policy.mjs` PASS and the file has no cap rise.

### Step 2 — r1b-parked-acceptance (., javascript, normal) — ROOT CAUSE + C3
Tooling: implementer implementer · gates code-reviewer · skills test-driven-development
Depends on: r1a-stale-binding
- [ ] 2.1 In `scripts/lib/core.mjs` `bindingAcceptance` (:1244), accept an optional `held` set of unit ids. A `[unit:X]` line whose X is in `held` goes into a new `held` list instead of `binding`. `[plan:]` and untagged handling stays unchanged (ARCH-TRACKER-16's "binds only when its ledger names X" still holds, with one more condition) → accept: existing core and acceptance tests are unchanged and green.
- [ ] 2.2 In `scripts/stop-gate.mjs:413-456`, build `held` from `currentState(context)` rows whose status is `PARKED` or `BLOCKED`, and pass it to `bindingAcceptance`. Held lines do not block. They are listed in the Stop systemMessage notice (`craftsman: N acceptance line(s) held by BLOCKED/PARKED units <ids> — answered in /craftsman:auto Phase C`). The block text gains the exit "or, if the unit is blocked on the user, record it BLOCKED/PARKED via tracker.mjs with a decision and print BLOCKED ON USER" → accept: test 2.4.
- [ ] 2.3 Log `{ev:"stop-acceptance-held", sid, units}` when held lines exist → accept: test 2.4 reads the event.
- [ ] 2.4 Add to `scripts/stop-gate-plan-scope.test.mjs`: (a) the session's ledger names a unit whose latest row is BLOCKED and that unit has an unticked `[unit:]` line → Stop exits 0, the notice names the unit, and the event is logged (RED on old code); (b) the same with IN_PROGRESS → still blocks, and the reason contains the BLOCKED ON USER exit → accept: (a) fails on old code; both pass after 2.1-2.3.

### Step 3 — c1-goal-template (., markdown, normal) — CONTRIBUTING
Tooling: implementer implementer · gates code-reviewer · skills test-driven-development · guards doc-size-policy
Depends on: r1b-parked-acceptance
- [ ] 3.1 In `commands/instruction.md` Phase 2, the `/goal` template's second line is the met-stop rule. The goal is MET when the final turn prints COMPLETION EVIDENCE, or prints `BLOCKED ON USER: <one thing>` + what was tried; BLOCKED rows and PARKED rows with a printed blocker count as met. The evidence clause, the parked-rows clause and the turn cap stay (ARCH-AUTO-04). Pay for the bytes in the same file → accept: `node scripts/doc-size-policy.mjs` PASS with no cap rise.
- [ ] 3.2 Add an assertion to `scripts/auto-command.test.mjs`: inside the instruction.md template block, `BLOCKED ON USER` appears within the first 3 lines after `/goal`, and the template names BLOCKED rows as a met stop → accept: fails on old instruction.md, passes after 3.1.

### Step 4 — c2-docguard-text (., javascript, high) — CONTRIBUTING
Tooling: implementer implementer · gates code-reviewer, security-auditor · skills test-driven-development
Depends on: none
- [ ] 4.1 In `scripts/pre-guard.mjs` (doc-guard deny at :2103-2106 and the Bash-side `ask` at :1987), when `commandInvoked(sid, DOC_WRITER_COMMANDS)` holds for the session, the message leads with `this session already ran a doc-writing command; re-grant with: node "${CLAUDE_PLUGIN_ROOT}/scripts/doc-write.mjs" on` and drops "Hand the change to /plan". Otherwise it keeps the redirect, now naming `/craftsman:plan`. Exit code and allow/deny decisions are unchanged (ARCH-STATE-16) → accept: test 4.2.
- [ ] 4.2 Add to `scripts/pre-guard-writes.test.mjs`: a session with a recorded `orchestrate` command and no grant gets a deny (exit 2) whose stderr names `doc-write.mjs on` and not `Hand the change to`; a session with no recorded doc writer still gets the redirect → accept: the first case fails on old code; both pass after 4.1.

### Step 5 — r2-criteria-owner (., markdown, normal) — ROOT CAUSE
Tooling: implementer implementer · gates code-reviewer · skills test-driven-development · guards doc-size-policy
Depends on: c1-goal-template
- [ ] 5.1 `commands/plan.md` Phase 1 step 3: a criterion that needs an edit to a `docWriteGuard.docPaths` doc (architecture rules, ideas, plan prose) is written `- [ ] [plan:<slug>] (owner: architect|sync-docs) <criterion>`. It is never `[unit:]`-tagged, because no unit may write those paths (orchestrate.md:10, architect.md:10) → accept: test 5.5.
- [ ] 5.2 `agents/plan-reviewer.md`: emit an owner-tagged `[plan:]` line for any doc-edit criterion, never a unit line → accept: test 5.5.
- [ ] 5.3 `agents/scrutineer.md` § Acceptance verdicts: an `(owner: …)` criterion is MET on doc `file:line` evidence (no test required); still UNMET when the doc does not say it → accept: test 5.5.
- [ ] 5.4 `commands/instruction.md` goal step 4 (`/craftsman:sync-docs --all`, `/craftsman:architect --update`) ticks the owner-tagged criteria it satisfies. `commands/orchestrate.md` states that units never take owner-tagged lines. Every edit is paid for by same-file trims → accept: `node scripts/doc-size-policy.mjs` PASS, no cap rise.
- [ ] 5.5 New `scripts/criteria-owner.test.mjs` asserts the owner rule's wording in plan.md, plan-reviewer.md, scrutineer.md, instruction.md and orchestrate.md, and that `bindingAcceptance` treats an `(owner: …)` `[plan:]` line like any `[plan:]` line (a unit's MERGED is not held by it, via `tracker.mjs` refusal semantics, ARCH-TRACKER-15) → accept: fails on old docs, passes after 5.1-5.4.

### Step 6 — r3a-emitted-prefix (., javascript, normal) — ROOT CAUSE (symptom 1, runtime half)
Tooling: implementer implementer · gates code-reviewer · skills test-driven-development
Depends on: r1b-parked-acceptance, c2-docguard-text
- [ ] 6.1 Prefix every emitted (non-comment) craftsman command name with `/craftsman:` in `session-context.mjs` (LOOP lines :244, :245, :251; agent-mode :306; tracker nudge :317), `pre-guard.mjs` (:1535, :1967, :1970, :1987, :2104, re-read after step 4 merged), `agent-mode-guard.mjs` (:51-53, :119, :131-133), `arch-check.mjs` (:150, :231, :352), `init.mjs` (:54-55), `scope.mjs` (:175, :202), `digest.mjs` (:58), `goal-token.mjs` (:21), `doc-retire.mjs` (:118) → accept: test 6.3.
- [ ] 6.2 Update the locked expectations `scripts/init.test.mjs:164`, `scripts/agent-mode-guard.test.mjs:154`, `scripts/goal-token.test.mjs:60`, `scripts/scope.test.mjs:228,255` and `scripts/pre-guard.test.mjs:1535` (expected strings only) to the prefixed text → accept: both suites green.
- [ ] 6.3 New `scripts/command-prefix.test.mjs` (part 1). It scans string literals and template literals, not comments, in `scripts/*.mjs` (non-test), `scripts/lib/*.mjs` and `hooks/*.js` for `(^|[^:\w./-])/(<craftsman command names>)\b`, and fails on any hit. Paths like `docs/plans/` and `commands/plan.md` must not match → accept: fails on old code with the session-context LOOP line among the hits; passes after 6.1.

Cap rule for steps 7-8: each file pays for its own added bytes by trimming wording in that file; there are no CAP_TRADES. A file that cannot be paid for → PARK the unit with that file named in the decision.

### Step 7 — r3b-doc-prefix (., markdown, normal) — ROOT CAUSE (symptom 1, loop command docs)
Tooling: implementer implementer · gates code-reviewer · guards doc-size-policy
Depends on: r2-criteria-owner, r3a-emitted-prefix
- [ ] 7.1 Prefix with `/craftsman:` every command named on a line that tells the model what to print, recommend or run next: `plan.md:41`, `investigate.md:44`, `idea.md:67`, `architect.md:50`, `understand.md:50`, `scrutinise.md:43`, `orchestrate.md:58` (re-locate each by its text after earlier merges) → accept: `grep -nE 'next step|Print|Recommend' <file>` shows no bare craftsman command name in those 7 files; `node scripts/doc-size-policy.mjs` PASS with no cap rise.

### Step 8 — r3c-doc-prefix (., markdown, normal) — ROOT CAUSE (symptom 1, goal template + prefix test part 2)
Tooling: implementer implementer · gates code-reviewer · skills test-driven-development · guards doc-size-policy
Depends on: c1-goal-template, r2-criteria-owner, r3b-doc-prefix
- [ ] 8.1 Prefix the next-step lines in `_architect-maintain.md:42`, `_architect-backfill.md:37`, `init.md:67`, the `auto.md` Phase B/Finish lines, and the `instruction.md` `/goal` template steps 1-4 plus its Output section, and every bare name part 2 flags in `_scrutinise-deep.md`, `digest.md`, `merge.md`, `sync-docs.md` (updating the locked expectations at `auto-command.test.mjs:83`, `criteria-owner.test.mjs:34` and `views-wiring.test.mjs:18`) → accept: `node scripts/doc-size-policy.mjs` PASS with no cap rise; template still ≤ 4,000 chars when filled (ARCH-AUTO-04).
- [ ] 8.2 Extend `scripts/command-prefix.test.mjs` (part 2) over every `commands/*.md` line containing `next step`, `Print`, `Recommend` or `/goal`, plus the whole `instruction.md` template block → accept: fails on the pre-step-7 docs, passes now.

### Step 9 — r3d-userdocs-prefix (., markdown, normal) — LATENT (mechanical)
Tooling: implementer implementer · gates code-reviewer · skills test-driven-development
Depends on: r3c-doc-prefix
- [ ] 9.1 Prefix the Commands table and next-step references in `README.md`, `EXTENDING.md` and `INSTALL.md` (no caps apply) → accept: test 9.2.
- [ ] 9.2 Extend `scripts/command-prefix.test.mjs` (part 3) over the Commands/next-step sections of those three files → accept: fails on the old files, passes after 9.1; then `node --test scripts/*.test.mjs scripts/lib/*.test.mjs` exits 0 and `node scripts/arch-check.mjs lint` PASS.

## Sequencing
r1a → r1b (both write stop-gate.mjs and lib/core.mjs) → c1 (goal template) → r2 (also writes instruction.md). c2 runs independently. r3a waits for r1b and c2 (it touches pre-guard.mjs strings c2 rewrites). r3b runs last, after every other writer of instruction.md and the command docs. Root causes go first, then contributing, then the broad string sweep, so the sweep never conflicts with a behavioural fix.

## Verification background   (citations — for the reviewer, not the executor)
- The Stop gate blocks on every binding, with no existence check — `scripts/stop-gate.mjs:97-107`.
- The sweep removes worktrees but only forgets the session-worktree ledger, never the binding — `scripts/stop-gate.mjs:48-52`, `scripts/lib/core.mjs` `forgetSessionWorktree`.
- Park/block paths clean up the worktree without releasing the scope — `agents/unit-runner.md:31-39` (land releases at :27).
- Only `scope.mjs release` clears a binding; the file is self-protected — `scripts/scope.mjs:144-156`, `scripts/lib/self-protect.mjs:21`.
- Real transcript: "the `archive-lib` unit's binding was left behind when its worktree was removed" (session 9d68568c); `WORKTREE BINDING ACTIVE` repeated 5-24× per unit in sessions 9d68568c, 54b76895, c8722858.
- `[unit:]` criteria bind regardless of row status — `scripts/lib/core.mjs:1244-1252`; block text "tick … otherwise implement it" — `scripts/stop-gate.mjs:446-450`.
- The gate blocked on archive-lib/next-queue criteria while the model printed BLOCKED ON USER on consecutive turns — session 9d68568c transcript.
- The goal's exit clause sits last; only "Parked rows" are a met stop — `commands/instruction.md:40-56`; ARCH-AUTO-04.
- 95 of 96 `goal_status` entries were met:false; no evaluator reason cites BLOCKED ON USER — session 9d68568c.
- Doc-write authority is cleared on every Stop — `scripts/stop-gate.mjs:89-90`; the deny redirects to /plan — `scripts/pre-guard.mjs:1987`, `:2103-2106`; the re-grant works whenever a doc writer is recorded — `scripts/doc-write.mjs` + `DOC_WRITER_COMMANDS` `scripts/lib/core.mjs:638`.
- Doc ownership split — `commands/orchestrate.md:10` (tracker rows only), `commands/architect.md:10`, `commands/sync-docs.md:10`; the scrutineer requires code+test evidence — `agents/scrutineer.md:23`; unit criteria demanding rules-doc edits — `.craftsman/acceptance.md:167,186`.
- The SessionStart LOOP line uses bare names — `scripts/session-context.mjs:251`; commands/*.md have 226 bare vs 30 prefixed references; no convention or test exists (`scripts/entry-surface.test.mjs:26-29` accepts both).
- Doc caps are a zero-sum ratchet, and most command docs have 0 headroom — `scripts/doc-size-policy.mjs:21-210`, ARCH-SLIM-17.

CONSUMERS:
- `bindingAcceptance` (scripts/lib/core.mjs:1244): `scripts/stop-gate.mjs:433`; tests `scripts/acceptance-plan-scope.test.mjs`, `scripts/stop-gate-plan-scope.test.mjs`. The new `held` argument is optional, so existing callers are unchanged.
- `clearWorktreeBinding` (scripts/lib/core.mjs): `scripts/scope.mjs:148`; new caller `scripts/stop-gate.mjs`.
- Deny/LOOP strings: asserted by `scripts/init.test.mjs:164`, `scripts/agent-mode-guard.test.mjs:154`, `scripts/session-context.test.mjs:227` (already prefixed).

## Risk & rollback
- Clearing a binding is limited to a missing worktree; an existing worktree still blocks, so a live unit can never be released silently.
- The held-criteria filter covers only PARKED/BLOCKED rows. Those still hold `tracker.mjs` MERGED/COMPLETE (ARCH-TRACKER-04), so nothing lands unmet; the Stop simply stops forcing work on them.
- Cap pressure in step 7: if a doc cannot pay for its own bytes, the unit PARKs and asks rather than raising caps.
- Rollback: revert each unit's merge commit.

## Out of scope — follow-ups (not rows in this plan; raise as their own plans)
- F1 (L1, unverified): a typed bare `/plan` may be recorded as craftsman `plan` by `orchestrate-scope-guard.mjs:102-107` even when Claude Code routes it to built-in plan mode, which would satisfy the doc-write gate (`pre-guard.mjs:1969`). Verify, then match only `/craftsman:` on typed prompts.
- F2 (L2): 50 of 105 logged docguard denials are "command the parser cannot prove safe" refusals (shell `for`, subshells, `node -e`); review the `proveSafe` coverage within ARCH-SAFETY-17's limits.
- F3 (L3): `/craftsman:architect --update` to restate ARCH-TRACKER-16 (held units), ARCH-AUTO-04 (BLOCKED met stop, leading exit) and ARCH-SLIM-14 (prefixed entry points) once this lands.
- F4 (C2b, owner decision): keep the doc-write grant across Stops while an /auto goal is active, instead of only fixing the deny text.
- F5: prefix the remaining in-prose shorthand references in command and agent docs (about 2.3 KB over caps today), which needs paid CAP_TRADES or trims.
