---
slug: scrutinise-investigate-auto-flow-friction
goal: The Stop gate's advice is always executable and never tells the model to delete unlanded work, and the fixes from the investigate-auto-flow-friction review round hold under test.
level: feature
parent: investigate-auto-flow-friction
children: []
priority: P1
classification: in-scope — /craftsman:scrutinise round 1, 2026-11-25 (isolated scrutineer, main @6dbd6d8): 0 Critical, 3 Warning, 7 Suggestion, 0 Disputed; 12/12 criteria MET
tracker_rows: [s1-stopgate-advice, s2-core-bindings, s3-preguard-advice, s4-goal-step2, w2-binding-inflight]
guards:
  blast_radius: done
  completeness_sweep: done
  blind_rederivation: skipped(config:never)
  strategist: skipped(decomposition given by the scrutineer's findings, one unit per file boundary)
coverage:
  contract:      N/A(no exported signature changes; bindingAcceptance and readLiveWorktreeBindings keep their shapes)
  data:          2.1 (binding file unlinked by the entry actually read)
  config:        N/A(no config key)
  security:      1.2 (leftover advice never names `git branch -D` for a branch not merged into a remote-tracking base, ARCH-SAFETY-07), 3.1 (doc-guard advice inside a unit scope keeps the redirect)
  tests:         1.4, 2.3, 3.2, 4.2 (each RED on the old code)
  observability: N/A(no event changes)
  interface:     1.1 (Stop block exit text), 1.2 (WORKTREE NOT SWEPT text), 3.1 (deny advice), 4.1 (/goal step 2)
  docs:          cite: re-points only, by the unit whose edit shifts them; stale cites S5 → (owner: architect) criterion
  rollback:      revert each unit's merge commit; message/filter changes only
units:
  - id: 1
    scope_id: s1-stopgate-advice
    project: .
    depends_on: []
    module: stop-gate exit text, leftover check, held units
    language: javascript
    security: high
    scope:
      read: [scripts/stop-gate.mjs, scripts/stop-gate-plan-scope.test.mjs]   # stop-gate.test.mjs ~54 KB, tracker.mjs, worktree-sweep.mjs, core.mjs: grep -n and read by range
      docs: [docs/architecture/state.rules.md, docs/architecture/tracker.rules.md, docs/architecture/safety.rules.md]
      write: [scripts/stop-gate.mjs, scripts/stop-gate.test.mjs, scripts/stop-gate-plan-scope.test.mjs, docs/architecture/state.rules.md, docs/architecture/tracker.rules.md, docs/architecture/safety.rules.md]   # rules docs: cite: line ranges only, re-pointing cites this unit's stop-gate.mjs edit shifts (safety-cites.test.mjs)
    arch: [ARCH-TRACKER-03, ARCH-TRACKER-16, ARCH-STATE-23, ARCH-SAFETY-06, ARCH-SAFETY-07]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [test-driven-development], guards: [], mcp: [] }
  - id: 2
    scope_id: s2-core-bindings
    project: .
    depends_on: [s1-stopgate-advice]
    module: core binding clear, bindingAcceptance held table
    language: javascript
    security: normal
    scope:
      read: [scripts/acceptance-plan-scope.test.mjs]   # core.mjs ~68 KB and core.test.mjs: grep -n readLiveWorktreeBindings / readWorktreeBindings / bindingAcceptance and read by range
      docs: [docs/architecture/state.rules.md, docs/architecture/tracker.rules.md, docs/architecture/safety.rules.md, docs/architecture/auto.rules.md, docs/architecture/views.rules.md, docs/architecture/archive.rules.md]
      write: [scripts/lib/core.mjs, scripts/lib/core.test.mjs, scripts/acceptance-plan-scope.test.mjs, docs/architecture/state.rules.md, docs/architecture/tracker.rules.md, docs/architecture/safety.rules.md, docs/architecture/auto.rules.md, docs/architecture/views.rules.md, docs/architecture/archive.rules.md]   # rules docs: cite: line ranges into core.mjs only
    arch: [ARCH-STATE-23, ARCH-STATE-19, ARCH-TRACKER-16, ARCH-AUTO-11]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [test-driven-development], guards: [], mcp: [] }
  - id: 3
    scope_id: s3-preguard-advice
    project: .
    depends_on: [s2-core-bindings]
    module: pre-guard doc-guard advice
    language: javascript
    security: high
    scope:
      read: [scripts/pre-guard-writes.test.mjs]   # pre-guard.mjs ~162 KB: grep -n docGuardAdvice / readScope and read by range
      docs: [docs/architecture/state.rules.md, docs/architecture/safety.rules.md]
      write: [scripts/pre-guard.mjs, scripts/pre-guard-writes.test.mjs, docs/architecture/state.rules.md, docs/architecture/safety.rules.md]   # rules docs: cite: line ranges into pre-guard.mjs only
    arch: [ARCH-STATE-16, ARCH-STATE-18, ARCH-SAFETY-13, ARCH-SAFETY-17]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [test-driven-development], guards: [], mcp: [] }
  - id: 4
    scope_id: s4-goal-step2
    project: .
    depends_on: [s3-preguard-advice]   # serialized 2026-11-25: units with no deps ran concurrently and collided on the shared session scope (F-run1)
    module: /goal template step 2
    language: markdown
    security: normal
    scope:
      read: [commands/instruction.md, scripts/auto-command.test.mjs, scripts/doc-size-policy.mjs]
      docs: [docs/architecture/auto.rules.md, docs/architecture/slim.rules.md, docs/architecture/plan.rules.md]
      write: [commands/instruction.md, scripts/auto-command.test.mjs]
    arch: [ARCH-AUTO-04, ARCH-SLIM-17, ARCH-PLAN-06]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [test-driven-development], guards: [doc-size-policy], mcp: [] }
  - id: 5
    scope_id: w2-binding-inflight
    project: .
    depends_on: [s4-goal-step2]
    module: stop-gate in-flight deferral (ARCH-STATE-23)
    language: javascript
    security: high
    scope:
      read: [scripts/stop-gate.mjs]   # stop-gate.test.mjs ~55 KB: grep -n "inFlight\|background_tasks\|WORKTREE BINDING ACTIVE\|WORKTREE NOT SWEPT" and read by range
      docs: [docs/architecture/state.rules.md, docs/architecture/safety.rules.md, docs/architecture/tracker.rules.md]
      write: [scripts/stop-gate.mjs, scripts/stop-gate.test.mjs, docs/architecture/state.rules.md, docs/architecture/safety.rules.md, docs/architecture/tracker.rules.md]   # rules docs: cite: line ranges only (re-point what this edit shifts, incl. ARCH-STATE-23's own cite)
    arch: [ARCH-STATE-23, ARCH-STATE-08, ARCH-SAFETY-06, ARCH-SAFETY-07]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [test-driven-development], guards: [], mcp: [] }
---

# scrutinise-investigate-auto-flow-friction

Fixes from `/craftsman:scrutinise investigate-auto-flow-friction` round 1. W2 needed an owner decision (amend decided ARCH-STATE-04); decided 2026-11-25 → ARCH-STATE-23, implemented by step 5.

## Scope Steps (executable core)

### Step 1 — s1-stopgate-advice (., javascript, high) — W1, W3, S1
Tooling: implementer implementer · gates code-reviewer, security-auditor · skills test-driven-development

- [ ] 1.1 `scripts/stop-gate.mjs` acceptance-block exit (≈:464): replace "record it BLOCKED/PARKED via tracker.mjs with a decision" with "record it PARKED via tracker.mjs with decision {question, options[]} (or BLOCKED with evidence only)" + "and print BLOCKED ON USER". `tracker.mjs:78-83` refuses a decision on BLOCKED and needs `{question, options[≥2]}` for an autonomous PARK (ARCH-TRACKER-03) → accept: 1.4(a).
- [ ] 1.2 Leftover check (≈:125-132): never use the `["HEAD"]` fallback when `entry.keep_reason === "not merged into the base branch"` (a base ref exists and the branch is not in it), and resolve any HEAD fallback in the main checkout (first `listWorktrees` entry), never in a unit worktree. ARCH-SAFETY-07: a branch counts as merged only into a remote-tracking base ref → accept: 1.4(b).
- [ ] 1.3 Held units (≈:436-439): add a row's id to `held` only when that row's plan slug equals the plan of the `[unit:X]` line it would hold → accept: 1.4(c).
- [ ] 1.4 Tests, each RED on the old code: (a) `stop-gate-plan-scope.test.mjs` test G's regex matches the new exit and does not match `BLOCKED/PARKED via tracker.mjs with a decision`; (b) `stop-gate.test.mjs`: a session-owned worktree whose branch has a commit not on the base, with the sweep's keep_reason "not merged into the base branch" and a scope whose project_root is that worktree → no `WORKTREE NOT SWEPT` and no `branch -D` in the output; (c) `stop-gate-plan-scope.test.mjs`: unit id X BLOCKED in plan A and IN_PROGRESS with an unticked `[unit:X]` line in plan B (ledger names B) → still blocks → accept: all three fail on 6dbd6d8, pass after 1.1-1.3.
- [ ] 1.5 Re-point every `cite:` into `scripts/stop-gate.mjs` that this edit shifts (state/tracker/safety rules); change no rule text → accept: `node --test scripts/safety-cites.test.mjs` and `node scripts/arch-check.mjs lint` PASS.

### Step 2 — s2-core-bindings (., javascript, normal) — S3, S7
Tooling: implementer implementer · gates code-reviewer · skills test-driven-development
Depends on: s1-stopgate-advice

- [ ] 2.1 `scripts/lib/core.mjs` `readLiveWorktreeBindings` (≈:1303-1311): clear the binding file that `readWorktreeBindings` actually read (its directory entry), not a key recomputed from the absolute `worktree_path` → accept: 2.3(a).
- [ ] 2.2 `scripts/acceptance-plan-scope.test.mjs`: table rows for `bindingAcceptance` `held` — a held id with no lines (absent from both lists), a held id on a `[plan:]`-only line (still binds), and `held` omitted deep-equals the old shape plus `held: []` → accept: green.
- [ ] 2.3 Tests: (a) `scripts/lib/core.test.mjs` (or stop-gate.test.mjs if the helper is only reachable there): a binding written with a relative `worktree_path` from a non-root cwd whose worktree is gone → the file is removed after one read (RED on old code: the file stays) → accept: RED then green.
- [ ] 2.4 Re-point every `cite:` into `scripts/lib/core.mjs` across the rules docs (includes the stale ARCH-AUTO-11 and ARCH-STATE-19 cites) → accept: arch-check lint PASS; each re-pointed range holds the cited symbol.

### Step 3 — s3-preguard-advice (., javascript, high) — S4
Tooling: implementer implementer · gates code-reviewer, security-auditor · skills test-driven-development
Depends on: s2-core-bindings

- [ ] 3.1 `scripts/pre-guard.mjs` `docGuardAdvice` (≈:1984-1993): when the session has an active unit scope with a `worktree_path`, keep the `/craftsman:plan` redirect instead of the re-grant line; decisions and exit codes unchanged (ARCH-STATE-16) → accept: 3.2.
- [ ] 3.2 `scripts/pre-guard-writes.test.mjs`: a session with a recorded doc writer AND an active unit scope (worktree_path set) gets the redirect, not `doc-write.mjs on` (RED on old code) → accept: RED then green.
- [ ] 3.3 Re-point every `cite:` into `scripts/pre-guard.mjs` (includes the stale ARCH-SAFETY-13 and ARCH-STATE-18 cites) → accept: safety-cites.test.mjs and arch-check lint PASS.

### Step 4 — s4-goal-step2 (., markdown, normal) — S6
Tooling: implementer implementer · gates code-reviewer · skills test-driven-development · guards doc-size-policy
Depends on: s3-preguard-advice

- [ ] 4.1 `commands/instruction.md` template step 2: "no PARKED/BLOCKED left unresolved" → "none left without a printed blocker", matching line 2's met-stop rule; pay the bytes in-file → accept: doc-size-policy PASS, no cap rise.
- [ ] 4.2 `scripts/auto-command.test.mjs`: the template has no `left unresolved` and step 2 names `printed blocker` (RED on old) → accept: RED then green.

### Step 5 — w2-binding-inflight (., javascript, high) — W2
Tooling: implementer implementer · gates code-reviewer, security-auditor · skills test-driven-development
Depends on: s4-goal-step2

Owner decision 2026-11-25 (Phase C): ARCH-STATE-04 is superseded by ARCH-STATE-23 (`state.rules.md`), written by /craftsman:architect.

- [ ] 5.1 `scripts/stop-gate.mjs`: compute `inFlight` (today ≈:418-421, from `input.background_tasks`) once, before the binding loop (≈:97). While it is non-empty, skip the WORKTREE BINDING ACTIVE problems and the owned-worktree leftover check (WORKTREE NOT SWEPT), and log `{ev:"stop-binding-deferred", sid, tasks}`; the acceptance deferral keeps its existing event; secrets and regression checks are untouched → accept: 5.2.
- [ ] 5.2 `scripts/stop-gate.test.mjs`, each RED on 6dbd6d8's logic: (a) a live binding to an existing worktree + one in-flight workflow in `background_tasks` → exit 0, no `WORKTREE BINDING ACTIVE`, event logged; (b) the same binding with `background_tasks` empty → still blocks (the existing test stays green); (c) an owned leftover worktree + in-flight work → no `WORKTREE NOT SWEPT`; (d) a planted secret + in-flight work → still blocks → accept: (a) and (c) RED before 5.1, all four green after.
- [ ] 5.3 Re-point ARCH-STATE-23's `cite:` to the new in-flight computation and every other cite into `scripts/stop-gate.mjs` this edit shifts; change no rule text → accept: safety-cites.test.mjs and arch-check lint PASS.

## Follow-ups (not driven)

- S2: IN_PROGRESS→BLOCKED with any evidence releases a unit's lines from the Stop gate (`stop-gate.mjs:436-447`, `tracker.mjs`); nothing unmet can land (ARCH-TRACKER-04). Decide in ARCH-TRACKER-16 whether held needs a decision or printed blocker.
- F-run1 (seen live 2026-11-25): craftsman:run started s1 and s4 (both `depends_on: []`) concurrently under one root session_id; they share one active scope, so s1's displaced s4's and pre-guard refused s4's commit. Fix: serialize units sharing a session scope, or key the active scope per worktree.
- F-run2: s1's `.worktrees/s1-stopgate-advice` was left as a plain directory (only `.craftsman/sessions/<sid>/secrets-scanned`, not a registered worktree). `repo-exec.mjs` prepare (:296-300) treats any existing directory as a reusable worktree ("worktree already exists on main"). Fix: require `git worktree list` registration, not `fs.existsSync`.
- F-run3: `scope.mjs` refuseDirtyWorktree (:221-232) runs `git -C <dir> status` on a non-worktree directory, which reads the parent checkout, so releasing an empty directory is refused as "uncommitted changes". Fix: require `rev-parse --show-toplevel` == the path before judging dirtiness. (Recovered by the user-approved removal of the empty directory.)

## Round 2 — /craftsman:scrutinise 2026-11-25 (isolated, main @695f06a)

0 Critical · 0 Warning · 1 Architecture (fixed in 4af5d03: state-ignore comments re-cited ARCH-STATE-04 → ARCH-STATE-24) · 6 Suggestions (follow-ups, not driven). Criteria: s1-s4, w2 and the owner:architect cite line MET; the whole-plan suite+lint line UNMET only because `arch-check lint` fails on ARCH-LAND-38 and ARCH-STATE-25, both added by 2971cc7 (service-scoped-gates) and citing code its round 11 has not written yet.

- R2-1 [Correctness] `stop-gate.mjs:144-145`: the HEAD fallback is dropped only for keep_reason "not merged into the base branch"; gate it on `baseRefs(context.root).length > 0` for any keep reason (ARCH-SAFETY-07).
- R2-2 [Correctness] `stop-gate.mjs:47-52`: the Stop sweep runs before `inFlight` and can remove a freshly prepared, clean, unlocked unit worktree while its implementer is starting; skip session-owned/bound worktrees while in flight, or lock prepared worktrees in repo-exec (likely cause of F-run2).
- R2-3 [Cross-unit] `core.mjs:1275-1283`: `bindingAcceptance`'s `held` option is no longer called (stop-gate holds per plan locally at :453-469) but three tests pin it; remove it or move the plan-keyed hold into it.
- R2-4 [Cross-unit] `account-switch.mjs:513-516`: same recomputed-key unlink s2 fixed; export the entries reader and unlink `entry.file`.
- R2-5 [Test-coverage] `stop-gate.mjs:116-121,145`: no test reaches `mainCheckout()`; add a no-remote fixture.
- R2-6 [Test-coverage] `stop-gate.test.mjs:709`: rename the stale "skip only the acceptance block" test title.

## Verification background

CONSUMERS:
- stop-gate exit text → stop-gate-plan-scope.test.mjs test G (:265); commands/instruction.md:44 (met-stop wording)
- WORKTREE NOT SWEPT text → stop-gate.test.mjs leftover tests (grep `WORKTREE NOT SWEPT`)
- readLiveWorktreeBindings → scripts/stop-gate.mjs:97 only (grep)
- docGuardAdvice → pre-guard.mjs:2000, :2116
