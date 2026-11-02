---
slug: scrutinise-sandbox-auto-flow
goal: A scoped Read of scratch evidence can never reach a file inside another active scope's root, the guard still refuses a bracketed file name it cannot compile, and the sandbox-gap text, fixtures and rules cites say what the merged code does
level: feature
parent: sandbox-auto-flow
priority: P1
classification: /scrutinise round 1 of sandbox-auto-flow (isolated scrutineer, 2026-11-02, ranges c41ad91..9e122b1, committed state 9e122b1)
tracker_rows: [TRACKER#scratch-read-all-scopes, TRACKER#bracket-literal-fallback, TRACKER#init-gap-text, TRACKER#fixtures-no-upstream, TRACKER#followup-scratch-root-cache-names, TRACKER#followup-pre-guard-helper-layout]
guards:
  blast_radius: done
  completeness_sweep: done
  blind_rederivation: skipped(config:never)
coverage:
  contract:      1.3 (new export activeScopes in scope.mjs; readScope behaviour unchanged, consumers in CONSUMERS), 3.3 (SessionStart gap line wording)
  data:          N/A(no persistence or migration)
  config:        N/A(no config key; the protectedPaths default is follow-up S4, which needs an /architect decision)
  security:      1.1, 1.4 (W2: another scope's files stay behind that scope), 2.1, 2.2 (S3: a fail-closed crash must not become an allow); security-auditor gate on units 1 and 2
  tests:         1.1, 1.2, 1.3, 2.1, 3.1, 3.5, 4.1
  observability: N/A(no new event or log; the sandbox_bypass event is unchanged)
  interface:     3.3, 3.4 (SessionStart gap line, /init text)
  docs:          1.5, 2.3 (cites), 1.6 (CHANGELOG), 3.4 (init.md)
  rollback:      one merge commit per unit; a revert restores the code and its cites together
units:
  - id: 1
    scope_id: scratch-read-all-scopes
    project: .
    depends_on: []
    module: scripts/pre-guard.mjs insideScratchRoots, scripts/scope.mjs activeScopes
    language: javascript
    security: high
    scope:
      read: [scripts/scope.mjs, scripts/scope.test.mjs]   # pre-guard.mjs is ~113 KB and pre-guard.test.mjs ~153 KB: grep -n first, read by range with Bash (ARCH-ENGINE-08); edit .mjs by exact-match splice (followup-quality-gate-prettier)
      docs: [docs/architecture/safety.rules.md, docs/architecture/state.rules.md, docs/architecture/auto.rules.md, docs/architecture/slim.rules.md]
      write: [scripts/pre-guard.mjs, scripts/pre-guard.test.mjs, scripts/scope.mjs, scripts/scope.test.mjs, docs/architecture/safety.rules.md, docs/architecture/state.rules.md, docs/architecture/auto.rules.md, CHANGELOG.md]   # rules docs: cite: line ranges only; CHANGELOG.md is ~44 KB: edit one bullet
    arch: [ARCH-STATE-18, ARCH-SAFETY-13, ARCH-SLIM-08]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [test-driven-development], guards: [arch-check], mcp: [] }
  - id: 2
    scope_id: bracket-literal-fallback
    project: .
    depends_on: [scratch-read-all-scopes]
    module: scripts/pre-guard.mjs bracketClass
    language: javascript
    security: high
    scope:
      read: []   # pre-guard.mjs and pre-guard.test.mjs: grep -n "bracketClass\|segmentRe\|pathspecHit" first, read by range (ARCH-ENGINE-08)
      docs: [docs/architecture/safety.rules.md, docs/architecture/state.rules.md]
      write: [scripts/pre-guard.mjs, scripts/pre-guard.test.mjs, docs/architecture/safety.rules.md, docs/architecture/state.rules.md]   # rules docs: cite: line ranges only
    arch: [ARCH-SAFETY-02, ARCH-SAFETY-03, ARCH-STATE-16]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [test-driven-development], guards: [arch-check], mcp: [] }
  - id: 3
    scope_id: init-gap-text
    project: .
    depends_on: []
    module: scripts/lib/settings-merge.mjs, commands/init.md
    language: javascript
    security: normal
    scope:
      read: [scripts/lib/settings-merge.mjs, scripts/lib/settings-merge.test.mjs, commands/init.md]
      docs: [docs/architecture/safety.rules.md, docs/architecture/slim.rules.md]
      write: [commands/init.md, scripts/lib/settings-merge.mjs, scripts/lib/settings-merge.test.mjs]
    arch: [ARCH-SAFETY-12, ARCH-SAFETY-04, ARCH-SLIM-01, ARCH-SLIM-02]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [test-driven-development], guards: [arch-check], mcp: [] }
  - id: 4
    scope_id: fixtures-no-upstream
    project: .
    depends_on: []
    module: scripts/auto-archive.test.mjs, scripts/repo-exec-approval.test.mjs
    language: javascript
    security: normal
    scope:
      read: [scripts/auto-archive.test.mjs, scripts/repo-exec-approval.test.mjs]
      docs: []
      write: [scripts/auto-archive.test.mjs, scripts/repo-exec-approval.test.mjs]
    arch: []
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [test-driven-development], guards: [], mcp: [] }
---

# Plan: scrutinise sandbox-auto-flow (round 1)

## Outcome
A scoped Read of scratch evidence can never reach a file inside another active scope's root; the bracket fallback no longer lets a literal bracketed file name through; the SessionStart gap text and `/init` stop telling the model to edit settings the guard refuses; and the fixtures and rules cites match the merged code. Two acceptance criteria are open again (`.craftsman/acceptance.md`, scope-ambiguous-outside-read and "every unit: cites refreshed").

## Round 1 findings (isolated scrutineer, 0 Critical, 3 Warning, 8 Suggestion; Disputed: none)
| id | class | sev | where | unit |
|---|---|---|---|---|
| W1 | Correctness (criterion UNMET) | Warning | safety.rules.md:18 ARCH-SAFETY-08 cites pre-guard.mjs:1120-1124; the 2 lines sandbox-bypass-stat added at 1123-1124 moved `docSide` to 1128 | 1 |
| W2 | Architecture, ARCH-STATE-17 (criterion UNMET) | Warning | pre-guard.mjs:1130, :1767-1777 `insideScratchRoots` checks only `activeRoot`, which with an ambiguous scope is `scopes[0]` (scope.mjs:116, readdir order) | 1 |
| W3 | Cross-unit | Warning | CHANGELOG.md:15 omits the scoped-Read loosening | 1 |
| S1 | Correctness | Suggestion | init.md:96, settings-merge.mjs:139 tell the model to edit sandbox settings; pre-guard refuses (ARCH-SAFETY-05, now -13) | 3 |
| S2 | Correctness | Suggestion | settings-merge.mjs:130 `excluded-malformed` misses an entry with no command word (plan step 3.1) | 3 |
| S3 | Security | Suggestion | pre-guard.mjs:224, :266, :1756-1762 `bracketClass` fallback can turn a fail-closed crash into an allow | 2 |
| S4 | Security | Suggestion | pre-guard.mjs:1772 scratch root is `os.tmpdir()`, all of /tmp when TMPDIR is unset | follow-up |
| S5 | Cross-unit | Suggestion | pre-guard.mjs:1743-1777 helpers after the final `process.exit(0)`; enclosure logic repeated from scope.mjs:69-78 | follow-up |
| S6 | Test-coverage | Suggestion | pre-guard.test.mjs:163-193 no TMPDIR-scope test; env row asserts exit 2 only | 1 |
| S7 | Test-coverage | Suggestion | settings-merge.mjs:98 the 2 s git timeout is untested | 3 |
| S8 | Test-coverage | Suggestion | auto-archive.test.mjs:107, repo-exec-approval.test.mjs:75 still `push -u` | 4 |

Acceptance verdicts: 7 MET (worktree-no-track x2, sandbox-gap-report x2, sandbox-bypass-stat, segmentre-range with a recorded deviation, init-doc-drift); 2 UNMET (W2, W1). Residual risk from the review: the `sandbox.network.allowedDomains` key and the `excludedCommands` semantics were not verified against Claude Code; the real TMPDIR of a hook may differ from the sandboxed shell's; a symlink swapped between check and read is not caught.

## Scope Steps (executable core)

### Step 1 — scratch-read-all-scopes (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor · skills test-driven-development · guards arch-check
Depends on: none. **Needs the Phase 2 rules docs on main** (ARCH-STATE-18, ARCH-SAFETY-13, `/architect` 2026-11-01); until `/craftsman:merge` lands them the `arch:` ids do not exist and the scope will not activate.
- [ ] 1.1 Add RED rows to `scripts/pre-guard.test.mjs` (use the `scratchProject` helper): two active scopes, A's worktree inside the project and B's under TMPDIR, plus a symlink under TMPDIR to a file inside B that B's `read` list omits. A Read of the symlink must exit 2 whichever scope is listed first. readdir order is filesystem-dependent, so run the Read for six manifest-name pairs (include one pair where A sorts first and one where B does) and also assert the direct path exits 2 → accept: at least one pair exits 0 on 9e122b1 behaviour (red); every pair and the direct-path row exit 2 after 1.4
- [ ] 1.2 Tighten the "env file" row (pre-guard.test.mjs:163-193) to assert stderr matches `/is a protected path/`, and add a row with B's root under TMPDIR: a file on B's `read` list still reads (B governs it), a file off the list exits 2 → accept: rows green after 1.4; the env row would fail if `insideScratchRoots` stopped accepting dotfiles (check with one temporary mutation, not committed)
- [ ] 1.3 In `scripts/scope.mjs` export `activeScopes(input)`, the live-manifest list `readScope` builds at :100-105, and make `readScope` call it; return the list sorted by manifest file name so an ambiguous scope resolves the same way on every run (today it is whatever `readdir` lists first, which made the review's finding hard to reproduce); add `scope.test.mjs` rows: it returns every live manifest in name order, drops one whose worktree is gone, and `readScope` returns the same scope as before for zero, one and several non-ambiguous scopes, and the first by name for an ambiguous one → accept: `node --test scripts/scope.test.mjs scripts/followups.test.mjs` exit 0
- [ ] 1.4 In `scripts/pre-guard.mjs` give `insideScratchRoots` the real-path roots of every scope from `activeScopes(input)` (the call at :1130 passes them): return false when the target's real path is inside any of them, when any of them lies under a scratch root, or on any error; keep its existing refusals (relative path, missing file, scratch root enclosing the project) → accept: 1.1 and 1.2 rows green and the three existing scratch-read tests still green
- [ ] 1.5 Refresh cites: re-point every `cite:` range in `safety.rules.md`, `state.rules.md` and `auto.rules.md` that points into lines of `pre-guard.mjs` or `scope.mjs` this unit moved, including ARCH-SAFETY-08 (`1120-1124` becomes the range holding both `safetyEnabled` and `docSide`); cite text only → accept: `node --test scripts/safety-cites.test.mjs scripts/safety-claims.test.mjs scripts/safety-docs.test.mjs` and `node scripts/arch-check.mjs lint` pass, and `sed -n` of each changed range shows the identifier its rule names
- [ ] 1.6 Edit the existing Unreleased `### Fixed` bullet about this area in `CHANGELOG.md` (no new bullet): a scoped Read may read files under the OS temp dir or `$CLAUDE_JOB_DIR/tmp`, never a file inside another active scope's root, and `protectedPaths` still applies → accept: `node --test scripts/changelog.test.mjs` passes ([Unreleased] stays under 8 KB, ARCH-SLIM-08)
- [ ] 1.7 Run `node --test scripts/*.test.mjs scripts/lib/*.test.mjs` → accept: exit 0

### Step 2 — bracket-literal-fallback (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor · skills test-driven-development · guards arch-check
Depends on: scratch-read-all-scopes (same file, adjacent code)
- [ ] 2.1 Add a RED row to `scripts/pre-guard.test.mjs`: config `docWriteGuard.docPaths` `["docs/plans/*.md"]` (no `**`), an existing file `docs/plans/L[a-1].md`; both `rm docs/plans/L[a-1].md` and `rm 'docs/plans/L[a-1].md'` must exit 2 → accept: both exit 0 on 9e122b1 behaviour (red); the existing reversed-bracket rows (pre-guard.test.mjs:87-123) stay green
- [ ] 2.2 In `scripts/pre-guard.mjs` make the `bracketClass` fallback match either reading: for a class that does not compile, `segmentRe` (:224) emits `(?:[^/]|\[<body escaped for RegExp>\])` and `pathspecHit` (:266) the same with `.` for `[^/]`; correct the comment at :1756-1762 (the wildcard reading alone is not "the safe over-approximation") → accept: 2.1 green and `node --test scripts/pre-guard*.test.mjs` exit 0
- [ ] 2.3 Refresh cites into `pre-guard.mjs` lines this unit moved, in `safety.rules.md` and `state.rules.md`; cite text only → accept: `node --test scripts/safety-cites.test.mjs scripts/safety-claims.test.mjs scripts/safety-docs.test.mjs` and `node scripts/arch-check.mjs lint` pass
- [ ] 2.4 Run `node --test scripts/*.test.mjs scripts/lib/*.test.mjs` → accept: exit 0

### Step 3 — init-gap-text (., javascript, normal)
Tooling: implementer implementer · gates code-reviewer · skills test-driven-development · guards arch-check
Depends on: none (no rule cites `commands/init.md`, and every cite into `settings-merge.mjs` is at lines 9-53, above this unit's edits at about 98-140, so no rules doc is written)
- [ ] 3.1 Add RED rows to `scripts/lib/settings-merge.test.mjs`: a whitespace-free `excludedCommands` entry that contains `/` and ends in `/`, `/*` or `/**` (`src/**`, `build/`, `./out/*`) is reported as `excluded-malformed`; valid entries are not (`docker *`, `docker compose *`, `/usr/local/bin/docker *`, `./gradlew build`); the existing comma-list row stays → accept: the new malformed rows fail on 9e122b1 behaviour, the valid rows pass
- [ ] 3.2 In `scripts/lib/settings-merge.mjs:130` flag that entry shape. Planner refinement of the review's "starts with `.` or `/`": an absolute- or relative-path command is a legitimate pattern (Claude Code matches the call's text, so a path spelling is written as such), so only a single-token path glob is malformed → accept: 3.1 green
- [ ] 3.3 In `settings-merge.mjs` change the `sandboxGapLine` tail (:139) from "add them to the sandbox settings" to "ask the user to add them to the sandbox settings", and the docker gap detail to say an `excludedCommands` entry runs docker outside the sandbox → accept: `node --test scripts/lib/settings-merge.test.mjs scripts/session-context.test.mjs` pass; `grep -rn "add them to the sandbox" scripts` shows only the new wording
- [ ] 3.4 In `commands/init.md:96` replace "Add network domains and a docker exclusion yourself; SessionStart names what is missing." with a sentence that has the user add them (and says a docker exclusion runs docker outside the sandbox), trimming other text in the same section so the file stays within its cap → accept: `node scripts/doc-size-policy.mjs` PASS, `wc -c commands/init.md` ≤ 4890 with the cap unchanged (ARCH-SLIM-01, -02), no "yourself" in the line
- [ ] 3.5 Add a characterisation test for the 2 s git timeout: a `git` stub that sleeps 5 s, first on PATH, no `origin` argument → `sandboxGaps` returns without a network gap and without throwing, in under about 3 s → accept: passes; fails when `timeout: 2000` is removed from `originUrl` (check with one temporary mutation, not committed)
- [ ] 3.6 Run `node --test scripts/*.test.mjs scripts/lib/*.test.mjs` → accept: exit 0

### Step 4 — fixtures-no-upstream (., javascript, normal)
Tooling: implementer implementer · gates code-reviewer · skills test-driven-development
Depends on: none
- [ ] 4.1 Drop `-u` from the `feature/p-f1` pushes at `scripts/auto-archive.test.mjs:107` and `scripts/repo-exec-approval.test.mjs:75`; leave the base-branch fixture pushes (:88, :56). If a test then fails because the code under test needs an upstream, that is a production gap (repo-exec no longer writes one): record it as a follow-up row, never restore `-u` → accept: `node --test scripts/auto-archive.test.mjs scripts/repo-exec-approval.test.mjs` exit 0 and `grep -n "push.*-u" scripts/auto-archive.test.mjs scripts/repo-exec-approval.test.mjs` shows no push of `feature/p-f1`
- [ ] 4.2 Run `node --test scripts/*.test.mjs scripts/lib/*.test.mjs` → accept: exit 0

## Sequencing
Run `/craftsman:merge` first: the Phase 2 rules docs (ARCH-STATE-18, ARCH-SAFETY-13/14/15, ARCH-AUTO-11, ARCH-LAND-34/35) and this plan must be on main, because steps 1 and 2 cite them. Then steps 1, 3 and 4 are independent (different files) and step 2 follows step 1 (same file, adjacent code). Each code unit refreshes the cites it moves (option B of the strategist's comparison: every merge leaves the rules correct and every revert is self-contained; a trailing cite unit would repeat what caused W1). The Phase 2 code plan edits the same files (`pre-guard.mjs`, `scope.mjs`, `settings-merge.mjs`): land this plan's units first and re-grep every line number in each unit, since the numbers below are from 9e122b1.

## Verification background   (citations — for the reviewer, not the executor)
- `readScope` returns `scopes[0]` flagged ambiguous when no scope root contains the target and none is the lone session scope — `scripts/scope.mjs:98-119`; `insideScratchRoots` takes one project root — `scripts/pre-guard.mjs:1130`, `:1764-1777`.
- W2 repro at 9e122b1: A inside the project, B under TMPDIR, `$TMPDIR/alias.ts` linked to `B/src/secret.ts` (not on B's read list); the Read exits 0 when A is listed first (2 of 4 runs), the direct path exits 2 — reviewer's reproduction, readdir order.
- ARCH-SAFETY-08 cite — `docs/architecture/safety.rules.md:18` (`pre-guard.mjs:1120-1124`); `safetyEnabled` at :1122, the `sandbox_bypass` logEvent at :1124, `docSide` at :1128 (committed 9e122b1). `safety-cites.test.mjs:30-32` passes on `safetyEnabled` alone.
- `state.rules.md` `verified_at: e56442b` at 9e122b1 predates the STATE-17 cite; the uncommitted Phase 2 frontmatter already sets it to 9e122b1.
- S1: `commands/init.md:96`, `scripts/lib/settings-merge.mjs:139`; the refusal is ARCH-SAFETY-05 (`sandbox` is among the settings keys it guards; now ARCH-SAFETY-13). `init.md` is 4881 of 4890 bytes — `scripts/doc-size-policy.mjs:63`.
- S2: plan step 3.1 asked for "an entry holding `, ` or no command word" — `docs/plans/sandbox-auto-flow.md:127`; code at `settings-merge.mjs:130`. Path-spelled commands are legitimate patterns: the sandboxing docs say "Claude Code matches the text of the call" and that `/usr/local/bin/docker` does not match an entry for `docker` — code.claude.com/docs/en/sandboxing (fetched 2026-11-01).
- S3: `bracketClass` and its comment — `pre-guard.mjs:1756-1762`; callers `:224` (`segmentRe`), `:266` (`pathspecHit`). Reviewer's repro: `docPaths ["docs/plans/*.md"]`, file `docs/plans/L[a-1].md`, `rm` plain and quoted: exit 2 at c41ad91 ("could not decide"), exit 0 at 9e122b1; default `docPaths` use `**` and still block.
- S7: `originUrl` timeout — `settings-merge.mjs:97-99`; no test names a timeout (grep of `settings-merge.test.mjs`).
- S8: `scripts/auto-archive.test.mjs:107`, `scripts/repo-exec-approval.test.mjs:75`; the matching `repo-exec.test.mjs:827`, `:907` fixtures were already updated.
- CHANGELOG `[Unreleased]` is 1995 bytes against an 8 KB cap — `scripts/changelog.test.mjs:11-17`; the bullet to edit is `CHANGELOG.md:15`.
- The size check counts whole files in `read` + `docs` (`scripts/arch-check.mjs:158-183`), so the 113 KB `pre-guard.mjs` and 153 KB test stay out of `read`; a Read of a file listed only under `write` is refused (`pre-guard.mjs:1139`), so they are read by range with Bash, as in sandbox-auto-flow.

CONSUMERS:
- `activeScopes` (new export, scope.mjs) → `scope.mjs` `readScope` and `pre-guard.mjs` only.
- `readScope` (behaviour must not change) → `scripts/pre-guard.mjs:1115`, `scripts/quality-gate.mjs:18`, `scripts/stop-gate.mjs:23`, `scripts/telemetry.mjs:104`.
- `insideScratchRoots` (internal) → `pre-guard.mjs:1130` only. `bracketClass` (internal) → `pre-guard.mjs:224`, `:266`.
- `sandboxGaps`, `sandboxGapLine` (text only changes) → `scripts/session-context.mjs:19`, `:68`; tests `scripts/lib/settings-merge.test.mjs`, `scripts/session-context.test.mjs`.
- Rules-doc cites into `pre-guard.mjs`, `scope.mjs` → read by `scripts/safety-cites.test.mjs` (HOLDS) and `arch-check.mjs lint`; cites live in `safety.rules.md` (:11, :13, :18, :23, :25), `state.rules.md` (:13, :19, :26, :28), `auto.rules.md` (:21).

## Risk & rollback
- Unit 1 narrows what a scoped Read may reach (never a file inside another scope's root) and touches `readScope`'s shape: its four consumers keep the same return value, asserted by 1.3. Revert the merge commit; the code and its cites revert together.
- Unit 2 makes the hook deny more (a literal bracketed name under a `docPaths` pattern without `**`); revert independently of unit 1.
- Units 3 and 4 change text and fixtures only (one added malformed-entry class in the advisory gap line). Revert the merge commit.

## Out of scope
- S4 `followup-scratch-root-cache-names`: limit the scratch allowance to Claude's per-user temp subdirectory, or extend `protectedPaths` (`/tmp/krb5cc_*` and similar). A decision for `/architect` (craftsman.config.json is governed by engine rules). Registered PENDING, not driven.
- S5 `followup-pre-guard-helper-layout`: move `commandHead`, `bracketClass`, `insideScratchRoots` above the main flow and share one read-only-root helper with `insidePluginRoot`. A pure refactor that moves every pre-guard cite; run after steps 1 and 2 with its own full cite sweep. Registered PENDING, not driven.
- Implementing ARCH-STATE-18's Write/Edit allowance and the rest of Phase 2 (queue protection, drain validation, init origin hosts): `/plan sandbox-auto-flow phase 2`.
- For `/sync-docs`: `docs/plans/sandbox-auto-flow.md` has no acceptance section and its 16 step boxes are unticked; its acceptance lives in `.craftsman/acceptance.md:314-322`.
