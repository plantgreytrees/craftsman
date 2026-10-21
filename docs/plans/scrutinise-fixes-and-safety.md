---
slug: scrutinise-fixes-and-safety
goal: The self-protection layer holds, so a tool call cannot forge a grant, marker, scope or goal token, run the doc-write or toggle scripts out of turn, or skip git hooks, and the Stop and drift reports say what they promise.
level: feature
priority: P0
classification: in-scope # /scrutinise --deep of fixes-and-safety (792b8e4..c27533d, PR #1): 4 Critical, 5 Warning, Suggestions; every Critical and bypass Warning reproduced by a probe
tracker_rows: [core-isfile, selfprotect-markers, selfprotect-scripts, bypass-flags-2, quality-dirty-marker, doc-drift-and-stop-report, launcher-promptsubmit, selfprotect-settings-notebook, core-small-correctness, state-filter-dedupe, self-scoped-shared, config-keys-protected, selfprotect-shell-words, script-authority-in-scripts, bypass-flags-3, prompt-failclosed, stop-loopguard-reports, followup-skill-record, followup-md-dirty-marker] # PENDING, registered by /plan
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
  round2:        self-scoped-shared | config-keys-protected | selfprotect-shell-words | script-authority-in-scripts | bypass-flags-3 | prompt-failclosed | stop-loopguard-reports # security/correctness; followups are PENDING and not driven
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
  - id: self-scoped-shared
    scope_id: self-scoped-shared
    project: .
    depends_on: []
    module: scripts/scope.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/scope.mjs, scripts/scope.test.mjs, scripts/pre-guard.mjs]
      docs: [docs/architecture/state.rules.md, docs/architecture/safety.rules.md]
      write: [scripts/scope.mjs, scripts/scope.test.mjs, scripts/lib/self-protect.mjs, scripts/lib/self-protect.test.mjs, scripts/pre-guard.mjs, scripts/pre-guard.test.mjs, docs/architecture/safety.rules.md, docs/architecture/state.rules.md, .craftsman/acceptance.md]
    arch: [ARCH-STATE-06, ARCH-SAFETY-05]
    tooling: { implementer: implementer, gates: [security-auditor, code-reviewer], skills: [], guards: [arch-check], mcp: [] }
  - id: config-keys-protected
    scope_id: config-keys-protected
    project: .
    depends_on: [self-scoped-shared]
    module: scripts/pre-guard.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/pre-guard.mjs, scripts/lib/self-protect.mjs, craftsman.config.json]
      docs: [docs/architecture/state.rules.md, docs/architecture/safety.rules.md]
      write: [scripts/pre-guard.mjs, scripts/pre-guard.test.mjs, scripts/lib/self-protect.mjs, scripts/lib/self-protect.test.mjs, docs/architecture/safety.rules.md, docs/architecture/state.rules.md, .craftsman/acceptance.md]
    arch: [ARCH-STATE-06, ARCH-SAFETY-05, ARCH-SAFETY-08]
    tooling: { implementer: implementer, gates: [security-auditor, code-reviewer], skills: [], guards: [arch-check], mcp: [] }
  - id: selfprotect-shell-words
    scope_id: selfprotect-shell-words
    project: .
    depends_on: [config-keys-protected]
    module: scripts/pre-guard.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/pre-guard.mjs, scripts/lib/shell-words.mjs]
      docs: [docs/architecture/state.rules.md, docs/architecture/safety.rules.md]
      write: [scripts/pre-guard.mjs, scripts/pre-guard.test.mjs, docs/architecture/safety.rules.md, docs/architecture/state.rules.md, .craftsman/acceptance.md]
    arch: [ARCH-STATE-06, ARCH-SAFETY-05]
    tooling: { implementer: implementer, gates: [security-auditor, code-reviewer], skills: [], guards: [arch-check], mcp: [] }
  - id: script-authority-in-scripts
    scope_id: script-authority-in-scripts
    project: .
    depends_on: []
    module: scripts/doc-write.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/doc-write.mjs, scripts/toggle.mjs, scripts/goal-token.mjs, scripts/lib/core.mjs]
      docs: [docs/architecture/state.rules.md, docs/architecture/safety.rules.md]
      write: [scripts/doc-write.mjs, scripts/toggle.mjs, scripts/script-authority.test.mjs, docs/architecture/safety.rules.md, docs/architecture/state.rules.md, .craftsman/acceptance.md]
    arch: [ARCH-STATE-06, ARCH-SAFETY-05]
    tooling: { implementer: implementer, gates: [security-auditor, code-reviewer], skills: [], guards: [arch-check], mcp: [] }
  - id: bypass-flags-3
    scope_id: bypass-flags-3
    project: .
    depends_on: [selfprotect-shell-words]
    module: scripts/pre-guard.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/pre-guard.mjs, scripts/lib/self-protect.mjs]
      docs: [docs/architecture/state.rules.md, docs/architecture/safety.rules.md]
      write: [scripts/pre-guard.mjs, scripts/pre-guard.test.mjs, scripts/lib/self-protect.mjs, scripts/lib/self-protect.test.mjs, README.md, docs/architecture/safety.rules.md, docs/architecture/state.rules.md, docs/architecture/safety.md, .craftsman/acceptance.md]
    arch: [ARCH-STATE-06, ARCH-SAFETY-03, ARCH-SAFETY-05]
    tooling: { implementer: implementer, gates: [security-auditor], skills: [], guards: [arch-check], mcp: [] }
  - id: prompt-failclosed
    scope_id: prompt-failclosed
    project: .
    depends_on: []
    module: hooks/run.sh
    language: shell
    security: high
    scope:
      read: [hooks/run.sh, scripts/orchestrate-scope-guard.mjs]
      docs: [docs/architecture/state.rules.md, docs/architecture/safety.rules.md]
      write: [hooks/run.sh, scripts/launcher.test.mjs, docs/architecture/safety.rules.md, docs/architecture/state.rules.md, .craftsman/acceptance.md]
    arch: [ARCH-STATE-05, ARCH-SAFETY-02]
    tooling: { implementer: implementer, gates: [security-auditor], skills: [], guards: [arch-check], mcp: [] }
  - id: stop-loopguard-reports
    scope_id: stop-loopguard-reports
    project: .
    depends_on: []
    module: scripts/stop-gate.mjs
    language: javascript
    security: normal
    scope:
      read: [scripts/stop-gate.mjs, scripts/lib/doc-snapshot.mjs, scripts/lib/unpushed.mjs]
      docs: [docs/architecture/state.rules.md, docs/architecture/safety.rules.md]
      write: [scripts/stop-gate.mjs, scripts/stop-gate.test.mjs, docs/architecture/safety.rules.md, docs/architecture/state.rules.md, .craftsman/acceptance.md]
    arch: [ARCH-STATE-04, ARCH-SAFETY-06, ARCH-SAFETY-10]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [arch-check], mcp: [] }
  - id: followup-skill-record
    scope_id: followup-skill-record
    project: .
    depends_on: [script-authority-in-scripts]
    module: scripts/lib/core.mjs
    language: javascript
    security: high
    scope: { read: [scripts/lib/core.mjs], docs: [docs/architecture/state.rules.md, docs/architecture/safety.rules.md], write: [scripts/lib/core.mjs] }
    arch: [ARCH-STATE-06, ARCH-SAFETY-05]
    tooling: { implementer: implementer, gates: [security-auditor], skills: [], guards: [arch-check], mcp: [] }
  - id: followup-md-dirty-marker
    scope_id: followup-md-dirty-marker
    project: .
    depends_on: []
    module: scripts/quality-gate.mjs
    language: javascript
    security: normal
    scope: { read: [scripts/quality-gate.mjs], docs: [docs/architecture/state.rules.md], write: [scripts/quality-gate.mjs, scripts/stop-gate.test.mjs] }
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

### Round 2 (`/scrutinise --deep`, 792b8e4..5ef1ef9)
Isolated, 4 rounds (the cap, not dryness, stopped it), no Disputed, no open acceptance criteria; headline outcome UNMET. Findings 1, 2 and 8 re-confirmed in the code; the rest by probes against `pre-guard.mjs`, `scope.mjs` and `hooks/run.sh` in throwaway repos.

| Finding | Class / severity | Unit |
|---|---|---|
| `scope.mjs` gate list lacks the settings files: a model-made scope naming `.claude/settings.json` (or `.claude/**`) activates, then one Write sets `disableAllHooks` | Security / Critical | self-scoped-shared |
| `SAFETY_CONFIG_KEYS` names a `safety` key that does not exist; `protectedPaths`, `docWriteGuard`, `execution.agentMode`, `enabled` are freely editable; `env.NODE_OPTIONS` unprotected; NotebookEdit passes a scoped JSON file | Security / Critical | config-keys-protected |
| self-protection reads raw command text: `o""ff`, `crafts''man`, `cd .craftsman && touch off`, split filenames forge grants, command records, scopes | Security / Warning | selfprotect-shell-words |
| doc-write/toggle gate bypassed by quoting, variables, links, globs, `sh -c`, `xargs`, `node -e import()` | Security / Warning | script-authority-in-scripts |
| `git config set core.hooksPath`, `git -c alias.X=…`, `merge`/`rebase`/`am` skip flags, `.git/config` writes; two `sh -c` extractors | Correctness / Warning | bypass-flags-3 |
| node present but exit 2 on UserPromptSubmit still erases the prompt | Correctness / Warning | prompt-failclosed |
| loop-guard exit skips the unpushed and drift reports | Correctness / Warning | stop-loopguard-reports |
| a model Skill call counts as a typed command; toggle record ignores its argument | Security / Suggestion | followup-skill-record (PENDING) |
| every `*.md` edit skips the dirty marker though this repo's tests assert markdown | Correctness / Suggestion | followup-md-dirty-marker (PENDING) |
| none of the above pinned by a test | Test-coverage / Warning | folded into each step's red tests |

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

### Step 11 — self-scoped-shared (., javascript, high)
Depends on: none
- [ ] 11.0 Failing tests first (against 5ef1ef9) → accept: `scope.test` cases fail where a manifest with `write` of `.claude/settings.json`, `.claude/settings.local.json`, `.claude/**`, `**` or `.claude/*` activates with no /orchestrate run
- [ ] 11.1 New `scripts/lib/self-protect.mjs` exports the one `SELF_SCOPED` list (hooks.json, craftsman.config.json, both settings files) and `namesSelfScoped(writeEntries)` (entry equals, ends with, or its glob matches any of them) → accept: `self-protect.test` pins the list and the matcher, including `**`, `.claude/**`, `*.json`
- [ ] 11.2 `scope.mjs` (`:148-154`) and `pre-guard.mjs` (`:1022`) import both; no second copy remains → accept: grep finds one `SELF_SCOPED` definition (test reads the sources, as `craftsman-state.test` does); every case in 11.0 now exits 2 outside /orchestrate or /auto and 0 after /orchestrate
- [ ] 11.3 Full CI set (fix any arch-lint cite drift in `safety.rules.md`), tick `[unit:self-scoped-shared]`, commit `fix(guard): one SELF_SCOPED list gates scope activation and edits`

### Step 12 — config-keys-protected (., javascript, high)
Depends on: self-scoped-shared
- [ ] 12.0 Failing tests first → accept: red on 5ef1ef9 for each Write below
- [ ] 12.1 Protect in `craftsman.config.json`, outside a unit scope that names the file: `enabled`, `protectedPaths`, `docWriteGuard`, `execution.agentMode`, `execution.engine`, `stopGate`; delete the phantom `safety` key from `SAFETY_CONFIG_KEYS` (no key of that name exists in the config) (`pre-guard.mjs:~1023,1036`; the lists live in `lib/self-protect.mjs`) → accept: Writes of `{"protectedPaths":[]}`, `{"docWriteGuard":{"enabled":false}}`, `{"docWriteGuard":{"docPaths":[]}}`, `{"execution":{"agentMode":"subagents"}}`, `{"enabled":false}` are blocked; `maxFeedbackLines` and `timeoutMs` stay editable; a unit scope naming the file still allows
- [ ] 12.2 The settings projection adds `NODE_OPTIONS`, `NODE_PATH`, `PATH`, `CLAUDE_PLUGIN_ROOT` to the `CRAFTSMAN*` env keys → accept: Write of `{"env":{"NODE_OPTIONS":"--require x"}}` to `.claude/settings.json` is blocked; `{"env":{"DEBUG":"1"}}` stays allowed
- [ ] 12.3 A NotebookEdit whose after-state cannot be computed counts as changed for a scoped JSON file (`afterEdit` null with tool NotebookEdit) → accept: NotebookEdit of `.claude/settings.json` and of `craftsman.config.json` is blocked; of `analysis.ipynb` allowed
- [ ] 12.4 Full CI set, tick, commit `fix(guard): the config and settings keys that disable a guard are protected`

### Step 13 — selfprotect-shell-words (., javascript, high)
Depends on: config-keys-protected
- [ ] 13.0 Failing tests first, flag-free but quote-split forms → accept: red on 5ef1ef9 for each command below
- [ ] 13.1 `touch tee cp mv ln install mkdir truncate`, `dd of=`, `sed -i`, `perl -i` targets are write targets in `removedDocs`'s `dispatchAt` (the tokenizer that removes quotes and tracks cwd) and are matched by real path against `SELF_NEVER` and `SELF_SCOPED` (`pre-guard.mjs:~1057-1064`) → accept: `touch .craftsman/o""ff`, `touch .crafts''man/off`, `touch .craftsman/sessions/s1/doc-w""rite`, `tee .craftsman/sessions/s1/command""s.json`, `tee …/goal-token""s.json`, `tee …/sco""pe.json`, `ln -s .crafts''man x`, `cp x .craftsman/o''ff` blocked; `ls .craftsman`, `cat .craftsman/off`, `touch notes.txt` allowed
- [ ] 13.2 A `cd` into `.craftsman` (or any directory that resolves into it) followed by a write verb in the same command is refused → accept: `cd .craftsman && touch off`, `cd .craftsman; echo x > off`, `pushd .craftsman && touch off` blocked; `cd src && touch a.txt` allowed
- [ ] 13.3 Full CI set, tick, commit `fix(guard): self-protection reads shell words, not raw text`

### Step 14 — script-authority-in-scripts (., javascript, high)
Depends on: none
- [ ] 14.0 Failing tests first, driving the scripts directly (`scripts/script-authority.test.mjs`) → accept: red on 5ef1ef9: `doc-write.mjs on` and `toggle.mjs off` run with no command record
- [ ] 14.1 `doc-write.mjs on` refuses (exit 2, names the cause) unless `commandInvoked(CLAUDE_CODE_SESSION_ID, DOC_WRITER_COMMANDS)` holds; `toggle.mjs off` refuses unless the user typed `/craftsman:toggle` (`via:"prompt"`); `doc-write.mjs off` and `toggle.mjs on` stay open; a missing session id refuses (as `goal-token.mjs` does) → accept: with no record, with a record for another session, and with a record of another command each refuses; with the owning command's record each passes
- [ ] 14.2 Every pre-guard text bypass listed in the plan's findings reaches the same refusal: `node ".../doc-w""rite.mjs" on`, `N=node; $N …/doc-write.mjs on`, a symlinked `dw.mjs`, a glob, `sh -c 'node …/doc-w"r"ite.mjs on'`, `xargs node`, and `node --input-type=module -e "…import('…/toggle.mjs')"` → accept: each, executed in a throwaway project, leaves no grant and no `.craftsman/off`; the pre-guard text check stays as a second layer (its table still green)
- [ ] 14.3 Full CI set, tick, commit `fix(guard): doc-write and toggle check their own authority`

### Step 15 — bypass-flags-3 (., javascript, high)
Depends on: selfprotect-shell-words
- [ ] 15.0 Failing tests first, flag text by concatenation → accept: red on 5ef1ef9
- [ ] 15.1 `configBypasses` skips a leading `set`/`get`/`unset` subcommand (git 2.46+) and `-c alias.X=<value>` is read like `git config alias.X <value>` (`pre-guard.mjs:~903-915`) → accept: `git config set core.hooksPath x` and `git -c alias.ci='commit -n' ci -m x` blocked; `git config get core.editor` and `git -c alias.st=status st` allowed
- [ ] 15.2 The skip-flag scan covers `merge`, `rebase`, `am`, `cherry-pick` as well as `commit` and `push` (`:~972`) → accept: those four with the no-verify flag blocked; `git merge topic` allowed
- [ ] 15.3 `.git/config` and `.git/hooks/**` join `SELF_SCOPED`/`SELF_NEVER` (`lib/self-protect.mjs`) → accept: Write of `[core] hooksPath=…` to `.git/config` and of `.git/hooks/pre-commit` blocked, `git config user.name x` still allowed
- [ ] 15.4 One helper extracts a shell body for `sh|bash|zsh|dash|ksh -c` (flag cluster, `-o` option value, wrappers) and replaces both copies (`pre-guard.mjs:~640-650`, `~890-900`) → accept: `grep` finds one extractor; existing cases and `bash -lc`, `sh -o pipefail -c` stay green
- [ ] 15.5 README.md, `safety.rules.md` ARCH-SAFETY-03/05 and `safety.md` limits say what Steps 11-15 enforce and what remains (interpreter-written files, run-time-built command text) → accept: `safety-docs.test` green; every new claim names its test
- [ ] 15.6 Full CI set, tick, commit `fix(guard): git config set, -c alias, merge/rebase/am and .git/config`

### Step 16 — prompt-failclosed (., shell, high)
Depends on: none
- [ ] 16.0 Failing tests first (`launcher.test.mjs`) → accept: red on 5ef1ef9
- [ ] 16.1 With node present, `orchestrate-scope-guard` on UserPromptSubmit maps ANY non-zero exit (2 included) to the "prompt was not checked" `systemMessage` and exit 0 (`hooks/run.sh:~54-70`); other events and the other two safety hooks keep their codes → accept: fixture guard exiting 2 on a prompt payload gives 0 + message; the same fixture on PostToolUse still gives 2; `pre-guard` fixture exit 2 stays 2
- [ ] 16.2 `run.sh` unsets `NODE_OPTIONS` before it starts a safety hook (a second layer for the settings `env` route) → accept: a fixture hook printing `process.env.NODE_OPTIONS` shows it empty for `pre-guard.mjs`/`agent-mode-guard.mjs`/`orchestrate-scope-guard.mjs` and untouched for an advisory hook
- [ ] 16.3 Full CI set (fix cites in `safety.rules.md` ARCH-SAFETY-02/11), tick, commit `fix(launcher): a failed prompt hook cannot erase the prompt, NODE_OPTIONS is cleared for safety hooks`

### Step 17 — stop-loopguard-reports (., javascript, normal)
Depends on: none
- [ ] 17.0 Failing tests first → accept: red on 5ef1ef9: with `stop_hook_active:true`, unpushed work and a drifted guarded doc, Stop prints nothing
- [ ] 17.1 The loop guard (`stop-gate.mjs:~53`) emits the unpushed notice and the unseen-doc report as a `systemMessage` before it exits, without blocking; reports computed once, not twice, on the normal path (`:~360-381`) → accept: the three cases print the report with `stop_hook_active:true`; a clean repo prints nothing; `CRAFTSMAN_SAFETY=off` prints nothing
- [ ] 17.2 Full CI set (fix cites in `safety.rules.md` ARCH-SAFETY-06/10 and `state.rules.md`), tick, commit `fix(stop): the loop-guard Stop still reports unpushed work and doc drift`

## Sequencing
Steps 2 → 3 → 4 → 6 → 8 share `pre-guard.mjs` and run in that order; step 6 also needs step 5 (`stop-gate.mjs`). Steps 1, 5 and 7 are independent and can run first. Step 9 follows 1 (both `core.mjs`), step 10 follows 6.

Round 2: steps 11 → 12 → 13 → 15 share `pre-guard.mjs` and `lib/self-protect.mjs` and run in that order. Steps 14, 16 and 17 are independent of them and of each other (14 reads `core.mjs` only; 16 touches `run.sh`; 17 touches `stop-gate.mjs`). The two follow-up rows (`followup-skill-record`, `followup-md-dirty-marker`) stay PENDING: each needs a decision first.

## Verification background
- Evidence: every Critical and the bypass Warnings were reproduced by spawning `scripts/pre-guard.mjs` against throwaway git repos (probe harness and case files in the scrutiny session's scratchpad: `probe.mjs`, `probe2.mjs`, `cases1-3.json`, `seq1-4.json`); this plan's author re-ran the node-option, two-call, `env -u` and `git config` forms and confirmed exit 0 on c27533d.
- Folded: the scrutineer's U9 (test-coverage) is each step's task N.0 red cases, not a separate unit.
- Split from the request: the single "markers" unit became steps 1 and 2, and the "small correctness" unit became steps 9 and 10, because `pre-guard.mjs` (63.7 KB) plus `core.mjs` (53.4 KB) alone exceed `execution.unitContextBytes` (ARCH-ENGINE-08).
- CONSUMERS: `grantMtime` is private to `core.mjs` and used by `hasDocWriteGrant` (`core.mjs:221-242`), consumed by `pre-guard.mjs` and `scripts/doc-write.mjs`; `enabled()` is consumed by every hook script and by `guardState` (consumed by `session-context.mjs:38`); `SELF_NEVER`/`selfKind` are private to `pre-guard.mjs`; `recordCommand`/`commandInvoked` are consumed by `orchestrate-scope-guard.mjs`, `scope.mjs`, `goal-token.mjs`, `pre-guard.mjs`; the allowed `preguard` event is consumed only by `doc-snapshot.mjs:unseenDocChanges` via `stop-gate.mjs`.

- Round 2 CONSUMERS: `SELF_SCOPED` (new `lib/self-protect.mjs`) is read by `scope.mjs:148-154` and `pre-guard.mjs` (`selfKind`, the Bash scan, `scopedMentioned`); `SAFETY_CONFIG_KEYS` and `safetyProjection` are private to `pre-guard.mjs`; `doc-write.mjs` and `toggle.mjs` are run by `commands/plan.md`, `orchestrate.md`, `sync-docs.md`, `idea.md`, `architect.md`, `builtin-check.md`, `toggle.md` (every owning command must still pass the new self-check: step 14.2's allowed rows); `hooks/run.sh` is called by every `hooks/hooks.json` entry; the Stop notice is read by `stop-gate.mjs` only.
- Round 2 evidence: probes `harness.mjs`, `p1.mjs`–`p8.mjs` of the scrutineer (scratchpad `probe/`), and `scratchpad/check-r2.mjs`.

## Risk & rollback
- Step 2's realpath resolution runs on every Bash hit: keep it to targets that already matched a self-protected name, so the guard's latency does not grow.
- Step 3 widens a gate that blocks `doc-write.mjs on`: the owning commands must still pass (the existing 8.1 cases pin it).
- Step 7 changes launcher exit codes for safety hooks: the advisory path must keep its codes.
- Rollback: one commit per step; revert in reverse order.
- Step 12 widens what a session may not edit in `craftsman.config.json`: a user who asks the model to change `protectedPaths` now gets a refusal naming the cause; they edit it themselves or run `/orchestrate` with a unit scope that names the file.
- Step 14 makes `doc-write.mjs on` depend on a command record: a headless run with no `CLAUDE_CODE_SESSION_ID` refuses; the owning commands record themselves before they call it.

## Out of scope (flagged, not driven)
- Moving the `failClosed` + handler block, copied in `pre-guard.mjs:21-36`, `agent-mode-guard.mjs:56-71` and `orchestrate-scope-guard.mjs:72-87`, into `core.mjs`: a Suggestion whose unit would read `pre-guard.mjs` and `core.mjs` together and exceed the context cap; the three copies are pinned by the same test.
- Runtime-only: whether the mod's `$.fs.list` `mtimeMs` equals Node's `statSync().mtimeMs` (a mismatch fails safe: no goal launches).
- By design: a goal token proves only that `/instruction` or `/auto` ran in the last hour, so a model under injection during `/auto` can still mint one.
- Unknown: whether Claude Code itself prompts before a tool writes `.claude/settings*.json` (step 8 closes the craftsman side regardless).
- Follow-ups, PENDING, not driven: `followup-skill-record` (a model Skill call counts as a typed command in `core.mjs:621`, `scope.mjs:152`, `goal-token.mjs:17`; the toggle record ignores its argument: decide whether a Skill-invoked /orchestrate is legitimate under /auto, then document or require `via:"prompt"`), `followup-md-dirty-marker` (`quality-gate.mjs:54` exempts every `*.md`; this repo's own tests assert markdown).
- Runtime-only, unproven: whether Claude Code applies `.claude/settings.json` `env` and `disableAllHooks` mid-session or on the next start (either way it persists); whether NotebookEdit refuses a non-`.ipynb` target; that exit 2 on UserPromptSubmit erases the prompt (from documented hook semantics); docs merged from a worktree after an orchestrated landing may show as unseen drift (informational).
- The launcher's filter assumes `CLAUDE_PROJECT_DIR` is set for hooks; session-end's 8 s git timeout times many worktrees against a 20 s budget.
