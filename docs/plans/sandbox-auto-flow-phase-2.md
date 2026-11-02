---
slug: sandbox-auto-flow-phase-2
goal: An unattended /craftsman:auto run under the Claude Code sandbox stops being blocked by craftsman's own guards: the network queue is protected and validated, command records and the scope marker last as long as their run, init offers the sandbox hosts and the auto-mode entry, and scratch files can be written
level: feature
priority: P1
classification: in-scope (phase 2 of sandbox-auto-flow; decided by /architect 2026-11-01, amended 2026-11-02 with the owner, merged as rules 5455f9c and the LAND-36 / SAFETY-16 amendment)
tracker_rows: [TRACKER#prettier-ignore, TRACKER#command-records, TRACKER#marker-lifecycle, TRACKER#init-settings, TRACKER#network-drain, TRACKER#guard-paths, TRACKER#guard-heredoc, TRACKER#phase2-changelog]
guards:
  blast_radius: done
  completeness_sweep: done
  blind_rederivation: skipped(config:never)
coverage:
  contract:      2.1-2.2 (commandInvoked default lifetime, callers unchanged), 4.3-4.6 (new exports projectSettingsBlock, mergeUserSettings, NETWORK_STEP_ALLOW), 5.2-5.4 (drainQueue signature, enqueuePush loses `upstream`); consumers in CONSUMERS
  data:          5.4 (a legacy queue entry carrying `upstream: true` still drains)
  config:        1.2 (.prettierignore), 4.6 (user settings path, CLAUDE_CONFIG_DIR)
  security:      6.1-6.4 (queue protection, scratch Write/Edit), 7.1-7.3 (heredoc narrowing), 5.1-5.2 (drain validation); security-auditor gate on units 5, 6 and 7
  tests:         every unit starts with red rows (1.1, 2.1, 3.1/3.3, 4.1/4.3/4.5/4.7, 5.1/5.3, 6.1/6.3, 7.1); mutation checks 6.5, 7.3
  observability: 5.1-5.2 (drain_refused event)
  interface:     4.6 (init --user-settings-diff/-write), 4.8 (commands/init.md), 5.5 (commands/_network.md)
  docs:          2.3, 3.5, 4.9, 5.6, 6.6, 7.4 (cites re-pointed by the unit that moves them), 8.1 (CHANGELOG)
  rollback:      one merge commit per unit; units 6 and 7 are separate so one bypass found in review reverts alone
units:
  - id: 1
    scope_id: prettier-ignore
    project: .
    depends_on: []
    module: .prettierignore
    language: javascript
    security: normal
    scope:
      read: []
      docs: []
      write: [.prettierignore, scripts/prettier-ignore.test.mjs]
    arch: []
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [test-driven-development], guards: [], mcp: [] }
  - id: 2
    scope_id: command-records
    project: .
    depends_on: [prettier-ignore]
    module: scripts/lib/core.mjs commandInvoked, recordCommand
    language: javascript
    security: high
    scope:
      read: [scripts/lib/core.mjs]   # core.test.mjs is 56 KB: grep -n "commandInvoked\|recordCommand" first, read by range with Bash
      docs: [docs/architecture/state.rules.md, docs/architecture/safety.rules.md]
      write: [scripts/lib/core.mjs, scripts/lib/core.test.mjs, docs/architecture/state.rules.md, docs/architecture/safety.rules.md]   # rules docs: cite: line ranges only
    arch: [ARCH-SAFETY-13, ARCH-STATE-02]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [test-driven-development], guards: [arch-check], mcp: [] }
  - id: 3
    scope_id: marker-lifecycle
    project: .
    depends_on: [prettier-ignore]
    module: scripts/orchestrate-scope-guard.mjs, scripts/session-context.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/orchestrate-scope-guard.mjs, scripts/orchestrate-scope-guard.test.mjs, scripts/session-context.mjs, scripts/session-context.test.mjs, scripts/scope.mjs]
      docs: [docs/architecture/auto.rules.md, docs/architecture/safety.rules.md, docs/architecture/state.rules.md]
      write: [scripts/orchestrate-scope-guard.mjs, scripts/orchestrate-scope-guard.test.mjs, scripts/session-context.mjs, scripts/session-context.test.mjs, docs/architecture/auto.rules.md, docs/architecture/safety.rules.md, docs/architecture/state.rules.md]   # rules docs: cite: line ranges only
    arch: [ARCH-AUTO-11, ARCH-AUTO-10, ARCH-SAFETY-04, ARCH-STATE-03]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [test-driven-development], guards: [arch-check], mcp: [] }
  - id: 4
    scope_id: init-settings
    project: .
    depends_on: [prettier-ignore]
    module: scripts/lib/settings-merge.mjs, scripts/init.mjs, commands/init.md
    language: javascript
    security: normal
    scope:
      read: [scripts/lib/settings-merge.mjs, scripts/lib/settings-merge.test.mjs, scripts/init.mjs, scripts/init.test.mjs, commands/init.md]
      docs: [docs/architecture/safety.rules.md, docs/architecture/slim.rules.md, docs/architecture/plan.rules.md]
      write: [scripts/lib/settings-merge.mjs, scripts/lib/settings-merge.test.mjs, scripts/init.mjs, scripts/init.test.mjs, commands/init.md, docs/architecture/safety.rules.md]   # safety.rules.md: cite: line ranges only
    arch: [ARCH-SAFETY-16, ARCH-SAFETY-12, ARCH-SAFETY-10, ARCH-SLIM-01, ARCH-SLIM-02, ARCH-PLAN-04]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [test-driven-development], guards: [arch-check], mcp: [] }
  - id: 5
    scope_id: network-drain
    project: .
    depends_on: [init-settings]
    module: scripts/lib/network.mjs, scripts/repo-exec.mjs drain call, commands/_network.md
    language: javascript
    security: high
    scope:
      read: [scripts/lib/network.mjs, scripts/network.test.mjs, commands/_network.md, scripts/repo-exec.mjs]   # repo-exec.test.mjs is 65 KB: grep -n "queue\|drain" first, read by range with Bash
      docs: [docs/architecture/landing.rules.md, docs/architecture/engine.rules.md, docs/architecture/slim.rules.md]
      write: [scripts/lib/network.mjs, scripts/network.test.mjs, scripts/repo-exec.mjs, scripts/repo-exec.test.mjs, commands/_network.md, docs/architecture/landing.rules.md, docs/architecture/engine.rules.md]   # rules docs: cite: line ranges only
    arch: [ARCH-LAND-36, ARCH-LAND-35, ARCH-LAND-19, ARCH-ENGINE-19, ARCH-SLIM-01, ARCH-SLIM-02]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [test-driven-development], guards: [arch-check], mcp: [] }
  - id: 6
    scope_id: guard-paths
    project: .
    depends_on: [command-records, marker-lifecycle, init-settings, network-drain]
    module: scripts/lib/self-protect.mjs, scripts/pre-guard.mjs queue protection and scratch Write/Edit
    language: javascript
    security: high
    scope:
      read: [scripts/lib/self-protect.mjs]   # pre-guard.mjs is ~135 KB and pre-guard.test.mjs ~160 KB: grep -n first, read by range with Bash (ARCH-ENGINE-08); edit .mjs by exact-match splice
      docs: [docs/architecture/safety.rules.md, docs/architecture/state.rules.md]
      write: [scripts/lib/self-protect.mjs, scripts/pre-guard.mjs, scripts/pre-guard.test.mjs, scripts/pre-guard-queue.test.mjs, docs/architecture/safety.rules.md, docs/architecture/state.rules.md]   # rules docs: cite: line ranges only
    arch: [ARCH-SAFETY-13, ARCH-STATE-18, ARCH-STATE-16]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [test-driven-development], guards: [arch-check], mcp: [] }
  - id: 7
    scope_id: guard-heredoc
    project: .
    depends_on: [guard-paths]
    module: scripts/pre-guard.mjs setter check
    language: javascript
    security: high
    scope:
      read: []   # grep -n "SETS_SAFETY_VAR\|safetyText\|inertNodeE" scripts/pre-guard.mjs first, read by range with Bash
      docs: [docs/architecture/safety.rules.md, docs/architecture/state.rules.md]
      write: [scripts/pre-guard.mjs, scripts/pre-guard-heredoc.test.mjs, docs/architecture/safety.rules.md, docs/architecture/state.rules.md]   # rules docs: cite: line ranges only
    arch: [ARCH-SAFETY-13, ARCH-SAFETY-15, ARCH-STATE-16]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [test-driven-development], guards: [arch-check], mcp: [] }
  - id: 8
    scope_id: phase2-changelog
    project: .
    depends_on: [guard-heredoc]
    module: CHANGELOG.md
    language: javascript
    security: normal
    scope:
      read: [CHANGELOG.md]
      docs: [docs/architecture/slim.rules.md]
      write: [CHANGELOG.md]
    arch: [ARCH-SLIM-08]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [], mcp: [] }
---

# Plan: sandbox-auto-flow phase 2

## Outcome
The six decided rules that phase 1 merged as docs now have code: the network push queue cannot be written by a tool call and the drain validates every entry (base only in direct-land mode); command records last the session; the scope-required marker ends with its /orchestrate run; init offers the origin hosts and, separately, one user-scope `autoMode.allow` entry; a scoped Write or Edit may take scratch files; and a quoted heredoc that merely names a safety variable is no longer refused. `/craftsman:auto` under the sandbox no longer needs a human at each of these.

## Decisions already made (do not re-decide; a conflict PARKs the unit and routes to /architect)
Rules in `docs/architecture/{safety,state,landing,auto}.rules.md`: ARCH-SAFETY-13, -15, -16; ARCH-STATE-18; ARCH-AUTO-11; ARCH-LAND-35, -36. Owner answers 2026-11-02: base drains only in direct-land mode (`planning.featureBranches` off; the runner's `repo-exec merge` pushes base, `repo-exec.mjs:411`); guard units run last and a conflict with the other session's `pre-guard.mjs` rounds PARKs; `.prettierignore` first; `repo-exec.mjs:92` (`attachDetached`) stays in `followup-set-upstream-writers`.

## Scope Steps (executable core)
House rules for every step: the first commit is the red test; `.mjs` files are edited by exact-match replacement (Bash, a node splice that aborts unless the anchor matches once), never the Edit tool, until step 1 has merged; a unit that moves lines cited in a rules doc re-points those cites in the same unit (cite text only); the full suite and `node scripts/arch-check.mjs lint` are green before the merge.

### Step 1 — prettier-ignore (., javascript, normal)
Tooling: implementer implementer · gates code-reviewer · skills test-driven-development
Depends on: none
- [ ] 1.1 Add `scripts/prettier-ignore.test.mjs`: `prettier --file-info <file>` reports `"ignored": true` for `scripts/pre-guard.mjs`, `scripts/lib/core.mjs`, `scripts/pre-guard.test.mjs`, `workflows/run.js` and `hooks/register.js`; the test skips cleanly when `prettier` is not on the PATH → accept: the rows fail on main (`ignored: false`)
- [ ] 1.2 Add `.prettierignore` with a header comment (hand-formatted sources; the quality gate runs `prettier --write` on every Edit or Write, which rewrote whole files) listing `scripts/`, `workflows/`, `hooks/` → accept: 1.1 green, and `prettier --write --log-level silent scripts/lib/core.mjs` followed by `git diff --stat scripts/lib/core.mjs` shows nothing
- [ ] 1.3 Run `node --test scripts/*.test.mjs scripts/lib/*.test.mjs` → accept: exit 0
- [ ] 1.4 At close-out, root cancels the follow-up row `followup-quality-gate-prettier` through `tracker.mjs` with this unit's merge sha as evidence → accept: the row shows CANCELLED with that evidence

### Step 2 — command-records (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor · skills test-driven-development · guards arch-check
Depends on: prettier-ignore
- [ ] 2.1 RED rows in `scripts/lib/core.test.mjs` beside :816: every doc-writer record (`plan`, `orchestrate`, `auto`, `sync-docs`, `idea`, `architect`, `builtin-check`, `instruction`) is still honoured 25 h after its `at`; `toggle`'s record expires after one hour and still needs `via: "prompt"`; a typed (`prompt`) record outranks a later `skill` record for the same command at any age (except toggle's, after its hour) → accept: the rows fail on main (one-hour expiry for all)
- [ ] 2.2 In `scripts/lib/core.mjs` (`COMMAND_TTL_MS` ~:641, `recordCommand` ~:643, `commandInvoked` ~:653) make the lifetime a function of the command name: one hour for `toggle`, none for every other record; an explicit `ttlMs` option still wins; the typed-outranks check in `recordCommand` uses the same function; no caller changes → accept: 2.1 green, and `node --test scripts/lib/core.test.mjs scripts/goal-token.test.mjs scripts/scope.test.mjs scripts/pre-guard-docclean.test.mjs` exit 0
- [ ] 2.3 Re-point the rules cites into `core.mjs` that 2.2 moved (cite text only) → accept: `node --test scripts/safety-cites.test.mjs scripts/safety-claims.test.mjs scripts/safety-docs.test.mjs` and `node scripts/arch-check.mjs lint` pass
- [ ] 2.4 Run `node --test scripts/*.test.mjs scripts/lib/*.test.mjs` → accept: exit 0

### Step 3 — marker-lifecycle (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor · skills test-driven-development · guards arch-check
Depends on: prettier-ignore
- [ ] 3.1 RED rows in `scripts/session-context.test.mjs` beside :87: SessionStart arms the scope-required marker only when the session's `handoff.json` lists remaining units (`remaining_units` a non-empty array); a closing hand-off (`remaining_units: []`) and one without the field arm nothing → accept: the closing and field-less rows fail on main
- [ ] 3.2 In `scripts/session-context.mjs` (:162-168) arm only for a non-empty `remaining_units` → accept: 3.1 green
- [ ] 3.3 RED rows in `scripts/orchestrate-scope-guard.test.mjs` with a session-level scope file and marker present: a TYPED prompt (`input.prompt`) for any recognized craftsman command other than /orchestrate and /auto (`plan`, `sync-docs`, `idea`, `architect`, `scrutinise`, `instruction`, `toggle`, `builtin-check`) removes both; the same command as a Skill call removes neither; a typed /orchestrate re-arms and a typed /auto touches nothing; while `autoActive(sid)` is true nothing is removed; a worktree-keyed scope, binding and marker (names with a `-<16 hex>` suffix) are never removed → accept: the clearing rows fail on main
- [ ] 3.4 In `scripts/orchestrate-scope-guard.mjs`, after the command is recorded (:113) and before the orchestrate branch (:118): on the prompt route, for a recognized command other than orchestrate/auto and `!autoActive(sid, context)`, remove `requiredFile({ session_id })` and `scopeFile({ session_id })` (the session-level names from `scripts/scope.mjs:62-63`, no worktree key) → accept: 3.3 green
- [ ] 3.5 Re-point cites into `session-context.mjs`, `orchestrate-scope-guard.mjs` (cite text only) → accept: lint and the three safety doc tests pass
- [ ] 3.6 Run `node --test scripts/*.test.mjs scripts/lib/*.test.mjs` → accept: exit 0

### Step 4 — init-settings (., javascript, normal)
Tooling: implementer implementer · gates code-reviewer · skills test-driven-development · guards arch-check
Depends on: prettier-ignore
- [ ] 4.1 RED rows in `scripts/lib/settings-merge.test.mjs`: `originHostOf("host:/srv/r.git")` is `host`; `git@host:/srv/r.git`, https, ssh and `user@host:path` unchanged; `C:\srv\r.git` and `D:/srv/r.git` still null (round 3 finding R3-S1) → accept: the new row fails on main
- [ ] 4.2 In `originHostOf` (`settings-merge.mjs:87-95`) make the `user@` part of the absolute-path alternative optional, after the drive-path check → accept: 4.1 green
- [ ] 4.3 RED rows: new export `projectSettingsBlock(hosts)` returns `SANDBOX_BLOCK` plus `sandbox.network.allowedDomains` for the given hosts and no `excludedCommands`; merging it twice is a no-op; a host already covered by an existing entry or a `*.` wildcard of the file is not added; existing keys are kept → accept: fails on main (no export)
- [ ] 4.4 In `scripts/init.mjs` (`previewSandboxSettings` :480, `applySandboxSettings` :485) build the block from `projectSettingsBlock(originHostsOf(root))`, where `originHostsOf` reads every project of the workspace manifest (`loadWorkspaceManifest`, `scripts/lib/core.mjs:105`; else the current project) with `git -C <root> remote get-url origin`, a 2 s limit, failing open, de-duplicated → accept: 4.3 green and `scripts/init.test.mjs` rows show the hosts in the `--settings-diff` preview and in nothing else
- [ ] 4.5 RED rows: new export `NETWORK_STEP_ALLOW` (prose, no plugin-cache path or hash) names `repo-exec.mjs`, the `network` action with `fetch, drain or status`, that it needs the user's git credentials the sandbox hides, that it fetches origin and pushes the run's own unit and feature branches and the base branch only in direct-land mode (`planning.featureBranches` off), never forced; new export `mergeUserSettings(text)` (a new file gets `autoMode.allow: ["$defaults", NETWORK_STEP_ALLOW]`; an existing `autoMode.allow` gets the entry appended and `$defaults` is not added; idempotent; every other key kept; never `sandbox.credentials`, `network.tlsTerminate`, a `permissions.allow` rule or a credential directory) → accept: fails on main
- [ ] 4.6 Implement 4.5 and add `--user-settings-diff` and `--user-settings-write` to `scripts/init.mjs` (the mode list at :505): the file is `<CLAUDE_CONFIG_DIR or ~/.claude>/settings.json`; the diff is shown first and nothing is written without the write flag; the old file is backed up under `.craftsman/init-backups/<ts>/user/settings.json`; a write that fails (read-only or sandbox-denied) prints the path and the diff and exits non-zero instead of throwing; the project and user offers stay separate → accept: `scripts/init.test.mjs` rows (temp `CLAUDE_CONFIG_DIR`, read-only dir) pass
- [ ] 4.7 RED then green row in `scripts/lib/settings-merge.test.mjs`: the gap line and the docker detail are unchanged by this unit → accept: existing rows still green
- [ ] 4.8 `commands/init.md` §6: replace the sentence that says the user adds network domains with what init now offers (the origin hosts in the project block; separately, one user-scope entry shown as a diff first; the docker exclusion stays the user's and runs docker outside the sandbox), trimming non-MUST prose elsewhere in the file so it stays at or under 4,890 bytes (ARCH-SLIM-02: the cap only goes down; ARCH-SLIM-06: no MUST sentence leaves) → accept: `node scripts/doc-size-policy.mjs` PASS and `wc -c commands/init.md` ≤ 4890
- [ ] 4.9 Re-point cites into `settings-merge.mjs` that moved (ARCH-SAFETY-12/16 at :9-12 and :24-35; cite text only) → accept: lint and the three safety doc tests pass; then run `node --test scripts/*.test.mjs scripts/lib/*.test.mjs` → accept: exit 0

### Step 5 — network-drain (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor · skills test-driven-development · guards arch-check
Depends on: init-settings (the entry text it names is `NETWORK_STEP_ALLOW`)
- [ ] 5.1 RED rows in `scripts/network.test.mjs` with forged queue entries: a push of `main` is refused in feature mode and drains in direct-land mode; pushes of `feat/x` and `feature/p-f1` drain in both; a push of `develop`, `refs/tags/x`, `+main` or a dst containing `..` is refused; a delete of `feat/x` drains, a delete of `main` or `feature/p-f1` is refused; every refusal is logged `drain_refused {kind, dst, reason}`, leaves the queue and is returned in the drain's `rejected` list so it PARKs; the other entries still drain; nothing is forced → accept: the refusal rows fail on main
- [ ] 5.2 In `scripts/lib/network.mjs` add the pure `drainVerdict(entry, { baseBranch, directLand })` and use it in `drainQueue(root, info, { directLand })` (:145-171); in `scripts/repo-exec.mjs` pass `directLand: loadConfig(context).planning?.featureBranches !== true` at the drain call (:827) and add a `drain-refused` entry to the PARK decisions (:704-735) whose question names the refused dst → accept: 5.1 green
- [ ] 5.3 RED row in `scripts/repo-exec.test.mjs` or `scripts/network.test.mjs` (extend the offline test at network.test.mjs:60): an offline sandboxed unit merge in direct-land mode queues dst base and the root drain pushes it → accept: stays green with 5.2 and fails if the base rule is removed (one temporary mutation, not committed)
- [ ] 5.4 Remove the `upstream` parameter from `enqueuePush` (:122, :127) and the drain's `branch --set-upstream-to` (:156); a legacy queue entry with `upstream: true` still drains and sets nothing; the caller at `repo-exec.mjs:53` is unchanged → accept: a test drains such an entry and `git config --local --get-regexp '^branch\.'` is empty
- [ ] 5.5 `commands/_network.md` and the `FIX` text (`network.mjs:12`): name the user-scope `autoMode.allow` entry (the one `/craftsman:init --user-settings-diff` shows) and say that a classifier refusal (`[Safety Bypass Flag]`, `[Auto-Mode Bypass]`) is handled like `needs_network`: stop, name the one command, park nothing; net growth ≤ 4 bytes (the file is 2,569 of its 2,573-byte cap): trim non-MUST prose in the same file → accept: `node scripts/doc-size-policy.mjs` PASS
- [ ] 5.6 Re-point cites into `network.mjs` and `repo-exec.mjs` that moved, in `landing.rules.md` and `engine.rules.md` (cite text only; ARCH-LAND-36 cites `network.mjs:145-171` and `repo-exec.mjs:411`) → accept: lint passes; then run `node --test scripts/*.test.mjs scripts/lib/*.test.mjs` → accept: exit 0

### Step 6 — guard-paths (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor · skills test-driven-development · guards arch-check
Depends on: command-records, marker-lifecycle, init-settings, network-drain (guard units run last; a conflict with the other session's `pre-guard.mjs` rounds PARKs this unit with its branch kept)
- [ ] 6.1 RED rows in a new `scripts/pre-guard-queue.test.mjs`: a Write or Edit tool call, and `echo >>`, `tee`, `cp`, `mv` and `sed -i` in Bash, to `<git common dir>/.craftsman/network/queue.jsonl` (a relative path from the main checkout, and the absolute main-checkout path from a linked worktree session) exit 2; a Read of it exits 0; the existing `.craftsman/approvals/**` row still exits 2; `enqueuePush` run directly by node still writes the file → accept: the tool-call rows fail on main (probe 2026-11-02: both allowed)
- [ ] 6.2 Protect the queue: add the pattern to `SELF_NEVER` (`scripts/lib/self-protect.mjs:17-30`) and make `pre-guard.mjs`'s `mainRelOf`/`mainStateRel` (~:170-180) and `selfKind` (~:1709) judge the git common dir's `.craftsman/network/**` for a linked worktree → accept: 6.1 green
- [ ] 6.3 RED rows in `scripts/pre-guard.test.mjs` (flip :220-221): with a scope active, a Write and an Edit of a file whose real path is under the OS temp dir or `$CLAUDE_JOB_DIR/tmp` exit 0; NotebookEdit, Glob and Grep still exit 2; a symlink or `..` out, a file inside any governed root (any scope root, the session checkout, the active root), a scratch root that encloses a governed root, and an env file (`protectedPaths`) still exit 2; a relative or missing path still exits 2 → accept: the Write and Edit rows fail on main
- [ ] 6.4 In `pre-guard.mjs` (the scope check at ~:1322) pass Write and Edit through `insideScratchRoots` too, and make sure the later Write/Edit checks (doc-write guard, `selfKind` by real path, `protectedPaths`) still run for the target → accept: 6.3 green
- [ ] 6.5 Mutation checks, each with one temporary edit shown red then restored: drop the Write/Edit entry; drop the queue pattern → accept: each turns its own rows red; `git status` clean after
- [ ] 6.6 Update the two code comments that say only Read is implemented, then re-point every rules cite into `pre-guard.mjs` this unit moved (cite text only) → accept: lint and the three safety doc tests pass; then run `node --test scripts/*.test.mjs scripts/lib/*.test.mjs` → accept: exit 0

### Step 7 — guard-heredoc (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor · skills test-driven-development · guards arch-check
Depends on: guard-paths (same file; a loosening, kept separate so it reverts alone)
- [ ] 7.1 RED rows in a new `scripts/pre-guard-heredoc.test.mjs`: a quoted-tag heredoc (`<<'EOF'`, `<<"EOF"`, `<<-'EOF'`) fed to `cat`, `cat >file`, `tee`, `python3 -` or `node -` whose body names `CRAFTSMAN_SAFETY=off`, `CLAUDE_PROJECT_DIR=` or `export CLAUDE_CODE_SESSION_ID=` exits 0; these stay refused: an unquoted tag, `echo`/`printf` prose naming one, a heredoc whose head is `bash`, `sh`, `eval`, `source` or `env`, a real setter after the heredoc (`export CRAFTSMAN_SAFETY=off`), a heredoc inside `$(...)`; and a `--no-verify` inside a quoted body is still refused by the ARCH-STATE-16 scan → accept: the quoted-tag rows fail on main (probe 2026-11-02: refused)
- [ ] 7.2 In `pre-guard.mjs` (the setter check, `safetyText` ~:1776-1785) blank only the bodies of quoted-tag heredocs whose command word is `cat`, `tee`, `python3`, `python` or `node` (a new helper; `stripHeredocs` at ~:104 is not reusable because it drops unquoted bodies too); the bypass-flag scan keeps reading the whole command → accept: 7.1 green
- [ ] 7.3 Mutation checks: drop the command-word condition and drop the quote condition, each shown red then restored → accept: the unquoted-tag and echo rows (resp. the bash/sh rows) turn red; `git status` clean after
- [ ] 7.4 Re-point cites into `pre-guard.mjs` this unit moved (cite text only) → accept: lint and the three safety doc tests pass; then run `node --test scripts/*.test.mjs scripts/lib/*.test.mjs` → accept: exit 0

### Step 8 — phase2-changelog (., javascript, normal)
Tooling: implementer implementer · gates code-reviewer
Depends on: guard-heredoc
- [ ] 8.1 Extend the existing `## [Unreleased]` `### Fixed` bullet of this area (no new bullet): init offers the origin hosts and a separate user-scope `autoMode.allow` entry; the network drain validates every queued push and delete (base only in direct-land mode) and the queue is protected from tool calls; command records last the session; the scope-required marker ends with its run; a scoped Write and Edit may take scratch files; a quoted heredoc that names a safety variable is no longer refused → accept: `node --test scripts/changelog.test.mjs` passes ([Unreleased] stays under 8 KB, ARCH-SLIM-08)
- [ ] 8.2 Run `node --test scripts/*.test.mjs scripts/lib/*.test.mjs` → accept: exit 0

## Sequencing
The order is the topological order of `depends_on` and the owner's: `.prettierignore` first (it makes every later `.mjs` edit safe), the units that never touch `pre-guard.mjs` next (command-records, marker-lifecycle, init-settings, then network-drain, which names init's entry), the two `pre-guard.mjs` units last, then the changelog. The other session's guard rounds merge to main between these; every unit runs `repo-exec sync` right before its merge, and a conflict PARKs it. After the run: `/architect --update safety state landing auto` (the status lines under each Phase 2 section of the human docs say "not yet implemented" and must go) and `/craftsman:sync-docs --all sandbox-auto-flow-phase-2`.

## Verification background   (citations — for the reviewer, not the executor)
- Probes 2026-11-02 (architect --update): Write and `echo >>` to the queue allowed; a quoted heredoc naming `CRAFTSMAN_SAFETY=` refused; records expire after 1 h (`core.mjs:641`); `SANDBOX_BLOCK` holds only `enabled` and four asks (`settings-merge.mjs:9-12`); `drainQueue` validates nothing (`network.mjs:145-171`); `_network.md` names neither the entry nor the refusal path.
- Base pushes: `repo-exec.mjs:411` (`merge`), `:470`, `:634` (`land-feature`) queue `dst: info.base_branch`; the runner calls `merge` itself (`agents/unit-runner.md:28`); this repo is direct-land (`craftsman.config.json` `planning.featureBranches: false`); direct-land needs no verification point (ARCH-APPROVAL-08).
- The marker: re-armed on every resume by `session-context.mjs:162-168`; armed by `orchestrate-scope-guard.mjs:118-128`; session-level names `scope.mjs:62-63`.
- Formatter: the `javascript` profile runs `prettier --write` on `.mjs` (`craftsman.config.json` ~:183); the repo has no prettier config; `prettier --file-info scripts/pre-guard.mjs` reports `ignored: false` today.
- Byte budgets: `commands/init.md` 4,889 of 4,890 and `commands/_network.md` 2,569 of 2,573 (`scripts/doc-size-policy.mjs`); the shipped e2e-loop units were trimmed by this plan's /plan step (read lists of `workflow-spike` and `release-notes` in `docs/plans/autonomous-e2e-loop.md`) so `scope.mjs`, README and CHANGELOG may grow; units read `pre-guard.mjs` (135 KB) and its test (161 KB) by range only (ARCH-ENGINE-08).
- Strategist comparison (Option C accepted): per-rule units multiply `pre-guard.mjs` windows and re-point `safety.rules.md` line 23 each time; a single guard unit mixes a tightening with two loosenings and reverts them together.

CONSUMERS:
- `commandInvoked` (default lifetime changes, signature unchanged) → `scripts/goal-token.mjs:20`, `scripts/toggle.mjs:25`, `scripts/pre-guard.mjs` (goal-token, doc-write and toggle checks ~:1787-1793), `scripts/scope.mjs:174`, `scripts/doc-write.mjs:36`; `recordCommand` → `scripts/orchestrate-scope-guard.mjs:113` only.
- `requiredFile`, `scopeFile` (read-only use by the new clearing) → `scope.mjs:62-63`, `orchestrate-scope-guard.mjs:122`, `account-switch.mjs:505`, `session-context.mjs:167-168`.
- `projectSettingsBlock`, `mergeUserSettings`, `NETWORK_STEP_ALLOW` (new exports) → `scripts/init.mjs` only; `originHostOf` → `settings-merge.mjs:129` (`sandboxGaps`) and its tests; `sandboxGaps`/`sandboxGapLine` → `session-context.mjs:19, :68` (unchanged).
- `drainQueue(root, info, opts)` → `scripts/repo-exec.mjs:827` only; `enqueuePush` (loses `upstream`) → `repo-exec.mjs:53` only; `enqueueDelete` → `repo-exec.mjs:60`; `readQueue` → `network.mjs:106, :140, :146`, `repo-exec.mjs:814`.
- `SELF_NEVER` (new entry) → `scripts/pre-guard.mjs` (`selfKind`, `removedDocs`) and `scripts/lib/self-protect.mjs` consumers; the rules cites into the moved files are read by `scripts/safety-cites.test.mjs` and `arch-check.mjs lint`.

## Risk & rollback
- Units 6 and 7 edit a safety hook another session is also editing: a conflict PARKs the unit and keeps its branch; nothing is merged half-done. Each unit is one merge commit and reverts alone; 6 (a tightening plus a loosening) and 7 (a loosening) are separate so a bypass found in review reverts one without the other.
- Unit 3 changes when a guard condition is armed (the marker) and when it is cleared; a wrong clear would lift a unit scope, so only the session-level names are touched and worktree-keyed files never are (asserted).
- Unit 5 makes the drain refuse more than it did; a refusal PARKs with a decision and loses no entry silently.
- Unit 4 writes a user-level settings file only on its own explicit flag; a sandboxed init cannot, and prints the diff instead.

## Out of scope
- `repo-exec.mjs:92` (`attachDetached` writes upstream config): stays in `followup-set-upstream-writers`.
- The bracket POSIX classes (`followup-bracket-posix-classes`), `followup-scratch-root-cache-names`, `followup-pre-guard-helper-layout`, `followup-round3-suggestions` (R3-S1 is folded into step 4; R3-S2 and R3-S3 stay).
- Verifying that Claude Code honours `sandbox.network.allowedDomains` and what the auto-mode classifier does with the entry's prose: run `claude auto-mode critique` on the offered entry after the run.
