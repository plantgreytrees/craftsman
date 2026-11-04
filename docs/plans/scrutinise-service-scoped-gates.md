---
slug: scrutinise-service-scoped-gates
goal: The scoped gates behave on every path the isolated review found - nested markers, deleted files, embedded placeholders, deletion-only branches and null language entries no longer skip, loop or crash a gate.
level: feature
parent: service-scoped-gates
priority: P2
idea: docs/ideas/service-scoped-gates.md
classification: in-scope  # /scrutinise service-scoped-gates, main 7af0bd8: no Critical, 6 Warnings (all verified at file:line by root), 7 Suggestions; nothing disputed
tracker_rows: [fix-stop-snapshot, fix-merge-gate, fix-config-robustness, fix-extending-docs]
guards:
  blast_radius: done
  completeness_sweep: done
  blind_rederivation: skipped(config:never)   # craftsman.config.json:164
coverage:
  contract:      1.1 (isScoped added to scripts/lib/changed.mjs; its two consumers snapshot.mjs and stop-gate.mjs change in the same unit) | 2.1 (an embedded placeholder now fails the pre-merge gate)
  data:          N/A(no persistence or migration; the change list file keeps its format)
  config:        3.1 (a null language entry from layering is skipped)
  security:      1.4 (a path starting with '-' is never read as an option) | 3.1 | 2.2 (a deletion-only branch no longer skips the gate)
  tests:         1.1 | 1.2 | 1.3 | 1.4 | 2.1 | 2.2 | 3.1 | 3.2
  observability: 1.2 (the wrong snapshot-pending reason disappears) | 1.3 (all-gone logs no-changes)
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
---

# Plan: Fix round for the service-scoped gates review

## Outcome
The scoped gates behave on every path the isolated review found. A nested marker still runs at Stop, a deleted file no longer blocks every later Stop, an embedded placeholder is never snapshotted and fails the merge gate instead of disabling it, a deletion-only branch no longer lands untested, and a `null` language entry no longer crashes the quality gate. (Same meaning as `goal`.)

## Scope Steps (executable core)

Every unit keeps the unattended-run constraint: **never run `rm`, `rmdir`, `find -delete` or any command that deletes files** (it stalls on an approval prompt no one can answer); for scratch or mutation checks use `mktemp -d` under the OS temp dir and leave it in place. New cases go into the existing scoped test files named in each unit (write-only, so the unit context stays within `execution.unitContextBytes`). Each unit ends by running `node --test scripts/safety-cites.test.mjs`: if it fails **only** because a cited line range in a `docs/architecture/*.rules.md` moved, do not edit `docs/architecture/**`; PARK naming each cite and its new range (root re-points them under the owner's approved path).

### Step 1 - fix-stop-snapshot (., JavaScript, normal)
Tooling: implementer implementer - gates none - skills test-driven-development - guards none
Depends on: none
Rule: ARCH-STATE-21 (a scoped command is never snapshotted; Stop derives it from config and runs it when dirty), ARCH-STATE-22.
- [ ] 1.1 [F6] In `scripts/lib/changed.mjs` export `isScoped(cmd)` (a whole `{changed}`/`{changedDirs}` token or an embedded one) and use it in `scripts/snapshot.mjs` (replace the `hasChangePlaceholder` skip at `:32`) and in `scripts/stop-gate.mjs` (replace the local `isScoped` at `:188`) → accept: `scripts/snapshot.test.mjs` runs the script on a fixture whose command is `node check.mjs --files={changed}` and finds it neither run nor in `session-start.json`; `scripts/lib/changed.test.mjs` covers `isScoped` for whole, embedded and plain commands.
- [ ] 1.2 [F1] In `scripts/stop-gate.mjs` select scoped `stopGate.commands` entries the way `snapshot.mjs:22-24` does: `await markerPresent(marker, context) && gateUsable(context.root, marker, cmd, { markerOk: true })` (import `markerPresent` from `./lib/core.mjs`) → accept: `scripts/stop-gate-scoped.test.mjs` with a tracked `services/api/package.json`, `stopGate.commands {"package.json": "node check.mjs {changed}"}`, a dirty session and change list `["services/api/x.js"]`: the check receives `services/api/x.js` and no `snapshot-pending` skip is logged.
- [ ] 1.3 [F2] In `scripts/stop-gate.mjs`, before expanding, drop paths that no longer exist from an array change list (`fs.existsSync(path.resolve(context.root, f))`); a `null` list stays "unknown"; an array with nothing left behaves as an empty list (`no-changes`) → accept: tests in `scripts/stop-gate-scoped.test.mjs`: list `["gone.js"]` with no such file runs nothing, logs `no-changes` and does not block, twice in a row; list `["gone.js", "kept.js"]` passes only `kept.js`.
- [ ] 1.4 [F10] In `scripts/lib/changed.mjs` `expandChangePlaceholders`, prefix `./` to any relative path (in `rels` and in `dirs`) that starts with `-`, so a tool never reads it as an option (`.` and other paths are unchanged) → accept: `scripts/lib/changed.test.mjs`: file `-rf.js` expands to `./-rf.js`, a directory `-x` to `./-x`, `.` stays `.`.
- [ ] 1.5 Run `node --test scripts/lib/changed.test.mjs scripts/snapshot.test.mjs scripts/stop-gate-scoped.test.mjs scripts/stop-gate-skip-reasons.test.mjs scripts/stop-gate.test.mjs scripts/stop-gate-plan-scope.test.mjs scripts/safety-cites.test.mjs` → accept: exits 0 (or the unit PARKS naming only moved cite ranges).

### Step 2 - fix-merge-gate (., JavaScript, normal)
Tooling: implementer implementer - gates none - skills test-driven-development - guards none
Depends on: fix-stop-snapshot
Rule: ARCH-LAND-37 (an EMPTY diff skips the gate; a diff that cannot be computed fails it), ARCH-LAND-06 (a red gate parks). `verifyGateBeforeMerge` has three callers: `merge`, `land-unit`, `land-feature`.
- [ ] 2.1 [F4] In `scripts/repo-exec.mjs` `verifyGateBeforeMerge`, an embedded placeholder (`gateArgv` returns `{warn}`) throws `pre-merge gate failed — {changed}/{changedDirs} must be a whole argument in "<cmd>"` instead of logging a skip and returning, so the land parks; only the empty-diff `skip` keeps the log-and-return path → accept: the existing embedded-placeholder test in `scripts/repo-exec-scoped.test.mjs` (~`:136`) now expects the failure and its message, and nothing lands.
- [ ] 2.2 [F5] In `gateArgv`, decide emptiness from the unfiltered `git diff --name-only -z <ref>...HEAD`; keep the `--diff-filter=d` (surviving files) list for expansion; empty unfiltered diff → skip `no-changes`; non-empty but nothing surviving → throw `pre-merge gate failed — this branch only deletes files, so a scoped command has nothing to name; run the suite unscoped` → accept: `scripts/repo-exec-scoped.test.mjs` cases: a deletion-only branch fails the gate with that message; a branch that deletes one file and adds another expands only the added one; an empty diff still skips and logs `no-changes`.
- [ ] 2.3 Run `node --test scripts/repo-exec-scoped.test.mjs scripts/repo-exec.test.mjs scripts/repo-exec-retire.test.mjs scripts/lib/gate-command.test.mjs scripts/safety-cites.test.mjs` → accept: exits 0 (or the unit PARKS naming only moved cite ranges).

### Step 3 - fix-config-robustness (., JavaScript, normal)
Tooling: implementer implementer - gates none - skills test-driven-development - guards none
Depends on: fix-merge-gate
Rule: ARCH-STATE-19 (a project `null` drops an inherited entry).
- [ ] 3.1 [F3] In `scripts/lib/core.mjs` `detectLang`, skip falsy language specs (`if (!spec) continue;`), and audit the other places in `core.mjs` and `scripts/quality-gate.mjs` that iterate map-shaped config (`Object.entries(cfg.languages)` and similar) for the same `null`; a file outside this unit's write list that needs the same guard is named in a PARK, not edited → accept: `scripts/lib/config-layering.test.mjs`: with `deepMerge(loadConfig(), { languages: { python: null } })`, `detectLang` for a `.py` file returns `null` without throwing and another language (for example `.js`) still detects.
- [ ] 3.2 [F7] In `scripts/quality-gate.mjs`, derive `skipBins` from the expanded bin (`tokenize(c, file, context, toolCwd)[0]` or the same value `runChecks` compares) instead of the raw first word, so a crashed `{workspaceRoot}/bin/tool` is skipped on the next edit → accept: a test in `scripts/lib/config-layering.test.mjs` that fails before the change: a language check configured as `{workspaceRoot}/<stub that crashes>` is attempted once and skipped on the second edit of the session.
- [ ] 3.3 Run `node --test scripts/lib/config-layering.test.mjs scripts/lib/core.test.mjs scripts/lib/tool-cwd.test.mjs scripts/quality-gate-events.test.mjs scripts/launcher.test.mjs scripts/safety-cites.test.mjs` → accept: exits 0 (or the unit PARKS naming only moved cite ranges).

### Step 4 - fix-extending-docs (., Markdown, normal)
Tooling: implementer implementer - gates none - skills none - guards none
Depends on: fix-stop-snapshot, fix-merge-gate
Rule: none governs EXTENDING.md; do not edit `CHANGELOG.md` (its entry still holds).
- [ ] 4.1 [F8] In `EXTENDING.md`: near the placeholder section (`~:178`) state the final behaviour — an embedded placeholder is never snapshotted, is said once at Stop, and fails the merge gate; a deletion-only branch fails the merge gate; a deleted file drops out of the Stop set — and near `~:186` state that the merge `{changed}` set (diff against the target) includes docs and other non-source files while the Stop set (files edited this session) excludes docs, state and ignored paths, so one command can pass at Stop and fail at merge (for example a test runner handed `README.md`) → accept: those statements are present; `node --test scripts/stop-gate.test.mjs scripts/changelog.test.mjs` exits 0.

## Sequencing
`fix-stop-snapshot` first: it owns the shared `isScoped` and `expandChangePlaceholders` that `fix-merge-gate` calls, and edits `stop-gate.mjs`. `fix-merge-gate` next (`repo-exec.mjs`). `fix-config-robustness` after them (`core.mjs`, `quality-gate.mjs`; no overlap, run last among the code units so any cite drift in `core.mjs` is the final one). `fix-extending-docs` last, so it describes the final behaviour. Root then re-points drifted rule cites and repairs `slim.rules.md` under `/architect --update` (below) before re-running `/scrutinise`.

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

## Round 2 (2026-11-04, isolated scrutineer on main b910a92)
Zero Critical and zero Warning. All of F1 to F7 and F10 are confirmed fixed, each new test failing on the old code, and both whole-plan criteria were run by the reviewer and are MET (suite 1838 of 1838, `arch-check lint` PASS). Four Suggestions, dispositions:
- CHANGELOG did not mention the stricter merge gate and the Stop-set pruning: one clause added (sync-docs).
- Stale second cites in ARCH-LAND-06, 12, 13 and 15 (wrong before this work; lint and `safety-cites` do not check cite content): re-pointed under `/architect --update` (sync-docs).
- Stop selects a scoped command with a marker anywhere in the tree, the pre-merge gate only at the top level and silently returns when it finds none: the difference is now stated in EXTENDING.md; making the lookup consistent, or logging `pre_merge_gate skipped no-command`, is the flagged row `followup-premerge-marker-lookup` (an ARCH-LAND-37 scope decision, not driven).
- Two untested cases (a `-x.js` file through the merge path; a directory or dangling symlink in the change list at Stop): flagged row `followup-scoped-gate-tests`.
The `arch-check --root` row gained a sharper consequence from the review (a session `architecture.dir` that differs makes lint report 0 rules docs and PASS); the `land-unit` row was judged no worse than described. Both stay flagged, not driven.
