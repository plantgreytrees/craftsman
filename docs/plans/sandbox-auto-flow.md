---
slug: sandbox-auto-flow
goal: /craftsman:auto stops tripping the Claude Code sandbox on its own git calls and guard false positives, and SessionStart names the sandbox gaps that push sessions into unsandboxed retries.
level: feature
priority: P1
classification: in-scope (phase 1 of the /understand --deep sweep of 33 sessions, 2026-11-01; phase 2 routes to /architect, see "Open decision")
tracker_rows: [TRACKER#worktree-no-track, TRACKER#scope-ambiguous-outside-read, TRACKER#sandbox-gap-report, TRACKER#sandbox-bypass-stat, TRACKER#segmentre-range, TRACKER#init-doc-drift]
guards:
  blast_radius: done
  completeness_sweep: done
  blind_rederivation: skipped(config:never)
coverage:
  contract:      1.2, 1.3 (repo-exec git argv only; JSON stdin contract unchanged); 3.1 (new export sandboxGaps, one consumer session-context.mjs)
  data:          N/A(no persistence or migration; git config is no longer written)
  config:        3.1 (reads sandbox.* from settings files; writes nothing)
  security:      1.2 (no tracking config, so a bare push cannot target base), 2.1 (only Reads outside every project root skip the ambiguity block; Writes unchanged), 5.2 (fails closed as before)
  tests:         1.1, 2.1, 3.2, 4.1, 5.1
  observability: 4.1, 4.2 (sandbox_bypass event + stats line); auto-mode classifier denials N/A(happen after PreToolUse; no hook sees them)
  interface:     3.3 (SessionStart line), 4.2 (/craftsman:stats section)
  docs:          6.1, 6.2, 1.4, 2.2, 3.4
  rollback:      each unit is one merge commit; revert it. No state migration.
units:
  - id: worktree-no-track
    scope_id: worktree-no-track
    project: .
    depends_on: []
    module: scripts/repo-exec.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/repo-exec.mjs, scripts/lib/network.mjs, scripts/lib/unpushed.mjs]   # repo-exec.test.mjs is 61 KB: grep -n "worktree add\|push" first, read by range
      docs: [docs/architecture/landing.rules.md, docs/architecture/safety.rules.md]
      write: [scripts/repo-exec.mjs, scripts/repo-exec.test.mjs, docs/architecture/landing.rules.md]
    arch: [ARCH-LAND-19, ARCH-SAFETY-06]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [test-driven-development], guards: [arch-check], mcp: [] }
  - id: scope-ambiguous-outside-read
    scope_id: scope-ambiguous-outside-read
    project: .
    depends_on: []
    module: scripts/pre-guard.mjs
    language: javascript
    security: high
    scope:
      read: []   # pre-guard.mjs is ~107 KB and pre-guard.test.mjs ~143 KB: grep -n "scope_ambiguous\|activeScope\|activeRoot" first, then read by range (ARCH-ENGINE-08)
      docs: [docs/architecture/safety.rules.md, docs/architecture/state.rules.md]
      write: [scripts/pre-guard.mjs, scripts/pre-guard.test.mjs, docs/architecture/safety.rules.md, docs/architecture/state.rules.md]   # rules docs: cite: line ranges only
    arch: [ARCH-SAFETY-01, ARCH-SAFETY-03, ARCH-STATE-10]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [test-driven-development], guards: [arch-check], mcp: [] }
  - id: sandbox-gap-report
    scope_id: sandbox-gap-report
    project: .
    depends_on: []
    module: scripts/lib/settings-merge.mjs
    language: javascript
    security: normal
    scope:
      read: [scripts/lib/settings-merge.mjs, scripts/lib/settings-merge.test.mjs, scripts/session-context.mjs, scripts/session-context.test.mjs]
      docs: [docs/architecture/safety.rules.md, docs/architecture/state.rules.md]
      write: [scripts/lib/settings-merge.mjs, scripts/lib/settings-merge.test.mjs, scripts/session-context.mjs, scripts/session-context.test.mjs, docs/architecture/safety.rules.md]
    arch: [ARCH-SAFETY-01, ARCH-SAFETY-04, ARCH-SAFETY-10, ARCH-STATE-01]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [test-driven-development], guards: [arch-check], mcp: [] }
  - id: sandbox-bypass-stat
    scope_id: sandbox-bypass-stat
    project: .
    depends_on: [scope-ambiguous-outside-read]
    module: scripts/stats.mjs
    language: javascript
    security: normal
    scope:
      read: [scripts/stats.mjs, scripts/stats.test.mjs]   # pre-guard.mjs: grep -n "logEvent(" and read those ranges only
      docs: [docs/architecture/mod.rules.md, docs/architecture/safety.rules.md, docs/architecture/state.rules.md]
      write: [scripts/pre-guard.mjs, scripts/pre-guard.test.mjs, scripts/stats.mjs, scripts/stats.test.mjs]
    arch: [ARCH-MOD-03, ARCH-SAFETY-03, ARCH-STATE-16]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [test-driven-development], guards: [arch-check], mcp: [] }
  - id: segmentre-range
    scope_id: segmentre-range
    project: .
    depends_on: [sandbox-bypass-stat]
    module: scripts/pre-guard.mjs segmentRe
    language: javascript
    security: high
    scope:
      read: []   # pre-guard.mjs: read 214-230 (segmentRe) and grep -n "segmentRe(\|could not decide"; pre-guard.test.mjs by range
      docs: [docs/architecture/safety.rules.md, docs/architecture/state.rules.md]
      write: [scripts/pre-guard.mjs, scripts/pre-guard.test.mjs]
    arch: [ARCH-SAFETY-02, ARCH-SAFETY-03, ARCH-STATE-16]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [systematic-debugging, test-driven-development], guards: [arch-check], mcp: [] }
  - id: init-doc-drift
    scope_id: init-doc-drift
    project: .
    depends_on: [worktree-no-track, scope-ambiguous-outside-read, sandbox-gap-report, sandbox-bypass-stat, segmentre-range]
    module: commands/init.md
    language: markdown
    security: normal
    scope:
      read: [commands/init.md, scripts/lib/settings-merge.mjs, CHANGELOG.md]
      docs: [docs/architecture/slim.rules.md, docs/architecture/safety.rules.md]
      write: [commands/init.md, CHANGELOG.md]
    arch: [ARCH-SLIM-01, ARCH-SLIM-02, ARCH-SAFETY-12]
    tooling: { implementer: implementer, gates: [], skills: [], guards: [arch-check], mcp: [] }
---

# Plan: sandbox-auto-flow (phase 1)

## Outcome
/craftsman:auto stops tripping the Claude Code sandbox on its own git calls and guard false positives, and SessionStart names the sandbox gaps that push sessions into unsandboxed retries.

## Scope Steps (executable core)

### Step 1 — worktree-no-track (., javascript, high)
Tooling: implementer · gates code-reviewer, security-auditor · skills test-driven-development · guards arch-check
Depends on: none
- [ ] 1.1 In `scripts/repo-exec.test.mjs` add a failing test: a `prepare` that creates a new unit branch from `origin/<base>` leaves `git config --local --get-regexp '^branch\.<unit>\.'` empty; add a guard row that re-preparing an existing branch (`worktree add <path> <branch>`, no `-b`) also writes none → accept: the new-branch test fails on main with `branch.<unit>.remote origin` / `branch.<unit>.merge refs/heads/main` present; the guard row passes on main and after.
- [ ] 1.2 Add `--no-track` to both `worktree add -b` calls (`scripts/repo-exec.mjs:281`, `:308`); the `--detach` calls (`:461`, `:617`) stay as they are → accept: 1.1 passes; existing repo-exec tests pass.
- [ ] 1.3 Drop `-u` from `push -u` at `scripts/repo-exec.mjs:689` and `:754`, keeping the explicit `<src>:refs/heads/<dst>` / branch refspec, and add a test that after a land push `git config --local --get-regexp '^branch\.'` holds no entry for the pushed branch → accept: test passes; `node --test scripts/unpushed.test.mjs scripts/repo-exec.test.mjs` exits 0 (ARCH-SAFETY-06 still reports an un-pushed branch with no upstream).
- [ ] 1.4 Update `cite:` ranges in `docs/architecture/landing.rules.md` that point into the lines 1.2/1.3 moved → accept: `node scripts/arch-check.mjs lint` PASS.

### Step 2 — scope-ambiguous-outside-read (., javascript, high)
Tooling: implementer · gates code-reviewer, security-auditor · skills test-driven-development · guards arch-check
Depends on: none
- [ ] 2.1 In `scripts/pre-guard.test.mjs` add rows: with two active project scopes matching the session, a `Read` of `/tmp/x.png` and of `~/scratch/y.png` (real path outside every scoped project root and outside the plugin root) exits 0; a `Read` inside either project root and every `Write`/`Edit`/`NotebookEdit` still exit 2 with "more than one active project scope" → accept: the two Read rows fail on main; after the change in `scripts/pre-guard.mjs:1101-1104` (skip the ambiguity block only for read-bucket tools whose target resolves outside every candidate scope's root) all rows pass.
- [ ] 2.2 Refresh `cite:` ranges in `safety.rules.md` / `state.rules.md` that 2.1 moved → accept: `node scripts/arch-check.mjs lint` PASS; full `node --test` suite exits 0.

### Step 3 — sandbox-gap-report (., javascript, normal)
Tooling: implementer · gates code-reviewer · skills test-driven-development · guards arch-check
Depends on: none
- [ ] 3.1 Add `sandboxGaps({ root, userDir, managedDirs })` to `scripts/lib/settings-merge.mjs`: when `sandboxEnabledAnywhere` is true, merge `sandbox.network.allowedDomains` and `sandbox.excludedCommands` across the same files and return gaps: `network` when the host of `git remote get-url origin` (https or scp form) is not in any `allowedDomains` entry (exact or `*.` suffix), `docker` when the root holds `docker-compose.y*ml`/`compose.y*ml` and no `excludedCommands` entry starts with `docker`, `excluded-malformed` for an entry holding `, ` or no command word (e.g. `".craftsman/, docs/plans/, src/**"`). The origin lookup is one `execFileSync("git", ["-C", root, "remote", "get-url", "origin"], { timeout: 2000 })`; any failure means no `network` gap (advisory, fails open, ARCH-SAFETY-04). Never throws; unreadable counts as absent → accept: unit tests cover each gap, no gap, sandbox off (returns []), and a bad JSON file.
- [ ] 3.2 Add `scripts/lib/settings-merge.test.mjs` cases for 3.1 and `scripts/session-context.test.mjs` cases for 3.3 → accept: `node --test scripts/lib/settings-merge.test.mjs scripts/session-context.test.mjs` exits 0.
- [ ] 3.3 In `scripts/session-context.mjs:63-67`, when the sandbox is on and `sandboxGaps` is non-empty, emit one line: `craftsman: sandbox on, but <gap list>: these calls fail sandboxed and get retried outside it (dangerouslyDisableSandbox), which auto mode refuses.` Off-everywhere wording is unchanged → accept: 3.2 asserts the exact line for a network gap and no line when gaps are empty.
- [ ] 3.4 Add the gap line to ARCH-SAFETY-10's check/cite in `docs/architecture/safety.rules.md` (report only, writes nothing) → accept: `node scripts/arch-check.mjs lint` PASS.

### Step 4 — sandbox-bypass-stat (., javascript, normal)
Tooling: implementer · gates code-reviewer · skills test-driven-development · guards arch-check
Depends on: scope-ambiguous-outside-read (same file)
- [ ] 4.1 In `scripts/pre-guard.mjs`, when `tool === "Bash"` and `tool_input.dangerouslyDisableSandbox === true`, `logEvent({ ev: "sandbox_bypass", sid, head })` where `head` is the first command word (never the full command, never an env assignment's value); logging stays inside the existing never-throw `logEvent` and does not change the decision → accept: a pre-guard.test row sees one `sandbox_bypass` line in a temp state dir and the same exit code as without the flag.
- [ ] 4.2 In `scripts/stats.mjs` add a "Sandbox bypasses" section: count per session and the top 5 heads; "none recorded" when absent → accept: `scripts/stats.test.mjs` case with fixture events passes.

### Step 5 — segmentre-range (., javascript, high)
Tooling: implementer · gates code-reviewer, security-auditor · skills systematic-debugging, test-driven-development · guards arch-check
Depends on: sandbox-bypass-stat (same file)
- [ ] 5.1 Reproduce "pre-guard could not decide (Invalid regular expression: …Range out of order in character class)" with the transcript commands under "Verification background" (a doc-write-authorised `python3 - <<'EOF'` whose body holds `L[a-1]`, and the `E[a-1].strip` form), as pre-guard.test rows → accept: rows fail on main with exit 2 and that message; if neither reproduces at HEAD, record the commands tried in this plan and mark the unit CANCELLED with that evidence.
- [ ] 5.2 Make `segmentRe` (`scripts/pre-guard.mjs:217-229`) build a bracket class only when it is a valid range set; otherwise match the `[` literally (bash also matches nothing for a reversed range), so a construction error cannot reach the could-not-decide path → accept: 5.1 rows exit as the same command without the bracket text does; every existing guarded-glob row still passes; full suite exits 0.

### Step 6 — init-doc-drift (., markdown, normal)
Tooling: implementer · guards arch-check
Depends on: all steps above
- [ ] 6.1 `commands/init.md:96`: replace "ask rules for `rm -r`/`-rf`, `sudo`, …" with the asks `SANDBOX_BLOCK` really holds (`sudo`, `git push --force`, `git reset --hard`, `git clean`, ARCH-SAFETY-12) and mention the SessionStart gap line from Step 3 → accept: `grep -n 'rm -r' commands/init.md` finds nothing in §6; doc-size-policy passes (file shrinks or stays within cap, ARCH-SLIM-02).
- [ ] 6.2 `CHANGELOG.md` `## [Unreleased]`: one `### Fixed` bullet for this feature area (unit worktrees no longer write git config; ambiguous-scope Reads outside projects; SessionStart sandbox gaps; sandbox_bypass stat; segmentRe crash) → accept: one new bullet, no duplicate of an existing sandbox bullet.

## Sequencing
Step 1 first: smallest, verified by repro, and it removes the stale `config.lock` stall that every later unit worktree would hit. Steps 2 and 3 are independent. Steps 2, 4 and 5 all edit `scripts/pre-guard.mjs`, so they run in that order. **`doc-guard-shell-quoting` (scrutinise-investigate-cross-repo-worktree-git-guard) is IN_PROGRESS on pre-guard.mjs:** start Step 2 only after it lands or is parked, to avoid a conflicting merge. Step 6 last.

## Open decision — phase 2 (route to /architect, no rows registered)
One question for `/architect` (it decides whether a `network-argv` unit exists): **may root's network step run sandboxed through `sandbox.network.allowedDomains`, or does it need an allow-listed unsandboxed retry?** Today `commands/_network.md:8` runs fetch/drain "with the sandbox disabled for that call only (the user approves it)"; unattended, the auto-mode classifier refuses ([Safety Bypass Flag], [Auto-Mode Bypass]). Constraints: ARCH-LAND-19 (never loosen the sandbox for runners; no credential allowlisting, and push auth here uses `gh auth git-credential`, which reads `~/.config/gh`), ARCH-SAFETY-12 (SANDBOX_BLOCK = enable + asks). Test first: does an HTTPS `git fetch` succeed sandboxed with only `allowedDomains: [<origin host>]`?
The same pass should decide the items the rules keep on purpose, seen in the sweep:
- `allowedDomains`, a docker `excludedCommands` and a user-scope merge in SANDBOX_BLOCK (ARCH-SAFETY-12; docker exclusion vs ARCH-LAND-19).
- The setter rule firing on heredoc text that only names a safety variable, and "names craftsman state" on commands the parser gives up on (scratch repos via `$VAR` paths) (ARCH-SAFETY-05, ARCH-STATE-16).
- Chained `doc-write.mjs on; …` refused (nonce only for the plain command, ARCH-SAFETY-05; 60 blocks / 13 sessions).
- Removal words in `node -e` literal text (91 blocks); real `for … rm` loops stay blocked (owner accepted, scrutinise-feature-branch-plans Round 14).
- The scope-required marker blocking `docs/plans/**` edits in /investigate and /plan after an /orchestrate in the same session (126 blocks; ARCH-AUTO-10, ARCH-STATE-03/-10).
Related pending rows to fold into that pass rather than duplicate: `followup-guard-redesign` (F1) and `followup-sandbox-verify` (F3) in `scrutinise-investigate-cross-repo-worktree-git-guard`.

## Verification background   (citations — for the reviewer, not the executor)
- Sweep: 33 craftsman sessions, last 3 days. Gleam (sandbox on) 5,108 `dangerouslyDisableSandbox` calls in 11 sessions, 13 auto-mode classifier denials; Artist 255; Loost, Loost-Gallery and Craftsman have no sandbox in any scope.
- `git worktree add -b u1 ../w1 origin/main` writes `branch.u1.remote origin` and `branch.u1.merge refs/heads/main`; with `--no-track` the local config is unchanged (repro 2026-11-01). Claude Code always write-protects `.git/config` and `.git/hooks` inside the sandbox (code.claude.com/docs/en/sandboxing), hence the stale `config.lock` seen in Gleam.
- `scripts/repo-exec.mjs:281`, `:308` (`worktree add -b`); `:689`, `:754` (`push -u`); `:461`, `:617` (`--detach`, no branch config).
- `scripts/lib/unpushed.mjs:54` treats a branch with no upstream as un-pushed only when its commits are on no remote; `scripts/account-switch.mjs:182` reads `@{u}` of the session checkout only.
- `scripts/pre-guard.mjs:1101-1104` blocks every scoped tool on `scope_ambiguous` before resolving the target; transcript blocks were Reads of `~/scratch/*/shots/*.png` and `/tmp/claude-1001/cites_check.py`.
- `scripts/lib/settings-merge.mjs:8-11` SANDBOX_BLOCK; `:62-77` `sandboxEnabledAnywhere` checks `enabled` only; `scripts/session-context.mjs:63-67` the off-only notice.
- `scripts/pre-guard.mjs:217-229` `segmentRe` builds `[...]` from command text; transcript commands (Gleam, plugin 7723e8b39228 and 676f3b23c37e): `node …/doc-write.mjs on >/dev/null; python3 - <<'EOF' > "$TMPDIR/cites.txt" … L[a-1].strip()[:110] if a<=len(L) else …` and a heredoc holding `E[a-1].strip`.
- `commands/init.md:96` still lists `rm -r`/`-rf` asks; ARCH-SAFETY-12 (safety.rules.md:22) removed them in 3684bdc.

CONSUMERS:
- `repo-exec.mjs` prepare/land git argv → internal only; callers `workflows/run.js`, `agents/unit-runner.md`, `commands/_network.md` use the JSON stdin contract, which is unchanged.
- `sandboxGaps` (new export, settings-merge.mjs) → `scripts/session-context.mjs` only.
- `sandbox_bypass` event (events.jsonl) → `scripts/stats.mjs` only.

## Risk & rollback
- 1.2/1.3: a human who relied on unit branches tracking `main` loses `git status` ahead/behind there; unit branches are craftsman-owned and short-lived. Revert the commit to restore.
- 2.1: narrows a fail-closed block to Reads outside every project; outside-root reads are the sandbox's (ARCH-SAFETY-01). Writes keep the block.
- 3.3: advisory text only. 4.1: logging cannot change a decision (asserted).
- 5.2: a malformed class now matches literally; covered by the full guarded-glob table.

## Out of scope
Claude Code's own bwrap mount/stub failures (`.claude/launch.json`, `.claude/loop.md`, `.idea`, `/tmp/.mcp.json`); the user's settings files (malformed Gleam `excludedCommands`, user-level `rm` asks, `/home` vs `/var/home` paths); updating the installed plugin (153 commits behind; run `/craftsman:upgrade` after landing); everything under "Open decision".
