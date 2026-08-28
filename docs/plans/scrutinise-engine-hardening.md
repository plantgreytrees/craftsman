---
slug: scrutinise-engine-hardening
classification: in-scope # fixes for verified findings from /scrutinise on the just-merged engine-hardening plan; TRACKER#22-25 all MERGED, this closes what that scrutiny found
tracker_rows: [TRACKER#26, TRACKER#27, TRACKER#28]
guards:
  blast_radius: done # grep-verified: gitTrackedFiles()'s only external caller (baseline.mjs) already calls it with no args, default fresh:false preserves exact current behavior; no HTTP/event boundary in a plugin-only repo
  completeness_sweep: done
  blind_rederivation: skipped(trivial-per-unit — each unit is a targeted, evidence-backed fix for one adversarially-verified finding, not new design)
coverage:
  contract:      N/A(gitTrackedFiles()'s new optional {fresh} param is additive/default-preserving; grep-verified no other call site needs updating)
  data:          N/A(no persistence/migration)
  config:        N/A(no config surface change)
  security:      N/A(no authn/authz/secret/input-boundary surface touched; the Critical fix corrects a false-positive block, not a security control)
  tests:         1.2 | 2.2
  observability: 1.1
  interface:     N/A(no UI/API/CLI surface)
  docs:          3.1
  rollback:      see Risk & rollback
units:
  - id: 1
    module: scripts/stop-gate.mjs (runTask budget-truncation fix)
    language: JavaScript (Node ESM, dependency-free)
    security: normal
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [] }
  - id: 2
    module: scripts/lib/core.mjs, scripts/session-context.mjs, scripts/lib/core.test.mjs
    language: JavaScript (Node ESM, dependency-free)
    security: normal
    tooling: { implementer: implementer, gates: [], skills: [], guards: [] }
  - id: 3
    module: scripts/stop-gate.mjs (comment compression)
    language: JavaScript (Node ESM, dependency-free)
    security: normal
    tooling: { implementer: implementer, gates: [], skills: [], guards: [] }
---

# Plan: Fix scrutinise findings on engine-hardening

## Outcome
A Stop-gate command that gets cut short by the shared time budget (not because
it actually failed) is correctly logged and skipped, never misreported as a
secrets hit / test regression / guard failure — closing a Critical,
reproduced-live bug the scrutinise pass found in the just-merged
`engine-hardening` plan. The duplicated tool-probe logic between `core.mjs`
and `session-context.mjs` is unified; `gitTrackedFiles()`'s test-only cache
reset is replaced with a cleaner parameter-based seam. `stop-gate.mjs`'s
comment density, which drifted to ~42% after four sequential patches, is
brought back in line with this codebase's own established 8-19% norm, and
the one comment that narrated its own review history instead of the code's
rationale is rewritten.

## Units (executable core)

### Unit 1 — Critical: budget-truncation misreporting (JS, normal)
Tooling: implementer implementer · gates code-reviewer (Stop-gate regression contract, same precedent as the original engine-hardening Unit 1) · skills none · guards none

- [ ] 1.1 In `scripts/stop-gate.mjs`'s `runTask`, record `const startedAt =
  Date.now()` immediately before the `pexec` call. In the `catch (e)` block,
  before the existing per-kind `problems.push(...)` branches (and after the
  existing `if (t.kind !== "test" && e.code === "ENOENT") return;` line),
  add a check that the kill was actually caused by OUR timeout reaching
  `cap` — **not** `e.killed` alone, which Node also sets on a `maxBuffer`
  overflow (e.g. a secrets scan or test failure with unusually large output)
  regardless of how much time has elapsed. Compute `const elapsed =
  Date.now() - startedAt` and only treat it as a budget skip when `e.killed
  && cap < t.timeoutMs && elapsed >= cap - 250` (a 250ms tolerance for
  scheduling jitter — a real timeout-at-`cap` kill lands at/after `cap`
  elapsed; a maxBuffer kill fires as soon as the output overflows,
  independent of `cap`, and will almost always land well before it). On that
  condition: `logEvent({ ev: "stop-budget-exceeded", sid, cmd: t.cmd });
  return;`. Do NOT change what happens when a command is killed after
  running its own full `timeoutMs` (`cap === t.timeoutMs`) — that's
  pre-existing, out-of-scope behavior (see Out of scope). Note in a comment
  that this is a narrower rule than `core.mjs`'s `runOne()` (which treats
  *any* kill as a non-finding, having no shared budget to distinguish
  against) — deliberately, not the same precedent restated.
  → accept: a `sleep 5` task with `totalBudgetMs: 3000` produces
  `stop-budget-exceeded` and no `problems` entry; a task that exceeds only
  its own full `timeoutMs` (budget not binding, `cap === t.timeoutMs`) still
  produces its normal `problems` entry unchanged; a task killed by
  `maxBuffer` overflow (simulate via a command that floods stdout well past
  8MB near-instantly, with `totalBudgetMs` set low enough that `cap <
  t.timeoutMs`) still produces its normal `problems` entry, not
  `stop-budget-exceeded`, because `elapsed` lands nowhere near `cap`; the
  default budget (280000) with a fast command logs no `stop-budget-exceeded`;
  a genuinely failing (non-killed, non-zero exit) command still blocks as
  before.
- [ ] 1.2 Add an automated `node:test` integration test — new file
  `scripts/stop-gate.test.mjs` — covering the five scenarios in 1.1's accept
  criterion, by actually spawning `node scripts/stop-gate.mjs` as a
  subprocess (matching the manual recipe already used to verify 1.1: an
  isolated temp git repo fixture with its own `.git`, a scratch
  `craftsman.config.json` override, crafted stdin JSON, and assertions on
  stdout/exit-code/`.craftsman/events.jsonl`). This is the regression test
  for the exact bug class that survived three prior review rounds uncaught
  precisely because nothing exercised `stop-gate.mjs` end-to-end — leaving
  it manual-only would repeat that gap. Clean up the temp fixture in a
  `finally`/`after` hook regardless of test outcome.
  → accept: `node --test scripts/stop-gate.test.mjs` passes, covering all
  five 1.1 scenarios; re-running the whole suite (`node --test scripts/`)
  leaves no stray temp directories behind.

### Unit 2 — Reuse + simplification (JS, normal)
Tooling: implementer implementer · gates none (mechanical refactor, no new behavior for any real caller) · skills none · guards none

- [ ] 2.1 In `scripts/lib/core.mjs`, extract the "resolve `which`/`where` by
  platform, run it, distinguish `ENOENT` (probe binary itself missing) from
  a normal non-zero exit, warn once" logic currently duplicated between
  `which()` (core.mjs) and the inline probe loop in
  `scripts/session-context.mjs` into one exported helper — your call on
  exact shape (e.g. `probeBin(bin)` returning `{ present, probeMissing }`,
  or restructuring `session-context.mjs`'s batch loop to call `have()`
  directly if that fits more naturally once you're in the code). Both call
  sites use it; no duplicated platform-branch/ENOENT-check logic remains.
  → accept: `grep -c "win32" scripts/lib/core.mjs scripts/session-context.mjs`
  shows the platform check exists in exactly one place (the shared helper);
  `node --check` passes on both files; existing behavior unchanged (a
  present tool still reads present, an absent probe binary still warns once).
- [ ] 2.2 In `scripts/lib/core.mjs`, replace the test-only
  `resetGitTrackedFilesCache()` export with a parameter on `gitTrackedFiles`
  itself: `export async function gitTrackedFiles({ fresh = false } = {})`,
  returning the memoized `_gitFiles` unless `fresh` is true or none exists
  yet. Remove `resetGitTrackedFilesCache` entirely. Update the test in
  `scripts/lib/core.test.mjs` that used it to call `gitTrackedFiles({ fresh:
  true })` instead of `resetGitTrackedFilesCache()` + `gitTrackedFiles()`.
  Confirm via grep that no other call site (`markerPresent` in core.mjs,
  `scripts/baseline.mjs`) needs a code change — they call `gitTrackedFiles()`
  with no args today, and the default `fresh: false` preserves that exactly.
  → accept: `grep -rn "resetGitTrackedFilesCache" scripts/` finds nothing;
  `node --test scripts/lib/core.test.mjs` green including the updated test;
  `node --check` passes on `core.mjs`, `session-context.mjs`,
  `baseline.mjs`.

### Unit 3 — Conformance: comment density (JS, normal)
Tooling: implementer implementer · gates none (comment-only change, no behavior affected) · skills none · guards none

- [ ] 3.1 In `scripts/stop-gate.mjs`, compress the three oversized comment
  blocks flagged by `standards-keeper`'s audit down to the 2-4 line rationale
  this codebase's own files actually use (target density: `core.mjs`'s
  `resolveProjectRoot`/`which()` comments) — the ~23-line block above the
  dirty-check, the ~13-line block above the marker-check, and the ~15-line
  block above the deadline computation. The fuller argument already lives in
  `docs/plans/engine-hardening.md` and `CHANGELOG.md`; don't delete the
  rationale, just state it at the length this family actually uses elsewhere.
  Separately, rewrite the "Addendum (post-merge security review):" comment
  (above the marker-check) to state the invariant directly — "Guarantee at
  least one scan per session regardless of dirtiness, so an
  already-committed secret can't go permanently unscanned" — without
  narrating how it was found; grep confirms this is the only comment
  anywhere in `scripts/` that references its own review/PR history rather
  than the code's own rationale.
  → accept: `scripts/stop-gate.mjs`'s comment-line percentage drops from
  ~42% back into roughly the 15-20% range (still slightly above the
  family floor given this file's genuinely higher logical density, but not
  2-3x it); `grep -n "Addendum\|post-merge\|security review" scripts/stop-gate.mjs`
  finds nothing; `node --check scripts/stop-gate.mjs` passes; `node --test
  scripts/lib/core.test.mjs` still green (comment-only change, no logic
  touched).

## Sequencing
Unit 1 (functional fix) before Unit 3 (comment compression) — both touch
`scripts/stop-gate.mjs`; running the functional fix first means Unit 3's
comment rewrite works against the final code shape, not a moving target.
Unit 2 is independent (different files, no overlap with Unit 1/3) — any
order relative to them.

## Verification background
- `scripts/stop-gate.mjs`'s `runTask` (merged in `e6e7b81`, the original
  engine-hardening Unit 1) — the `catch (e)` block has no `e.killed` check,
  confirmed by direct read of the merged file and by live reproduction
  during the scrutinise pass (`totalBudgetMs: 3000` + `sleep 5` →
  `REGRESSION` reported, no `stop-budget-exceeded` logged).
- `scripts/lib/core.mjs`'s `runOne()` (lines ~211-223) — the precedent this
  fix mirrors: `if (e.killed) return { ok: false, timedOut: true, ... }`,
  separated from real `failures` upstream in `runChecks()`.
- `EXTENDING.md`'s `stopGate.totalBudgetMs` documentation (added in
  engine-hardening 1.8) and `CHANGELOG.md`'s matching bullet both state a
  budget-skipped command "is logged... never blocked" — the contract this
  fix makes true.
- `scripts/lib/core.mjs`'s `which()` (post engine-hardening Unit 2) and
  `scripts/session-context.mjs`'s probe loop — both independently implement
  the identical platform-branch + ENOENT-distinction + warn-once logic,
  confirmed by direct read of both files.
- `scripts/lib/core.mjs`'s `gitTrackedFiles()`/`resetGitTrackedFilesCache()`
  (post engine-hardening Unit 2) and its sole external caller,
  `scripts/baseline.mjs:20` (`await gitTrackedFiles()`, no args) —
  grep-confirmed no other call site.
- Comment-density measurements (standards-keeper's audit): `stop-gate.mjs`
  87/208 lines (~42%) vs. the family's 8-19% band measured across
  `quality-gate.mjs`, `pre-guard.mjs`, `baseline.mjs`, `snapshot.mjs`,
  `session-context.mjs`, `log-router.mjs`, `lib/core.mjs`.

## Risk & rollback
- Unit 1 only adds a new early-return branch inside an existing catch block,
  gated on a condition (`e.killed && cap < t.timeoutMs`) that was previously
  impossible to distinguish — it can only *remove* false-positive blocks,
  never introduce a new one (a genuine, non-killed failure still falls
  through to the unchanged existing branches). Revert: remove the added
  `if` block.
- Unit 2.1 is a pure refactor (same behavior, one implementation instead of
  two) — revert by inlining the helper back at each call site. Unit 2.2's
  default parameter value preserves every existing caller's exact behavior
  (verified by grep); revert by restoring `resetGitTrackedFilesCache()`.
- Unit 3 touches comments only — zero behavioral risk. Revert: restore the
  longer comments (not that anyone would want to).

## Out of scope
- **A full automated test harness for `stop-gate.mjs`'s OTHER runtime
  logic** (the dirty-gate decision, the session-scoped/config-signature
  marker state machine, the acceptance-criteria check) beyond the specific
  budget-truncation scenario 1.2 now covers — real gap, but broader than
  this one bug's regression test; this exact "add tests beyond `core.mjs`"
  expansion was already declined once in
  `docs/plans/engine-self-improvements.md`'s Out of scope ("larger effort —
  needs process/hook fixtures, not requested by the self-review"). Same
  judgment holds for the REST of the file — 1.2 closes the specific gap that
  let the Critical finding through, not a full harness. Recorded as a
  PENDING follow-up row (`TRACKER#follow-up-1`, no plan doc yet).
- **A command that hits its own full configured `timeoutMs` (not
  budget-related) still gets reported as a genuine finding**, for all three
  kinds (secret/test/extra) — pre-existing behavior that predates this
  entire plan, not introduced or worsened by it. `quality-gate.mjs` already
  established "a timeout is never a finding you wrote" (merged B7), but
  transplanting that principle onto Stop-gate's *test*-regression detection
  is a separate, larger design call: a test that starts hanging past its own
  configured timeout is itself meaningful regression signal (unlike a
  linter simply running slow), so the right fix isn't obviously "always
  treat a timeout as a non-finding" the way it is for the quality gate.
  Needs its own dedicated investigation/plan, not a drive-by fix bundled
  into closing out this scrutiny. Recorded as a PENDING follow-up row
  (`TRACKER#follow-up-2`, no plan doc yet).
