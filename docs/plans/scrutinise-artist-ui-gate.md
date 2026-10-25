---
slug: scrutinise-artist-ui-gate
goal: The ui gate reaches Artist's critic only with a report that matches the code, honours valid Artist justifications, and names the gate script plainly
level: feature
priority: P1
classification: in-scope # round 3 of an isolated /scrutinise of artist-ui-gate (round 1 c9efbfb, 5b0faf9; round 2 8ba334b)
tracker_rows: [TRACKER#fix-ui-gate-script, TRACKER#fix-ui-gate-wiring, TRACKER#fix-ui-gate-round2, TRACKER#fix-ui-gate-round3]
guards:
  blast_radius: done
  completeness_sweep: done
  blind_rederivation: skipped(config:never)
coverage:
  contract:      2.1, 2.2 (the ui-gate.mjs CLI argument order in its only consumer)
  data:          N/A(no persistence; run dirs are gitignored session state)
  config:        1.5, 3.5 (timeout override env var, clamped to int32)
  security:      1.2 (report screenshot names resolved inside the run dir only), 4.2 (justifications containment + JSON check)
  tests:         1.1-1.6, 2.2, 3.1-3.7, 4.1-4.3
  observability: 1.1 (reason "worktree not found: <path>")
  interface:     2.1 (CLI order), 2.3 (lens name in shared docs), 3.2 (reuse-check --justifications), 3.6 (manifest example)
  docs:          2.3, 3.6, 4.4
  rollback:      every unit is one merge commit; revert it
units:
  - id: fix-ui-gate-script
    scope_id: fix-ui-gate-script
    project: .
    depends_on: []
    module: scripts/ui-gate.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/ui-gate.mjs, scripts/ui-gate.test.mjs, scripts/lib/core.mjs]
      docs: [docs/architecture/gates.rules.md, docs/plans/scrutinise-artist-ui-gate.md]
      write: [scripts/ui-gate.mjs, scripts/ui-gate.test.mjs]
    arch: [ARCH-GATES-02, ARCH-GATES-03, ARCH-GATES-04, ARCH-GATES-05]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [test-driven-development], guards: [arch-check], mcp: [] }
  - id: fix-ui-gate-wiring
    scope_id: fix-ui-gate-wiring
    project: .
    depends_on: [fix-ui-gate-script]
    module: commands/_shared-execution.md
    language: markdown + javascript
    security: normal
    scope:
      read: [commands/_shared-execution.md, commands/_shared-machinery.md, commands/_scrutinise-deep.md, scripts/doc-size-policy.mjs, scripts/ui-gate.mjs, scripts/entry-surface.test.mjs]
      docs: [docs/architecture/gates.rules.md, docs/architecture/slim.rules.md, docs/architecture/engine.rules.md, docs/architecture/docs.rules.md]
      write: [commands/_shared-execution.md, commands/_shared-machinery.md, commands/_scrutinise-deep.md, scripts/doc-size-policy.mjs, scripts/entry-surface.test.mjs]
    arch: [ARCH-GATES-01, ARCH-SLIM-01, ARCH-SLIM-02, ARCH-ENGINE-04, ARCH-DOCS-09]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [verification-before-completion], guards: [arch-check, doc-size-policy], mcp: [] }
  - id: fix-ui-gate-round2
    scope_id: fix-ui-gate-round2
    project: .
    depends_on: [fix-ui-gate-wiring]
    module: scripts/ui-gate.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/ui-gate.mjs, scripts/ui-gate.test.mjs, scripts/lib/core.mjs, commands/_shared-machinery.md, scripts/doc-size-policy.mjs, agents/unit-runner.md]
      docs: [docs/architecture/gates.rules.md, docs/architecture/slim.rules.md, docs/plans/scrutinise-artist-ui-gate.md]
      write: [scripts/ui-gate.mjs, scripts/ui-gate.test.mjs, commands/_shared-machinery.md, scripts/doc-size-policy.mjs]
    arch: [ARCH-GATES-01, ARCH-GATES-03, ARCH-GATES-04, ARCH-GATES-05, ARCH-SLIM-01, ARCH-SLIM-02]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [test-driven-development], guards: [arch-check, doc-size-policy], mcp: [] }
  - id: fix-ui-gate-round3
    scope_id: fix-ui-gate-round3
    project: .
    depends_on: [fix-ui-gate-round2]
    module: scripts/ui-gate.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/ui-gate.mjs, scripts/ui-gate.test.mjs, commands/_shared-machinery.md, scripts/doc-size-policy.mjs, agents/unit-runner.md]
      docs: [docs/architecture/gates.rules.md, docs/architecture/slim.rules.md, docs/plans/scrutinise-artist-ui-gate.md]
      write: [scripts/ui-gate.mjs, scripts/ui-gate.test.mjs, commands/_shared-machinery.md, scripts/doc-size-policy.mjs]
    arch: [ARCH-GATES-01, ARCH-GATES-04, ARCH-GATES-05, ARCH-GATES-07, ARCH-SLIM-01, ARCH-SLIM-02]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [test-driven-development], guards: [arch-check, doc-size-policy], mcp: [] }
---

# Plan: scrutinise-artist-ui-gate — rolling summary + round 3

## Rolling summary
Round 1 (landed `c9efbfb`, `5b0faf9`): fixed the reversed `ui-gate.mjs` arguments in `_shared-execution.md:33` (Critical), with a wiring test; added the missing-worktree reason, exact screenshots, a stale-report filter, run-dir pruning, the timeout env var and project-tier tests; renamed the lens to `ui-ux-reviewer`. Round 2 (landed `8ba334b`): staleness measured from the merge-base so the critic is reachable; `--justifications` passed; format, rubric, timeout and test hardening. Round 3 (this round): a report from before a fix-round edit still counted; the user superseded ARCH-GATES-03 with ARCH-GATES-07 (`e0b6e7e`), so justifications must also be valid JSON; containment tests; plain gate naming.

## Outcome
The ui gate reaches Artist's critic only with a report that matches the code, honours valid Artist justifications, and names the gate script plainly.

## Scope Steps (executable core)

### Step 1 — fix-ui-gate-script (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor · skills test-driven-development · guards arch-check
Depends on: none
Every task writes its failing test in `scripts/ui-gate.test.mjs` first and records the red run.
- [ ] 1.1 Nonexistent worktree (finding 4, `scripts/ui-gate.mjs:109-116`): before `git rev-parse`, fall back with reason `worktree not found: <path>` when the path is not a directory → accept: a test passing a missing path gets that reason, not "spawn git ENOENT".
- [ ] 1.2 Exact screenshots (finding 5, `:21-23`, ARCH-GATES-04): parse the chosen `report.json`; take its `screenshots` values (file names relative to the report's directory, per Artist `scripts/verify.mjs`), resolve each with `path.resolve(dir, name)` and keep only paths inside that directory that exist; set `critic.screenshots` (absolute paths) and name them in the critic step instead of `<dir>/ screenshots`. Unparseable report, no `screenshots` key, or no surviving path → no critic, `a11y: true` → accept: tests for a valid report (absolute paths in field and step), a `../escape.png` entry dropped, and an unparseable report falling back to a11y.
- [ ] 1.3 Stale reports (finding 6, `:88-105,162-165`): ignore a report whose mtime is older than the worktree HEAD commit time (`git log -1 --format=%ct`) → accept: a test with a report touched before HEAD's commit yields no critic and `a11y: true`.
- [ ] 1.4 Prune run dirs (finding 7, `:135-137`): before `mkdtemp`, remove `<main>/.craftsman/ui-gate/run-*` directories older than 7 days; never follow symlinks, never touch other names → accept: a test with an old and a fresh `run-*` dir (mtime set via `fs.utimesSync`) keeps only the fresh one and a non-`run-` dir.
- [ ] 1.5 Timeout and odd exits (finding 8, `:17,146,151`): read the timeout from env `CRAFTSMAN_UI_GATE_TIMEOUT_MS` when it is a positive integer, else 60000 → accept: a sleeping stub with the env at 200 falls back with a timeout reason; a stub exiting 3 falls back; a stub killing itself with a signal falls back; all exit 0.
- [ ] 1.6 Project-tier precedence (finding 9, `ui-gate.test.mjs:111-121`) → accept: project `false` over user `true` falls back "not enabled"; local `true` over project `false` passes detection; `node --test scripts/ui-gate.test.mjs` green.

### Step 2 — fix-ui-gate-wiring (., markdown + javascript, normal)
Tooling: implementer implementer · gates code-reviewer · skills verification-before-completion · guards arch-check, doc-size-policy
Depends on: fix-ui-gate-script
- [ ] 2.2 FIRST, red: in `scripts/entry-surface.test.mjs` add a test that reads `commands/_shared-execution.md`, extracts the `ui-gate.mjs` invocation, and asserts its argument placeholders are `<worktree> <merge-base>`, matching the `usage:` line printed by `scripts/ui-gate.mjs` (run it with no args, read stderr) → accept: the test fails on the current doc.
- [ ] 2.1 Critical (finding 1/2, `commands/_shared-execution.md:33`, ARCH-GATES-01): swap to `ui-gate.mjs" <worktree> <merge-base>` (byte-neutral) → accept: 2.2 passes; `node scripts/ui-gate.mjs $PWD HEAD~1` reaches detection.
- [ ] 2.3 Lens name (finding 10): in `commands/_scrutinise-deep.md:20` and `commands/_shared-machinery.md:51` replace the `ui-gate` lens/gate name with `ui-ux-reviewer` (the a11y floor; Artist steps come from ui-gate.mjs); both files are at their caps, so trim at least the added bytes elsewhere in the same file without dropping a MUST sentence (ARCH-SLIM-06); lower each cap in `scripts/doc-size-policy.mjs` to the new size if it shrank → accept: `grep -n '\bui-gate\b' commands/_scrutinise-deep.md commands/_shared-machinery.md` finds only `ui-gate.mjs` mentions or nothing; `node scripts/doc-size-policy.mjs` PASS; `node --test scripts/*.test.mjs` green.

### Step 3 — fix-ui-gate-round2 (., javascript + markdown, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor · skills test-driven-development · guards arch-check, doc-size-policy
Depends on: fix-ui-gate-wiring
Every task writes its failing test in `scripts/ui-gate.test.mjs` first and records the red run.
- [ ] 3.1 Warning — staleness vs merge-base (`scripts/ui-gate.mjs:142,210`; unit-runner commits after verify, `agents/unit-runner.md:18`): compare report mtime to the merge-base commit time (`git log -1 --format=%ct <mergeBase>`, `mergeBase` from `:173`), not HEAD → accept: a fixture that writes the report, then commits the unit ≥1 s later, yields `critic`; the existing stale test is reframed as "report older than the merge-base" → no critic, `a11y: true`; no test relies on future mtimes to pass.
- [ ] 3.2 Warning — justifications (`:184-190`; Artist `reuse-check.mjs:252-256`): when `<dirname(report)>/justifications.json` exists for the fresh report, append `--justifications <abs path>` to the reuse-check argv; never pass it when the file is absent → accept: an argv-recording stub sees `--justifications <path>` with the file present and argv ending `--base <mb>` without it (update `ui-gate.test.mjs:141`).
- [ ] 3.3 Format detection (`:121`): match `^format:\s*(\d+)\s*$` and require `Number(m) === 2`, mirroring Artist's `formatOf` → accept: `format: 02` passes, `format: 3` falls back "not format 2".
- [ ] 3.4 Rubric check (`:215`): skip the critic (keep `a11y: true`) when `<installPath>/skills/create/references/rubric.md` does not exist → accept: a fixture install without the rubric yields no critic and `a11y: true`.
- [ ] 3.5 Timeout clamp (`:20-23`): accept `CRAFTSMAN_UI_GATE_TIMEOUT_MS` only as a positive integer ≤ 2147483647, else 60000 → accept: env `9999999999` does not kill a quick stub (route `artist`).
- [ ] 3.6 Manifest example (`commands/_shared-machinery.md:51`, ARCH-GATES-01): replace `ui-ux-reviewer` in the Gates example with `ui:ui-gate.mjs` (byte-neutral, 14 bytes each), so planners name the ui gate, not the a11y agent → accept: `grep -c ui-ux-reviewer` on that line is 0; file ≤ cap 6895; lower the cap if it shrank; `node scripts/doc-size-policy.mjs` PASS.
- [ ] 3.7 Tests: spawn/maxBuffer catch path (a stub writing >16 MiB to stdout falls back, exit 0); the unparseable / no-screenshots cases (`ui-gate.test.mjs:262-272`) each gain a fresh valid-report control in the same fixture that does yield `critic` → accept: `node --test scripts/*.test.mjs` green.

### Step 4 — fix-ui-gate-round3 (., javascript + markdown, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor · skills test-driven-development · guards arch-check, doc-size-policy
Depends on: fix-ui-gate-round2
Every task writes its failing test in `scripts/ui-gate.test.mjs` first and records the red run.
- [ ] 4.1 Warning — report older than the code (`scripts/ui-gate.mjs:159-160,201`; fix rounds re-run edit+commit without verify, `agents/unit-runner.md:20`; ARCH-GATES-04/05): the staleness floor becomes the max of the merge-base commit time and the newest mtime among existing files in `git diff --name-only -z <mergeBase>` (working tree vs merge-base) plus `git ls-files -z --others --exclude-standard`, excluding `.artist/`; use lstat, skip missing paths. Committing leaves mtimes alone, so a report written after the last edit and before the commit still counts → accept: report written, then a changed file touched later → no critic, `a11y: true`; files edited, then report, then a commit dated later → `critic`; fixtures that set report mtimes in the past also set the changed and untracked files' mtimes earlier.
- [ ] 4.2 Justifications must be valid JSON (ARCH-GATES-07, user choice "skip it and say so"): `justificationsOf` also parses the file; invalid → no `--justifications`, route stays `artist`, critic kept, and `reason` gains `; justifications.json ignored: invalid JSON` → accept: an argv-recording stub sees no `--justifications`, `reason` matches `/justifications\.json ignored: invalid JSON/`, `critic` present.
- [ ] 4.3 Containment tests (`justificationsOf`, `ui-gate.mjs:133`): `justifications.json` as a symlink to a file outside the report dir, and as a directory → argv ends at `--base <mb>` with no `--justifications` → accept: both tests pass; `node --test scripts/*.test.mjs` green.
- [ ] 4.4 Gate naming (`commands/_shared-machinery.md:51`, Artist peer review): write `ui-gate.mjs` instead of `ui:ui-gate.mjs` in the Gates example (it read like `plugin:agent`); lower its cap in `scripts/doc-size-policy.mjs` by the 3 bytes saved (ARCH-SLIM-01/02) → accept: `node scripts/doc-size-policy.mjs` PASS with the lowered cap.

## Sequencing
Script fixes first (the critic step text changes shape), then the wiring line and its test, which reads the script's usage line. Round 2 runs after both; round 3 after round 2.

## Verification background
- Usage `<worktree> <base-ref>` — `scripts/ui-gate.mjs:6,176`; consumer passes `<merge-base> <worktree>` — `commands/_shared-execution.md:33`; reproduced: documented order → `{"route":"fallback","reason":"not a git worktree: spawn git ENOENT"}`, correct order → detection reached.
- Caps at 0 headroom: `_shared-execution.md` 12766/12766, `_shared-machinery.md` 6897/6897, `_scrutinise-deep.md` 5459/5459 (`scripts/doc-size-policy.mjs`).
- Critic inputs are the report's screenshots — `docs/architecture/gates.rules.md:14` (ARCH-GATES-04).

CONSUMERS:
- `scripts/ui-gate.mjs` CLI → `commands/_shared-execution.md:33` (only consumer; `rg ui-gate.mjs commands agents workflows hooks`).
- `ui-gate` lens name → `commands/_scrutinise-deep.md:20`, `commands/_shared-machinery.md:51`.

## Findings (round 3, isolated scrutineer + Artist peer review)
Warning 2 (Correctness: report older than a fix-round edit suppresses the a11y floor; Architecture: `--justifications` outside decided ARCH-GATES-03, resolved by the user superseding it with ARCH-GATES-07) · Suggestion 4 (invalid-JSON path, containment tests, invalid-JSON test, `ui:ui-gate.mjs` naming). Disputed: none. Residual risk: mtime vs committer-time clock skew; TOCTOU between the realpath check and reuse-check's read (low: keys only become justification reasons).

## Findings (round 2, isolated scrutineer + Artist peer review)
Warning 2 (Correctness: stale filter vs HEAD makes critic unreachable; Correctness: justifications ignored) · Suggestion 6 (format regex, rubric check, timeout int32 clamp, manifest example, maxBuffer test, fresh-report controls). Disputed: none. The Artist session's round-7 review of `676f3b2..5b0faf9` found the same Warning independently. Residual risk: a SIGTERM-trapping child outlives the execFile timeout.

## Findings (round 1, isolated scrutineer)
Critical 1 (Correctness: arg order) · Warning 2 (Architecture ARCH-GATES-01; Test-coverage: no wiring test) · Suggestion 7 (worktree check, exact screenshots, stale report, run-dir prune, timeout/odd-exit tests, project-tier tests, lens name). Disputed: none. Residual risk noted: managed/enterprise settings and `--plugin-dir` installs are not modelled; repo-controlled `.artist/runs/<name>` text reaches a model-facing step string.
Out of scope, reported to the user: `agents/unit-runner.md`'s `S` helper sets `CLAUDE_PROJECT_DIR` inline, which `scripts/pre-guard.mjs` blocks, so unit-runners cannot run their land steps.

## Risk & rollback
Behaviour change: the critic step names files instead of a directory; stale or malformed reports now keep the a11y floor on. Revert the merge commits.

## Out of scope
The unit-runner `S` helper vs pre-guard conflict; modelling managed settings; Artist repo changes.
