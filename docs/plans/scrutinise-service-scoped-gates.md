---
slug: scrutinise-service-scoped-gates
goal: The scoped gates behave on every path the isolated reviews found, and every follow-up those reviews flagged is fixed or pinned by a test.
level: feature
parent: service-scoped-gates
priority: P2
idea: docs/ideas/service-scoped-gates.md
classification: in-scope  # rounds 1-10 of /scrutinise service-scoped-gates; round 11 drives the flagged follow-ups (owner, 2026-11-25)
tracker_rows: [fix-stop-snapshot, fix-merge-gate, fix-config-robustness, fix-extending-docs, fix-skip-reason, fix-snapshot-fact, fix-baseline-session, fix-gate-usable, fix-baseline-owner, fix-baseline-resilient, fix-workspaceroot-helper, fix-workspaceroot-callers, followup-changed-argv-cap, followup-gate-spawn-error-message, followup-snapshot-dropped-reason, followup-changelist-inside-root, followup-scoped-gate-tests, followup-premerge-marker-lookup, followup-land-unit-empty-diff, followup-land-feature-workspaceroot-test, followup-tokenize-leading-dash, followup-program-probe-helper, followup-workspaceroot-submodule-test, followup-same-repository-helper, followup-changelist-symlink-root, followup-approval-workspaceroot, followup-arch-check-root-layering, followup-instruction-scoped-command, followup-workspaceroot-trust-note, followup-state04-comment-cites, fix-merge-marker-tracked]
guards:
  blast_radius: done
  completeness_sweep: done
  blind_rederivation: skipped(config:never)   # craftsman.config.json:164
coverage:
  contract:      13.1 (`expandChangePlaceholders` gains `overCap`; consumers stop-gate 13.2 and repo-exec 14.2) | 24.1 (new `same-repository.mjs`; consumers stop-gate, scope) | 22.1 (one program probe; consumers gate-command, core)
  data:          N/A(no persistence; one new session marker, snapshot-dropped, 15.1)
  config:        27.1 (--root reads another repository's config alone)
  security:      16.1 (change-list lines stay inside the root) | 21.1 (a leading-dash path is never an option) | 26.1
  tests:         every task names its test; 17, 20, 23 are tests only
  observability: 15.1 (snapshot-dropped reason) | 13.2 | 14.1 | 14.2 (no empty failure message)
  interface:     N/A(no UI)
  docs:          28.1 | 29.1
  rollback:      see Risk & rollback
units:
  - id: followup-changed-argv-cap
    scope_id: followup-changed-argv-cap
    project: .
    depends_on: []
    module: scripts/lib/changed.mjs, scripts/stop-gate.mjs
    language: JavaScript (Node ESM)
    security: normal
    scope:
      read: [scripts/lib/changed.mjs, scripts/stop-gate.mjs]
      docs: [docs/architecture/state.rules.md]
      write: [scripts/lib/changed.mjs, scripts/stop-gate.mjs, scripts/lib/changed.test.mjs, scripts/stop-gate-scoped.test.mjs]
    arch: [ARCH-STATE-25, ARCH-STATE-21]
    tooling: { implementer: implementer, gates: [], skills: [test-driven-development], guards: [], mcp: [] }
  - id: followup-gate-spawn-error-message
    scope_id: followup-gate-spawn-error-message
    project: .
    depends_on: [followup-changed-argv-cap]
    module: scripts/repo-exec.mjs
    language: JavaScript (Node ESM)
    security: normal
    scope:
      read: [scripts/repo-exec.mjs, scripts/lib/changed.mjs]
      docs: [docs/architecture/landing.rules.md, docs/architecture/state.rules.md]
      write: [scripts/repo-exec.mjs, scripts/lib/changed.mjs, scripts/repo-exec-scoped.test.mjs]
    arch: [ARCH-STATE-25, ARCH-LAND-37, ARCH-LAND-06]
    tooling: { implementer: implementer, gates: [], skills: [test-driven-development], guards: [], mcp: [] }
  - id: followup-snapshot-dropped-reason
    scope_id: followup-snapshot-dropped-reason
    project: .
    depends_on: [followup-changed-argv-cap]
    module: scripts/snapshot.mjs, scripts/stop-gate.mjs
    language: JavaScript (Node ESM)
    security: normal
    scope:
      read: [scripts/snapshot.mjs, scripts/stop-gate.mjs]
      docs: [docs/architecture/state.rules.md]
      write: [scripts/snapshot.mjs, scripts/stop-gate.mjs, scripts/snapshot.test.mjs, scripts/stop-gate-skip-reasons.test.mjs]
    arch: [ARCH-STATE-24]
    tooling: { implementer: implementer, gates: [], skills: [test-driven-development], guards: [], mcp: [] }
  - id: followup-changelist-inside-root
    scope_id: followup-changelist-inside-root
    project: .
    depends_on: [followup-snapshot-dropped-reason]
    module: scripts/stop-gate.mjs
    language: JavaScript (Node ESM)
    security: normal
    scope:
      read: [scripts/stop-gate.mjs]
      docs: [docs/architecture/state.rules.md]
      write: [scripts/stop-gate.mjs, scripts/stop-gate-scoped.test.mjs]
    arch: [ARCH-STATE-21]
    tooling: { implementer: implementer, gates: [], skills: [test-driven-development], guards: [], mcp: [] }
  - id: followup-scoped-gate-tests
    scope_id: followup-scoped-gate-tests
    project: .
    depends_on: [followup-changelist-inside-root, followup-gate-spawn-error-message]
    module: scripts/repo-exec-scoped.test.mjs, scripts/stop-gate-scoped.test.mjs
    language: JavaScript (Node ESM)
    security: normal
    scope:
      read: [scripts/lib/changed.mjs, scripts/repo-exec-scoped.test.mjs, scripts/stop-gate-scoped.test.mjs]
      docs: [docs/architecture/state.rules.md]
      write: [scripts/lib/changed.mjs, scripts/repo-exec-scoped.test.mjs, scripts/stop-gate-scoped.test.mjs]
    arch: [ARCH-STATE-21, ARCH-LAND-37]
    tooling: { implementer: implementer, gates: [], skills: [test-driven-development], guards: [], mcp: [] }
  - id: followup-premerge-marker-lookup
    scope_id: followup-premerge-marker-lookup
    project: .
    depends_on: [followup-scoped-gate-tests]
    module: scripts/lib/gate-command.mjs
    language: JavaScript (Node ESM)
    security: normal
    scope:
      read: [scripts/lib/gate-command.mjs, scripts/lib/core.mjs]
      docs: [docs/architecture/landing.rules.md, docs/architecture/state.rules.md]
      write: [scripts/lib/gate-command.mjs, scripts/lib/gate-command.test.mjs, scripts/repo-exec-scoped.test.mjs]
    arch: [ARCH-LAND-38, ARCH-LAND-37]
    tooling: { implementer: implementer, gates: [], skills: [test-driven-development], guards: [], mcp: [] }
  - id: followup-land-unit-empty-diff
    scope_id: followup-land-unit-empty-diff
    project: .
    depends_on: [followup-premerge-marker-lookup]
    module: scripts/repo-exec.mjs
    language: JavaScript (Node ESM)
    security: normal
    scope:
      read: [scripts/repo-exec.mjs]
      docs: [docs/architecture/landing.rules.md]
      write: [scripts/repo-exec.mjs, scripts/repo-exec-scoped.test.mjs]
    arch: [ARCH-LAND-37, ARCH-LAND-06]
    tooling: { implementer: implementer, gates: [], skills: [test-driven-development], guards: [], mcp: [] }
  - id: followup-land-feature-workspaceroot-test
    scope_id: followup-land-feature-workspaceroot-test
    project: .
    depends_on: [followup-land-unit-empty-diff]
    module: scripts/repo-exec-scoped.test.mjs
    language: JavaScript (Node ESM)
    security: normal
    scope:
      read: [scripts/repo-exec.mjs, scripts/repo-exec-scoped.test.mjs]
      docs: [docs/architecture/landing.rules.md]
      write: [scripts/repo-exec-scoped.test.mjs]
    arch: [ARCH-LAND-37, ARCH-STATE-19]
    tooling: { implementer: implementer, gates: [], skills: [test-driven-development], guards: [], mcp: [] }
  - id: followup-tokenize-leading-dash
    scope_id: followup-tokenize-leading-dash
    project: .
    depends_on: []
    module: scripts/lib/core.mjs
    language: JavaScript (Node ESM)
    security: normal
    scope:
      read: [scripts/lib/core.mjs]
      docs: [docs/architecture/state.rules.md]
      write: [scripts/lib/core.mjs, scripts/lib/tool-cwd.test.mjs]
    arch: [ARCH-STATE-20]
    tooling: { implementer: implementer, gates: [], skills: [test-driven-development], guards: [], mcp: [] }
  - id: followup-program-probe-helper
    scope_id: followup-program-probe-helper
    project: .
    depends_on: [followup-tokenize-leading-dash, followup-premerge-marker-lookup]
    module: scripts/lib/gate-command.mjs, scripts/lib/core.mjs
    language: JavaScript (Node ESM)
    security: normal
    scope:
      read: [scripts/lib/gate-command.mjs, scripts/lib/core.mjs]
      docs: [docs/architecture/state.rules.md, docs/architecture/landing.rules.md]
      write: [scripts/lib/gate-command.mjs, scripts/lib/core.mjs, scripts/lib/gate-command.test.mjs, scripts/lib/tool-cwd.test.mjs]
    arch: [ARCH-STATE-20, ARCH-LAND-37]
    tooling: { implementer: implementer, gates: [], skills: [test-driven-development], guards: [], mcp: [] }
  - id: followup-workspaceroot-submodule-test
    scope_id: followup-workspaceroot-submodule-test
    project: .
    depends_on: [followup-program-probe-helper, followup-snapshot-dropped-reason]
    module: scripts/lib/config-layering.test.mjs, scripts/snapshot.test.mjs
    language: JavaScript (Node ESM)
    security: normal
    scope:
      read: [scripts/lib/core.mjs, scripts/snapshot.mjs]
      docs: [docs/architecture/state.rules.md]
      write: [scripts/lib/config-layering.test.mjs, scripts/snapshot.test.mjs]
    arch: [ARCH-STATE-19]
    tooling: { implementer: implementer, gates: [], skills: [test-driven-development], guards: [], mcp: [] }
  - id: followup-same-repository-helper
    scope_id: followup-same-repository-helper
    project: .
    depends_on: [followup-changelist-inside-root]
    module: scripts/lib/same-repository.mjs, scripts/stop-gate.mjs, scripts/scope.mjs
    language: JavaScript (Node ESM)
    security: normal
    scope:
      read: [scripts/stop-gate.mjs, scripts/scope.mjs]
      docs: [docs/architecture/state.rules.md]
      write: [scripts/stop-gate.mjs, scripts/scope.mjs, scripts/lib/same-repository.mjs, scripts/lib/same-repository.test.mjs, scripts/stop-gate-skip-reasons.test.mjs, scripts/scope.test.mjs]
    arch: [ARCH-STATE-24]
    tooling: { implementer: implementer, gates: [], skills: [test-driven-development], guards: [], mcp: [] }
  - id: followup-changelist-symlink-root
    scope_id: followup-changelist-symlink-root
    project: .
    depends_on: []
    module: scripts/quality-gate.mjs
    language: JavaScript (Node ESM)
    security: normal
    scope:
      read: [scripts/quality-gate.mjs]
      docs: [docs/architecture/state.rules.md]
      write: [scripts/quality-gate.mjs, scripts/quality-gate-events.test.mjs]
    arch: [ARCH-STATE-21, ARCH-STATE-20]
    tooling: { implementer: implementer, gates: [], skills: [test-driven-development], guards: [], mcp: [] }
  - id: followup-approval-workspaceroot
    scope_id: followup-approval-workspaceroot
    project: .
    depends_on: []
    module: scripts/approval.mjs, scripts/doc-checks.mjs
    language: JavaScript (Node ESM)
    security: normal
    scope:
      read: [scripts/approval.mjs, scripts/doc-checks.mjs]
      docs: [docs/architecture/approval.rules.md, docs/architecture/state.rules.md]
      write: [scripts/approval.mjs, scripts/doc-checks.mjs, scripts/approval.test.mjs, scripts/doc-checks.test.mjs]
    arch: [ARCH-STATE-19]
    tooling: { implementer: implementer, gates: [], skills: [test-driven-development], guards: [], mcp: [] }
  - id: followup-arch-check-root-layering
    scope_id: followup-arch-check-root-layering
    project: .
    depends_on: []
    module: scripts/arch-check.mjs
    language: JavaScript (Node ESM)
    security: normal
    scope:
      read: [scripts/arch-check.mjs]
      docs: [docs/architecture/docs.rules.md]
      write: [scripts/arch-check.mjs, scripts/arch-check.test.mjs]
    arch: [ARCH-DOCS-19, ARCH-DOCS-16]
    tooling: { implementer: implementer, gates: [], skills: [test-driven-development], guards: [], mcp: [] }
  - id: followup-instruction-scoped-command
    scope_id: followup-instruction-scoped-command
    project: .
    depends_on: []
    module: commands/instruction.md
    language: Markdown
    security: normal
    scope:
      read: [commands/instruction.md]
      docs: [docs/architecture/auto.rules.md, docs/architecture/plan.rules.md, docs/architecture/slim.rules.md]
      write: [commands/instruction.md, scripts/auto-command.test.mjs]
    arch: []
    tooling: { implementer: implementer, gates: [], skills: [test-driven-development], guards: [], mcp: [] }
  - id: followup-workspaceroot-trust-note
    scope_id: followup-workspaceroot-trust-note
    project: .
    depends_on: [followup-snapshot-dropped-reason, followup-changed-argv-cap, followup-premerge-marker-lookup]
    module: EXTENDING.md
    language: Markdown
    security: normal
    scope:
      read: [EXTENDING.md]
      docs: []
      write: [EXTENDING.md]
    arch: []
    tooling: { implementer: implementer, gates: [], skills: [test-driven-development], guards: [], mcp: [] }
  - id: followup-state04-comment-cites
    scope_id: followup-state04-comment-cites
    project: .
    depends_on: [followup-same-repository-helper, followup-workspaceroot-submodule-test, followup-snapshot-dropped-reason]
    module: comments in scripts/lib/craftsman-state.mjs, scripts/session-context.mjs, scripts/snapshot.mjs, scripts/stop-gate.mjs
    language: JavaScript (Node ESM)
    security: normal
    scope:
      read: [scripts/lib/craftsman-state.mjs, scripts/session-context.mjs, scripts/snapshot.mjs, scripts/stop-gate.mjs]
      docs: [docs/architecture/state.rules.md]
      write: [scripts/lib/craftsman-state.mjs, scripts/session-context.mjs, scripts/snapshot.mjs, scripts/stop-gate.mjs, scripts/snapshot.test.mjs, scripts/session-context.test.mjs, scripts/lib/craftsman-state.test.mjs]
    arch: [ARCH-STATE-24]
    tooling: { implementer: implementer, gates: [], skills: [test-driven-development], guards: [], mcp: [] }
  - id: fix-merge-marker-tracked
    scope_id: fix-merge-marker-tracked
    project: .
    depends_on: []
    module: scripts/lib/gate-command.mjs presentAnywhere; EXTENDING.md scoped-command lookup
    language: JavaScript (Node ESM)
    security: normal
    scope:
      read: [scripts/lib/gate-command.mjs, scripts/lib/gate-command.test.mjs, EXTENDING.md]
      docs: [docs/architecture/landing.rules.md]
      write: [scripts/lib/gate-command.mjs, scripts/lib/gate-command.test.mjs, EXTENDING.md, docs/architecture/landing.rules.md]
    arch: [ARCH-LAND-38, ARCH-LAND-37]
    tooling: { implementer: implementer, gates: [], skills: [test-driven-development], guards: [], mcp: [] }
---

# Plan: Fix round for the service-scoped gates review

## Outcome
The scoped gates behave on every path the isolated reviews found, and every follow-up those reviews flagged is fixed or pinned by a test. (Same meaning as `goal`.)

## Done (Steps 1-12, MERGED; task text is in git)
fix-stop-snapshot, fix-merge-gate, fix-config-robustness, fix-extending-docs, fix-skip-reason, fix-snapshot-fact, fix-baseline-session, fix-gate-usable, fix-baseline-owner, fix-baseline-resilient, fix-workspaceroot-helper, fix-workspaceroot-callers: nested markers, deleted files, embedded placeholders, deletion-only branches, null language entries, the snapshot fact, the baseline session, gate usability, the baseline owner and resilience, and `{workspaceRoot}` following a unit worktree (main 63fa4a2).

## Scope Steps (round 11, executable core)
Unit rules: never run `rm`, `rmdir`, `unlink` or `find -delete`, not even as a no-op (use `mktemp -d` under the OS temp dir and leave it); finish with `node --test scripts/safety-cites.test.mjs`, and if it fails only because a cited range in `docs/architecture/**` moved, do not edit those docs: PARK naming each cite and its new range. Every new test fails on the code before the unit.

### Step 13 - followup-changed-argv-cap (., JavaScript, normal)
Rule: ARCH-STATE-25, ARCH-STATE-21.
- [ ] 13.1 `changed.mjs:54-67` `expandChangePlaceholders` has no size cap, so a large `{changed}` reaches the OS argv limit (E2BIG). Add an exported byte cap (128 KiB of joined argv is a sensible default) and return `{ overCap: { bytes, files } }` past it, never an argv → accept: `scripts/lib/changed.test.mjs` cap case; below the cap the output is unchanged.
- [ ] 13.2 `stop-gate.mjs:227-240` treats `overCap` as a scoped failure: it blocks with `SCOPED TESTS FAILED` naming the cap and the file count and suggesting an unscoped run, and runs nothing → accept: `scripts/stop-gate-scoped.test.mjs` over-cap case (a change list past the cap blocks with that text, no spawn).

### Step 14 - followup-gate-spawn-error-message (., JavaScript, normal)
Rule: ARCH-STATE-25, ARCH-LAND-37, ARCH-LAND-06.
- [ ] 14.1 `repo-exec.mjs:325` `gateOutput` joins only stdout and stderr, so a gate program that cannot start (EACCES on a non-executable `./gradlew`, ENOENT) parks the land with an empty "did not pass in <wt>:" message; fall back to `<error.code>: <error.message>` → accept: `scripts/repo-exec-scoped.test.mjs` non-executable gate case names `EACCES`.
- [ ] 14.2 `gateArgv` (`:332-348`) fails the gate on `overCap` with a message naming the cap and the file count → accept: `scripts/repo-exec-scoped.test.mjs` over-cap case: the land fails with that message and no spawn.

### Step 15 - followup-snapshot-dropped-reason (., JavaScript, normal)
Rule: ARCH-STATE-24 (owner decision 2026-11-25; supersedes ARCH-STATE-22).
- [ ] 15.1 `snapshot.mjs:45` exits without a result when the tree changed while it ran, leaving `snapshot-started`, so every later dirty Stop logs `snapshot-pending`. Write a `snapshot-dropped` marker in the same session dir before that exit; `stop-gate.mjs` logs reason `snapshot-dropped` when it exists and `session-start.json` does not, ahead of the `snapshot-pending` check → accept: `scripts/snapshot.test.mjs` writes the marker only on a changed tree; `scripts/stop-gate-skip-reasons.test.mjs` snapshot-dropped case and the reason table now has seven entries.

### Step 16 - followup-changelist-inside-root (., JavaScript, normal)
Rule: ARCH-STATE-21.
- [ ] 16.1 `stop-gate.mjs:227` keeps any change-list line that exists, including `../x` or an absolute path outside `context.root`; drop every line that does not resolve inside the root before expansion → accept: `scripts/stop-gate-scoped.test.mjs` case: a tampered list with `../outside.js` and `/etc/hosts` expands to the in-root files only.

### Step 17 - followup-scoped-gate-tests (., JavaScript, normal)
Rule: ARCH-STATE-21, ARCH-LAND-37. Tests only; if one fails on current code, the fix belongs in `changed.mjs`.
- [ ] 17.1 `scripts/repo-exec-scoped.test.mjs`: a branch that adds `-x.js` lands with the gate receiving `./-x.js` → accept: the case passes.
- [ ] 17.2 `scripts/stop-gate-scoped.test.mjs`: a change-list entry that is now a directory, and one that is a dangling symlink, never reach the command (a directory is dropped like a gone path) → accept: both cases pass.

### Step 18 - followup-premerge-marker-lookup (., JavaScript, normal)
Rule: ARCH-LAND-38 (owner decision 2026-11-25), ARCH-LAND-37.
- [ ] 18.1 `gate-command.mjs:46-60` `findGateCommand` accepts a command's marker only at the worktree root, while Stop selects a scoped command with a marker anywhere (`core.mjs` `markerPresent`). For a scoped command (`isScoped`), accept a marker anywhere in the worktree with the same semantics as `markerPresent` (sync, skipping `.git` and `node_modules`); an unscoped command keeps the root-only lookup → accept: `scripts/lib/gate-command.test.mjs` nested-marker case for a scoped command and the unchanged root-only case for an unscoped one; `scripts/repo-exec-scoped.test.mjs` a nested-service branch lands through the scoped gate, which runs.

### Step 19 - followup-land-unit-empty-diff (., JavaScript, normal)
Rule: ARCH-LAND-37, ARCH-LAND-06.
- [ ] 19.1 `repo-exec.mjs:540-541` without `unit_worktree` gates the feature worktree, which is on the feature branch and does not yet hold the unit, so `feature...HEAD` is empty and a scoped gate skips (an unscoped one tests the wrong tree). Gate the unit branch instead: a detached temp worktree at the unit branch (as land-feature does at `:656`), diffed against the feature branch, removed afterwards with `git worktree remove` → accept: `scripts/repo-exec-scoped.test.mjs` land-unit without `unit_worktree`: a red unit is refused, a green one lands, and no temp worktree is left.

### Step 20 - followup-land-feature-workspaceroot-test (., JavaScript, normal)
Rule: ARCH-LAND-37, ARCH-STATE-19. Tests only.
- [ ] 20.1 Only `merge` has a `{workspaceRoot}` gate case. Add `land-unit` (with `unit_worktree`) and `land-feature` cases where the branch's `gate.mjs` exits 1 and main's exits 0 → accept: both are refused by the gate.

### Step 21 - followup-tokenize-leading-dash (., JavaScript, normal)
Rule: ARCH-STATE-20.
- [ ] 21.1 `core.mjs:908-917` `tokenize` passes `{file}` and `{dir}` bare relative to a `nearest:` tool cwd, so `services/api/-c.my` becomes the option `-c.my` (reproduced); prefix a relative value that starts with `-` with `./`, as `changed.mjs` does → accept: `scripts/lib/tool-cwd.test.mjs` case with `-y.txt` gives `./-y.txt`; other paths unchanged.

### Step 22 - followup-program-probe-helper (., JavaScript, normal)
Rule: ARCH-STATE-20, ARCH-LAND-37.
- [ ] 22.1 `gate-command.mjs:30-34` `programPresent` and `core.mjs` `runOne` (`:931`) probe a program differently (PATH lookup and the slash rule); export one probe from `core.mjs` and use it in both → accept: `scripts/lib/gate-command.test.mjs` and `scripts/lib/tool-cwd.test.mjs` agree for a bare name, a `./bin` path and an absolute path.

### Step 23 - followup-workspaceroot-submodule-test (., JavaScript, normal)
Rule: ARCH-STATE-19. Tests only.
- [ ] 23.1 `scripts/lib/config-layering.test.mjs`: `workspaceRootFor` gives `PROJECT_ROOT` for a `git submodule add` checkout inside the root and inside a unit worktree, and for a nested repository; `scripts/snapshot.test.mjs`: a `{workspaceRoot}` command in a worktree context runs the worktree's script → accept: the cases pass.

### Step 24 - followup-same-repository-helper (., JavaScript, normal)
Rule: ARCH-STATE-24.
- [ ] 24.1 `stop-gate.mjs:569` and `scope.mjs:124` each define `sameRepository` and disagree for `/home` against `/var/home`. Move one implementation (real-path equality, else equal real git common dirs, a git failure is a different repository) to a new `scripts/lib/same-repository.mjs` and use it in both → accept: `scripts/lib/same-repository.test.mjs` symlinked-spelling and other-repository cases; the existing stop-gate and scope tests pass.

### Step 25 - followup-changelist-symlink-root (., JavaScript, normal)
Rule: ARCH-STATE-21, ARCH-STATE-20.
- [ ] 25.1 `quality-gate.mjs:34` takes `path.relative(context.root, file)`; a `file_path` spelled through a symlinked alias of the root gives `../`, so the edit never joins the change list. When the result starts with `..`, retry on the real paths of both → accept: `scripts/quality-gate-events.test.mjs` case: an edit through a symlinked root alias is recorded as the in-root path.

### Step 26 - followup-approval-workspaceroot (., JavaScript, normal)
Rule: ARCH-STATE-19 (owner decision 2026-11-25: approval follows the detached tree).
- [ ] 26.1 `approval.mjs:58` and `doc-checks.mjs:20` split commands with no context, so in the detached tree at `head_sha` (`approval.mjs:73-87`) `{workspaceRoot}` is the main checkout. Pass `{ root: dir }` to `splitCmd` in the secrets runner and thread a context through `runDocChecks` → accept: `scripts/approval.test.mjs` and `scripts/doc-checks.test.mjs` cases: a `{workspaceRoot}` check runs the detached tree's script; without a context it is unchanged.

### Step 27 - followup-arch-check-root-layering (., JavaScript, normal)
Rule: ARCH-DOCS-19 (owner decision 2026-11-25).
- [ ] 27.1 `arch-check.mjs:333-335` loads `--root` through `loadConfig` layering, so another repository inherits this session's `architecture.dir`. For a root that is neither inside this session's repository nor a registered workspace project, read that root's config files alone over the plugin defaults → accept: `scripts/arch-check.test.mjs` case: lint on another repository with its own `architecture.dir` finds its rules docs; the session root is unchanged.

### Step 28 - followup-instruction-scoped-command (., Markdown, normal)
Rule: None governs the change; `doc-size-policy` caps the file.
- [ ] 28.1 `commands/instruction.md:20` (step 3, proof commands) would paste a scoped `{changed}`/`{changedDirs}` command as the evaluator's proof; say to use the unscoped command, trimming elsewhere to stay within the cap → accept: the line names the rule; `node scripts/doc-size-policy.mjs` PASS with no cap rise; `scripts/auto-command.test.mjs` passes.

### Step 29 - followup-workspaceroot-trust-note (., Markdown, normal)
Rule: EXTENDING.md only.
- [ ] 29.1 EXTENDING.md: say an absolute path pins the main checkout's copy of a gate script and that a script a branch can edit is only as trustworthy as the branch; add `snapshot-dropped` to the reason table; say a scoped command past the byte cap fails clearly; say the merge gate finds a scoped command's marker anywhere → accept: the four statements are present and match the code.

### Step 30 - followup-state04-comment-cites (., JavaScript, normal)
Rule: ARCH-STATE-24. Comments and test names only.
- [ ] 30.1 Comments and test names in `craftsman-state.mjs`, `session-context.mjs`, `snapshot.mjs`, `stop-gate.mjs` and their tests cite ARCH-STATE-04 (background tasks, now superseded) or ARCH-STATE-22 (superseded) for behaviour ARCH-STATE-24 records; re-point them → accept: `grep -n "ARCH-STATE-04\|ARCH-STATE-22"` over those files finds none; the tests pass.

### Step 31 - fix-merge-marker-tracked (., JavaScript, normal)
Rule: ARCH-LAND-38 (owner decision 2026-11-25, "Match Stop for scoped cmds"), ARCH-LAND-37. `presentAnywhere` (gate-command.mjs:50-64) walks the filesystem, skipping only `.git` and `node_modules`; Stop's `markerPresent` (core.mjs:790-799) matches git-tracked files and walks only a tree that is not a git checkout. So a marker that exists only in an untracked or ignored folder selects a scoped command at merge but not at Stop.
- [ ] 31.1 In `presentAnywhere`, list the worktree's tracked files with a synchronous `git -C <worktree> ls-files -z` (execFileSync, no shell) and match them as `markerPresent` does (`f === marker || f.endsWith("/" + marker)`, a glob marker by the same rule); keep the existing walk only for a worktree that is not a git checkout or when ls-files fails → accept: gate-command.test.mjs cases: a marker only in an untracked folder, and one only in a gitignored folder, select no scoped command; a tracked nested marker still does (the existing nested-marker case stays green); a non-git directory still finds a nested marker through the walk.
- [ ] 31.2 EXTENDING.md (~:204-210) says the two gates look in different places; restate it: both select a scoped command when a git-tracked marker exists anywhere in the tree, and a tree that is not a git checkout is walked → accept: the paragraph matches the code; doc-size-policy passes.
- [ ] 31.3 Finish with `node --test scripts/lib/gate-command.test.mjs scripts/repo-exec-scoped.test.mjs scripts/safety-cites.test.mjs`; a cite of ARCH-LAND-37/38 that moved only because of this edit is re-pointed in its `cite:` field, nothing else in rules docs changes → accept: the command exits 0.
Never run rm, rmdir, unlink or `find -delete`; use `mktemp -d` under the OS temp dir.

## Sequencing
Units that share a file run one after another (`depends_on`): `changed.mjs` 13 → 14 → 17; `stop-gate.mjs` 13 → 15 → 16 → 24 → 30; `repo-exec.mjs` and its scoped test 14 → 17 → 18 → 19 → 20; `gate-command.mjs` and `core.mjs` 18 → 21 → 22 → 23; EXTENDING.md (29) after the behaviour it describes. 25, 26, 27 and 28 are independent.

## Verification background   (citations - for the reviewer, not the executor)
CONSUMERS:
- `expandChangePlaceholders` (`scripts/lib/changed.mjs`): `scripts/stop-gate.mjs:231`, `scripts/repo-exec.mjs:348`; both handle `overCap` (13.2, 14.2).
- `sameRepository`: `scripts/stop-gate.mjs:569`, `scripts/scope.mjs:124` (24.1); `repo-exec.mjs` keeps its own (it compares registered worktrees).
- `findGateCommand` (`scripts/lib/gate-command.mjs:46`): `scripts/repo-exec.mjs:356`, `scripts/tool-slots.test.mjs`; only the scoped-command lookup widens (18.1).
- `runDocChecks` (`scripts/doc-checks.mjs`): `scripts/approval.mjs:67` and the docs checks at the verification point; a context is optional (26.1).

## Risk & rollback
Stricter gates only: an over-cap expansion, a gate that cannot start, an out-of-root change-list line and a land-unit without a unit worktree now fail or test the right tree instead of passing silently. Revert any unit by reverting its merge commit. Cite drift in `stop-gate.mjs`, `repo-exec.mjs` and `core.mjs` is re-pointed by root after the units.

## Review history (older detail is in git)
Round 1 (main 7af0bd8): no Critical, 6 Warnings, fixed by Steps 1-4. Round 2 (b910a92): none new at Warning; docs and four Suggestions. Round 3 (4b28c66): one Warning, a markerless dirty Stop logged `snapshot-pending`, fixed by Step 5; cite pointers re-pointed. Round 4 (cf64bd1): two Warnings in the same recomputation (`snapshotAtStart: false`; a dropped snapshot), fixed by Step 6, which records a `snapshot-started` fact instead of guessing; the cite sweep widened to eight rules docs. Round 5 (b7704cd, real-flow runs): three older Warnings, fixed by Steps 7 and 8 (the tree hash ignored `.craftsman/` state, Stop read the scope's directory for the baseline, `gateUsable` accepted a missing program). Round 6 docs pass: cites re-pointed, ARCH-STATE-22 and ARCH-LAND-37 reworded. Round 7 (abf3dca): one Warning, the root's baseline was applied to a sub-project scope, fixed by Step 9 and its docs pass. Round 8 (bcc58a5): two Warnings in the baseline lookup, an unguarded `projectContext` and a REGRESSION line for an unmeasured tree, fixed by Step 10. Round 9 (a5a3bf0): no Critical; one Warning reported on `{workspaceRoot}` inside a unit worktree (disputed to a Suggestion, then decided by the owner, Round 10), six Suggestions flagged as follow-ups. Every time ARCH-STATE-19 to 22, ARCH-LAND-37 and ARCH-SLIM-08 HOLD and both whole-plan criteria are MET. Round 10 (94ba183): no Critical, Warning or Architecture finding; four Suggestions flagged.

## Round 11 (2026-11-25, owner decisions)
The owner chose to drive every flagged follow-up and decided the open questions: a seventh skip reason `snapshot-dropped` (ARCH-STATE-24 supersedes 22), a byte cap that fails clearly (ARCH-STATE-25), the merge gate finds a scoped command's marker anywhere (ARCH-LAND-38), `arch-check --root` on another repository reads its own config (ARCH-DOCS-19), and approval checks follow the detached tree. `followup-workspaceroot-worktree` was fixed by Steps 11-12 and is closed with that evidence.
- **Run notes (2026-11-25):** all 18 units MERGED (main 696bc22; suite 2012/2012). Three changes to the run, recorded here because the task text above predates them: (1) the Stop hook's sweep removed a fresh, commit-less unit worktree, so each runner locked its worktree after `prepare` and unlocked it before landing (the sweep itself is out of scope and reported to the owner); (2) a unit whose edit only moved a cited range re-pointed that `cite:` itself instead of parking, rule text untouched; (3) `followup-state04-comment-cites` also loaded `safety.rules.md` with ARCH-SAFETY-04 and wrote the three test files that carried ARCH-STATE-22, after its first run was refused scope.
- **Round 11 result (isolated scrutineer, main cbadb0a):** 0 Critical, 0 Warning; all 39 round 11 criteria MET. One Architecture-class Suggestion (ARCH-LAND-37 and ARCH-STATE-25 cites left behind by 5c4e88c and 5053971) was fixed by root by re-pointing the cites. Eight Suggestions are flagged for the owner, not driven: an over-cap Stop also logs a fallback `stop-tests-skipped` reason (stop-gate.mjs:251-257, :274); a submodule-only branch skips the merge gate as `no-changes` (changed.mjs:67-70); quality-gate classifies doc/state paths before the realpath retry (quality-gate.mjs:34, :60-73); an over-cap change list blocks every later dirty Stop of the session; the merge gate's `presentAnywhere` walks ignored trees, unlike Stop's git-tracked `markerPresent` (gate-command.mjs:50-64); `arch-check` keeps its own common-dir test beside `same-repository.mjs` (arch-check.mjs:340-341); two inside-root tests (stop-gate.mjs:245, quality-gate.mjs:67); the 16.1 test leaves `outside-*.js` in the OS temp dir (stop-gate-scoped.test.mjs:460-463).
- **Root, after the units:** re-point moved cites in `docs/architecture` by identifier check, stamp `verified_at`, and edit the CHANGELOG bullet (under 8 KB, ARCH-SLIM-08).

## Round 12 (2026-11-25)
- `/architect --update` found ARCH-LAND-38's merge-gate lookup partly unmet: it walks untracked and ignored folders that Stop never sees. Step 31 makes the merge gate match Stop's git-tracked lookup, as the owner decided.
