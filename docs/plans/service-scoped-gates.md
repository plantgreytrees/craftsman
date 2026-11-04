---
slug: service-scoped-gates
goal: Quality and test gates run per service in a multi-service workspace - the workspace's settings are inherited, tools run in the right folder, and only what a session touched is tested.
level: feature
priority: P2
idea: docs/ideas/service-scoped-gates.md
classification: in-scope  # architected idea, owner decisions 2026-10-23 (docs/ideas/service-scoped-gates.md "Corrections found by /architect"); rules ARCH-STATE-19..22, ARCH-LAND-37
tracker_rows: [obs-events, tool-cwd, changed-lib, stop-scoped, merge-scoped, config-layering, docs-changelog]
guards:
  blast_radius: done
  completeness_sweep: done
  blind_rederivation: skipped(config:auto - one repo, no migration, no security surface; the architect pass already ran an isolated analyst over the same seams)
coverage:
  contract:      5.2 | 6.2 | 3.2 (new config keys languages.<lang>.cwd, placeholders {changed} {changedDirs} {workspaceRoot}, new event fields; consumers listed under CONSUMERS)
  data:          3.1 (sessions/<sid>/changed, append-only, pruned with the session dir) | N/A(no schema or migration)
  config:         2.1 | 3.2 | 6.1 | 7.1
  security:      N/A(no authn/authz/secret surface; no shell anywhere - argv only; cwd confined by isInside; the config files stay self-protected by ARCH-SAFETY-05)
  tests:         1.4 | 2.6 | 3.6 | 4.5 | 5.3 | 6.5
  observability: 1.1 | 1.2 | 1.3 | 2.5 | 4.3
  interface:     N/A(no UI; the CLI/hook surface changes are the config keys and messages above)
  docs:          7.1 | 7.2
  rollback:      see Risk & rollback
units:
  - id: obs-events
    scope_id: obs-events
    project: .
    depends_on: []
    module: scripts/stop-gate.mjs, scripts/quality-gate.mjs
    language: JavaScript (Node ESM)
    security: normal
    scope:
      read: [scripts/stop-gate.mjs, scripts/quality-gate.mjs, scripts/stop-gate-plan-scope.test.mjs]
      docs: [docs/architecture/state.rules.md]
      write: [scripts/stop-gate.mjs, scripts/quality-gate.mjs, scripts/stop-gate-skip-reasons.test.mjs, scripts/quality-gate-events.test.mjs]
    arch: [ARCH-STATE-22]
    tooling: { implementer: implementer, gates: [], skills: [test-driven-development], guards: [], mcp: [] }
  - id: tool-cwd
    scope_id: tool-cwd
    project: .
    depends_on: [obs-events]
    module: scripts/lib/core.mjs, scripts/quality-gate.mjs
    language: JavaScript (Node ESM)
    security: normal
    scope:
      read: [scripts/lib/core.mjs, scripts/quality-gate.mjs]
      docs: [docs/architecture/state.rules.md]
      write: [scripts/lib/core.mjs, scripts/quality-gate.mjs, scripts/lib/tool-cwd.test.mjs]
    arch: [ARCH-STATE-20]
    tooling: { implementer: implementer, gates: [], skills: [test-driven-development], guards: [], mcp: [] }
  - id: changed-lib
    scope_id: changed-lib
    project: .
    depends_on: [tool-cwd]
    module: scripts/lib/changed.mjs, scripts/quality-gate.mjs, scripts/snapshot.mjs
    language: JavaScript (Node ESM)
    security: normal
    scope:
      read: [scripts/lib/core.mjs, scripts/quality-gate.mjs, scripts/snapshot.mjs]
      docs: [docs/architecture/state.rules.md]
      write: [scripts/lib/changed.mjs, scripts/lib/changed.test.mjs, scripts/quality-gate.mjs, scripts/snapshot.mjs, scripts/snapshot.test.mjs]
    arch: [ARCH-STATE-21]
    tooling: { implementer: implementer, gates: [], skills: [test-driven-development], guards: [], mcp: [] }
  - id: stop-scoped
    scope_id: stop-scoped
    project: .
    depends_on: [obs-events, changed-lib]
    module: scripts/stop-gate.mjs
    language: JavaScript (Node ESM)
    security: normal
    scope:
      read: [scripts/stop-gate.mjs, scripts/lib/changed.mjs, scripts/lib/gate-command.mjs, scripts/stop-gate-skip-reasons.test.mjs, scripts/stop-gate-plan-scope.test.mjs]
      docs: [docs/architecture/state.rules.md]
      write: [scripts/stop-gate.mjs, scripts/stop-gate-scoped.test.mjs]
    arch: [ARCH-STATE-21, ARCH-STATE-22]
    tooling: { implementer: implementer, gates: [], skills: [test-driven-development], guards: [], mcp: [] }
  - id: merge-scoped
    scope_id: merge-scoped
    project: .
    depends_on: [changed-lib]
    module: scripts/repo-exec.mjs
    language: JavaScript (Node ESM)
    security: normal
    scope:
      read: [scripts/repo-exec.mjs, scripts/lib/changed.mjs, scripts/lib/gate-command.mjs, scripts/repo-exec-retire.test.mjs]
      docs: [docs/architecture/landing.rules.md]
      write: [scripts/repo-exec.mjs, scripts/repo-exec-scoped.test.mjs]
    arch: [ARCH-LAND-37, ARCH-LAND-06]
    tooling: { implementer: implementer, gates: [], skills: [test-driven-development], guards: [], mcp: [] }
  - id: config-layering
    scope_id: config-layering
    project: .
    depends_on: [tool-cwd, stop-scoped, merge-scoped]
    module: scripts/lib/core.mjs
    language: JavaScript (Node ESM)
    security: normal
    scope:
      read: [scripts/lib/core.mjs, scripts/workspace.test.mjs]
      docs: [docs/architecture/state.rules.md]
      write: [scripts/lib/core.mjs, scripts/lib/config-layering.test.mjs]
    arch: [ARCH-STATE-19]
    tooling: { implementer: implementer, gates: [], skills: [test-driven-development], guards: [], mcp: [] }
  - id: docs-changelog
    scope_id: docs-changelog
    project: .
    depends_on: [config-layering]
    module: EXTENDING.md, CHANGELOG.md
    language: Markdown
    security: normal
    scope:
      read: [EXTENDING.md, CHANGELOG.md]
      docs: [docs/architecture/slim.rules.md]
      write: [EXTENDING.md, CHANGELOG.md]
    arch: [ARCH-SLIM-08]
    tooling: { implementer: implementer, gates: [], skills: [], guards: [], mcp: [] }
---

# Plan: Service-scoped gates

## Outcome
Quality and test gates run per service in a multi-service workspace: a sub-project or unit worktree inherits the workspace root's settings, per-file tools run in the right folder, and Stop and the pre-merge gate test only what a session touched. (Same meaning as `goal`.)

## Scope Steps (executable core)

All steps are in this repository (`project: .`). Each new test goes in a **new focused test file**: `scripts/lib/core.test.mjs` (62 KB) plus `core.mjs` (61 KB) already fill `execution.unitContextBytes` (122880), and `stop-gate.test.mjs` / `repo-exec.test.mjs` are 51 / 69 KB. New files follow the `scripts/stop-gate-plan-scope.test.mjs` pattern (temp git repo fixture, spawn the script, assert on stdout, exit code and `.craftsman/events.jsonl`). Run the whole suite with `node --test scripts/*.test.mjs scripts/lib/*.test.mjs` (as `.github/workflows/ci.yml:39` does); a unit's own gate is its new test file plus the suites named in its `accept:` lines.

### Step 1 - obs-events (., JavaScript, normal)
Tooling: implementer implementer - gates none - skills test-driven-development - guards none
Depends on: none
Rule: ARCH-STATE-22. Read `quality-gate.mjs:23-26` and `stop-gate.mjs:23-26`: when a unit scope is live the context is a literal without `id`; `projectContext` supplies `id` otherwise.
- [ ] 1.1 In `scripts/quality-gate.mjs`, give the scope-built context literal `id: active.project`, and add `project: context.id ?? "."` to every `logEvent({ ev: "gate", ... })` call → accept: a new `scripts/quality-gate-events.test.mjs` runs the hook for an edit at the fixture root and reads a `gate` event whose `project` is `"."`.
- [ ] 1.2 In `scripts/stop-gate.mjs`, give the scope-built context literal `id: active.project`, and add `project` to the `stop` events (both the `pass` and `block` paths) and to the `stop-tests-skipped` event → accept: `scripts/stop-gate-skip-reasons.test.mjs` reads a `stop` event with `project: "."`.
- [ ] 1.3 In `scripts/stop-gate.mjs` section "2. Tests", when the session is dirty and no `test` task is queued, log exactly one `stop-tests-skipped` with `reason`: `snapshot-pending` (no `session-start.json`), else `no-command` (`results` is `[]`), else `red-at-start` (every result red); the clean path keeps `reason: "clean"`. Logging happens when no test task ran, never alongside a test run → accept: the reason table in the new test passes for all four reasons.
- [ ] 1.4 Write `scripts/stop-gate-skip-reasons.test.mjs` (fixture + a dirty marker + a seeded `session-start.json` per case) and `scripts/quality-gate-events.test.mjs` → accept: `node --test scripts/stop-gate-skip-reasons.test.mjs scripts/quality-gate-events.test.mjs scripts/stop-gate.test.mjs scripts/stop-gate-plan-scope.test.mjs` passes.

### Step 2 - tool-cwd (., JavaScript, normal)
Tooling: implementer implementer - gates none - skills test-driven-development - guards none
Depends on: obs-events
Rule: ARCH-STATE-20. Read `core.mjs` `splitTokens` / `tokenize` (~842-860), `runOne` (~865), `cacheKey` (~1036), the `have()` / `which` probe, `isInside` (~101), and the notice-once pattern in `quality-gate.mjs` (`tool-unavailable-*` marker). Never use `process.cwd()` (a core.test regex pins that).
- [ ] 2.1 In `scripts/lib/core.mjs` add and export `resolveToolCwd(file, lang, context)`: parse `lang.cwd` of the form `nearest:<marker>[,<marker>]`; walk from `dirname(file)` up to and including `context.root`; the first directory containing any marker wins (markers tried in order within a directory); none found, a malformed spec, or a result failing `isInside(context.root, dir)` returns `{ cwd: context.root, reason }`; no `lang.cwd` returns `{ cwd: context.root }` → accept: unit cases in `scripts/lib/tool-cwd.test.mjs` for nearest hit, marker order, none found, root-level file, malformed spec, symlink escape.
- [ ] 2.2 Make `tokenize` / `runOne` use the resolved cwd: `{file}` and `{dir}` are relative to the effective cwd (POSIX), and the spawn `cwd` is that directory; with no `cwd` key the output is byte-identical to today → accept: a test shows the same token list as before without the key, and a file under `svc/` with `nearest:package.json` yields `{file}` relative to `svc`.
- [ ] 2.3 Probe a bin containing `/` with `fs.existsSync(path.resolve(cwd, bin))` instead of `which`/`have()` → accept: test with a relative bin present only under the nested cwd runs; absent bin reports unavailable.
- [ ] 2.4 Add the resolved cwd (relative) to `cacheKey`'s inputs (update its allow-list comment) so the same file under two cwds does not share a cache hit → accept: two keys differ when only the resolved cwd differs.
- [ ] 2.5 In `scripts/quality-gate.mjs`, add `cwd` (root-relative) to the `gate` event when it is not the root, and say once per session (marker pattern of `tool-unavailable-*`) when a spec fell back to the root → accept: test sees the `cwd` field on a nested run and exactly one notice across two failing edits.
- [ ] 2.6 Test `languages.<lang>.cwd` end to end through the hook with a stub tool that prints its cwd → accept: `node --test scripts/lib/tool-cwd.test.mjs scripts/lib/core.test.mjs scripts/launcher.test.mjs` passes.

### Step 3 - changed-lib (., JavaScript, normal)
Tooling: implementer implementer - gates none - skills test-driven-development - guards none
Depends on: tool-cwd
Rule: ARCH-STATE-21. Commands are split by `splitCmd` (exported from `core.mjs`) and run with no shell, so expansion works on argv tokens.
- [ ] 3.1 Create `scripts/lib/changed.mjs` exporting `recordChanged(sessionDir, relPath)` (append one POSIX root-relative path per line to `sessions/<sid>/changed` with `appendFileSync`) and `readChanged(sessionDir)` (dedupe, preserve first-seen order; missing file → `null`, which means "unknown", an empty file → `[]`) → accept: `scripts/lib/changed.test.mjs` cases for append, dedupe, missing vs empty.
- [ ] 3.2 Export `hasChangePlaceholder(cmd)` (true when some token is exactly `{changed}` or `{changedDirs}`) and `embeddedChangePlaceholder(cmd)` (true when such text appears inside a longer token) → accept: tests for whole-token, embedded, none.
- [ ] 3.3 Export `expandChangePlaceholders(cmd, files, { cwd, root })` returning `{ argv }`, `{ skip: "no-changes" }`, or `{ warn: "embedded-placeholder" }`: a whole `{changed}` token becomes one argv entry per file (paths with spaces preserved, POSIX, relative to `cwd`); `{changedDirs}` becomes the sorted unique `dirname`s (`.` for top-level); an empty file set returns `skip`; an embedded placeholder stays literal and returns `warn` → accept: tests for spaces, dirs dedupe and sort, empty set, embedded.
- [ ] 3.4 In `scripts/quality-gate.mjs`, where the `dirty` marker is written, also `recordChanged` the root-relative POSIX path of the edited file (not for docs-only edits that do not set `dirty`) → accept: after one source edit `sessions/<sid>/changed` contains the path; a doc edit leaves it absent.
- [ ] 3.5 In `scripts/snapshot.mjs`, skip any command for which `hasChangePlaceholder` is true (not run, not in `results`) → accept: `scripts/snapshot.test.mjs` runs the script on a fixture with one plain and one placeholder command and finds only the plain one in `session-start.json`.
- [ ] 3.6 Run the new tests plus the existing `session-context` suite → accept: `node --test scripts/lib/changed.test.mjs scripts/snapshot.test.mjs scripts/session-context.test.mjs scripts/stop-gate.test.mjs` passes.

### Step 4 - stop-scoped (., JavaScript, normal)
Tooling: implementer implementer - gates none - skills test-driven-development - guards none
Depends on: obs-events, changed-lib
Rules: ARCH-STATE-21, ARCH-STATE-22, and ARCH-SAFETY-04 (a fail-open must be said once, via `advisorySkipped` / the existing notice pattern in `stop-gate.mjs`).
- [ ] 4.1 In `scripts/stop-gate.mjs` build scoped tasks: every entry of `cfg.stopGate.commands` whose command has a placeholder and passes `gateUsable(context.root, marker, command)`, and every `cfg.stopGate.extraChecks` entry with a placeholder; only when `isDirty`; the generic `extraChecks` loop must skip placeholder entries so none runs unexpanded → accept: a test with `extraChecks: ["node check.mjs {changed}"]` shows the script received the edited path, never the literal `{changed}`.
- [ ] 4.2 Expand from `readChanged(sdir)` with `cwd = context.root`: an empty set skips the command and logs one `stop-tests-skipped` with `reason: "no-changes"`; an unreadable or missing list while dirty logs `changes-unknown` and says so once per session; an embedded placeholder runs nothing and says so once → accept: three tests, one per outcome.
- [ ] 4.3 Run scoped tasks in the existing concurrent batch under the same budget; a non-zero exit blocks with the text `SCOPED TESTS FAILED (not baselined): <cmd>` followed by the output tail, never the "regression" wording; a task killed by `totalBudgetMs` writes a once-per-session marker and prints a notice (it is no longer silent) → accept: failure test asserts the block text and that "REGRESSION" is absent; budget test asserts exactly one notice across two Stops.
- [ ] 4.4 A scoped command is never read from `session-start.json`, never needs it green at start, and counts as a test run for the `dirty` marker clear → accept: test with a missing `session-start.json` still runs the scoped command; the marker clears after a pass.
- [ ] 4.5 Write `scripts/stop-gate-scoped.test.mjs` for 4.1-4.4 (fixture pattern of `stop-gate-plan-scope.test.mjs`, a stub script that prints argv) → accept: `node --test scripts/stop-gate-scoped.test.mjs scripts/stop-gate-skip-reasons.test.mjs scripts/stop-gate.test.mjs scripts/stop-gate-plan-scope.test.mjs` passes.

### Step 5 - merge-scoped (., JavaScript, normal)
Tooling: implementer implementer - gates none - skills test-driven-development - guards none
Depends on: changed-lib
Rule: ARCH-LAND-37, with failures treated as any gate failure (ARCH-LAND-06). `verifyGateBeforeMerge` has three callers in `repo-exec.mjs`: `merge` (worktree vs base), `land-unit` (unit worktree vs the feature branch), `land-feature` (temp worktree after merging `origin/<base>`).
- [ ] 5.1 Change `verifyGateBeforeMerge(context, worktree)` to take a target ref; when `findGateCommand` returns a command with a placeholder, compute `git diff --name-only <ref>...HEAD` in the worktree and expand with `expandChangePlaceholders` (cwd = the worktree); an empty diff logs one event with `reason: "no-changes"` and skips; a failing diff throws the existing `pre-merge gate failed` error; a command without a placeholder behaves exactly as today → accept: tests below.
- [ ] 5.2 Pass the right ref at each caller: `merge` → the base branch the merge targets, `land-unit` → the feature branch it lands onto, `land-feature` → `origin/<base_branch>` → accept: a test per caller path (read the three call sites first; if a ref name is ambiguous, PARK with the question rather than guess).
- [ ] 5.3 Write `scripts/repo-exec-scoped.test.mjs` (fixture pattern of `repo-exec-retire.test.mjs`; a stub gate command printing its argv through `stopGate.commands` with a `justfile`-free marker such as `package.json`) covering: expanded diff, empty diff skip, diff failure fails the gate, unscoped command unchanged → accept: `node --test scripts/repo-exec-scoped.test.mjs scripts/repo-exec.test.mjs scripts/repo-exec-retire.test.mjs scripts/lib/gate-command.test.mjs` passes.

### Step 6 - config-layering (., JavaScript, normal)
Tooling: implementer implementer - gates none - skills test-driven-development - guards none
Depends on: tool-cwd, stop-scoped, merge-scoped
Rule: ARCH-STATE-19. This is the only behaviour change and ships in its own commit so it can be reverted alone. Read `core.mjs` `loadConfig` (~569-588) and `deepMerge` (590-598): `{}` merges into the defaults and changes nothing; only `null` drops a key. `loadConfig` is called from `pre-guard.mjs`, `tracker.mjs`, `approval.mjs`, `session-context.mjs`, the gate hooks and in-process tests.
- [ ] 6.1 In `loadConfig`, when `context?.root` resolves to a path different from `PROJECT_ROOT`, merge `PROJECT_ROOT`'s `PROJECT_CONFIG_FILES` (in list order) after the user config and before the context root's own files; equal roots, no context, or a missing file adds nothing; a malformed inherited file is ignored with the existing warning → accept: `scripts/lib/config-layering.test.mjs` cases for order (defaults, user, workspace root, project), project wins, `null` drops an inherited entry, `{}` changes nothing, equal roots add no layer, malformed inherited file ignored.
- [ ] 6.2 Substitute `{workspaceRoot}` (= `PROJECT_ROOT`) in `splitTokens` so every configured command (per-file, Stop, pre-merge via `splitCmd`) is covered; no new file name is added to `PROJECT_CONFIG_FILES` → accept: test that `python3 {workspaceRoot}/scripts/x.py {file}` expands in `tokenize` and `splitCmd`; `scripts/launcher.test.mjs` still passes.
- [ ] 6.3 The "enabled is false in <file>" guard notice (`guardState`, ~695-711) names the inherited file when the switch comes from the workspace root → accept: test with `enabled: false` only in the root config names that file.
- [ ] 6.4 Confirm no safety regression: a context inheriting `protectedPaths` from the workspace root only adds protection → accept: `node --test scripts/pre-guard.test.mjs scripts/pre-guard-narrow.test.mjs scripts/launcher.test.mjs` passes unchanged.
- [ ] 6.5 Run the whole suite `node --test scripts/*.test.mjs scripts/lib/*.test.mjs`. Any in-process fixture that now fails because the plugin repo's own `craftsman.project.json` layers into its `loadConfig({ root: tmp })` is NOT edited here: PARK this unit with a decision naming the failing files so the scope can be amended (ARCH-ENGINE-07) → accept: suite green, or the unit is PARKED with the file list.

### Step 7 - docs-changelog (., Markdown, normal)
Tooling: implementer implementer - gates none - skills none - guards none
Depends on: config-layering
Rule: ARCH-SLIM-08 (`[Unreleased]` under 8 KB; it measured 4400 bytes when planned).
- [ ] 7.1 In `EXTENDING.md` document: `languages.<lang>.cwd = "nearest:<marker,...>"`; the `{changed}` / `{changedDirs}` placeholders (whole tokens only, no shell, empty set skips, never snapshotted, blocks as `SCOPED TESTS FAILED`) in `stopGate.commands`, `stopGate.extraChecks` and the pre-merge gate; `{workspaceRoot}` and inheritance of the workspace root's config (order, `null` drops, `{}` does not clear defaults); the `project` event field and the skip reasons → accept: each term above appears in `EXTENDING.md`; `scripts/stop-gate.test.mjs` markdown tests still pass.
- [ ] 7.2 `CHANGELOG.md`, LAST: edit or add one entry under `## [Unreleased]` (Added: the cwd option, placeholders and event fields; Changed: sub-projects now inherit the workspace root config, root-relative commands must use `{workspaceRoot}`), check `[Unreleased]` stays under 8192 bytes → accept: `node --test scripts/changelog.test.mjs` passes; if the section would exceed the cap, PARK for a release cut instead of trimming other entries.

## Sequencing
`obs-events` first (attribution and reasons are additive and measure the rest) → `tool-cwd` (core.mjs and quality-gate.mjs, opt-in) → `changed-lib` (shared primitives, then the two consumers) → `stop-scoped` and `merge-scoped` (disjoint writes: `stop-gate.mjs` vs `repo-exec.mjs`; a wave under ARCH-ENGINE-16 once the wave spike has passed, otherwise sequential) → `config-layering` last (the only behaviour change, own commit, edits `core.mjs` again after `tool-cwd`) → `docs-changelog` (one CHANGELOG entry, last). `quality-gate.mjs` is written by steps 1, 2 and 3 and `stop-gate.mjs` by 1 and 4, so those are serialised by `depends_on`.

## Verification background   (citations - for the reviewer, not the executor)
- Config loads from `context.root` only, with `deepMerge`; `{}` is a no-op on defaults - `scripts/lib/core.mjs:569-598`.
- Per-file tools spawn with `cwd: context?.root || PROJECT_ROOT`, no shell - `scripts/lib/core.mjs:865-870`; `{file}` / `{dir}` tokens - `core.mjs:842-860`.
- Stop runs tests only when dirty and green at start; the only skip reason logged is `clean` - `scripts/stop-gate.mjs:172-191`; snapshot builds the start results - `scripts/snapshot.mjs:27-42`.
- Pre-merge gate and its three callers - `scripts/repo-exec.mjs:326-339`, `:368`, `:508`, `:623`; marker lookup is top-level only - `scripts/lib/gate-command.mjs:18-37`.
- Rules this plan implements: ARCH-STATE-19..22 (`docs/architecture/state.rules.md`), ARCH-LAND-37 (`docs/architecture/landing.rules.md`); inherited: ARCH-STATE-01/06, ARCH-SAFETY-04/05/11, ARCH-ENGINE-07/08, ARCH-SLIM-08.
- Size budget: `core.mjs` 61 KB + `lib/core.test.mjs` 62 KB equal `execution.unitContextBytes` (122880), hence new test files - `craftsman.config.json:7`.
- Gleam evidence: whole-solution `dotnet test` red at every session start while `stopGate.commands: {}` disarms nothing - `docs/ideas/service-scoped-gates.md` "Corrections found by /architect".

CONSUMERS:
- `tokenize` / `splitTokens` / `splitCmd` (core.mjs): `scripts/lib/core.mjs:927` (`runChecks`), `scripts/stop-gate.mjs` (`splitCmd`), `scripts/repo-exec.mjs:329-335` (`splitCmd`); `pre-guard.mjs` has its own unrelated `tokenize`.
- `runOne` / `runChecks`: `scripts/quality-gate.mjs:75`, `scripts/baseline.mjs:40` (baseline also runs `format`; a `cwd` key changes where both run - same for baseline, intended).
- `cacheKey`: `scripts/quality-gate.mjs:67` only.
- `verifyGateBeforeMerge`: `scripts/repo-exec.mjs:368, 508, 623` (three callers, all updated in step 5); `findGateCommand` re-exported at `repo-exec.mjs:322`.
- `loadConfig(context)`: `pre-guard.mjs:1486`, `tracker.mjs:93,378,514`, `approval.mjs:55,69,123`, `session-context.mjs:36`, `quality-gate.mjs:26`, `stop-gate.mjs`, `agent-mode-guard.mjs:73`, `orchestrate-scope-guard.mjs:112`, `digest.mjs:84`, `tracker-sync.mjs:56,77`, `init.mjs:49`, `session-end.mjs:17`, `run-args.mjs:95` - all see inherited values once a sub-project context differs from `PROJECT_ROOT` (step 6).
- Events `gate`, `stop`, `stop-tests-skipped`: only `scripts/stats.mjs:165-166` reads `gate` and `stop`, by `ev`/`result`; added fields are additive.
- `session-start.json`: written by `snapshot.mjs`, read by `stop-gate.mjs` and `session-context.mjs`; shape unchanged (placeholder commands are simply absent).
- Config keys added: `languages.<lang>.cwd`, placeholders inside existing command strings; none is in `SAFETY_CONFIG_KEYS` (`scripts/lib/self-protect.mjs`) and `PROJECT_CONFIG_FILES` is unchanged, so `hooks/run.sh` and `launcher.test.mjs` need no change.

## Risk & rollback
- **Behaviour change (step 6 only):** a sub-project or unit worktree now inherits the workspace root's config. A workspace with root-relative commands (Gleam: secrets check, `extraChecks`) would see them run from the sub-project cwd and block every unit Stop until they use `{workspaceRoot}`. Mitigation: ships last, own commit, CHANGELOG "Changed" names the migration; the owner updates Gleam's three commands before taking it via `stable`. Revert: revert the step 6 commit; every other step is inert without config.
- **In-process test fixtures** may pick up the plugin repo's own `craftsman.project.json` once layering lands; step 6.5 PARKs with the file list instead of widening scope.
- **Session change list** is blind to Bash-only edits, as the `dirty` marker already is; `no-changes` counts (step 1 events) show how often.
- **Scoped failures block** even when the touched service was red before the session; the owner sets the marker to `null` or narrows the script.
- **Time:** a scoped command can still exceed `totalBudgetMs`; step 4.3 makes the kill visible.
- **Owner steps outside this plan:** update Gleam's commands to `{workspaceRoot}` before adopting; run `/architect --update` afterwards to restamp `verified_at` and mark the rules implemented; time `dotnet test <tests.csproj> --no-build` for three Gleam services before relying on `{changed}` for C#.

## Out of scope
- Resolving every file to its owning service and an affected-set engine (idea recommendation 5, deferred); gitlink discovery in `workspace-init`; a cached `loadWorkspaceManifest` (separate latency fix); any edit to the Gleam repository; `scripts/stats.mjs` reporting of the new fields.
