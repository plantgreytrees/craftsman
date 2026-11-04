---
slug: scrutinise-service-scoped-gates
goal: The scoped gates behave on every path the isolated review found - nested markers, deleted files, embedded placeholders, deletion-only branches and null language entries no longer skip, loop or crash a gate.
level: feature
parent: service-scoped-gates
priority: P2
idea: docs/ideas/service-scoped-gates.md
classification: in-scope  # /scrutinise service-scoped-gates, main 7af0bd8: no Critical, 6 Warnings (all verified at file:line by root), 7 Suggestions; nothing disputed
tracker_rows: [fix-stop-snapshot, fix-merge-gate, fix-config-robustness, fix-extending-docs, fix-skip-reason, fix-snapshot-fact, fix-baseline-session, fix-gate-usable]
guards:
  blast_radius: done
  completeness_sweep: done
  blind_rederivation: skipped(config:never)   # craftsman.config.json:164
coverage:
  contract:      1.1 (isScoped added to scripts/lib/changed.mjs; its two consumers snapshot.mjs and stop-gate.mjs change in the same unit) | 2.1 (an embedded placeholder now fails the pre-merge gate)
  data:          N/A(no persistence or migration; the change list file keeps its format)
  config:        3.1 (a null language entry from layering is skipped)
  security:      1.4 (a path starting with '-' is never read as an option) | 3.1 | 2.2 (a deletion-only branch no longer skips the gate)
  tests:         1.1 | 1.2 | 1.3 | 1.4 | 2.1 | 2.2 | 3.1 | 3.2 | 5.1 | 5.2 | 6.1 | 6.2 | 7.1 | 7.2 | 7.3 | 7.4 | 8.1 | 8.2
  observability: 1.2 (the wrong snapshot-pending reason disappears) | 1.3 (all-gone logs no-changes) | 5.1 (a markerless dirty Stop logs no-command, not snapshot-pending)
  interface:     N/A(no UI; hook and CLI messages are in the tasks)
  docs:          4.1
  rollback:      see Risk & rollback
units:
  - id: fix-stop-snapshot
    scope_id: fix-stop-snapshot
    project: .
    depends_on: []
    module: scripts/stop-gate.mjs, scripts/snapshot.mjs, scripts/lib/changed.mjs
    language: JavaScript (Node ESM)
    security: normal
    scope:
      read: [scripts/stop-gate.mjs, scripts/snapshot.mjs, scripts/lib/changed.mjs, scripts/lib/gate-command.mjs]
      docs: [docs/architecture/state.rules.md]
      write: [scripts/stop-gate.mjs, scripts/snapshot.mjs, scripts/lib/changed.mjs, scripts/stop-gate-scoped.test.mjs, scripts/snapshot.test.mjs, scripts/lib/changed.test.mjs]
    arch: [ARCH-STATE-21, ARCH-STATE-22]
    tooling: { implementer: implementer, gates: [], skills: [test-driven-development], guards: [], mcp: [] }
  - id: fix-merge-gate
    scope_id: fix-merge-gate
    project: .
    depends_on: [fix-stop-snapshot]
    module: scripts/repo-exec.mjs
    language: JavaScript (Node ESM)
    security: normal
    scope:
      read: [scripts/repo-exec.mjs, scripts/lib/changed.mjs, scripts/lib/gate-command.mjs]
      docs: [docs/architecture/landing.rules.md]
      write: [scripts/repo-exec.mjs, scripts/repo-exec-scoped.test.mjs]
    arch: [ARCH-LAND-37, ARCH-LAND-06]
    tooling: { implementer: implementer, gates: [], skills: [test-driven-development], guards: [], mcp: [] }
  - id: fix-config-robustness
    scope_id: fix-config-robustness
    project: .
    depends_on: [fix-merge-gate]
    module: scripts/lib/core.mjs, scripts/quality-gate.mjs
    language: JavaScript (Node ESM)
    security: normal
    scope:
      read: [scripts/lib/core.mjs, scripts/quality-gate.mjs]
      docs: [docs/architecture/state.rules.md]
      write: [scripts/lib/core.mjs, scripts/quality-gate.mjs, scripts/lib/config-layering.test.mjs]
    arch: [ARCH-STATE-19]
    tooling: { implementer: implementer, gates: [], skills: [test-driven-development], guards: [], mcp: [] }
  - id: fix-extending-docs
    scope_id: fix-extending-docs
    project: .
    depends_on: [fix-stop-snapshot, fix-merge-gate]
    module: EXTENDING.md
    language: Markdown
    security: normal
    scope:
      read: [EXTENDING.md]
      docs: []
      write: [EXTENDING.md]
    arch: []
    tooling: { implementer: implementer, gates: [], skills: [], guards: [], mcp: [] }
  - id: fix-skip-reason
    scope_id: fix-skip-reason
    project: .
    depends_on: []
    module: scripts/stop-gate.mjs, scripts/lib/core.mjs
    language: JavaScript (Node ESM)
    security: normal
    scope:
      read: [scripts/stop-gate.mjs, scripts/lib/core.mjs]
      docs: [docs/architecture/state.rules.md]
      write: [scripts/stop-gate.mjs, scripts/lib/core.mjs, scripts/stop-gate-skip-reasons.test.mjs, scripts/stop-gate-scoped.test.mjs, scripts/lib/tool-cwd.test.mjs]
    arch: [ARCH-STATE-22, ARCH-STATE-20]
    tooling: { implementer: implementer, gates: [], skills: [test-driven-development], guards: [], mcp: [] }
  - id: fix-snapshot-fact
    scope_id: fix-snapshot-fact
    project: .
    depends_on: []
    module: scripts/stop-gate.mjs, scripts/session-context.mjs, scripts/quality-gate.mjs
    language: JavaScript (Node ESM)
    security: normal
    scope:
      read: [scripts/stop-gate.mjs, scripts/session-context.mjs, scripts/quality-gate.mjs]
      docs: [docs/architecture/state.rules.md, docs/architecture/safety.rules.md]
      write: [scripts/stop-gate.mjs, scripts/session-context.mjs, scripts/quality-gate.mjs, scripts/stop-gate-skip-reasons.test.mjs, scripts/session-context.test.mjs, scripts/quality-gate-events.test.mjs]
    arch: [ARCH-STATE-22, ARCH-STATE-20, ARCH-SAFETY-04]
    tooling: { implementer: implementer, gates: [], skills: [test-driven-development], guards: [], mcp: [] }
  - id: fix-baseline-session
    scope_id: fix-baseline-session
    project: .
    depends_on: []
    module: scripts/snapshot.mjs, scripts/session-context.mjs, scripts/stop-gate.mjs, scripts/lib/craftsman-state.mjs
    language: JavaScript (Node ESM)
    security: normal
    scope:
      read: [scripts/snapshot.mjs, scripts/session-context.mjs, scripts/stop-gate.mjs, scripts/lib/craftsman-state.mjs]
      docs: [docs/architecture/state.rules.md, docs/architecture/safety.rules.md]
      write: [scripts/snapshot.mjs, scripts/session-context.mjs, scripts/stop-gate.mjs, scripts/lib/craftsman-state.mjs, scripts/lib/craftsman-state.test.mjs, scripts/snapshot.test.mjs, scripts/session-context.test.mjs, scripts/stop-gate-skip-reasons.test.mjs]
    arch: [ARCH-STATE-22, ARCH-STATE-04, ARCH-SAFETY-04]
    tooling: { implementer: implementer, gates: [], skills: [test-driven-development], guards: [], mcp: [] }
  - id: fix-gate-usable
    scope_id: fix-gate-usable
    project: .
    depends_on: [fix-baseline-session]
    module: scripts/lib/gate-command.mjs, scripts/repo-exec.mjs
    language: JavaScript (Node ESM)
    security: normal
    scope:
      read: [scripts/lib/gate-command.mjs, scripts/repo-exec.mjs]
      docs: [docs/architecture/landing.rules.md, docs/architecture/engine.rules.md]
      write: [scripts/lib/gate-command.mjs, scripts/lib/gate-command.test.mjs, scripts/repo-exec.mjs, scripts/repo-exec-scoped.test.mjs]
    arch: [ARCH-LAND-37, ARCH-LAND-06, ARCH-ENGINE-22]
    tooling: { implementer: implementer, gates: [], skills: [test-driven-development], guards: [], mcp: [] }
---

# Plan: Fix round for the service-scoped gates review

## Outcome
The scoped gates behave on every path the isolated review found. A nested marker still runs at Stop, a deleted file no longer blocks every later Stop, an embedded placeholder is never snapshotted and fails the merge gate instead of disabling it, a deletion-only branch no longer lands untested, and a `null` language entry no longer crashes the quality gate. (Same meaning as `goal`.)

## Scope Steps (executable core)

Every unit keeps the unattended-run constraint: **never run `rm`, `rmdir`, `find -delete` or any command that deletes files** (it stalls on an approval prompt no one can answer); for scratch or mutation checks use `mktemp -d` under the OS temp dir and leave it in place. New cases go into the existing scoped test files named in each unit (write-only, so the unit context stays within `execution.unitContextBytes`). Each unit ends by running `node --test scripts/safety-cites.test.mjs`: if it fails **only** because a cited line range in a `docs/architecture/*.rules.md` moved, do not edit `docs/architecture/**`; PARK naming each cite and its new range (root re-points them under the owner's approved path).

### Step 1 - fix-stop-snapshot (., JavaScript, normal)
MERGED (206c911). Scoped `stopGate.commands` are selected with `markerPresent` like the session snapshot; paths that no longer exist drop out of the Stop set; one shared `isScoped`; a path starting with `-` expands as `./-...`. [F1, F2, F6, F10]

### Step 2 - fix-merge-gate (., JavaScript, normal)
MERGED (d0b31d5). An embedded placeholder and a deletion-only branch fail the pre-merge gate; only an empty diff skips. [F4, F5]

### Step 3 - fix-config-robustness (., JavaScript, normal)
MERGED (7a6323f). `detectLang` skips a null language spec; `skipBins` holds the expanded program. [F3, F7]

### Step 4 - fix-extending-docs (., Markdown, normal)
MERGED (79c7693). EXTENDING.md states the final behaviour and the Stop-versus-merge set difference. [F8]

### Step 5 - fix-skip-reason (., JavaScript, normal)
MERGED (db007cf). A markerless dirty Stop logged `no-command` (superseded by Step 6's recorded fact); `resolveToolCwd` resolves a relative file against the root. [R3-W1, R3-S3]

### Step 6 - fix-snapshot-fact (., JavaScript, normal)
MERGED (eb6c31b). `session-context.mjs` writes a `snapshot-started` marker where it spawns the snapshot and Stop reads it; the quality hook resolves `file_path` once against the root. [R4-W1, R4-W2, R4-S4]

### Step 7 - fix-baseline-session (., JavaScript, normal)
Tooling: implementer implementer - gates none - skills test-driven-development - guards none
Depends on: none
Rule: ARCH-STATE-22 (skip reasons follow recorded facts), ARCH-STATE-04 (craftsman's own state is not the user's work), ARCH-SAFETY-04 (`session-context.mjs` is a governed hook).
Unattended-run rules: never run `rm`, `rmdir`, `find -delete` or any command that deletes files (use `mktemp -d` under the OS temp dir and leave it); finish with `node --test scripts/safety-cites.test.mjs`, and if it fails ONLY because a cited line range in `docs/architecture/**` moved, do not edit those docs: PARK naming each cite and its new range.
- [ ] 7.1 [R5-W2] A snapshot is dropped whenever `.craftsman/` is not gitignored, because `session-context.mjs:34` and `snapshot.mjs:39` hash the whole `git status --porcelain`, state files included (and `snapshot-started` is written after the starting hash). Add a helper to `scripts/lib/craftsman-state.mjs` that returns a porcelain text without the lines `isCraftsmanStateLine` recognises, and hash that in both places → accept: `scripts/lib/craftsman-state.test.mjs` covers the helper; `scripts/snapshot.test.mjs` and `scripts/session-context.test.mjs` include a real-flow case in a repo with NO `.gitignore` for `.craftsman/`: the snapshot lands `session-start.json`; an edit to a tracked file while it runs still drops it.
- [ ] 7.2 [R5-W1] Under a unit scope, `stop-gate.mjs:39` reads `session-start.json` and `snapshot-started` from the scope's session directory while SessionStart and `snapshot.mjs` write to the root context's, so the baseline is never found. Read those two files from `sessionDir(sid, projectContext(input.project || "."))` (as `stopReports()` already reads its state), and keep `dirty`, the change list and the scoped-task state in the scope's directory where `quality-gate.mjs` writes them → accept: a case in `scripts/stop-gate-skip-reasons.test.mjs` with a worktree scope active, a green `session-start.json` in the root directory and `dirty` in the scope's: the regression command is queued and no skip is logged; without a scope nothing changes.
- [ ] 7.3 [R5-own] In `scripts/session-context.mjs`, unlink a stale `snapshot-started` unconditionally before the spawn decision (a resume that spawns nothing must not keep the earlier marker), and evaluate the marker/`gateUsable` loop only inside the `enabled` and `snapshotAtStart` guard so SessionStart does not run `just --summary` when snapshots are off → accept: `scripts/session-context.test.mjs` cases: resume with `snapshotAtStart` now false leaves no marker; with snapshots off a fixture `just` stub is never run.
- [ ] 7.4 [R5-ENOENT] In `scripts/snapshot.mjs` (`:35`) skip a `stopGate.commands` entry whose program is not installed (`ENOENT`) instead of recording `green:false`, matching how a scoped command is skipped → accept: a case in `scripts/snapshot.test.mjs`: a command with a missing program leaves no entry in `session-start.json` and Stop does not log `red-at-start` for it.
- [ ] 7.5 Run `node --test scripts/lib/craftsman-state.test.mjs scripts/snapshot.test.mjs scripts/session-context.test.mjs scripts/stop-gate-skip-reasons.test.mjs scripts/stop-gate.test.mjs scripts/stop-gate-scoped.test.mjs scripts/safety-cites.test.mjs` → accept: exits 0 (or the unit PARKS naming only moved cite ranges).

### Step 8 - fix-gate-usable (., JavaScript, normal)
Tooling: implementer implementer - gates none - skills test-driven-development - guards none
Depends on: fix-baseline-session
Rule: ARCH-ENGINE-22 (a project tool is skipped silently when its program is absent), ARCH-LAND-37 and ARCH-LAND-06 (the pre-merge gate). Owner decision 2026-11-04: skip silently, do not fail the land.
Unattended-run rules: as in Step 7.
- [ ] 8.1 [R5-W3] `scripts/lib/gate-command.mjs:32` `gateUsable` returns true for any non-`just` command without checking its program exists, so the pre-merge gate throws on ENOENT and parks the land. For a non-`just` command require its program: on `PATH` (the existing `binOnPath`), or, when the program contains `/`, an existing file relative to the worktree; absent → not usable → no gate command found. Callers (`stop-gate`, `snapshot`, `session-context`, `repo-exec`) all go through it → accept: `scripts/lib/gate-command.test.mjs` cases: a command with a missing program is not usable; a program on `PATH` is; a `./bin/x` that exists is; `just` behaves as before.
- [ ] 8.2 In `scripts/repo-exec.mjs` `verifyGateBeforeMerge` (`:353-357`), when `findGateCommand` finds none, log one `pre_merge_gate` event `{ skipped: true, reason: "no-command", ref, worktree }` before returning, so a silent skip is visible in `events.jsonl` → accept: a case in `scripts/repo-exec-scoped.test.mjs`: a gate whose program is missing lands, and the event is logged; a present program is still run.
- [ ] 8.3 Run `node --test scripts/lib/gate-command.test.mjs scripts/repo-exec-scoped.test.mjs scripts/repo-exec.test.mjs scripts/repo-exec-retire.test.mjs scripts/stop-gate-scoped.test.mjs scripts/snapshot.test.mjs scripts/safety-cites.test.mjs` → accept: exits 0 (or the unit PARKS naming only moved cite ranges).

## Sequencing
`fix-baseline-session` (round 6) then `fix-gate-usable`: the second changes `gateUsable`, which the first's tests and `stop-gate`/`snapshot` also call. Earlier steps are merged.
`fix-snapshot-fact` (round 4) and `fix-skip-reason` (round 3) are independent of the four steps above, which are merged; `fix-snapshot-fact` replaces round 3's config recomputation with a recorded fact. `fix-skip-reason` (round 3) is independent of the four steps above, which are merged. Within the original round, `fix-stop-snapshot` first: it owns the shared `isScoped` and `expandChangePlaceholders` that `fix-merge-gate` calls, and edits `stop-gate.mjs`. `fix-merge-gate` next (`repo-exec.mjs`). `fix-config-robustness` after them (`core.mjs`, `quality-gate.mjs`; no overlap, run last among the code units so any cite drift in `core.mjs` is the final one). `fix-extending-docs` last, so it describes the final behaviour. Root then re-points drifted rule cites and repairs `slim.rules.md` under `/architect --update` (below) before re-running `/scrutinise`.

## Verification background   (citations - for the reviewer, not the executor)
- F1: `scripts/stop-gate.mjs:210` uses `gateUsable(context.root, marker, cmd)`; `scripts/lib/gate-command.mjs:18-24` `present()` only checks the top level; `scripts/snapshot.mjs:22-24` uses `markerPresent` + `markerOk`.
- F2: `scripts/lib/changed.mjs:26-30` `readChanged` never prunes; `scripts/stop-gate.mjs:218-219` expands it as is; `scripts/repo-exec.mjs:337` drops deletions with `--diff-filter=d`.
- F3: `scripts/lib/core.mjs:753-754` reads `spec.extensions` on a `null` spec; `deepMerge` stores `null` (`core.mjs:590-598`); `EXTENDING.md:209` documents `null` as the way to drop an inherited entry.
- F4: `scripts/repo-exec.mjs:353-357`; F5: `:337` and `:353`.
- F6: `scripts/snapshot.mjs:32` (`hasChangePlaceholder`) against `scripts/stop-gate.mjs:188` (`isScoped`).
- F7: `scripts/quality-gate.mjs:103` against `scripts/lib/core.mjs:967-968`.
- F8: `EXTENDING.md:178,186`; F10: `scripts/lib/changed.mjs:54-56`.
- Rules: `docs/architecture/state.rules.md` (ARCH-STATE-19, 21, 22), `docs/architecture/landing.rules.md` (ARCH-LAND-37, 06).

CONSUMERS:
- `isScoped` (new export, `scripts/lib/changed.mjs`): `scripts/snapshot.mjs`, `scripts/stop-gate.mjs` (both change in step 1); nothing else.
- `expandChangePlaceholders`: `scripts/stop-gate.mjs`, `scripts/repo-exec.mjs` (`gateArgv`); the `./` prefix only changes output for paths starting with `-`.
- `verifyGateBeforeMerge` / `gateArgv` (`scripts/repo-exec.mjs`): the three callers `merge`, `land-unit`, `land-feature` all go through it; the new failure messages reach them as the existing `pre-merge gate failed` error.
- `detectLang` (`scripts/lib/core.mjs`): `scripts/quality-gate.mjs`, `scripts/baseline.mjs`, `scripts/session-context.mjs`; a falsy spec is skipped, so the return value for other languages is unchanged.
- `skipBins` (`scripts/quality-gate.mjs`): consumed by `runChecks` in `scripts/lib/core.mjs`.

## Not units (findings recorded for root or flagged, not driven)
- **Architecture / UNMET plan criterion** (`/architect --update`, root, after the code units; the owner approved this fix path): `docs/architecture/state.rules.md` and `landing.rules.md` `check:` fields name test files that hold none of the cases (STATE-19 -> `scripts/lib/config-layering.test.mjs`; STATE-20 -> `scripts/lib/tool-cwd.test.mjs`; STATE-21 -> `scripts/stop-gate-scoped.test.mjs`; STATE-22 -> `scripts/stop-gate-skip-reasons.test.mjs` and `scripts/quality-gate-events.test.mjs`; LAND-37 -> `scripts/repo-exec-scoped.test.mjs`); cites drifted (ARCH-LAND-36 `repo-exec.mjs:411` is now `:438`; ARCH-LAND-37 `326-339` is now `gateArgv` 331-344 and `verifyGateBeforeMerge` 347-365; ARCH-STATE-20 `core.mjs:842-870` is now `resolveToolCwd` 839-867); and `docs/architecture/slim.rules.md:12` ARCH-SLIM-02 carries the malformed state `[superseded by ARCH-SLIM-16, then ARCH-SLIM-17]` (the lint grammar takes one target), which makes `arch-check lint` fail and leaves `[plan:service-scoped-gates]` UNMET; the fix is `[superseded by ARCH-SLIM-17]`.
- **Follow-up rows, flagged not driven:** `arch-check.mjs:335` with `--root <other repo>` now inherits the session repo's config through `loadConfig` layering (needs a design choice: an opt-out context, or layering only under `PROJECT_ROOT` or a registered project); `repo-exec.mjs:534-535` `land-unit` without `unit_worktree` while the feature worktree sits on the feature branch makes `feature...HEAD` empty so the scoped gate is skipped (`planning.featureBranches` is off today).
- **Residual risks, not actions:** spawned-script tests inherit `CLAUDE_PROJECT_DIR`; `/home` against `/var/home` path spelling in `resolveToolCwd`; concurrent appends to the change list are assumed line-atomic.

## Risk & rollback
- Behaviour changes: an embedded placeholder and a deletion-only branch now fail the merge gate (they used to skip it silently); a nested marker now runs at Stop; a deleted file no longer reaches the command. Each is a stricter or more accurate gate, never a new bypass. Revert any unit by reverting its merge commit; units touch disjoint files except `changed.mjs`, which only `fix-stop-snapshot` edits.
- Cite drift: `stop-gate.mjs`, `repo-exec.mjs` and `core.mjs` all shift lines; `safety-cites.test.mjs` is the mechanical check and root re-points rule cites after the units, as it did for `stop-scoped`.

## Out of scope
The two follow-up rows above; any rule wording change; `CHANGELOG.md`; the Gleam repository.

## Review history (older detail is in git)
Round 1 (main 7af0bd8): no Critical, 6 Warnings, fixed by Steps 1-4. Round 2 (b910a92): none new at Warning; docs and four Suggestions. Round 3 (4b28c66): one Warning, a markerless dirty Stop logged `snapshot-pending`, fixed by Step 5; cite pointers re-pointed. Round 4 (cf64bd1): two Warnings in the same recomputation (`snapshotAtStart: false`; a dropped snapshot), fixed by Step 6, which records a `snapshot-started` fact instead of guessing; the cite sweep widened to eight rules docs. Every time ARCH-STATE-19 to 22, ARCH-LAND-37 and ARCH-SLIM-08 HOLD and both whole-plan criteria are MET.

## Round 5 (2026-11-04, isolated scrutineer on main b7704cd; six real-flow cases and a nine-doc cite sweep)
No Critical; rules all HOLD; both plan criteria MET (suite 1859 of 1859, lint PASS). Three Warnings, all verified by root and all older than this work, exposed by driving the real hooks: (1) `snapshot.mjs:39` and `session-context.mjs:34` hash `.craftsman/` state into the tree, so where it is not gitignored the snapshot is always dropped and the regression check never runs; (2) `stop-gate.mjs:39` reads the unit scope's session directory for the baseline that SessionStart wrote to the root's, so under a unit scope the baseline is never found (the round-4 follow-up, now proven); (3) `gate-command.mjs:32` treats any non-`just` command as usable, so a missing program parks the land against ARCH-ENGINE-22. Owner decided (2026-11-04) to drive all three: Steps 7 and 8, with a silent skip plus a logged event for (3). Also in Step 7: this work's own stale-marker and `just --summary` regressions and a missing-program snapshot entry.
- **Root, after the units:** ARCH-STATE-22 cite adds `session-context.mjs` marker lines and its check names the `snapshot-started` cases; ARCH-STATE-20 adds `quality-gate.mjs:29`; ARCH-LAND-37 adds the target-ref lines `repo-exec.mjs:400-402,541,656`; ARCH-APPROVAL-05 `session-context.mjs:290-292,309`; ARCH-VIEWS-07 `next-queue.mjs:47-81`; the EXTENDING.md reason table is widened to the recorded-fact meaning; the CHANGELOG notes that Stop now finds the baseline under a unit scope and that the merge gate skips a missing program and logs it. Cites into the three changed files are re-checked by identifier after the units land.
- **Flagged, not driven:** `followup-premerge-marker-lookup` (the pre-merge gate still looks only at the repository root), `followup-scoped-gate-tests`, `followup-arch-check-root-layering`, `followup-land-unit-empty-diff`; and from round 5 only as suggestions: `scope.mjs:79` and `pre-guard.mjs:1503` resolve a relative `file_path` against `process.cwd()` while `quality-gate.mjs:29` uses the root (Claude Code sends absolute paths); compaction re-runs the snapshot mid-session; `enabled(cfg)` without the context in `snapshot.mjs:20` in workspace mode.
