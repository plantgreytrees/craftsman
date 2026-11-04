---
slug: scrutinise-service-scoped-gates
goal: The scoped gates behave on every path the isolated review found - nested markers, deleted files, embedded placeholders, deletion-only branches and null language entries no longer skip, loop or crash a gate.
level: feature
parent: service-scoped-gates
priority: P2
idea: docs/ideas/service-scoped-gates.md
classification: in-scope  # /scrutinise service-scoped-gates, main 7af0bd8: no Critical, 6 Warnings (all verified at file:line by root), 7 Suggestions; nothing disputed
tracker_rows: [fix-stop-snapshot, fix-merge-gate, fix-config-robustness, fix-extending-docs, fix-skip-reason, fix-snapshot-fact, fix-baseline-session, fix-gate-usable, fix-baseline-owner]
guards:
  blast_radius: done
  completeness_sweep: done
  blind_rederivation: skipped(config:never)   # craftsman.config.json:164
coverage:
  contract:      1.1 (isScoped added to scripts/lib/changed.mjs; its two consumers snapshot.mjs and stop-gate.mjs change in the same unit) | 2.1 (an embedded placeholder now fails the pre-merge gate)
  data:          N/A(no persistence or migration; the change list file keeps its format)
  config:        3.1 (a null language entry from layering is skipped)
  security:      1.4 (a path starting with '-' is never read as an option) | 3.1 | 2.2 (a deletion-only branch no longer skips the gate)
  tests:         1.1 | 1.2 | 1.3 | 1.4 | 2.1 | 2.2 | 3.1 | 3.2 | 5.1 | 5.2 | 6.1 | 6.2 | 7.1 | 7.2 | 7.3 | 7.4 | 8.1 | 8.2 | 9.1 | 9.2
  observability: 1.2 (the wrong snapshot-pending reason disappears) | 1.3 (all-gone logs no-changes) | 5.1 (a markerless dirty Stop logs no-command, not snapshot-pending) | 9.1 (a sub-project scope logs no-command and never runs the root's regression command)
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
      write: [scripts/lib/gate-command.mjs, scripts/lib/gate-command.test.mjs, scripts/repo-exec.mjs, scripts/repo-exec-scoped.test.mjs, scripts/snapshot.test.mjs]
    arch: [ARCH-LAND-37, ARCH-LAND-06, ARCH-ENGINE-22]
    tooling: { implementer: implementer, gates: [], skills: [test-driven-development], guards: [], mcp: [] }
  - id: fix-baseline-owner
    scope_id: fix-baseline-owner
    project: .
    depends_on: []
    module: scripts/stop-gate.mjs
    language: JavaScript (Node ESM)
    security: normal
    scope:
      read: [scripts/stop-gate.mjs, scripts/stop-gate-skip-reasons.test.mjs]
      docs: [docs/architecture/state.rules.md]
      write: [scripts/stop-gate.mjs, scripts/stop-gate-skip-reasons.test.mjs]
    arch: [ARCH-STATE-22]
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
MERGED (f7062bc, implementer e7711af). The starting and ending tree hashes ignore craftsman's own `.craftsman/` state lines (`withoutCraftsmanState`); Stop reads `session-start.json` and `snapshot-started` from the root context's session directory under a unit scope; a stale `snapshot-started` is removed unconditionally and SessionStart looks up no `just` target when snapshots are off; a `stopGate.commands` program that is not installed leaves no baseline entry. [R5-W1, R5-W2, R5-own, R5-ENOENT]

### Step 8 - fix-gate-usable (., JavaScript, normal)
MERGED (9a92eb7: d8c796a, df7566a). `gateUsable` requires a non-`just` command's program (on `PATH`, or an existing file when it names a path), so the pre-merge gate skips it instead of throwing and parking the land, and `verifyGateBeforeMerge` logs `pre_merge_gate {skipped: true, reason: "no-command"}`. 8.3 parked once on `snapshot.test.mjs:198`; that file joined the unit's write scope and the assertion now says no `session-start.json` is written. [R5-W3]

### Step 9 - fix-baseline-owner (., JavaScript, normal)
Tooling: implementer implementer - gates none - skills test-driven-development - guards none
Depends on: none
Rule: ARCH-STATE-22 (the baseline belongs to the repository SessionStart snapshotted).
Unattended-run rules: never run `rm`, `rmdir`, `unlink` or `find -delete` and never write one even as a no-op filler such as `rm -rf /dev/null` (use `mktemp -d` under the OS temp dir and leave it); finish with `node --test scripts/safety-cites.test.mjs`, and if it fails ONLY because a cited line range in `docs/architecture/**` moved, do not edit those docs: PARK naming each cite and its new range.
- [ ] 9.1 [R6-W1] `stop-gate.mjs:180-185` reads `session-start.json` and `snapshot-started` from the workspace root's session directory under ANY scope, including a workspace sub-project scope whose root is a different git repository (`scope.mjs:205`), so Stop queues the root project's green-at-start commands and runs them there (`stop-gate.mjs:280`, `cwd: context.root`): a red sub-project suite blocks as a false REGRESSION, and a real regression is checked only when the root's suite was green. Add a small `sameRepository(rootDir, scopeDir)` to `stop-gate.mjs`: equal real paths are the same repository; otherwise both `git rev-parse --git-common-dir` results, each resolved against its own directory and compared by `fs.realpathSync`, must be equal; a git failure is NOT the same repository; compute it only when the two roots differ. Read the root context's session directory only when it is the same repository; otherwise read the scope's own directory as before `fix-baseline-session` 7.2, so a sub-project scope has no baseline, a dirty Stop logs `no-command` (never `snapshot-pending`) and the root's commands never run there. `dirty`, the change list and the scoped-task state stay in the scope's directory → accept: the cases of 9.2 pass and fail without this change.
- [ ] 9.2 [R6-W1, R6-S6] In `scripts/stop-gate-skip-reasons.test.mjs` make `underScope` (`:206-235`) create the scope root as a real `git worktree add` of the root fixture and keep its four scope cases green on it (the regression command is queued; `snapshot-pending` from the root's marker; a baseline in the scope's own directory is not read; `dirty` is the scope's). Add a `subProjectScope` helper (a separate repository, project `svc-a`) with cases: a green root baseline queues nothing, logs `no-command` and prints no REGRESSION; a root `snapshot-started` marker does not make it `snapshot-pending`; a scope root that is not a git repository counts as not the same repository; the existing no-scope case is unchanged → accept: the kept and new cases pass, and with 9.1 reverted the sub-project cases fail.
- [ ] 9.3 Run `node --test scripts/stop-gate-skip-reasons.test.mjs scripts/stop-gate.test.mjs scripts/stop-gate-scoped.test.mjs scripts/session-context.test.mjs scripts/snapshot.test.mjs scripts/safety-cites.test.mjs` → accept: exits 0 (or the unit PARKS naming only moved cite ranges).

## Sequencing
`fix-baseline-session` (round 6) then `fix-gate-usable`: the second changes `gateUsable`, which the first's tests and `stop-gate`/`snapshot` also call. Earlier steps are merged.
`fix-baseline-owner` (round 7) is independent of every other step: it touches only `stop-gate.mjs` and its skip-reason test, after Steps 7 and 8 landed.
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
- **Round 7 follow-ups, flagged not driven:** `followup-gate-spawn-error-message` (`repo-exec.mjs:325,365-368`: `gateOutput` joins only stdout and stderr, so a gate program that cannot start, an `EACCES` on a non-executable `./gradlew` that `programPresent` accepts or an `E2BIG` on a huge `{changed}` argv, parks the land with an empty "did not pass in <wt>:" message; fall back to `error.code: error.message` as `stop-gate.mjs:352-353` does, and refuse or batch an over-long `{changed}`); `followup-tokenize-leading-dash` (`core.mjs:879-889` `tokenize` passes `{file}` and `{dir}` bare relative to a `nearest:` tool cwd, so `services/api/-c.my` becomes the option-like argument `-c.my`, reproduced, while `changed.mjs:63` already writes `./-x`; apply the `./` prefix there and add a `tool-cwd.test.mjs` case); `followup-land-unit-empty-diff` already covers `repo-exec.mjs:540-541`.
- **Residual risks, not actions:** spawned-script tests inherit `CLAUDE_PROJECT_DIR`; `/home` against `/var/home` path spelling in `resolveToolCwd`; concurrent appends to the change list are assumed line-atomic.

## Risk & rollback
- Behaviour changes: an embedded placeholder and a deletion-only branch now fail the merge gate (they used to skip it silently); a nested marker now runs at Stop; a deleted file no longer reaches the command. Each is a stricter or more accurate gate, never a new bypass. Revert any unit by reverting its merge commit; units touch disjoint files except `changed.mjs`, which only `fix-stop-snapshot` edits.
- Cite drift: `stop-gate.mjs`, `repo-exec.mjs` and `core.mjs` all shift lines; `safety-cites.test.mjs` is the mechanical check and root re-points rule cites after the units, as it did for `stop-scoped`.

## Out of scope
The two follow-up rows above; the Gleam repository. Rule wording, `EXTENDING.md` and `CHANGELOG.md` are root's docs pass, never a unit.

## Review history (older detail is in git)
Round 1 (main 7af0bd8): no Critical, 6 Warnings, fixed by Steps 1-4. Round 2 (b910a92): none new at Warning; docs and four Suggestions. Round 3 (4b28c66): one Warning, a markerless dirty Stop logged `snapshot-pending`, fixed by Step 5; cite pointers re-pointed. Round 4 (cf64bd1): two Warnings in the same recomputation (`snapshotAtStart: false`; a dropped snapshot), fixed by Step 6, which records a `snapshot-started` fact instead of guessing; the cite sweep widened to eight rules docs. Every time ARCH-STATE-19 to 22, ARCH-LAND-37 and ARCH-SLIM-08 HOLD and both whole-plan criteria are MET.

## Round 5 (2026-11-04, isolated scrutineer on main b7704cd; six real-flow cases and a nine-doc cite sweep)
No Critical; rules all HOLD; both plan criteria MET (suite 1859 of 1859, lint PASS). Three Warnings, all verified by root and all older than this work, exposed by driving the real hooks: (1) `snapshot.mjs:39` and `session-context.mjs:34` hash `.craftsman/` state into the tree, so where it is not gitignored the snapshot is always dropped and the regression check never runs; (2) `stop-gate.mjs:39` reads the unit scope's session directory for the baseline that SessionStart wrote to the root's, so under a unit scope the baseline is never found (the round-4 follow-up, now proven); (3) `gate-command.mjs:32` treats any non-`just` command as usable, so a missing program parks the land against ARCH-ENGINE-22. Owner decided (2026-11-04) to drive all three: Steps 7 and 8, with a silent skip plus a logged event for (3). Also in Step 7: this work's own stale-marker and `just --summary` regressions and a missing-program snapshot entry.
- **Root, after the units:** done in the round 6 docs pass (below).
- **Flagged, not driven:** `followup-premerge-marker-lookup` (the pre-merge gate still looks only at the repository root), `followup-scoped-gate-tests`, `followup-arch-check-root-layering`, `followup-land-unit-empty-diff`, `followup-state04-comment-cites` (the comments in `craftsman-state.mjs`, `session-context.mjs`, `snapshot.mjs` and their tests cite ARCH-STATE-04, which is about background tasks; the behaviour is recorded under ARCH-STATE-22, so the comments should cite that); and from round 5 only as suggestions: `scope.mjs:79` and `pre-guard.mjs:1503` resolve a relative `file_path` against `process.cwd()` while `quality-gate.mjs:29` uses the root (Claude Code sends absolute paths); compaction re-runs the snapshot mid-session; `enabled(cfg)` without the context in `snapshot.mjs:20` in workspace mode.

## Round 6 (2026-11-05, Steps 7 and 8 landed; docs pass)
Both units merged: `fix-baseline-session` (f7062bc) and `fix-gate-usable` (9a92eb7); suite 1891 of 1891, arch lint PASS. Root's docs pass repoints the cites that moved (ARCH-APPROVAL-05, AUTO-11, SAFETY-04, STATE-21, VIEWS-07), adds the new ones (STATE-20 `quality-gate.mjs:29`; STATE-22 the marker, the root-directory baseline read, the missing-program skip and the state-line hash; LAND-37 the three callers and `gateUsable`), words the recorded-fact baseline into ARCH-STATE-22 and the missing-program skip into ARCH-LAND-37, widens the EXTENDING.md reason table and CHANGELOG, and stamps `verified_at`. Every cite into a file the units touched was checked by an identifier in the cited range.

## Round 7 (2026-11-05, isolated scrutineer on main abf3dca, range 23027f9..abf3dca; the hooks, the merge gate and layering driven in throwaway repositories)
No Critical; every `cite:` and `check:` of ARCH-STATE-19..22, LAND-37, LAND-06, SLIM-08, SAFETY-04, APPROVAL-05, AUTO-11 and VIEWS-07, 09, 10 shows what its rule says; both plan criteria MET for all sixteen units (suite 1891 of 1891, lint PASS). One Warning, verified by root at `stop-gate.mjs:180-185`, `scope.mjs:205`, `snapshot.mjs:51` and the fixture `stop-gate-skip-reasons.test.mjs:206-235`: Step 7.2 reads the workspace root's baseline under any scope, so a sub-project scope (a separate repository) runs the root's commands (Step 9). Five Suggestions: two flagged above, one already a follow-up row, one a docs fix, one covered by Step 9's tests.
- **Root, after the unit:** (a) ARCH-STATE-22 says Stop reads the baseline and marker from the root context's session directory "even under a unit scope": narrow it to a unit worktree of the same repository and say a sub-project scope has no baseline and logs `no-command`; (b) EXTENDING.md:209 "lands without one (nothing is logged)" now says the `pre_merge_gate` `no-command` skip is logged (`repo-exec.mjs:357`); (c) the EXTENDING.md `no-command` row and the CHANGELOG sentence say a unit worktree of the same repository; (d) every `stop-gate.mjs` cite in docs/architecture is re-checked by identifier after the unit (it shifts lines near 180-185) and `verified_at` is stamped.
