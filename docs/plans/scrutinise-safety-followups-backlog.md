---
slug: scrutinise-safety-followups-backlog
goal: The gaps /scrutinise found in safety-followups-backlog are closed — the isMain switch-over finished, the missing tests and doc fields fixed, and the linked-worktree goal-file path decided and made consistent.
level: feature
priority: P2
classification: in-scope (round 1 of /scrutinise safety-followups-backlog; reviewed 113e1d5, e7dea5e, 51871b0 at main 984f169)
parent: safety-followups-backlog
tracker_rows: []
guards:
  blast_radius: done
  completeness_sweep: done
  blind_rederivation: skipped(trivial)
coverage:
  contract:      N/A(isMain is an additive export; goal-token's CLI is unchanged by hk and sw-*; gt may change which directory it accepts, its only consumer is hooks/register.js)
  data:          N/A(no persistence or migration)
  config:        N/A(no key added)
  security:      gt (a path-acceptance change in a minting script)
  tests:         hk-1, hk-2, hk-3, gt (decision-gated), each sw batch runs the full suite
  observability: N/A(a refusal already names the file)
  interface:     N/A
  docs:          hk-4 (safety.rules.md updated/verified_at), gt (commands/instruction.md:58, commands/auto.md:25 only if option (a) is chosen)
  rollback:      one revert per unit; each is its own commit
units:
  - id: 1
    scope_id: scrutinise-housekeeping
    project: .
    depends_on: []
    module: scripts/lib/core.test.mjs
    language: javascript
    security: normal
    scope:
      read: [scripts/lib/core.test.mjs, scripts/pre-guard.test.mjs, docs/plans/safety-followups-backlog.md]
      docs: [docs/architecture/safety.rules.md, docs/architecture/state.rules.md]
      write: [scripts/lib/core.test.mjs, scripts/pre-guard.test.mjs, docs/architecture/safety.rules.md, docs/plans/safety-followups-backlog.md]
    arch: [ARCH-SAFETY-05, ARCH-SAFETY-09, ARCH-STATE-06]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [test-driven-development], guards: [arch-check], mcp: [] }
  - id: 2
    scope_id: ismain-switch-1
    project: .
    depends_on: [scrutinise-housekeeping]
    module: scripts
    language: javascript
    security: normal
    scope:
      read: []   # the write files are the only ones touched; reading whole scripts overflows unitContextBytes (ARCH-ENGINE-08)
      docs: [docs/architecture/state.rules.md, docs/architecture/docs.rules.md, docs/architecture/engine.rules.md, docs/architecture/tracker.rules.md]
      write: [scripts/account-switch.mjs, scripts/arch-check.mjs, scripts/claim.mjs, scripts/digest.mjs, scripts/doc-retire.mjs]
    arch: [ARCH-STATE-06, ARCH-DOCS-03, ARCH-ENGINE-15, ARCH-TRACKER-01]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [arch-check], mcp: [] }
  - id: 3
    scope_id: ismain-switch-2
    project: .
    depends_on: [ismain-switch-1]
    module: scripts
    language: javascript
    security: normal
    scope:
      read: []
      docs: [docs/architecture/state.rules.md, docs/architecture/landing.rules.md, docs/architecture/plan.rules.md, docs/architecture/slim.rules.md]
      write: [scripts/doc-size-policy.mjs, scripts/handoff.mjs, scripts/init.mjs, scripts/plan-graph.mjs, scripts/plan-memory.mjs]
    arch: [ARCH-STATE-06, ARCH-LAND-06, ARCH-PLAN-04, ARCH-SLIM-01]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [arch-check], mcp: [] }
  - id: 4
    scope_id: ismain-switch-3
    project: .
    depends_on: [ismain-switch-2]
    module: scripts
    language: javascript
    security: normal
    scope:
      read: []
      docs: [docs/architecture/state.rules.md, docs/architecture/engine.rules.md, docs/architecture/landing.rules.md, docs/architecture/tracker.rules.md, docs/architecture/safety.rules.md]
      write: [scripts/repo-exec.mjs, scripts/run-args.mjs, scripts/run-manifest.mjs, scripts/scope.mjs, scripts/secrets-scan.mjs]
    arch: [ARCH-STATE-06, ARCH-ENGINE-19, ARCH-LAND-06, ARCH-TRACKER-07, ARCH-SAFETY-05]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [arch-check], mcp: [] }
  - id: 5
    scope_id: ismain-switch-4
    project: .
    depends_on: [ismain-switch-3]
    module: scripts
    language: javascript
    security: normal
    scope:
      read: []
      docs: [docs/architecture/state.rules.md, docs/architecture/mod.rules.md, docs/architecture/tracker.rules.md, docs/architecture/slim.rules.md, docs/architecture/engine.rules.md, docs/architecture/archive.rules.md, docs/architecture/docs.rules.md]
      write: [scripts/self-update.mjs, scripts/state-write.mjs, scripts/stats.mjs, scripts/telemetry.mjs, scripts/tracker.mjs]
    arch: [ARCH-STATE-06, ARCH-MOD-06, ARCH-TRACKER-01, ARCH-SLIM-06, ARCH-ENGINE-07, ARCH-ARCHIVE-04, ARCH-DOCS-09]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [arch-check], mcp: [] }
  - id: 6
    scope_id: ismain-switch-5
    project: .
    depends_on: [ismain-switch-4]
    module: scripts
    language: javascript
    security: normal
    scope:
      read: []
      docs: [docs/architecture/state.rules.md, docs/architecture/landing.rules.md, docs/architecture/safety.rules.md, docs/architecture/tracker.rules.md]
      write: [scripts/tracker-publish.mjs, scripts/workspace-init.mjs, scripts/worktree-sweep.mjs]
    arch: [ARCH-STATE-06, ARCH-LAND-29, ARCH-SAFETY-07, ARCH-TRACKER-07]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [arch-check], mcp: [] }
  - id: 7
    scope_id: goal-token-worktree
    project: .
    depends_on: []
    module: scripts/goal-token.mjs
    language: javascript
    security: high
    decision: resolved   # W1 = B (accept either directory), W2 = stated limit; see Decisions (resolved)
    scope:
      read: [scripts/goal-token.mjs, scripts/goal-token.test.mjs]
      docs: [docs/architecture/safety.rules.md, docs/architecture/mod.rules.md]
      write: [scripts/goal-token.mjs, scripts/goal-token.test.mjs, docs/architecture/safety.rules.md, docs/architecture/safety.md]
    arch: [ARCH-SAFETY-09, ARCH-MOD-02]
    tooling: { implementer: implementer, gates: [security-auditor], skills: [test-driven-development], guards: [arch-check], mcp: [] }
---

# Plan: scrutinise safety-followups-backlog

## Outcome
Round 1 of `/scrutinise safety-followups-backlog` found two Warnings in the goal-token change, three unmet criteria (2.1, 3.2, 3.3) and four Suggestions. This plan closes them. The user resolved W1 (accept either directory) and W2 (stated limit) for unit 7.

## Scope Steps (executable core)

### Step 1 — scrutinise-housekeeping (., javascript, normal)
Tooling: implementer implementer · gates code-reviewer · skills test-driven-development · guards arch-check
Depends on: none
- [ ] 1.1 [S1] In `scripts/lib/core.test.mjs:1025` pass `null` (and `""`) as `argv1` instead of `undefined`, so the `!argv1` branch of `isMain` runs → accept: the test fails if that branch is removed
- [ ] 1.2 [S3] Reword criterion 1.1 of `docs/plans/safety-followups-backlog.md` to "an edit that flips either key is refused with no scope and allowed only under `/orchestrate`"; add a `craftsman.project.json` case to `scripts/pre-guard.test.mjs:1800-1819` → accept: the new case is red if the key is removed from `SAFETY_CONFIG_KEYS`
- [ ] 1.3 [S2] Bump `updated:` and `verified_at:` in `docs/architecture/safety.rules.md` header → accept: `arch-check lint` and `safety-cites` pass

### Steps 2-6 — ismain-switch-1 … ismain-switch-5 (., javascript, normal) — plan criterion 3.3
Tooling: implementer implementer · gates code-reviewer · guards arch-check
Depends on: each on the one before; step 2 on step 1
For each batch (one commit each, `refactor(scripts): use isMain in <names>`):
- [ ] N.1 Replace `import.meta.url === …` entry checks in the batch's files with `isMain(import.meta.url)` imported from `./lib/core.mjs`; no other change → accept: `git diff` shows only the import and the condition per file
- [ ] N.2 Run `node --test scripts/*.test.mjs` → accept: exit 0 after every batch
Batches: 1 = account-switch, arch-check, claim, digest, doc-retire · 2 = doc-size-policy, handoff, init, plan-graph, plan-memory · 3 = repo-exec, run-args, run-manifest, scope, secrets-scan · 4 = self-update, state-write, stats, telemetry, tracker · 5 = tracker-publish, workspace-init, worktree-sweep. `goal-token.mjs` is left to step 7 and the variants outside these 23 files (`approval.mjs`, `tracker-sync.mjs`, `lib/*`) stay as they are; record them as out of scope in the last commit message.
Acceptance for the whole group: `grep -rl "import.meta.url ===" scripts --include=*.mjs` outside tests lists none of the 23.

### Step 7 — goal-token-worktree (., javascript, high) — decisions resolved (W1 = B, W2 = stated limit)
Tooling: implementer implementer · gates security-auditor · skills test-driven-development · guards arch-check
Depends on: none
- [ ] 7.1 [W1] In `scripts/goal-token.mjs:28-36` accept a `*.goal.txt` directly under either `<root>/.craftsman/instructions` or `<main>/.craftsman/instructions`, with the realpath dirname check against the matching directory; `commands/instruction.md` and `commands/auto.md` are not edited → accept: a goal file saved in the worktree mints, and a file in the main checkout still mints
- [ ] 7.2 [W2] Dropped: the token/root mismatch with `hooks/register.js:139,144` is recorded as a stated limit (task 7.4), not fixed here → accept: none needed
- [ ] 7.3 [S4] Add `goal-token.test.mjs` cases: a goal file saved inside the worktree mints, a file in the main checkout mints, an outside file, a symlink out and an unrelated copy are still refused, and the test asserts where the token lands → accept: red before 7.1
- [ ] 7.4 Update ARCH-SAFETY-09's text and cites in `safety.rules.md` and `safety.md`: say the goal file is accepted under the worktree's or the main checkout's `.craftsman/instructions`, and that from a linked worktree the mod may still fall back to the paste path because it reads the goal file and the token from one root (fails closed, UX only) → accept: `safety-cites` and `arch-check lint` pass

## Decisions (resolved — asked by /auto Phase C, 2026-10-24)
- W1: option B (accept either directory).
- W2: recorded as a stated limit of ARCH-SAFETY-09; task 7.2 dropped.

## Verification background (citations — for the reviewer, not the executor)
- `isMain` — `scripts/lib/core.mjs:1179-1186`; its test — `scripts/lib/core.test.mjs:1020-1028`
- Goal path resolved under the main checkout — `scripts/goal-token.mjs:28-36`; token written under the session state dir — `scripts/goal-token.mjs:38`; the mod reads both from one root — `hooks/register.js:139,144`
- Writers say to save at the relative path — `commands/instruction.md:58`, `commands/auto.md:25`
- CONSUMERS: `isMain` → none yet (steps 2-6 add the call sites); `mintGoalToken` → `scripts/goal-token.mjs` CLI and `scripts/goal-token.test.mjs`; the token file → `hooks/register.js`

## Risk & rollback
Steps 2-6 change 23 entry-point checks with no logic change; the suite after each batch is the guard and each batch reverts alone. Step 7 touches a security gate: its refusal cases are the point of its tests.

## Out of scope
The remaining `realpathSync` variants of the entry check, and registering or closing the stale ledger rows (step 4 of `safety-followups-backlog`).
