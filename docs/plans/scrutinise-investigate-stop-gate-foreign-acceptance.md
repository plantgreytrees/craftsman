---
slug: scrutinise-investigate-stop-gate-foreign-acceptance
goal: The force block and pre-guard refuse every destructive git, in-place write and safety assignment they refused before the quoted-text change, and the plan-scoping rules read as built
level: feature
parent: investigate-stop-gate-foreign-acceptance
priority: P0
classification: /scrutinise round 1 of investigate-stop-gate-foreign-acceptance (isolated scrutineer, 2026-10-28, main 7019c4b)
tracker_rows: [fb-prose-fail-closed, preguard-inplace-spellings, preguard-bypass-records, plan-slug-normaliser, rules-text]
guards:
  blast_radius: done
  completeness_sweep: done
  blind_rederivation: skipped(config:never)
coverage:
  contract:      3.1 (planSlugOf accepts any path ending in <slug>.md; consumers in CONSUMERS below)
  data:          N/A(no persistence change)
  config:        N/A(no config key)
  security:      1.1-1.5, 2.1-2.4 (security-auditor gate each; every probe a blocked test case)
  tests:         1.5, 2.3, 3.3 (each RED on 7019c4b)
  observability: 3.2 (Stop notice wording for feature-only lines)
  interface:     N/A(no new command surface)
  docs:          4.1-4.3 (rules wording and cites; no decision change)
  rollback:      revert the merge commits; each fix only narrows what blankProse treats as prose or widens what counts as a write
units:
  - id: 1
    scope_id: fb-prose-fail-closed
    project: .
    depends_on: []
    module: scripts/lib/force-block.mjs blankProse
    language: javascript
    security: high
    scope:
      read: [scripts/lib/force-block.mjs, scripts/force-block-quoted.test.mjs]
      docs: [docs/architecture/state.rules.md, docs/architecture/landing.rules.md]
      write: [scripts/lib/force-block.mjs, scripts/force-block-quoted.test.mjs]
    arch: [ARCH-LAND-31, ARCH-STATE-16]
    tooling: { implementer: implementer, gates: [security-auditor, code-reviewer], skills: [test-driven-development], guards: [], mcp: [] }
  - id: 2
    scope_id: preguard-inplace-spellings
    project: .
    depends_on: [fb-prose-fail-closed]
    module: scripts/pre-guard.mjs in-place writer detection
    language: javascript
    security: high
    scope:
      read: [scripts/pre-guard.mjs]
      docs: [docs/architecture/safety.rules.md, docs/architecture/state.rules.md]
      write: [scripts/pre-guard.mjs, scripts/pre-guard-inplace.test.mjs]
    arch: [ARCH-SAFETY-05, ARCH-SAFETY-03, ARCH-STATE-15]
    tooling: { implementer: implementer, gates: [security-auditor, code-reviewer], skills: [test-driven-development], guards: [], mcp: [] }
  - id: 2b
    scope_id: preguard-bypass-records
    project: .
    depends_on: [preguard-inplace-spellings]
    module: pre-guard sed and quoted-literal test files (bypass records)
    language: javascript
    security: high
    scope:
      read: [scripts/pre-guard-sed.test.mjs, scripts/pre-guard-quoted.test.mjs, scripts/pre-guard-inplace.test.mjs]
      docs: [docs/architecture/safety.rules.md]
      write: [scripts/pre-guard-sed.test.mjs, scripts/pre-guard-quoted.test.mjs]
    arch: [ARCH-SAFETY-05]
    tooling: { implementer: implementer, gates: [security-auditor, code-reviewer], skills: [], guards: [], mcp: [] }
  - id: 3
    scope_id: plan-slug-normaliser
    project: .
    depends_on: []
    module: scripts/lib/core.mjs planSlugOf
    language: javascript
    security: normal
    scope:
      read: [scripts/lib/core.mjs]
      docs: [docs/architecture/state.rules.md, docs/architecture/tracker.rules.md]
      write: [scripts/lib/core.mjs, scripts/stop-gate.mjs, scripts/tracker.mjs, scripts/plan-slug-normaliser.test.mjs]
    arch: [ARCH-TRACKER-15, ARCH-TRACKER-16, ARCH-STATE-04]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [test-driven-development], guards: [], mcp: [] }
  - id: 4
    scope_id: rules-text
    project: .
    depends_on: [fb-prose-fail-closed, preguard-inplace-spellings, preguard-bypass-records, plan-slug-normaliser]
    module: docs/architecture safety, tracker and landing rules wording and cites
    language: markdown
    security: normal
    scope:
      read: [docs/architecture/safety.rules.md, docs/architecture/tracker.rules.md, docs/architecture/landing.rules.md]
      docs: [docs/architecture/safety.rules.md, docs/architecture/tracker.rules.md, docs/architecture/landing.rules.md]
      write: [docs/architecture/safety.rules.md, docs/architecture/tracker.rules.md, docs/architecture/landing.rules.md]
    arch: [ARCH-SAFETY-05, ARCH-TRACKER-08, ARCH-TRACKER-15, ARCH-LAND-31]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [], mcp: [] }
---
# Scrutinise round 1 — investigate-stop-gate-foreign-acceptance

**Summary (rolling).** Round 1 (2026-10-28, isolated scrutineer over the 9 unit merges, floor 1304/1304, arch lint PASS): 1 Critical, 3 Warning, 7 Suggestion. Criteria UNMET and unticked by root: `[unit:preguard-sed]` auditor PASS, `[unit:preguard-quoted-literals]` auditor PASS, both `[unit:force-block-quoted]` lines. Root reproduced findings 1, 2 and 3 at HEAD (`destructiveGit` returns null for all six forms). Disputed: none.

## Executable core

### Step 1 — fb-prose-fail-closed (., javascript, HIGH)
Tooling: implementer · gates security-auditor, code-reviewer · skills test-driven-development
Depends on: none
Findings 1 (Critical), 2 (Warning), 3 (force-block side), 7.
- [ ] 1.1 `blankProse` (force-block.mjs:180) returns its input unchanged when it holds a backslash: a regex cannot pair quotes once one is escaped → accept: `echo \"; git push -f origin main; echo "x"`, `echo \'; git reset --hard; echo 'x'` and `echo a\"b; git clean -fd; echo "c"` are blocked by `destructiveGit`
- [ ] 1.2 `blankProse` returns its input unchanged when the text defines a shell function (`name() {` or `function name`), so a prose program can't be shadowed → accept: `echo() { bash -c "$1"; }; echo "git push -f origin main"` and `function grep { sh -c "$1"; }; grep "git reset --hard" x` are blocked
- [ ] 1.3 Only a bare program name, or one under `/bin/` or `/usr/bin/`, counts as a prose program; `./echo`, `/tmp/p/grep` and the like are live → accept: `/tmp/p/echo "git push -f origin main"` and `./grep "git reset --hard" x` are blocked
- [ ] 1.4 Skip leading shell reserved words (`do`, `then`, `else`, `elif`, `!`, `{`, `time`) before taking the program word, so `for f in a; do echo "git clean -fd"; done` is prose; a real invocation in a loop body stays blocked → accept: test 1.5
- [ ] 1.5 Extend `scripts/force-block-quoted.test.mjs` RED on 7019c4b with every probe in 1.1-1.4 as a blocked case, plus `for f in a; do git push -f; done` blocked and `for f in a; do echo "git clean -fd"; done` allowed → accept: `node --test scripts/force-block-quoted.test.mjs scripts/lib/force-block.test.mjs scripts/pre-guard-narrow.test.mjs` exit 0; the lease-to-own-branch cases (ARCH-LAND-31) unchanged

### Step 2 — preguard-inplace-spellings (., javascript, HIGH)
Tooling: implementer · gates security-auditor, code-reviewer · skills test-driven-development
Depends on: fb-prose-fail-closed (pre-guard imports blankProse)
Findings 3 (pre-guard side), 4. Add no `shellSegments` call; test 24.2 in pre-guard.test.mjs stays unchanged. Grep pre-guard.mjs for `INPLACE`, `WRITE_TEXT` and `blankProse`; do not read it whole beyond what the edit needs.
- [ ] 2.1 The in-place pattern (pre-guard.mjs:356-357 and its use near :1462) accepts every GNU prefix of `--in-place` (`--i`, `--in`, `--in-pl`, …) and option clusters that hold digits (`-0pi`, `-0777pi`, `-Ei`) → accept: `sed --in s/a/b/ craftsman.config.json`, `sed --in-pl s/a/b/ craftsman.config.json`, `sed -E --i s/a/b/ hooks/hooks.json`, `perl -0pi -e s/a/b/ craftsman.config.json`, `perl -0777pi -e s/a/b/ hooks/hooks.json` exit 2
- [ ] 2.2 A sed `w` command or `w` flag naming a guarded file counts as a write of that file → accept: `sed -n 's/a/b/w craftsman.config.json' README.md` and `sed -n '1w hooks/hooks.json' README.md` exit 2; `sed -n 1,5p README.md` still exits 0
- [ ] 2.3 (amended 2026-10-28: the unit-context cap leaves no room to read the existing test files) Create `scripts/pre-guard-inplace.test.mjs` with the Write tool (same harness as pre-guard-sed.test.mjs: spawn `node scripts/pre-guard.mjs` in a git-init temp dir via `fs.mkdtempSync`, cleaned up with `fs.rmSync` in node), RED on 7019c4b, holding every 2.1-2.2 probe, `./echo "sed -i s/a/b/ hooks/hooks.json"`, `./echo "CLAUDE_PROJECT_DIR=/tmp/x node a.mjs"` and `./grep "rm -rf .craftsman" x; for f in a; do echo $f; done` as blocked cases, and `sed -n 1,5p README.md` allowed → accept: `node --test scripts/pre-guard-inplace.test.mjs scripts/pre-guard-sed.test.mjs scripts/pre-guard-quoted.test.mjs scripts/pre-guard.test.mjs scripts/pre-guard-narrow.test.mjs` exit 0 and `grep -c shellSegments scripts/pre-guard.mjs` = 2
- [ ] 2.4 security-auditor: no previously refused write, assignment or removal is allowed, and every bypass it tries is a test case in pre-guard-inplace.test.mjs → accept: auditor PASS
Path note: use absolute paths under this unit's worktree for Read, Edit and Write; never main-checkout paths. Shell writes of test text that names craftsman state are refused by the guard by design; use the Write and Edit tools, and never assemble strings to get past a guard.

### Step 2b — preguard-bypass-records (., javascript, HIGH)
Tooling: implementer · gates security-auditor, code-reviewer
Depends on: preguard-inplace-spellings
The parent criteria name the files that must record each bypass: `[unit:preguard-sed]` → scripts/pre-guard-sed.test.mjs, `[unit:preguard-quoted-literals]` → scripts/pre-guard-quoted.test.mjs.
- [ ] 2b.1 Copy into `scripts/pre-guard-sed.test.mjs` every sed/perl probe of pre-guard-inplace.test.mjs and the path-qualified `./echo "sed -i …"` case, and into `scripts/pre-guard-quoted.test.mjs` the `./echo "CLAUDE_PROJECT_DIR=…"` and `./grep "rm -rf .craftsman" …` cases, as blocked cases in each file's own harness style (Read each file, then Edit; absolute worktree paths) → accept: `node --test scripts/pre-guard-sed.test.mjs scripts/pre-guard-quoted.test.mjs scripts/pre-guard-inplace.test.mjs` exit 0
- [ ] 2b.2 security-auditor over the merged pre-guard state (preguard-sed, preguard-quoted-literals and preguard-inplace-spellings): every bypass it tries is recorded in the parent-named file → accept: auditor PASS; then tick the parent lines `[unit:preguard-sed]` security-auditor PASS and `[unit:preguard-quoted-literals]` security-auditor PASS
Path note: as Step 2.

### Step 3 — plan-slug-normaliser (., javascript, normal)
Tooling: implementer · gates code-reviewer · skills test-driven-development
Depends on: none
Findings 8, 9, 10.
- [ ] 3.1 `planSlugOf` (core.mjs:352-356) maps any argument whose first non-flag word is a path ending in `<slug>.md` to `<slug>` (the basename, as tracker.mjs:388 and repo-exec.mjs:574 already do); a bare slug and `docs/plans/<slug>.md` keep their result; anything else that fails the slug pattern stays null → accept: `./docs/plans/x.md`, `sub/docs/plans/x.md` and `docs/plans/x.md` → `x`; `x` → `x`; `a b`'s first word rules as today
- [ ] 3.2 stop-gate.mjs Stop notice (near :379) calls the legacy lines "unscoped (untagged or feature-only)"; tracker.mjs `reconcileAcceptance` header comment (:370-372) says open `[plan:<slug>]` lines hold that plan's MERGED rows and untagged lines hold none → accept: grep shows both wordings; `node --test scripts/stop-gate-plan-scope.test.mjs scripts/stop-gate.test.mjs` exit 0 (update only a notice-text assertion if one pins the old word)
- [ ] 3.3 Write `scripts/plan-slug-normaliser.test.mjs` RED on 7019c4b: the 3.1 table; `bindingAcceptance(text, {units: [], plans: ["./docs/plans/b.md"]})` binds a `[plan:b]` line → accept: `node --test scripts/plan-slug-normaliser.test.mjs scripts/acceptance-plan-scope.test.mjs scripts/orchestrate-scope-guard.test.mjs scripts/lib/core.test.mjs` exit 0

### Step 4 — rules-text (., markdown, normal)
Depends on: every other step (cites point at the final code)
Findings 5, 6, 11. Wording only: each rule keeps the decision recorded in docs/plans/investigate-stop-gate-foreign-acceptance.md § Decisions (owner decisions 2026-10-27); no decision changes.
- [ ] 4.1 ARCH-SAFETY-05 (safety.rules.md:15) drops "the kept false positive that refuses prose naming a setter word next to a safety variable" and says a quoted grep/printf/echo argument or an inert `node -e` literal is not an assignment, per the owner decision to fix quoted-literal false positives in this run → accept: `node --test scripts/safety-cites.test.mjs` exit 0
- [ ] 4.2 ARCH-TRACKER-15 (tracker.rules.md:25) reads that untagged lines hold no plan's promotion and keep gating only the last feature's land-feature (ARCH-TRACKER-08), matching task 1.2 of the parent plan → accept: no contradiction with ARCH-TRACKER-08 on read
- [ ] 4.3 Re-point ARCH-LAND-31's `force-block.mjs:1-173` and ARCH-TRACKER-08's `repo-exec.mjs:571-584` cites to the ranges that now hold the cited code → accept: `node --test scripts/safety-cites.test.mjs scripts/arch-check.test.mjs` exit 0 and `node scripts/arch-check.mjs lint` PASS

## Sequencing
Steps 1 and 3 are independent. Step 2 follows step 1 (pre-guard calls blankProse). Step 4 runs last so its cites match the final code.

## Verification background

**Round 1 findings (verbatim classes):**
1. Critical Security — force-block.mjs:180-209: blankProse ignores backslash escapes; three probes return null (blocked before 88e655c). ARCH-LAND-31, ARCH-STATE-16. → 1.1
2. Warning Security — force-block.mjs:194-199: a function defined in the command shadows a prose program; two probes null. → 1.2
3. Suggestion (must-fix; makes parent criteria 8 and 10 UNMET) Security — force-block.mjs:198: path-qualified programs count as prose; exit 2 before bc51891, exit 0 now. → 1.3, 2.3
4. Suggestion (must-fix; criterion 8 needs every tried bypass recorded) Security — pre-guard.mjs:356-357, 1462: GNU prefixes, digit clusters, sed `w`; pre-existing. → 2.1, 2.2
5. Warning Architecture — safety.rules.md:15 ARCH-SAFETY-05 describes a removed false positive. → 4.1
6. Warning Architecture — tracker.rules.md:25 ARCH-TRACKER-15 vs ARCH-TRACKER-08 wording. → 4.2
7. Suggestion Correctness — reserved word read as program inside a loop body (fails closed). → 1.4
8. Suggestion Correctness — tracker.mjs:370-372 stale comment. → 3.2
9. Suggestion Correctness — feature-only line called "untagged" in the Stop notice. → 3.2
10. Suggestion Cross-unit — planSlugOf vs basename normalisers. → 3.1
11. Suggestion Architecture — moved cites after 88e655c's reformat. → 4.3

**Residual risk (scrutineer):** ANSI-C `$'…'` and nested `${…"…"}` quoting were reasoned about, not fuzzed (1.1 covers both, since each needs a backslash or `$`); /plan-time PENDING events' `session_id` vs the acceptance owner was not confirmed; workspace ledgers with non-`docs/plans/` paths not exercised (3.1 covers the slug side).

CONSUMERS:
- `planSlugOf` (core.mjs:352): orchestrate-scope-guard.mjs:135 (command args), stop-gate.mjs:350 (ledger plan), core.mjs:390 (ledger plan), core.mjs:510 and :516 (acceptance `[plan:]` tags), core.mjs:1191 (bindingAcceptance plans). The basename change only turns null into a slug for path-shaped inputs; existing slug and `docs/plans/<slug>.md` inputs are unchanged.
- `blankProse` (force-block.mjs:180): force-block.mjs `destructiveGit`; pre-guard.mjs:481, :1462, :1511 (all already guard backslashes themselves).
