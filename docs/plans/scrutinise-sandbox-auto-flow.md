---
slug: scrutinise-sandbox-auto-flow
goal: A scoped Read of scratch evidence can never reach a file inside another active scope's root, the guard still refuses a bracketed file name it cannot compile, and the sandbox-gap text, fixtures and rules cites say what the merged code does
level: feature
parent: sandbox-auto-flow
priority: P1
classification: /scrutinise round 1 of sandbox-auto-flow (isolated scrutineer, 2026-11-02, ranges c41ad91..9e122b1, committed state 9e122b1)
tracker_rows: [TRACKER#scratch-read-all-scopes, TRACKER#bracket-literal-fallback, TRACKER#init-gap-text, TRACKER#fixtures-no-upstream, TRACKER#followup-scratch-root-cache-names, TRACKER#followup-pre-guard-helper-layout, TRACKER#followup-e2e-loop-budget-trim, TRACKER#bypass-head-assignment, TRACKER#scratch-governed-coverage, TRACKER#origin-host-forms, TRACKER#followup-bracket-posix-classes, TRACKER#followup-round3-suggestions]
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
  round2:        5.1-5.2 (secret text never logged: contract is the sandbox_bypass event, one reader stats.mjs), 6.1-6.4 (security + tests: every governed root, mutation-checked), 7.1-7.2 (origin parsing)
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
  - id: 5
    scope_id: bypass-head-assignment
    project: .
    depends_on: []
    module: scripts/pre-guard.mjs commandHead
    language: javascript
    security: normal
    scope:
      read: []   # pre-guard.mjs ~125 KB and pre-guard.test.mjs ~155 KB: grep -n "commandHead\|sandbox_bypass" first, read by range (ARCH-ENGINE-08); edit .mjs by exact-match splice
      docs: [docs/architecture/safety.rules.md, docs/architecture/state.rules.md]
      write: [scripts/pre-guard.mjs, scripts/pre-guard.test.mjs, docs/architecture/safety.rules.md, docs/architecture/state.rules.md]   # rules docs: cite: line ranges only
    arch: [ARCH-SAFETY-13, ARCH-STATE-18]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [test-driven-development], guards: [arch-check], mcp: [] }
  - id: 6
    scope_id: scratch-governed-coverage
    project: .
    depends_on: [bypass-head-assignment]
    module: scripts/pre-guard.mjs insideScratchRoots
    language: javascript
    security: high
    scope:
      read: []   # grep -n "insideScratchRoots\|scratchProject" first, read by range
      docs: [docs/architecture/safety.rules.md, docs/architecture/state.rules.md]
      write: [scripts/pre-guard.mjs, scripts/pre-guard.test.mjs, docs/architecture/safety.rules.md, docs/architecture/state.rules.md]   # rules docs: cite: line ranges only
    arch: [ARCH-STATE-18, ARCH-SAFETY-13]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [test-driven-development], guards: [arch-check], mcp: [] }
  - id: 7
    scope_id: origin-host-forms
    project: .
    depends_on: []
    module: scripts/lib/settings-merge.mjs originHostOf
    language: javascript
    security: normal
    scope:
      read: [scripts/lib/settings-merge.mjs, scripts/lib/settings-merge.test.mjs]
      docs: [docs/architecture/safety.rules.md]
      write: [scripts/lib/settings-merge.mjs, scripts/lib/settings-merge.test.mjs]
    arch: [ARCH-SAFETY-04, ARCH-SAFETY-12]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [test-driven-development], guards: [arch-check], mcp: [] }
---

# Plan: scrutinise sandbox-auto-flow (rounds 1 and 2)

## Outcome
A scoped Read of scratch evidence never reaches a file inside any active scope's root or the session checkout; the bracket fallback does not let a literal bracketed file name through; the SessionStart gap text, the origin-host parsing and the fixtures say what the merged code does; the sandbox-bypass log never carries any part of an assignment value; and the rules cites match the code. Round 1's four units are MERGED (47125f7, da1d703, 0923480, 46b7569); round 2 adds three.

## Round 1 (history; the findings table is in git history, 35ed874)
Isolated scrutineer, 0 Critical, 3 Warning, 8 Suggestion; all fixed by steps 1-4 except `followup-scratch-root-cache-names` and `followup-pre-guard-helper-layout`. The run also found `followup-e2e-loop-budget-trim`: two shipped autonomous-e2e-loop units sit within a few hundred bytes of the ARCH-ENGINE-08 budget, so growing `scope.mjs` or `CHANGELOG.md` fails `arch-check.test.mjs`.

## Round 2 findings (isolated scrutineer, 2026-11-02, state 46b7569: 0 Critical, 2 Warning, 6 Suggestion kept, 1 Disputed)
| id | class | sev | where | unit |
|---|---|---|---|---|
| W1, W2, S1, S2 | Correctness, Test-coverage, Architecture | 2 Warning, 2 Suggestion | fixed: the `commandHead` value leak (criterion 319), the untested governed-root clause and the session checkout, the stale ARCH-STATE-18 comments, the origin host forms | 5, 6, 7 (042cfa1, 4751dbb, 953ad19) |
| S3 | Security | Suggestion | pre-guard.mjs:224, :266, :1868-1871 `[[:alpha:]]`, `[]p]`, `[!]x]` still under-match with docPaths lacking `**` (pre-existing) | follow-up |
| S4 | Cross-unit | Suggestion | network.mjs:122, :127, :156 and repo-exec.mjs:92 still write upstream config | existing `followup-set-upstream-writers` |
| S5 | Architecture | Suggestion | init.md:95 "The user adds network domains" is wrong once ARCH-SAFETY-14 lands | phase 2 init unit |

Disputed (dropped): D1 `isPathGlob` exempts an absolute single-token path glob (`/tmp/*`). Counter-evidence: `excludedCommands` entries use the Bash(...) rule syntax and Claude Code matches the text of the call, so an absolute path with a wildcard is a legitimate pattern (https://code.claude.com/docs/en/sandboxing, "Claude Code matches the text of the call"); round 1 step 3.2 recorded the refinement and `settings-merge.test.mjs:179-192` keeps `/usr/local/bin/docker *` valid.

Acceptance: `.craftsman/acceptance.md` 316 and 322 ticked (MET); 319 reopened by W1 and re-ticked in round 3; 327-334 MET.

## Round 3 (isolated scrutineer, state 953ad19: 0 Critical, 0 Warning, 3 Suggestion; criterion 319 MET and ticked; no criterion open)
No fix round. The floor was green at 953ad19 (1507 tests, lint 209 rules, doc-size). Persisted as one PENDING row, `followup-round3-suggestions`, for a later pass or the phase 2 init unit:
- R3-S1 `settings-merge.mjs:94` `host:/srv/r.git` (no `user@`) still reads as null; make the user part optional and add the row at `settings-merge.test.mjs:131-139`. Matters once ARCH-SAFETY-14's init offer reads origin hosts (the host class also accepts `-evil` and `.`).
- R3-S2 `settings-merge.mjs:93` `^[A-Za-z]:` is broader than step 7.2 first said (it also reads `C:r.git` and any one-letter host as a drive); intended and harmless, step 7.2 now says so; extend the comment.
- R3-S3 `pre-guard.test.mjs:166-167` still cites ARCH-STATE-17 and "the Read tool alone"; reword in place (comment only).
Recorded, not driven: `API_KEY= abc/Sk_live` logs `Sk_live` (by shell rules that word is the command); with only unit-worktree scopes a session started from a linked worktree does not govern the main checkout; a job dir inside the project turns its allowance off (fails closed); the runtime-only risks of round 2 (hook TMPDIR, symlink swap, hard links, case-insensitive realpath, `allowedDomains` semantics). A gitleaks hit on a made-up AWS-style fixture (`pre-guard.test.mjs:82`, step 5.1) was replaced by a placeholder (c18eb6d); the old string stays in 0ab50de and 8187ef3, not a credential.

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

### Step 5 — bypass-head-assignment (., javascript, normal)
Tooling: implementer implementer · gates code-reviewer, security-auditor · skills test-driven-development · guards arch-check
Depends on: none. Reopened criterion: acceptance 319 (sandbox-bypass-stat), which `/scrutinise` re-ticks once it is MET.
- [ ] 5.1 Add RED rows beside `scripts/pre-guard.test.mjs:57-72`: a sandbox-bypass Bash call whose whole command is a bare assignment (`API_KEY=abc/Sk_live-123`, `TOKEN=a/b+c`, `AWS_SECRET_ACCESS_KEY=fake/abc+def`, and the first after a `cd /x && ` prefix) logs `head` "?", and the raw events file holds no fragment of any value; the docker rows stay → accept: the new rows fail on 46b7569 behaviour (head is the last segment)
- [ ] 5.2 In `commandHead` (`pre-guard.mjs` ~1853) return "?" when the first word of the stripped command contains `=`, before the path split; edit in place so the function keeps its line count → accept: 5.1 green and `node --test scripts/pre-guard*.test.mjs` exit 0
- [ ] 5.3 Re-point any rules cite whose `pre-guard.mjs` lines moved (cite text only; none expected) → accept: `node --test scripts/safety-cites.test.mjs scripts/safety-claims.test.mjs scripts/safety-docs.test.mjs` and `node scripts/arch-check.mjs lint` pass
- [ ] 5.4 Run `node --test scripts/*.test.mjs scripts/lib/*.test.mjs` → accept: exit 0

### Step 6 — scratch-governed-coverage (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor · skills test-driven-development · guards arch-check
Depends on: bypass-head-assignment (same file)
- [ ] 6.1 Add rows to the scratch block (`scratchProject`): (a) a session scope with no worktree whose project root holds the TMPDIR (`<proj>/.tmp`), an off-list file there → Read exits 2; (b) a unit worktree with the scratch dir inside it, an off-list file → exits 2; (c) unit-worktree-only scopes with the TMPDIR inside the session checkout (`t.dir`), a file there → exits 2 → accept: (c) fails on 46b7569 behaviour (the session checkout is not governed); (a) and (b) pass on arrival and are proved by 6.4
- [ ] 6.2 In `insideScratchRoots` (`pre-guard.mjs` ~1889) add the session checkout's real path (`PROJECT_ROOT`) to the governed set → accept: (c) green and the existing scratch rows still green
- [ ] 6.3 Reword the comments at `pre-guard.mjs:1238` and ~1873 to say ARCH-STATE-18 allows Read, Write and Edit and only Read is implemented so far; keep their line counts → accept: no cite moves and `grep -n "Read tool alone" scripts/pre-guard.mjs` is empty
- [ ] 6.4 Check each of (a), (b), (c) with one temporary mutation (remove the `dir !== real && !within(dir, real)` clause; remove the `PROJECT_ROOT` entry), show the row fail, restore → accept: each mutation turns its row red and the tree is clean after the restore
- [ ] 6.5 Re-point any cite the unit moved (the ARCH-STATE-18 helper range; cite text only) → accept: lint and the three safety doc tests pass
- [ ] 6.6 Run `node --test scripts/*.test.mjs scripts/lib/*.test.mjs` → accept: exit 0

### Step 7 — origin-host-forms (., javascript, normal)
Tooling: implementer implementer · gates code-reviewer · skills test-driven-development · guards arch-check
Depends on: none
- [ ] 7.1 Add RED rows at `scripts/lib/settings-merge.test.mjs:122-128`: `originHostOf("C:\\srv\\r.git")` and `("D:/srv/r.git")` are null; `("git@git.example.com:/srv/r.git")` is `git.example.com`; the https, ssh and scp rows stay; `sandboxGaps` with origin `C:\srv\r.git` reports no network gap → accept: the new rows fail on 46b7569 behaviour
- [ ] 7.2 In `originHostOf` (`settings-merge.mjs:87-95`) return null for `^[A-Za-z]:` (a drive path, a drive-relative path or a one-letter host) and accept `:/` after an explicit `user@host` → accept: 7.1 green and `node --test scripts/lib/settings-merge.test.mjs scripts/session-context.test.mjs` exit 0
- [ ] 7.3 Run `node --test scripts/*.test.mjs scripts/lib/*.test.mjs` → accept: exit 0 (no rules doc is written: every cite into `settings-merge.mjs` is at lines 9-53, above the edit)

## Sequencing
Run `/craftsman:merge` first: the Phase 2 rules docs (ARCH-STATE-18, ARCH-SAFETY-13/14/15, ARCH-AUTO-11, ARCH-LAND-34/35) and this plan must be on main, because steps 1 and 2 cite them. Then steps 1, 3 and 4 are independent (different files) and step 2 follows step 1 (same file, adjacent code). Each code unit refreshes the cites it moves (option B of the strategist's comparison: every merge leaves the rules correct and every revert is self-contained; a trailing cite unit would repeat what caused W1). The Phase 2 code plan edits the same files (`pre-guard.mjs`, `scope.mjs`, `settings-merge.mjs`): land this plan's units first and re-grep every line number in each unit, since the numbers below are from 9e122b1.

Round 2: steps 5 and 7 are independent (different files); step 6 follows step 5 (same file). Each unit refreshes the cites it moves. None of them touches `scope.mjs` or `CHANGELOG.md`, so the ARCH-ENGINE-08 budgets of the shipped e2e-loop units (`followup-e2e-loop-budget-trim`) are not at risk; no changelog task is planned (the existing Fixed bullet names this area and has 2 spare bytes).

## Verification background   (citations — for the reviewer, not the executor)
- `readScope` returns `scopes[0]` flagged ambiguous when no scope root contains the target and none is the lone session scope — `scripts/scope.mjs:98-119`; `insideScratchRoots` takes one project root — `scripts/pre-guard.mjs:1130`, `:1764-1777`.
- W2 repro at 9e122b1: A inside the project, B under TMPDIR, `$TMPDIR/alias.ts` linked to `B/src/secret.ts` (not on B's read list); the Read exits 0 when A is listed first (2 of 4 runs), the direct path exits 2 — reviewer's reproduction, readdir order.
- Round 1's per-finding citations (W1, W3, S1-S3, S6-S8) are in git history (35ed874); steps 1-4 fixed all of them.
- The size check counts whole files in `read` + `docs` (`scripts/arch-check.mjs:158-183`), so the 113 KB `pre-guard.mjs` and 153 KB test stay out of `read`; a Read of a file listed only under `write` is refused (`pre-guard.mjs:1139`), so they are read by range with Bash, as in sandbox-auto-flow.
- Round 2, W1: the assignment-stripping regex `^[A-Za-z_][A-Za-z0-9_]*=[\w./:@+,-]*\s+` needs trailing whitespace, so a bare assignment reaches `split("/").pop()` — `scripts/pre-guard.mjs:1853-1862`; reproduced by running the committed function: `API_KEY=abc/Sk_live-123` gives `Sk_live-123`, `TOKEN=a/b+c` gives `b+c`.
- Round 2, W2: the governed set is `[project, ...scope roots]` — `pre-guard.mjs:1885-1889`; the only enclosure row is `pre-guard.test.mjs:213` (the temp root enclosing the project). The reviewer deleted the clause in a copy and 346 tests stayed green; it also probed a main-checkout file under a TMPDIR nested in the checkout with unit-worktree-only scopes: exit 0.
- Round 2, S2: the scp pattern forbids `:/` after the host (`(?!\/)`) — `settings-merge.mjs:93`; root probes: `C:\srv\r.git` gives `c`, `git@git.example.com:/srv/r.git` gives null.
- Round 2, S4: `network.mjs:122` (`upstream` parameter), `:127` (stored on the entry), `:156` (`branch --set-upstream-to` at drain, live for legacy entries, untested) and `repo-exec.mjs:92` (`attachDetached`) belong to the existing PENDING row `followup-set-upstream-writers`.

CONSUMERS:
- `activeScopes` (new export, scope.mjs) → `scope.mjs` `readScope` and `pre-guard.mjs` only.
- `readScope` (behaviour must not change) → `scripts/pre-guard.mjs:1115`, `scripts/quality-gate.mjs:18`, `scripts/stop-gate.mjs:23`, `scripts/telemetry.mjs:104`.
- `insideScratchRoots` (internal) → `pre-guard.mjs:1130` only. `bracketClass` (internal) → `pre-guard.mjs:224`, `:266`.
- `sandboxGaps`, `sandboxGapLine` (text only changes) → `scripts/session-context.mjs:19`, `:68`; tests `scripts/lib/settings-merge.test.mjs`, `scripts/session-context.test.mjs`.
- Rules-doc cites into `pre-guard.mjs`, `scope.mjs` → read by `scripts/safety-cites.test.mjs` (HOLDS) and `arch-check.mjs lint`; cites live in `safety.rules.md` (:11, :13, :18, :23, :25), `state.rules.md` (:13, :19, :26, :28), `auto.rules.md` (:21).

- Round 2: `commandHead` (internal) → `pre-guard.mjs:1232` only; `insideScratchRoots` (internal) → `pre-guard.mjs:1238` only; `originHostOf` → `settings-merge.mjs:124` (`sandboxGaps`) and its tests, `sandboxGaps` → `session-context.mjs:19`, `:68`; the `sandbox_bypass` event → `stats.mjs` only (its `head` field gets one more possible value, "?", which `sandboxBypassSection` already prints).
## Risk & rollback
- Unit 1 narrows what a scoped Read may reach (never a file inside another scope's root) and touches `readScope`'s shape: its four consumers keep the same return value, asserted by 1.3. Revert the merge commit; the code and its cites revert together.
- Unit 2 makes the hook deny more (a literal bracketed name under a `docPaths` pattern without `**`); revert independently of unit 1.
- Units 3 and 4 change text and fixtures only (one added malformed-entry class in the advisory gap line). Revert the merge commit.

- Round 2: step 5 changes one logged value (a leak removed). Step 6 narrows the scratch allowance further (the session checkout joins the governed set). Step 7 changes an advisory line's input. Each is one merge commit; revert independently.

## Out of scope
- S4 `followup-scratch-root-cache-names`: limit the scratch allowance to Claude's per-user temp subdirectory, or extend `protectedPaths` (`/tmp/krb5cc_*` and similar). A decision for `/architect` (craftsman.config.json is governed by engine rules). Registered PENDING, not driven.
- S5 `followup-pre-guard-helper-layout`: move `commandHead`, `bracketClass`, `insideScratchRoots` above the main flow and share one read-only-root helper with `insidePluginRoot`. A pure refactor that moves every pre-guard cite; run after steps 1 and 2 with its own full cite sweep. Registered PENDING, not driven.
- Implementing ARCH-STATE-18's Write/Edit allowance and the rest of Phase 2 (queue protection, drain validation, init origin hosts): `/plan sandbox-auto-flow phase 2`.
- For `/sync-docs`: `docs/plans/sandbox-auto-flow.md` has no acceptance section and its 16 step boxes are unticked; its acceptance lives in `.craftsman/acceptance.md:314-322`.
- Round 2: S3 `followup-bracket-posix-classes` — ARCH-SAFETY-15 says a newly reported bypass spelling becomes a stated limit unless a model writes it in ordinary work: `/architect` records it in safety.md, or widens `bracketClass` for bodies that start with `]` or `!]` or contain `[:`. Not driven.
- Round 2: S4 stays with `followup-set-upstream-writers` (its row should name `network.mjs:122,127,156` and `repo-exec.mjs:92`). S5: rewrite `commands/init.md:95` in the phase 2 init unit. CHANGELOG.md:15 lacks "protectedPaths still applies" (2 spare bytes against the shipped release-notes unit's budget).
