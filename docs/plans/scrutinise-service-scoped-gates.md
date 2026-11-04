---
slug: scrutinise-service-scoped-gates
goal: The scoped gates behave on every path the isolated review found - nested markers, deleted files, embedded placeholders, deletion-only branches and null language entries no longer skip, loop or crash a gate.
level: feature
parent: service-scoped-gates
priority: P2
idea: docs/ideas/service-scoped-gates.md
classification: in-scope  # /scrutinise service-scoped-gates, main 7af0bd8: no Critical, 6 Warnings (all verified at file:line by root), 7 Suggestions; nothing disputed
tracker_rows: [fix-stop-snapshot, fix-merge-gate, fix-config-robustness, fix-extending-docs, fix-skip-reason, fix-snapshot-fact, fix-baseline-session, fix-gate-usable, fix-baseline-owner, fix-baseline-resilient]
guards:
  blast_radius: done
  completeness_sweep: done
  blind_rederivation: skipped(config:never)   # craftsman.config.json:164
coverage:
  contract:      1.1 (isScoped added to scripts/lib/changed.mjs; its two consumers snapshot.mjs and stop-gate.mjs change in the same unit) | 2.1 (an embedded placeholder now fails the pre-merge gate)
  data:          N/A(no persistence or migration; the change list file keeps its format)
  config:        3.1 (a null language entry from layering is skipped)
  security:      1.4 (a path starting with '-' is never read as an option) | 3.1 | 2.2 (a deletion-only branch no longer skips the gate)
  tests:         1.1 | 1.2 | 1.3 | 1.4 | 2.1 | 2.2 | 3.1 | 3.2 | 5.1 | 5.2 | 6.1 | 6.2 | 7.1 | 7.2 | 7.3 | 7.4 | 8.1 | 8.2 | 9.1 | 9.2 | 10.1 | 10.2
  observability: 1.2 (the wrong snapshot-pending reason disappears) | 1.3 (all-gone logs no-changes) | 5.1 (a markerless dirty Stop logs no-command, not snapshot-pending) | 9.1 (a sub-project scope logs no-command and never runs the root's regression command) | 10.1 (a scoped Stop with an unloadable workspace manifest still runs its gate and says so once) | 10.2 (a REGRESSION under a worktree scope names the tree the baseline was taken in)
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
  - id: fix-baseline-resilient
    scope_id: fix-baseline-resilient
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
MERGED (8de1728, implementer 772c427). Stop reads the root's `session-start.json` and `snapshot-started` only when the scope is the same repository (`sameRepository`: equal real paths, else the same `git rev-parse --git-common-dir`; a git failure is a different repository), so a workspace sub-project scope has no baseline, logs `no-command` and never runs the root's commands; `underScope` is a real `git worktree add` and three sub-project cases are new. [R6-W1, R6-S6]

### Step 10 - fix-baseline-resilient (., JavaScript, normal)
Tooling: implementer implementer - gates none - skills test-driven-development - guards none
Depends on: none
Rule: ARCH-STATE-22 (the baseline lookup), ARCH-SAFETY-04 (an advisory lookup that cannot run is said once; it never fails the gate).
Unattended-run rules: never run `rm`, `rmdir`, `unlink` or `find -delete` and never write one even as a no-op filler such as `rm -rf /dev/null` (use `mktemp -d` under the OS temp dir and leave it); finish with `node --test scripts/safety-cites.test.mjs`, and if it fails ONLY because a cited line range in `docs/architecture/**` moved, do not edit those docs: PARK naming each cite and its new range.
- [ ] 10.1 [R7-W1] `stop-gate.mjs:180` and `baselineContext()` (`:509-512`) call `projectContext(input.project || ".")`, which loads the workspace manifest (`core.mjs:166-170`) and throws for a listed project folder that does not exist, malformed JSON or a non-Git-root folder. With a scope active the scope's context is built without it, so before Step 7.2 a scoped Stop never reached that call; now Stop exits 1 with a stack trace before the secrets scan, the regression and scoped tests, the acceptance check and the unlanded-feature check (reproduced; quality-gate exits 0 on the same state). Make `baselineContext` catch, fall back to `context` (no baseline) and record the error. Once `sayOnce` is usable (it needs `sdir` and `scopedNotices`, defined after line 180, so do not call it earlier) Stop says once per session that the workspace manifest could not be read and the baseline was not looked up. Print no second JSON document to stdout (`advisorySkipped` writes one; Stop's only stdout is its decision). The no-scope path (`stop-gate.mjs:28`) is unchanged → accept: a case in `scripts/stop-gate-skip-reasons.test.mjs` with a scope active and an unloadable workspace manifest: Stop exits 0 with its normal report, the notice is said once and a second Stop does not repeat it; the same case fails without this change.
- [ ] 10.2 [R7-W2] `stop-gate.mjs:349` tells a unit worktree "tests passed at session start but fail now" for a baseline measured on the root checkout's tree and re-run in the worktree (`:281`, `cwd: context.root`), a tree that was never measured (a fresh worktree without `node_modules`, or commits the branch has and the root had not). Keep the block and the exact text `REGRESSION: tests passed at session start but fail now (<cmd>)`, and add, only when the baseline was read for a scope whose real root differs from the root context's, the note ` - the baseline was taken in <root context root>; this is <context.root>, a different tree, and a worktree without its dependencies fails the same way` before the colon. Without a scope, or with equal roots, the line is unchanged → accept: the worktree-scope regression case in `scripts/stop-gate-skip-reasons.test.mjs` asserts the original text and the note; the no-scope regression case asserts no note.
- [ ] 10.3 Run `node --test scripts/stop-gate-skip-reasons.test.mjs scripts/stop-gate.test.mjs scripts/stop-gate-scoped.test.mjs scripts/session-context.test.mjs scripts/snapshot.test.mjs scripts/safety-cites.test.mjs` → accept: exits 0 (or the unit PARKS naming only moved cite ranges).

## Sequencing
`fix-baseline-session` (round 6) then `fix-gate-usable`: the second changes `gateUsable`, which the first's tests and `stop-gate`/`snapshot` also call. Earlier steps are merged.
`fix-baseline-owner` (round 7) is independent of every other step: it touches only `stop-gate.mjs` and its skip-reason test, after Steps 7 and 8 landed.
`fix-baseline-resilient` (round 8) is independent too and edits the same two files after Step 9 landed.
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
- **Round 8 follow-ups, flagged not driven:** `followup-tokenize-leading-dash` was found again (`core.mjs:880-887`, argv `["-y.txt","."]` reproduced); `followup-state04-comment-cites` also covers `craftsman-state.mjs:2,10`, `session-context.mjs:218`, `snapshot.mjs:43` and the test names at `snapshot.test.mjs:147,158` and `session-context.test.mjs:498,507`; `followup-premerge-marker-lookup` is the Stop-versus-merge-gate difference for nested service markers (documented in EXTENDING.md; a scoped command runs at the repository root); `followup-changelist-symlink-root` (`quality-gate.mjs:34,64-66`: a `file_path` spelled through a symlinked alias of the root, `/var/home` against `/home` here, gives a `../` path, so the edit never joins the change list and a scoped command skips with `no-changes`; retry `path.relative` on the real paths of both); `followup-changelist-inside-root` (`stop-gate.mjs:215`: a change-list line is not checked to stay inside the root; reachable only by tampering with the protected state dir).
- **Residual risks, not actions:** spawned-script tests inherit `CLAUDE_PROJECT_DIR`; `/home` against `/var/home` path spelling in `resolveToolCwd`; concurrent appends to the change list are assumed line-atomic.

## Risk & rollback
- Behaviour changes: an embedded placeholder and a deletion-only branch now fail the merge gate (they used to skip it silently); a nested marker now runs at Stop; a deleted file no longer reaches the command. Each is a stricter or more accurate gate, never a new bypass. Revert any unit by reverting its merge commit; units touch disjoint files except `changed.mjs`, which only `fix-stop-snapshot` edits.
- Cite drift: `stop-gate.mjs`, `repo-exec.mjs` and `core.mjs` all shift lines; `safety-cites.test.mjs` is the mechanical check and root re-points rule cites after the units, as it did for `stop-scoped`.

## Out of scope
The two follow-up rows above; the Gleam repository. Rule wording, `EXTENDING.md` and `CHANGELOG.md` are root's docs pass, never a unit.

## Review history (older detail is in git)
Round 1 (main 7af0bd8): no Critical, 6 Warnings, fixed by Steps 1-4. Round 2 (b910a92): none new at Warning; docs and four Suggestions. Round 3 (4b28c66): one Warning, a markerless dirty Stop logged `snapshot-pending`, fixed by Step 5; cite pointers re-pointed. Round 4 (cf64bd1): two Warnings in the same recomputation (`snapshotAtStart: false`; a dropped snapshot), fixed by Step 6, which records a `snapshot-started` fact instead of guessing; the cite sweep widened to eight rules docs. Round 5 (b7704cd, real-flow runs): three older Warnings, fixed by Steps 7 and 8 (the tree hash ignored `.craftsman/` state, Stop read the scope's directory for the baseline, `gateUsable` accepted a missing program). Round 6 docs pass: cites re-pointed, ARCH-STATE-22 and ARCH-LAND-37 reworded. Round 7 (abf3dca): one Warning, the root's baseline was applied to a sub-project scope, fixed by Step 9 and its docs pass. Every time ARCH-STATE-19 to 22, ARCH-LAND-37 and ARCH-SLIM-08 HOLD and both whole-plan criteria are MET.

## Round 8 (2026-11-05, isolated scrutineer on main bcc58a5, range 23027f9..bcc58a5; scope-less, worktree-scope, sub-project-scope and merge-gate runs)
No Critical; every cite and `check:` name was audited (one `check:` claim is wrong, below); both plan criteria MET (suite 1894 of 1894, lint PASS). Two Warnings, both reproduced and both from the baseline lookup Steps 7 and 9 added: (1) `baselineContext` calls `projectContext` unguarded, so a scoped Stop with an unloadable workspace manifest crashes and the whole gate fails open (Step 10.1); (2) a unit worktree is told "tests passed at session start" for a tree the baseline never measured (Step 10.2; the worktree read was the owner's choice in round 5, so the line is made honest, not removed). Eight Suggestions: the flagged follow-ups above, a ARCH-STATE-22 `check:` field that names missing-program cases in `session-context.test.mjs` that only `snapshot.test.mjs` holds, and an uncovered Stop crash that Step 10.1 now covers.
- **Root, after the unit:** (a) ARCH-STATE-22 says, after the baseline sentence, that a REGRESSION under a worktree scope names the tree the baseline was taken in; (b) its `check:` field is reworded to the cases that exist; (c) every `stop-gate.mjs` cite in docs/architecture is re-checked by identifier and `verified_at` is stamped; (d) EXTENDING.md gets one clause in the baseline paragraph if the note shows to users.
