---
slug: scrutinise-fixes-and-safety
goal: The self-protection layer holds, so a tool call cannot forge a grant, marker, scope or goal token, run the doc-write or toggle scripts out of turn, or skip git hooks, and the Stop and drift reports say what they promise.
level: feature
priority: P0
classification: in-scope # /scrutinise --deep of fixes-and-safety (792b8e4..c27533d, PR #1): 4 Critical, 5 Warning, Suggestions; every Critical and bypass Warning reproduced by a probe
tracker_rows: [core-isfile, selfprotect-markers, selfprotect-scripts, bypass-flags-2, quality-dirty-marker, doc-drift-and-stop-report, launcher-promptsubmit, selfprotect-settings-notebook, core-small-correctness, state-filter-dedupe] # PENDING, registered by /plan
guards:
  blast_radius: done
  completeness_sweep: done
  blind_rederivation: skipped(decomposition supplied by an isolated /scrutinise --deep, every Critical and bypass Warning reproduced against pre-guard.mjs)
coverage:
  contract:      core-isfile | selfprotect-markers # grantMtime and enabled() now require a regular file; SELF_NEVER grows
  data:          N/A(no persistence change; marker files keep their shape)
  config:        N/A(no new config key)
  security:      core-isfile | selfprotect-markers | selfprotect-scripts | bypass-flags-2 | selfprotect-settings-notebook | launcher-promptsubmit
  tests:         every unit # each fix ships a case that fails on c27533d
  observability: doc-drift-and-stop-report # the drift report counts only edits, Stop reports unpushed work whenever safety is on
  interface:     launcher-promptsubmit # a missing node must not erase the user's prompt
  docs:          selfprotect-settings-notebook # README and ARCH-SAFETY-05 text changed only after the code holds
  rollback:      every unit is one commit; revert it
units:
  - id: core-isfile
    scope_id: core-isfile
    project: .
    depends_on: []
    module: scripts/lib/core.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/lib/core.mjs]
      docs: [docs/architecture/state.rules.md]
      write: [scripts/lib/core.mjs, scripts/lib/core.test.mjs]
    arch: [ARCH-STATE-01]
    tooling: { implementer: implementer, gates: [security-auditor, code-reviewer], skills: [], guards: [arch-check], mcp: [] }
  - id: selfprotect-markers
    scope_id: selfprotect-markers
    project: .
    depends_on: []
    module: scripts/pre-guard.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/pre-guard.mjs, scripts/scope.mjs]
      docs: [docs/architecture/state.rules.md, docs/architecture/safety.rules.md]
      write: [scripts/pre-guard.mjs, scripts/pre-guard.test.mjs]
    arch: [ARCH-STATE-06, ARCH-SAFETY-05, ARCH-SAFETY-09]
    tooling: { implementer: implementer, gates: [security-auditor, code-reviewer], skills: [], guards: [arch-check], mcp: [] }
  - id: selfprotect-scripts
    scope_id: selfprotect-scripts
    project: .
    depends_on: [selfprotect-markers]
    module: scripts/pre-guard.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/pre-guard.mjs]
      docs: [docs/architecture/state.rules.md, docs/architecture/safety.rules.md]
      write: [scripts/pre-guard.mjs, scripts/pre-guard.test.mjs]
    arch: [ARCH-STATE-06, ARCH-SAFETY-05]
    tooling: { implementer: implementer, gates: [security-auditor, code-reviewer], skills: [], guards: [arch-check], mcp: [] }
  - id: bypass-flags-2
    scope_id: bypass-flags-2
    project: .
    depends_on: [selfprotect-scripts]
    module: scripts/pre-guard.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/pre-guard.mjs, scripts/lib/shell-words.mjs]
      docs: [docs/architecture/state.rules.md, docs/architecture/safety.rules.md]
      write: [scripts/pre-guard.mjs, scripts/pre-guard.test.mjs]
    arch: [ARCH-STATE-06, ARCH-SAFETY-03]
    tooling: { implementer: implementer, gates: [security-auditor], skills: [], guards: [arch-check], mcp: [] }
  - id: quality-dirty-marker
    scope_id: quality-dirty-marker
    project: .
    depends_on: []
    module: scripts/quality-gate.mjs
    language: javascript
    security: normal
    scope:
      read: [scripts/quality-gate.mjs, scripts/stop-gate.mjs]
      docs: [docs/architecture/state.rules.md]
      write: [scripts/quality-gate.mjs, scripts/stop-gate.test.mjs]
    arch: [ARCH-STATE-04]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [arch-check], mcp: [] }
  - id: doc-drift-and-stop-report
    scope_id: doc-drift-and-stop-report
    project: .
    depends_on: [bypass-flags-2, quality-dirty-marker]
    module: scripts/lib/doc-snapshot.mjs
    language: javascript
    security: normal
    scope:
      read: [scripts/pre-guard.mjs, scripts/stop-gate.mjs, scripts/lib/doc-snapshot.mjs]
      docs: [docs/architecture/state.rules.md, docs/architecture/safety.rules.md]
      write: [scripts/pre-guard.mjs, scripts/pre-guard.test.mjs, scripts/stop-gate.mjs, scripts/stop-gate.test.mjs, scripts/lib/doc-snapshot.mjs, scripts/lib/doc-snapshot.test.mjs]
    arch: [ARCH-STATE-04, ARCH-STATE-06, ARCH-SAFETY-06, ARCH-SAFETY-10]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [arch-check], mcp: [] }
  - id: launcher-promptsubmit
    scope_id: launcher-promptsubmit
    project: .
    depends_on: []
    module: hooks/run.sh
    language: shell
    security: high
    scope:
      read: [hooks/run.sh, craftsman.config.json]
      docs: [docs/architecture/state.rules.md, docs/architecture/safety.rules.md]
      write: [hooks/run.sh, scripts/launcher.test.mjs]
    arch: [ARCH-STATE-05, ARCH-SAFETY-02, ARCH-SAFETY-11]
    tooling: { implementer: implementer, gates: [security-auditor], skills: [], guards: [arch-check], mcp: [] }
  - id: selfprotect-settings-notebook
    scope_id: selfprotect-settings-notebook
    project: .
    depends_on: [doc-drift-and-stop-report]
    module: scripts/pre-guard.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/pre-guard.mjs]
      docs: [docs/architecture/state.rules.md, docs/architecture/safety.rules.md]
      write: [scripts/pre-guard.mjs, scripts/pre-guard.test.mjs, README.md, docs/architecture/safety.rules.md, docs/architecture/safety.md]
    arch: [ARCH-STATE-06, ARCH-SAFETY-05]
    tooling: { implementer: implementer, gates: [security-auditor, code-reviewer], skills: [], guards: [arch-check], mcp: [] }
  - id: core-small-correctness
    scope_id: core-small-correctness
    project: .
    depends_on: [core-isfile]
    module: scripts/lib/core.mjs
    language: javascript
    security: normal
    scope:
      read: [scripts/lib/core.mjs]
      docs: [docs/architecture/state.rules.md]
      write: [scripts/lib/core.mjs, scripts/lib/core.test.mjs]
    arch: [ARCH-STATE-01]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [arch-check], mcp: [] }
  - id: state-filter-dedupe
    scope_id: state-filter-dedupe
    project: .
    depends_on: [doc-drift-and-stop-report]
    module: scripts/lib/unpushed.mjs
    language: javascript
    security: normal
    scope:
      read: [scripts/lib/unpushed.mjs, scripts/lib/doc-snapshot.mjs, scripts/stop-gate.mjs]
      docs: [docs/architecture/state.rules.md]
      write: [scripts/lib/unpushed.mjs, scripts/lib/unpushed.test.mjs, scripts/lib/doc-snapshot.mjs, scripts/stop-gate.mjs, scripts/lib/craftsman-state.mjs, scripts/lib/craftsman-state.test.mjs]
    arch: [ARCH-STATE-04]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [arch-check], mcp: [] }
---

# Plan: scrutinise fixes-and-safety

## Outcome
A tool call can no longer forge a grant, marker, scope file or goal token, run `doc-write.mjs on` or `toggle.mjs off` out of turn, or skip git hooks by a spelling the guard missed; a missing node does not erase the user's prompt; the docs-only fast path no longer skips real test edits; and the Stop and drift reports do what ARCH-SAFETY-06 and ARCH-SAFETY-10 say. Result of `/scrutinise fixes-and-safety --deep` on `792b8e4..c27533d` (PR #1): isolated, 4 rounds (the cap stopped it, not dryness), no Disputed items, no `acceptance.md` to judge; against the plan's own Outcome ("a model cannot switch the guards off") it is UNMET.

## Findings → units
| Finding | Class / severity | Unit |
|---|---|---|
| `mkdir -p .craftsman/doc-write-pending` (and `.craftsman/off`) allowed; a directory counts as a grant/off flag | Security / Critical | core-isfile, selfprotect-markers |
| `selfKind`/`scopeNames` match the lexical path: a symlinked dir into `.craftsman` forges `goal-tokens.json`/`commands.json` | Security / Critical | selfprotect-markers |
| scope files not in `SELF_NEVER`: a forged scope unlocks `hooks.json` and the safety config keys | Security / Critical | selfprotect-markers |
| script gate sees only the first `node … doc-write|toggle` call and no node options | Security / Critical | selfprotect-scripts |
| hook-bypass misses `git config core.hooksPath`, alias, `GIT_CONFIG_*`, value-taking wrapper options, `sh -c` | Security / Warning | bypass-flags-2 |
| dirty marker skips test fixtures and config JSON | Correctness / Warning | quality-dirty-marker |
| drift report exempts any doc merely Read; `status` unused; Stop skips the unpushed report when `enabled()` is false | Correctness+Architecture / Warning | doc-drift-and-stop-report |
| orchestrate-scope-guard exit 2 erases the user's prompt without node; import-time throw exits 1; run.sh protected list not tied to config | Correctness / Suggestion | launcher-promptsubmit |
| `.claude/settings*.json` not self-protected; NotebookEdit's `notebook_path` unchecked; README/ARCH text over-claims | Security / Suggestion + Architecture / Warning | selfprotect-settings-notebook |
| `recordCommand` overwrites a user `prompt` record; only eslint-json crashes are "unavailable" | Correctness / Suggestion | core-small-correctness |
| short refnames in `unpushed.mjs`; three copies of the `.craftsman` porcelain filter | Correctness+Cross-unit / Suggestion | state-filter-dedupe |
| test table lacks every reproduction above | Test-coverage / Warning | folded into each unit's red tests |

## Scope Steps (executable core)

Every step: task N.0 first, red before green: run the new case against `c27533d` code (`git worktree add <scratch> c27533d`, copy only the new test files in) and record which cases fail. Last task of each step: the full CI set (`node --check` every script; `node --test scripts/*.test.mjs scripts/lib/*.test.mjs`; `model-policy.mjs`; `doc-size-policy.mjs`; `arch-check.mjs lint`; `claude plugin validate .`; `claude plugin test .`; `git diff --check`), then one commit. Test sources build any forbidden flag text by concatenation (the live guard scans commit messages and commands too). Tests that exercise destructive commands pin `HOME`.

### Step 1 — core-isfile (., javascript, high)
Depends on: none
- [ ] 1.0 Failing tests first → accept: `core.test` cases for a directory at the doc-write grant path, the session `doc-write` marker, `.craftsman/off`, and the launcher marker fail on c27533d
- [ ] 1.1 `grantMtime` (`core.mjs:208`), the `enabled()` off-flag check (`core.mjs:580`) and `guardState`'s off-flag and launcher-marker checks use `isFile()` (the launcher marker is a directory by design, so it keeps `isDirectory()`) → accept: a directory named `doc-write-pending`, `doc-write` or `off` is not a grant and not an off flag; a regular file still is; `guardState` agrees
- [ ] 1.2 Full CI set, commit `fix(state): a directory is not a grant or an off flag`

### Step 2 — selfprotect-markers (., javascript, high)
Depends on: none
- [ ] 2.0 Failing tests first, in the self-disable table's style, run through `pre-guard` as the suite already does → accept: red on c27533d for each row below
- [ ] 2.1 The Bash write-verb regex gains `mkdir`, `ln`, `install`, `mktemp` for the never-written and scoped paths (`pre-guard.mjs:~1002`) → accept: `mkdir -p .craftsman/doc-write-pending`, `mkdir .craftsman/off`, `ln -s x .craftsman/off`, `install /dev/null .craftsman/off` blocked; `mkdir build` and `ls .craftsman` stay allowed
- [ ] 2.2 `selfKind` and `scopeNames` judge the realpath of the target (the existing `realResolve`), for Write/Edit and for Bash hits; a Bash `ln` whose target resolves into `.craftsman` is a write → accept: after a symlinked directory `cs -> .craftsman/sessions` exists on disk, Write `cs/s1/goal-tokens.json` and `cs/s1/commands.json` are blocked; an ordinary file under a real `cs/` directory is allowed
- [ ] 2.3 `SELF_NEVER` gains `.craftsman/sessions/**/scope*`, `**/scope-required*`, `**/worktree-binding*` (scope.mjs and repo-exec stay the only writers; they are scripts, not tool calls) → accept: Write and `printf … > …` of a forged `scope.json` with `write:["**"]` blocked; the existing "a unit scope that names hooks.json lets it be edited" case still passes because it activates through `scope.mjs`
- [ ] 2.4 Full CI set, commit `fix(guard): markers, scope files and symlinks are self-protected`

### Step 3 — selfprotect-scripts (., javascript, high)
Depends on: selfprotect-markers
- [ ] 3.0 Failing tests first → accept: red on c27533d for each row below
- [ ] 3.1 The doc-write and toggle script gate scans every `node … <name>.mjs` invocation (`matchAll`), accepts node options (`--no-warnings`, `--`, `--input-type=module`) before the path, and denies when ANY invocation carries a non-permitted argument (`pre-guard.mjs:~1015-1023`) → accept: `node scripts/doc-write.mjs off; node scripts/doc-write.mjs on`, `node -- scripts/doc-write.mjs on`, `node --no-warnings "${CLAUDE_PLUGIN_ROOT}/scripts/doc-write.mjs"` and `node --no-warnings scripts/toggle.mjs off` blocked outside the owning command and allowed after it; `node --check scripts/toggle.mjs`, `node scripts/doc-write.mjs off` and `node scripts/toggle.mjs on` stay allowed
- [ ] 3.2 Full CI set, commit `fix(guard): every doc-write or toggle invocation is gated, with node options`

### Step 4 — bypass-flags-2 (., javascript, high)
Depends on: selfprotect-scripts
- [ ] 4.0 Failing tests first, flag text built by concatenation → accept: red on c27533d for each row below
- [ ] 4.1 `git config [--local|--global|--system] core.hooksPath …` and `git config alias.<x> <value naming the no-verify or no-gpg-sign flag>` are blocked; `GIT_CONFIG_COUNT`, `GIT_CONFIG_KEY_<n>` and `GIT_CONFIG_PARAMETERS` assignments are read like `-c` → accept: those forms blocked; `git config core.editor vim` and `git config user.name x` stay allowed
- [ ] 4.2 `gitWordIndex` skips the value of a value-taking wrapper option (`-u`, `-g`, `-C`, `-D`, `-n` for nice) and `GIT_WRAPPERS` is the same set as `WRAPPERS` (`pre-guard.mjs:~862` and `:~198`, `busybox` included) → accept: `env -u FOO git commit -n`, `sudo -u me git commit -n`, `busybox git commit -n` blocked; `env -u FOO git commit -m msg` allowed
- [ ] 4.3 A `sh|bash|zsh -c '<body>'` body is checked recursively like `removedDocs` does → accept: `sh -c 'git commit -n -m x'` and `bash -c "git -c core.hooksPath=/x commit"` (flag text concatenated in the test) blocked; `sh -c 'git status'` allowed
- [ ] 4.4 Full CI set, commit `fix(guard): more hook-bypass spellings`

### Step 5 — quality-dirty-marker (., javascript, normal)
Depends on: none
- [ ] 5.0 Failing tests first → accept: red on c27533d
- [ ] 5.1 `quality-gate.mjs` marks the session dirty for every edit except `docWriteGuard.docPaths`, `*.md` and ignored paths (a denylist, not "configured languages") (`quality-gate.mjs:53-56`) → accept: `stop-gate.test`: a turn editing `test/fixtures/a.json`, `tsconfig.json`, `.eslintrc.json`, `snap.snap`, `schema.sql` or `.env.test` leaves `dirty` and the suite re-runs; `docs/x.md`, `README.md` and `node_modules/x/index.js` still leave none
- [ ] 5.2 Full CI set, commit `fix(quality): only docs and ignored paths skip the test re-run`

### Step 6 — doc-drift-and-stop-report (., javascript, normal)
Depends on: bypass-flags-2, quality-dirty-marker
- [ ] 6.0 Failing tests first → accept: red on c27533d
- [ ] 6.1 pre-guard's allowed event carries `tool` (`pre-guard.mjs:~1150`) and `unseenDocChanges` counts only Write, Edit and NotebookEdit → accept: `doc-snapshot.test` and `stop-gate.test`: a guarded doc that was only Read, then changed out of band, is reported; one written through Write is not
- [ ] 6.2 `docDrift` compares the snapshot's `status` lines, or the field is dropped → accept: test pins whichever is chosen; no unused field remains (`doc-snapshot.mjs:33-34`)
- [ ] 6.3 Stop emits the unpushed notice before its `enabled()` return, gated on `safetyEnabled()`, as `session-end.mjs:15` does (`stop-gate.mjs:27,356-359`) → accept: `stop-gate.test`: with `CRAFTSMAN=off` and with `.craftsman/off` a Stop still prints the unpushed `systemMessage`, and with `CRAFTSMAN_SAFETY=off` it does not
- [ ] 6.4 Full CI set, commit `fix(stop): the drift report counts edits only, and Stop reports unpushed work whenever safety is on`

### Step 7 — launcher-promptsubmit (., shell, high)
Depends on: none
- [ ] 7.0 Failing tests first → accept: red on c27533d
- [ ] 7.1 With node missing, `orchestrate-scope-guard` on UserPromptSubmit exits 0 with a `systemMessage` instead of 2 (`hooks/run.sh:46-60`); pre-guard still blocks every tool call → accept: `launcher.test`: a payload with `"hook_event_name":"UserPromptSubmit"` and no node exits 0 and names the cause; the same script on PostToolUse still exits 2
- [ ] 7.2 Any exit other than 0 or 2 from a safety hook is mapped to 2, so an import-time throw before the in-process handler still denies → accept: `launcher.test`: a fixture `pre-guard.mjs` that throws at import exits 2 through `run.sh`; a fixture that exits 0 or 2 keeps its code; an advisory hook's exit 1 is kept
- [ ] 7.3 A launcher test ties the protected-looking substring list to the default `protectedPaths`: every default pattern's literal part appears in `run.sh`'s case list → accept: the case fails if a default pattern is added without a matching substring
- [ ] 7.4 Full CI set, commit `fix(launcher): a missing node cannot erase a prompt, import throws deny`

### Step 8 — selfprotect-settings-notebook (., javascript, high)
Depends on: doc-drift-and-stop-report
- [ ] 8.0 Failing tests first → accept: red on c27533d
- [ ] 8.1 `.claude/settings.json` and `.claude/settings.local.json` join the scoped self-protected paths with a key check: an edit that adds or changes `disableAllHooks`, `enabledPlugins`, `env` or `hooks` is blocked unless an active unit scope names the file → accept: Edit adding `"disableAllHooks": true`, Write of `env.CRAFTSMAN_SAFETY`, and `echo … > .claude/settings.json` blocked; an Edit of `permissions.allow` or `theme` allowed
- [ ] 8.2 `const file = toolInput.file_path ?? toolInput.notebook_path` so protected-path, doc-guard and self-protection checks reach NotebookEdit (`pre-guard.mjs:37`) → accept: NotebookEdit of `.craftsman/off`, of `package-lock.json` and of a guarded doc blocked as the Write equivalents are
- [ ] 8.3 README.md's off-switch bullet and ARCH-SAFETY-05's text name what is now enforced (markers, scope files, symlinks, every invocation, settings), and `safety.md` lists the remaining limits → accept: `safety-docs.test` still green; no claim in the docs exceeds a test
- [ ] 8.4 Full CI set, commit `fix(guard): settings and notebook edits are self-protected`

### Step 9 — core-small-correctness (., javascript, normal)
Depends on: core-isfile
- [ ] 9.0 Failing tests first → accept: red on c27533d
- [ ] 9.1 `recordCommand` keeps a `via:"prompt"` record when a `skill` record for the same command arrives (`core.mjs:607-612`) → accept: after a typed `/craftsman:toggle`, a model Skill call to it leaves `commandInvoked(..., {via:"prompt"})` true
- [ ] 9.2 A crash of any configured check tool (nonzero exit with no parseable findings and a stderr crash signature, or a spawn failure) is "unavailable", or plan 1 task 1.2's wording is narrowed to eslint-json in `safety.md` — pick by test: the case pins the choice (`core.mjs:835-841`) → accept: a fake `ruff` that crashes is not a finding, or the doc states the narrowed scope
- [ ] 9.3 Full CI set, commit `fix(state): a user's typed command record survives a Skill call; tool crashes are not findings`

### Step 10 — state-filter-dedupe (., javascript, normal)
Depends on: doc-drift-and-stop-report
- [ ] 10.0 Failing tests first → accept: red on c27533d
- [ ] 10.1 `unpushed.mjs` passes `refs/heads/<branch>` to `rev-list` (`unpushed.mjs:53,56`) → accept: `unpushed.test`: a branch named like a tag and one named like a file are reported
- [ ] 10.2 One helper `isCraftsmanStateLine` in new `scripts/lib/craftsman-state.mjs` replaces the three copies (`unpushed.mjs:16`, `stop-gate.mjs:100-103`, `doc-snapshot.mjs:34`) → accept: `craftsman-state.test` pins it; grep finds one definition
- [ ] 10.3 Full CI set, commit `refactor(state): one .craftsman porcelain filter; branch refs are explicit`

## Sequencing
Steps 2 → 3 → 4 → 6 → 8 share `pre-guard.mjs` and run in that order; step 6 also needs step 5 (`stop-gate.mjs`). Steps 1, 5 and 7 are independent and can run first. Step 9 follows 1 (both `core.mjs`), step 10 follows 6.

## Verification background
- Evidence: every Critical and the bypass Warnings were reproduced by spawning `scripts/pre-guard.mjs` against throwaway git repos (probe harness and case files in the scrutiny session's scratchpad: `probe.mjs`, `probe2.mjs`, `cases1-3.json`, `seq1-4.json`); this plan's author re-ran the node-option, two-call, `env -u` and `git config` forms and confirmed exit 0 on c27533d.
- Folded: the scrutineer's U9 (test-coverage) is each step's task N.0 red cases, not a separate unit.
- Split from the request: the single "markers" unit became steps 1 and 2, and the "small correctness" unit became steps 9 and 10, because `pre-guard.mjs` (63.7 KB) plus `core.mjs` (53.4 KB) alone exceed `execution.unitContextBytes` (ARCH-ENGINE-08).
- CONSUMERS: `grantMtime` is private to `core.mjs` and used by `hasDocWriteGrant` (`core.mjs:221-242`), consumed by `pre-guard.mjs` and `scripts/doc-write.mjs`; `enabled()` is consumed by every hook script and by `guardState` (consumed by `session-context.mjs:38`); `SELF_NEVER`/`selfKind` are private to `pre-guard.mjs`; `recordCommand`/`commandInvoked` are consumed by `orchestrate-scope-guard.mjs`, `scope.mjs`, `goal-token.mjs`, `pre-guard.mjs`; the allowed `preguard` event is consumed only by `doc-snapshot.mjs:unseenDocChanges` via `stop-gate.mjs`.

## Risk & rollback
- Step 2's realpath resolution runs on every Bash hit: keep it to targets that already matched a self-protected name, so the guard's latency does not grow.
- Step 3 widens a gate that blocks `doc-write.mjs on`: the owning commands must still pass (the existing 8.1 cases pin it).
- Step 7 changes launcher exit codes for safety hooks: the advisory path must keep its codes.
- Rollback: one commit per step; revert in reverse order.

## Out of scope (flagged, not driven)
- Moving the `failClosed` + handler block, copied in `pre-guard.mjs:21-36`, `agent-mode-guard.mjs:56-71` and `orchestrate-scope-guard.mjs:72-87`, into `core.mjs`: a Suggestion whose unit would read `pre-guard.mjs` and `core.mjs` together and exceed the context cap; the three copies are pinned by the same test.
- Runtime-only: whether the mod's `$.fs.list` `mtimeMs` equals Node's `statSync().mtimeMs` (a mismatch fails safe: no goal launches).
- By design: a goal token proves only that `/instruction` or `/auto` ran in the last hour, so a model under injection during `/auto` can still mint one.
- Unknown: whether Claude Code itself prompts before a tool writes `.claude/settings*.json` (step 8 closes the craftsman side regardless).
- The launcher's filter assumes `CLAUDE_PROJECT_DIR` is set for hooks; session-end's 8 s git timeout times many worktrees against a 20 s budget.
