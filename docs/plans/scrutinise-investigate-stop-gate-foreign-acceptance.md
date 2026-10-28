---
slug: scrutinise-investigate-stop-gate-foreign-acceptance
goal: The force block and pre-guard refuse every destructive git, in-place write and safety assignment they refused before the quoted-text change, and the plan-scoping rules read as built
level: feature
parent: investigate-stop-gate-foreign-acceptance
priority: P0
classification: /scrutinise rounds 1 (main 7019c4b), 2 (main 2637399) and 3 (main f0407a4) of investigate-stop-gate-foreign-acceptance (isolated scrutineer, 2026-10-28)
tracker_rows: [fb-prose-fail-closed, preguard-inplace-spellings, preguard-bypass-records, plan-slug-normaliser, rules-text, r2-prose-shadow, r2-preguard-writes, r2-bypass-records, r2-plan-slug-strict, r3-prose-readback]
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
  round2:        5.1-5.3 (prose shadowing), 6.1-6.4 (writer detection), 7.1-7.2 (bypass records), 8.1-8.2 (planSlugOf parent check)
  round3:        9.1-9.3 (prose read back through $_ and history)
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
  - id: 5
    scope_id: r2-prose-shadow
    project: .
    depends_on: []
    module: scripts/lib/force-block.mjs blankProse (shadowed prose programs)
    language: javascript
    security: high
    scope:
      read: [scripts/lib/force-block.mjs, scripts/force-block-quoted.test.mjs]
      docs: [docs/architecture/state.rules.md, docs/architecture/landing.rules.md, docs/architecture/safety.rules.md]
      write: [scripts/lib/force-block.mjs, scripts/force-block-quoted.test.mjs]
    arch: [ARCH-LAND-31, ARCH-SAFETY-05, ARCH-STATE-16]
    tooling: { implementer: implementer, gates: [security-auditor, code-reviewer], skills: [test-driven-development], guards: [], mcp: [] }
  - id: 6
    scope_id: r2-preguard-writes
    project: .
    depends_on: [r2-prose-shadow]
    module: scripts/pre-guard.mjs in-place, unreadable-writer and sed w/W detection
    language: javascript
    security: high
    scope:
      read: [scripts/pre-guard.mjs]
      docs: [docs/architecture/safety.rules.md, docs/architecture/state.rules.md]
      write: [scripts/pre-guard.mjs, scripts/pre-guard-writes.test.mjs]
    arch: [ARCH-SAFETY-05, ARCH-SAFETY-03, ARCH-STATE-15]
    tooling: { implementer: implementer, gates: [security-auditor, code-reviewer], skills: [test-driven-development], guards: [], mcp: [] }
  - id: 7
    scope_id: r2-bypass-records
    project: .
    depends_on: [r2-prose-shadow, r2-preguard-writes]
    module: pre-guard sed and quoted-literal test files (round 2 bypass records)
    language: javascript
    security: high
    scope:
      read: [scripts/pre-guard-sed.test.mjs, scripts/pre-guard-quoted.test.mjs, scripts/pre-guard-writes.test.mjs]
      docs: [docs/architecture/safety.rules.md]
      write: [scripts/pre-guard-sed.test.mjs, scripts/pre-guard-quoted.test.mjs]
    arch: [ARCH-SAFETY-05]
    tooling: { implementer: implementer, gates: [security-auditor, code-reviewer], skills: [], guards: [], mcp: [] }
  - id: 8
    scope_id: r2-plan-slug-strict
    project: .
    depends_on: []
    module: scripts/lib/core.mjs planSlugOf
    language: javascript
    security: normal
    scope:
      read: [scripts/lib/core.mjs, scripts/plan-slug-normaliser.test.mjs]
      docs: [docs/architecture/state.rules.md, docs/architecture/tracker.rules.md]
      write: [scripts/lib/core.mjs, scripts/plan-slug-normaliser.test.mjs]
    arch: [ARCH-TRACKER-15, ARCH-TRACKER-16, ARCH-STATE-04]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [test-driven-development], guards: [], mcp: [] }
  - id: 9
    scope_id: r3-prose-readback
    project: .
    depends_on: []
    module: scripts/lib/force-block.mjs blankProse (prose read back through $_ and history)
    language: javascript
    security: high
    scope:
      read: [scripts/lib/force-block.mjs, scripts/force-block-quoted.test.mjs, scripts/pre-guard-quoted.test.mjs, scripts/pre-guard-sed.test.mjs]
      docs: [docs/architecture/safety.rules.md, docs/architecture/state.rules.md, docs/architecture/landing.rules.md]
      write: [scripts/lib/force-block.mjs, scripts/force-block-quoted.test.mjs, scripts/pre-guard-quoted.test.mjs, scripts/pre-guard-sed.test.mjs]
    arch: [ARCH-SAFETY-05, ARCH-SAFETY-03, ARCH-STATE-16, ARCH-LAND-31]
    tooling: { implementer: implementer, gates: [security-auditor, code-reviewer], skills: [test-driven-development], guards: [], mcp: [] }
---
# Scrutinise round 1 — investigate-stop-gate-foreign-acceptance

**Summary (rolling).** Round 1 (2026-10-28, isolated scrutineer over the 9 unit merges, floor 1304/1304, arch lint PASS): 1 Critical, 3 Warning, 7 Suggestion. Criteria UNMET and unticked by root: `[unit:preguard-sed]` auditor PASS, `[unit:preguard-quoted-literals]` auditor PASS, both `[unit:force-block-quoted]` lines. Root reproduced findings 1, 2 and 3 at HEAD (`destructiveGit` returns null for all six forms). Disputed: none.

Round 2 (2026-10-28, isolated scrutineer over e6c0c55..2637399, floor 1369/1369, arch lint PASS): 3 Critical, 4 Warning, 2 Suggestion. All six open auditor-PASS criteria UNMET (parent `[unit:preguard-sed]`, `[unit:preguard-quoted-literals]`, `[unit:force-block-quoted]`; the security part of `[unit:fb-prose-fail-closed]`, `[unit:preguard-inplace-spellings]`, `[unit:preguard-bypass-records]`); their functional parts are MET. Root reproduced findings 1-6 at HEAD (each exits 0, or `destructiveGit` returns null; e6c0c55 refused them). Disputed: none. Gate fix 2637399 restored the setter-word prose clause in ARCH-SAFETY-05 that task 4.1 had dropped: the guard still refuses `echo 'hooks read CLAUDE_PROJECT_DIR first'` (safety-claims.test.mjs 41.0), so the rule now states both the narrowed check and the kept false positive.

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

### Step 5 — r2-prose-shadow (., javascript, HIGH)
Tooling: implementer · gates security-auditor, code-reviewer · skills test-driven-development
Depends on: none
Round 2 findings 3, 4, 5 (one root cause: blankProse trusts a program name the same command can repoint).
- [ ] 5.1 `blankProse` (force-block.mjs:182) returns its input unchanged (fail closed) when the text holds a word `hash`, `enable`, `alias`, `PATH=`, `export PATH`, `PROMPT_COMMAND` or `BASH_ENV`, or when an assignment prefix (`NAME=value`) precedes the prose program word (today :201 skips leading assignments silently) → accept: `destructiveGit` returns a verdict for `hash -p /usr/bin/env grep; grep "git" "reset" "--hard"`, `hash -p /usr/bin/env grep; grep git "push" "-f" origin main` and `PATH=/tmp/p:$PATH grep "git reset --hard"`
- [ ] 5.2 Extend `scripts/force-block-quoted.test.mjs` RED on 2637399: every 5.1 probe, plus `enable -n echo; echo "git push -f origin main"` and `alias grep=sh; grep "git clean -fd"`, in the fail-closed (blocked) list; the existing allowed prose cases (`grep -n "git reset --hard" x`, the loop echo) stay allowed → accept: `node --test scripts/force-block-quoted.test.mjs scripts/lib/force-block.test.mjs scripts/pre-guard-narrow.test.mjs scripts/pre-guard-quoted.test.mjs` exit 0; lease-to-own-branch cases unchanged
- [ ] 5.3 security-auditor over blankProse: no prose program can be repointed, shadowed or prefixed into live code and still be blanked → accept: auditor PASS, every attempt a case in force-block-quoted.test.mjs

### Step 6 — r2-preguard-writes (., javascript, HIGH)
Tooling: implementer · gates security-auditor, code-reviewer · skills test-driven-development
Depends on: r2-prose-shadow
Round 2 findings 1, 2, 6. Add no `shellSegments` call; test 24.2 in pre-guard.test.mjs stays unchanged. Grep pre-guard.mjs for `INPLACE_TEXT`, `WRITE_TEXT`, `SED_W_TEXT` and `scopedMentioned`; read only what each edit needs.
- [ ] 6.1 The in-place check (INPLACE_TEXT :356, used near :1467) also runs on a copy of the command whose quoted spans are emptied, so a quoted `;`, `|` or `&` in the script before `-i`/`--in-place` cannot end the scan → accept: `sed -e 's/a/b/;s/c/d/' -i .claude/settings.json`, `sed 's/a/b/;s/c/d/' -i craftsman.config.json`, `sed '1d;2d' -i hooks/hooks.json`, `perl -pe 's/a/b/;' -i hooks/hooks.json`, `sed -e '/x/{s/a/b/;}' --in-place=.bak craftsman.config.json` and `sed 's/a/b/;s/c/d/' -i .craftsman/off` exit 2
- [ ] 6.2 The unreadable-command check (near :1474) uses a writer pattern that still lists plain `sed` and `perl`, so a variable command word that can write and names craftsman state is refused → accept: `x=sed; $x -i 's/x/y/' .claude/settings.json`, `x=sed; "$x" -i 's/x/y/' .claude/settings.json`, `x=sed; ${x} --in-place 's/x/y/' .claude/settings.json` and `p=perl; $p -pi -e 's/x/y/' .claude/settings.json` exit 2; `sed -n 1,5p README.md` and `grep -n "sed -i" scripts/x.mjs; cat craftsman.config.json` still exit 0
- [ ] 6.3 SED_W_TEXT (:358) matches the `W` command as well as `w`, and when a sed w/W is present a protected name may follow the w/W directly (scopedMentioned near :1469) → accept: `sed 's/a/b/w.claude/settings.json' x`, `sed 's/a/b/whooks/hooks.json' x`, `sed -n 'W craftsman.config.json' x`, `sed -n 'Whooks/hooks.json' x` and `sed -n '1Wcraftsman.config.json' x` exit 2
- [ ] 6.4 Create `scripts/pre-guard-writes.test.mjs` with the Write tool (harness as pre-guard-inplace.test.mjs: spawn `node scripts/pre-guard.mjs` in an `fs.mkdtempSync` git-init dir, removed with `fs.rmSync` in node), RED on 2637399, holding every 6.1-6.3 probe as blocked and the 6.2 allowed cases → accept: `node --test scripts/pre-guard-writes.test.mjs scripts/pre-guard-inplace.test.mjs scripts/pre-guard-sed.test.mjs scripts/pre-guard-quoted.test.mjs scripts/pre-guard.test.mjs scripts/pre-guard-narrow.test.mjs` exit 0 and `grep -c shellSegments scripts/pre-guard.mjs` = 2; security-auditor PASS
Path note: as Step 2.

### Step 7 — r2-bypass-records (., javascript, HIGH)
Tooling: implementer · gates security-auditor, code-reviewer
Depends on: r2-prose-shadow, r2-preguard-writes
The parent criteria name the files that must record each bypass: `[unit:preguard-sed]` → scripts/pre-guard-sed.test.mjs, `[unit:preguard-quoted-literals]` → scripts/pre-guard-quoted.test.mjs.
- [ ] 7.1 Copy every probe of pre-guard-writes.test.mjs into `scripts/pre-guard-sed.test.mjs`, plus `for f in a; do hash -p /usr/bin/env grep; grep "sed" "-i" 's/x/y/' .claude/settings.json; done`; and into `scripts/pre-guard-quoted.test.mjs` `hash -p /usr/bin/env grep; grep "CLAUDE_PROJECT_DIR=/tmp/x" node a.mjs`, the same with `CRAFTSMAN_SAFETY`, `PATH=/tmp/p:$PATH grep "CLAUDE_PROJECT_DIR=/tmp/x node a.mjs"`, `enable -n echo; hash -p /usr/bin/env echo; echo "CLAUDE_PROJECT_DIR=/tmp/x" node a.mjs` and `for f in a; do hash -p /usr/bin/env grep; grep "rm" "-rf" ".craftsman"; done` (quoted and unquoted `.craftsman`) — all as blocked cases in each file's own harness style (Read, then Edit; absolute worktree paths) → accept: `node --test scripts/pre-guard-sed.test.mjs scripts/pre-guard-quoted.test.mjs scripts/pre-guard-writes.test.mjs` exit 0
- [ ] 7.2 security-auditor over the merged pre-guard and force-block state: every bypass it tries is recorded in the parent-named file → accept: auditor PASS
Path note: as Step 2.

### Step 8 — r2-plan-slug-strict (., javascript, normal)
Tooling: implementer · gates code-reviewer · skills test-driven-development
Depends on: none
Round 2 finding 8.
- [ ] 8.1 `planSlugOf` (core.mjs:352) maps a path to its basename only when the file's parent directory is `docs/plans` (any prefix: `./docs/plans/x.md`, `sub/docs/plans/x.md`, `docs/plans/x`); any other path is null → accept: `docs/plans/x/TRACKER.md` → null, `src/notes.md` → null; the round-1 table (3.1) unchanged
- [ ] 8.2 Extend `scripts/plan-slug-normaliser.test.mjs` RED on 2637399 with the 8.1 cases → accept: `node --test scripts/plan-slug-normaliser.test.mjs scripts/acceptance-plan-scope.test.mjs scripts/orchestrate-scope-guard.test.mjs scripts/lib/core.test.mjs scripts/stop-gate-plan-scope.test.mjs` exit 0

### Step 9 — r3-prose-readback (., javascript, HIGH)
Tooling: implementer · gates security-auditor, code-reviewer · skills test-driven-development
Depends on: none
Round 3 findings 1, 2. The fix lives in blankProse only; no pre-guard.mjs change, so `grep -c shellSegments scripts/pre-guard.mjs` stays 2.
- [ ] 9.1 `blankProse` (force-block.mjs) returns its input unchanged (fail closed) when the text can read back an earlier argument or history: `$_`, `${_`, `BASH_ARGV`, `BASH_ARGC`, `BASH_COMMAND`, history expansion `!$`, `!!`, `!:`, `!*`, and the words `fc` and `history` → accept: pre-guard exits 2 for `echo "CLAUDE_PROJECT_DIR=/tmp/x"; export "$_"`, `echo "CLAUDE_PROJECT_DIR=/tmp/x"; declare -x "$_"`, `grep -n "CLAUDE_PROJECT_DIR=x" README.md; typeset -x "$_"`, `echo "CRAFTSMAN_SAFETY=off"; export "${_}"`, `echo "CLAUDE_PROJECT_DIR=/tmp/x"; readonly "$_"; node a.mjs`, `echo "CLAUDE_PROJECT_DIR=/tmp/x"; export -- "$_"; node a.mjs`, `echo x "CLAUDE_PROJECT_DIR=/tmp/x"; env "$_" node a.mjs`, `echo "CLAUDE_PROJECT_DIR=/tmp/x" && export "$_"`, `echo "CLAUDE_PROJECT_DIR=/tmp/x" || export "$_"`, `echo "CLAUDE_PROJECT_DIR=/tmp/x"; export "$BASH_ARGV"`, `echo "CLAUDE_PROJECT_DIR=/tmp/x"; export !$`, `grep -s x "rm -rf .craftsman"; for f in a; do $_; done` and `grep -s x "sed -i s/a/b/ .claude/settings.json"; for f in a; do $_; done`
- [ ] 9.2 Record, RED on f0407a4, each 9.1 probe as a blocked case: the assignment and loop-removal forms in `scripts/pre-guard-quoted.test.mjs`, the sed form in `scripts/pre-guard-sed.test.mjs`, and `echo "git reset --hard"; $_`, `echo "git reset --hard"; eval "$_"` and `for b in x; do echo "git reset --hard"; $_; done` in the fail-closed list of `scripts/force-block-quoted.test.mjs`; the existing allowed prose cases (`echo "CLAUDE_PROJECT_DIR=/tmp/x node a.mjs"`, `grep "rm -rf .craftsman" x; for f in a; do echo; done`, `grep -n "git reset --hard" x`) stay allowed → accept: `node --test scripts/force-block-quoted.test.mjs scripts/lib/force-block.test.mjs scripts/pre-guard-quoted.test.mjs scripts/pre-guard-sed.test.mjs scripts/pre-guard-writes.test.mjs scripts/pre-guard.test.mjs scripts/pre-guard-narrow.test.mjs` exit 0
- [ ] 9.3 security-auditor over blankProse and its two pre-guard callers (removedDocs loop blanking, safetyText): no blanked text can be read back, repointed or executed later in the same command → accept: auditor PASS, every attempt a recorded case

## Sequencing
Steps 1 and 3 are independent. Step 2 follows step 1 (pre-guard calls blankProse). Step 4 runs last so its cites match the final code. Round 2: steps 5 and 8 are independent; step 6 follows step 5; step 7 follows both. Round 3: step 9 alone.

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

**Round 2 findings (verbatim classes):**
1. Critical Security/Architecture — pre-guard.mjs:356 INPLACE_TEXT stops at a quoted `;`; :359 WRITE_TEXT lost plain sed/perl (f3cde44). Six probes exit 0, were 2. ARCH-SAFETY-05. → 6.1
2. Critical Security/Architecture — pre-guard.mjs:1474 unreadable-command check uses WRITE_TEXT; variable command words (`x=sed; $x -i …`) exit 0, were 2. ARCH-SAFETY-05. → 6.2
3. Critical Security/Architecture — force-block.mjs:201-205 blankProse trusts a repointable program name (`hash -p`, `PATH=` prefix, `enable -n`, alias); safety-variable assignments exit 0, were 2. ARCH-SAFETY-05. → 5.1, 7.1
4. Warning Security — pre-guard.mjs:483 loop blanking: same shadowing lets `rm -rf .craftsman` and `sed -i` inside a loop through. ARCH-SAFETY-03/05. → 5.1, 7.1
5. Warning Security — force-block.mjs:215: shadowed grep arguments spelling destructive git return null. ARCH-LAND-31. → 5.1, 5.2
6. Warning Security — pre-guard.mjs:358 SED_W_TEXT / :1469 scopedMentioned miss `w` glued to the file name and uppercase `W` (pre-existing). ARCH-SAFETY-05. → 6.3, 7.1
7. Suggestion Security — gitTargets: `cd W && trap 'cd A' DEBUG && git commit -m x` from the main checkout exits 0 (was 2). The worktree git target code comes from 42de5ea/f332d69, which belong to plan scrutinise-investigate-cross-repo-worktree-git-guard, not this plan. Flagged follow-up for that plan; not driven here.
8. Suggestion Cross-unit — core.mjs:352 planSlugOf maps any `<dir>/<file>.md` to its basename. → 8.1
9. Warning Test-coverage — no recorded case for findings 1-6. → 5.2, 6.4, 7.1

**Pre-existing gaps, out of scope (both versions allow; the sandbox owns them, ARCH-SAFETY-01):** `sed 's/a|b/c/' -i …`, `perl -e 'open F,">…"'`, `awk '{print > "…"}'`, non-loop `hash -p` shadowing of rm.

**Round 2 residual risk (scrutineer):** alias shadowing needs `expand_aliases` (unconfirmed in Claude Code's shell); `PATH=` forms need a planted wrapper while `hash -p` needs nothing; the gitTargets guard was not probed exhaustively; /auto's live hook path was exercised only through `destructiveGit`.

**Round 3 (2026-10-28, main f0407a4, floor 1418/1418, lint PASS) — NOT ISOLATED probe phase.** The isolated scrutineer read both diffs statically and found that every 625731f..f0407a4 change only adds deny branches, but it was stopped before its probe phase. Root ran the probes: a replay of the round-2 corpus (about 170 commands) at HEAD vs e6c0c55 changes only the intended prose fixes, so the new class below is the only regression found.
1. Critical Security/Architecture — blankProse's blanked quoted text is read back in the same command through `$_`/`${_}`, so it becomes a live assignment or command; confirmed in bash (`echo "FOO=bar"; export "$_"` sets FOO). Callers pre-guard.mjs:513 and :1516-1518. ARCH-SAFETY-05, ARCH-SAFETY-03, ARCH-STATE-16. → 9.1
2. Warning Test-coverage — none recorded. → 9.2
3. Suggestion Correctness — force-block.mjs:185 REPOINTS matches its words anywhere, so `grep "alias" file` is no longer blanked (fails closed; usability only). Not driven.
Disputed: "planSlugOf null for non-plan paths may break callers" — at 7019c4b planSlugOf already returned null for every path not shaped `docs/plans/x.md`, and each CONSUMERS caller predates round 1 and handles null. Dropped.
Round 3 pre-existing gaps (allowed at e6c0c55 and HEAD; the sandbox owns them, ARCH-SAFETY-01): non-loop `hash -p` shadowing of grep naming `sed -i`/`rm -rf`, `find … -exec sed -i`, `perl -pe` without `-i`, plus round 2's list.

CONSUMERS:
- `planSlugOf` (core.mjs:352): orchestrate-scope-guard.mjs:135 (command args), stop-gate.mjs:350 (ledger plan), core.mjs:390 (ledger plan), core.mjs:510 and :516 (acceptance `[plan:]` tags), core.mjs:1191 (bindingAcceptance plans). The basename change only turns null into a slug for path-shaped inputs; existing slug and `docs/plans/<slug>.md` inputs are unchanged.
- `blankProse` (force-block.mjs:180): force-block.mjs `destructiveGit`; pre-guard.mjs:481, :1462, :1511 (all already guard backslashes themselves).
