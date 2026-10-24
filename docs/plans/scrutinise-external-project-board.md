---
slug: scrutinise-external-project-board
goal: The archive, landing and export code behaves as the views, archive and landing rules say: no double-rewritten pointers, no main-checkout move without a retire, no delete or write through a symlink, one classifier, no import cycle.
level: feature
priority: P1
classification: in-scope # rounds 1-2 of an isolated /scrutinise of external-project-board; this doc keeps a rolling summary plus the latest round (ARCH-DOCS-10)
tracker_rows: []
guards:
  blast_radius: done
  completeness_sweep: done
  blind_rederivation: skipped(the decomposition came from an isolated /scrutinise with file-level fixes, and the root re-read every Warning at file:line)
coverage:
  security:      fix-clear-notes-and-auto-event # clearNotes refuses a symlinked .craftsman or export dir; temp-file sweep; ls-tree argument validated
  tests:         every unit # each fix ships a case that fails on the previous code
  observability: fix-clear-notes-and-auto-event # a real retire({auto:true}) logs one doc_retired with auto true
  docs:          N/A(no doc changes; rule mismatches wait for the owner, D1 and D2)
  rollback:      every unit is one commit; revert it
units:
  - id: fix-pointer-rewrite-and-ff
    scope_id: fix-pointer-rewrite-and-ff
    project: .
    depends_on: []
    module: scripts/doc-retire.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/doc-retire.mjs, scripts/lib/archive.mjs, scripts/doc-retire.test.mjs, scripts/auto-archive.test.mjs]
      docs: [docs/architecture/docs.rules.md, docs/architecture/landing.rules.md, docs/architecture/archive.rules.md, docs/architecture/tracker.rules.md]
      write: [scripts/doc-retire.mjs, scripts/lib/archive.mjs, scripts/doc-retire.test.mjs, scripts/auto-archive.test.mjs]
    arch: [ARCH-DOCS-13, ARCH-DOCS-14, ARCH-LAND-30, ARCH-ARCHIVE-03, ARCH-TRACKER-02]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [], guards: [arch-check], mcp: [] }
  - id: fix-clear-notes-and-auto-event
    scope_id: fix-clear-notes-and-auto-event
    project: .
    depends_on: [fix-pointer-rewrite-and-ff]
    module: scripts/lib/export-notes.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/lib/export-notes.mjs, scripts/tracker-sync.mjs, scripts/tracker.mjs, scripts/lib/archive.mjs, scripts/doc-retire.test.mjs, scripts/export-notes.test.mjs, scripts/tracker-sync.test.mjs, scripts/archive.test.mjs, scripts/tracker.test.mjs]
      docs: [docs/architecture/views.rules.md, docs/architecture/archive.rules.md, docs/architecture/tracker.rules.md, docs/architecture/docs.rules.md]
      write: [scripts/lib/export-notes.mjs, scripts/tracker-sync.mjs, scripts/tracker.mjs, scripts/lib/archive.mjs, scripts/doc-retire.test.mjs, scripts/export-notes.test.mjs, scripts/tracker-sync.test.mjs, scripts/archive.test.mjs, scripts/tracker.test.mjs]
    arch: [ARCH-VIEWS-11, ARCH-ARCHIVE-03, ARCH-DOCS-14, ARCH-TRACKER-02, ARCH-TRACKER-09]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [], guards: [arch-check], mcp: [] }
  - id: fix-cycle-and-classifier-leftovers
    scope_id: fix-cycle-and-classifier-leftovers
    project: .
    depends_on: [fix-clear-notes-and-auto-event]
    module: scripts/tracker.mjs
    language: javascript
    security: normal
    scope:
      read: [scripts/tracker.mjs, scripts/lib/ledger-keys.mjs, scripts/doc-retire.mjs, scripts/lib/archive.mjs, scripts/tracker-sync.mjs, scripts/views-wiring.test.mjs, scripts/doc-retire.test.mjs, scripts/tracker.test.mjs]
      docs: [docs/architecture/tracker.rules.md, docs/architecture/views.rules.md, docs/architecture/docs.rules.md]
      write: [scripts/tracker.mjs, scripts/lib/ledger-keys.mjs, scripts/doc-retire.mjs, scripts/lib/archive.mjs, scripts/tracker-sync.mjs, scripts/views-wiring.test.mjs, scripts/doc-retire.test.mjs, scripts/tracker.test.mjs]
    arch: [ARCH-VIEWS-15, ARCH-DOCS-14, ARCH-TRACKER-02, ARCH-TRACKER-09]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [arch-check], mcp: [] }
---

# Plan: scrutinise external-project-board

## Outcome
Two isolated `/scrutinise` rounds of `external-project-board`. Round 1 found the dashboard queue empty, NEXT.md lines never removed, a wrong sibling restore path, an unconditional main-checkout fast-forward and symlink-following writes; six units fixed them (all COMPLETE). Round 2 (range `2d2a67f..8432d18`, 0 Critical, 4 Warnings) found the fixes left a cross-document pointer double-rewrite, a fast-forward that can still precede a refused retire, an unguarded `clearNotes` delete and no test of the real `auto` event. Root re-read all four at `file:line`. Two owner decisions (D1, D2) are not code and stay PARKED for `/auto` Phase C.

## Rolling summary
| Round | Steps | Built in | What the review found and what changed |
|---|---|---|---|
| 1 | six units | 4c828fb to 8432d18 | 10 Warnings, 2 unjustified ticks; fixed: dashboard queue and lanes (ARCH-PLAN-08 amends PLAN-05), NEXT.md retirement, sibling restore path, landing side effects, symlink-safe atomic export writes, one `classifyArchive`, SRI, lazy path helpers |
| 2 | 1.1-3.5 | (this round) | 4 Warnings (pointer double rewrite across docs, fast-forward before a refusable retire, `clearNotes` through a symlink, no real `auto` event test), reopened ticks for `fix-landing-side-effects` and `fix-suggestions`; fixes below |

## Tasks

### Step 1 — fix-pointer-rewrite-and-ff (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor
Depends on: none
- [ ] 1.1 In `scripts/doc-retire.mjs` (`rewriteLine`, ~:208-215) rewrite each line in ONE pass: a single alternation over every doc's plan path and slug, with a replacer that looks up the matched doc, so a pointer written for one doc is never rewritten for another → accept: a test with docs `[alpha, beta]`, product id `beta` and the line `see alpha here` yields `see archive:beta/plans/alpha@<sha> here` exactly once (ARCH-DOCS-13)
- [ ] 1.2 Make `autoArchiveEligible` (`scripts/lib/archive.mjs`) refuse on open `scrutinise-`/`investigate-` siblings and on live descendants, with the same checks `retire` applies (`doc-retire.mjs` ~:118-128 and ~:150), so eligibility predicts what `retire` will do → accept: a reason-bearing table case for each
- [ ] 1.3 In `autoArchive`, evaluate the git-tree parts of eligibility (tracked, clean) against the landed `sha` (`git ls-tree`/`cat-file`) or re-check after the fast-forward, so a doc that exists only in the landed merge is not reported as untracked → accept: a case where the plan doc exists only in the landed merge is eligible
- [ ] 1.4 Add tests in `scripts/auto-archive.test.mjs`: an open sibling, a live descendant, and a referrer brought by the merge each leave the main checkout HEAD and working tree untouched → accept: the first two fail on the previous code (ARCH-LAND-30)
- [ ] 1.5 Run `node --test scripts/doc-retire.test.mjs scripts/auto-archive.test.mjs scripts/repo-exec.test.mjs` → accept: green; `repo-exec.test.mjs` unedited

### Step 2 — fix-clear-notes-and-auto-event (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor
Depends on: fix-pointer-rewrite-and-ff
- [ ] 2.1 In `scripts/lib/export-notes.mjs` add a check-only variant of `verifiedExportDir` (lstat plus realpath, no mkdir) and call it at the top of `clearNotes` (~:262-270); refuse and return nothing removed otherwise → accept: with a symlinked `.craftsman`, and with a symlinked `.craftsman/export`, `clearNotes` unlinks nothing outside the export tree (ARCH-VIEWS-11)
- [ ] 2.2 Add to `scripts/doc-retire.test.mjs`: `retire({plan, auto: true})` writes exactly one `doc_retired` event with `auto === true`, a manual retire writes none with `auto`; add the descendant NEXT.md line case and the prefix-slug case (`alpha` retired, `alpha-two` kept) → accept: removing the `auto` spread at `doc-retire.mjs:351` turns the first test red (ARCH-DOCS-14)
- [ ] 2.3 Sweep stale `.<name>.<pid>.<ts>.tmp` files in the verified export directory at the start of a write (`export-notes.mjs` ~:46) → accept: a stale temp file is removed on the next write; a fresh one from a live pid is not
- [ ] 2.4 In `scripts/tracker.mjs` (~:563) validate `rec.archive` against `/^[0-9a-f]{7,40}$/` before `git ls-tree` (or pass `--end-of-options`) → accept: a heading with archive value `--output=x` yields no restore command and runs no git option (ARCH-TRACKER-02 headings unchanged)
- [ ] 2.5 In `scripts/lib/archive.mjs` `copyAndCommit` (~:80-86) also walk the source path components under the source root for symlinks and refuse → accept: a symlinked `docs/plans` source directory is refused without a commit (ARCH-ARCHIVE-03)
- [ ] 2.6 Run `node --test scripts/export-notes.test.mjs scripts/tracker-sync.test.mjs scripts/doc-retire.test.mjs scripts/archive.test.mjs scripts/tracker.test.mjs` → accept: green

### Step 3 — fix-cycle-and-classifier-leftovers (., javascript, normal)
Tooling: implementer implementer · gates code-reviewer
Depends on: fix-clear-notes-and-auto-event
- [ ] 3.1 Break the static cycle `tracker.mjs → lib/ledger-keys.mjs:4 → tracker.mjs` by moving the shared helper so `ledger-keys.mjs` does not import `tracker.mjs`; widen the guard in `scripts/views-wiring.test.mjs` (~:61) to match `from "…"` without the line anchor (multi-line imports) and assert no edge back from `ledger-keys.mjs` → accept: the guard fails on the previous graph and passes now
- [ ] 3.2 Build `retireCheck` (`doc-retire.mjs` ~:74-88, which feeds `doc_retire_candidate` and `approval-gate`) from `classifyArchive(...).hits` so it no longer lists the plan's own `docs/plans/<slug>/TRACKER.md` rollup or its sibling as referrers → accept: the candidate event and the dashboard agree for the same plan (ARCH-VIEWS-15)
- [ ] 3.3 Import `isMain` from `scripts/lib/core.mjs` (~:1179) in `scripts/tracker-sync.mjs` (~:71-74) and `scripts/tracker.mjs` (~:602), removing the local copy and the `file://argv` idiom → accept: `wiring.test.mjs` unchanged and green; the hook still runs through a symlinked plugin path
- [ ] 3.4 Make the `archive.mjs`/`doc-retire.mjs` import edge one-way by moving the shared piece, or record it as accepted in a code comment with the reason → accept: the guard in 3.1 covers the chosen result
- [ ] 3.5 Run the full suite and `node scripts/arch-check.mjs lint` → accept: both pass

## Owner decisions (not code; PARKED rows for `/auto` Phase C)
- **D1 decide-auto-archive-authority.** `retire()` (`doc-retire.mjs:113`) ignores `auto: true` and still needs the session doc-write grant, which a landing session does not hold; the automatic archive probably always refuses, and every `auto-archive.test.mjs` case stubs `retire`. Options: (a) `land-feature` passes an explicit landing-approval token that `retire` accepts for the auto path only; (b) require and document the doc-write grant; (c) drop the automatic path. Recommended: (a). After the decision, add an end-to-end test with a real archive repo. Round 2 adds that any caller can pass `auto: true` on stdin, so a manual retire can be logged as automatic; the token in (a) would also fix that.
- **D2 decide-rule-mismatches.** (i) ARCH-VIEWS-04 says the workspace manifest is not read and ARCH-VIEWS-11 omits repo-wide content, but ARCH-VIEWS-15 needs referrer data: amend VIEWS-04/11 via `/architect`, or derive candidates without the manifest. (ii) ARCH-VIEWS-08 names `.craftsman/dashboard.url`, `commands/digest.md:16` uses `.craftsman/export/dashboard.url`: amend the rule to the export tree (recommended), then tighten `views-wiring.test.mjs:17`. (iii) ARCH-ARCHIVE-07's check names a prune-round-cap case in `archive.test.mjs` that does not exist, and ARCH-ARCHIVE-05 requires a rejected archive push to PARK though the push is prose only (`commands/_sync-docs-prune.md:14`): add the test and a scripted push with park handling, or amend the checks.

## Verification background
CONSUMERS:
- `rewriteLine` and `retire` (`scripts/doc-retire.mjs:208,351`) → `scripts/lib/archive.mjs` (`autoArchive`), `scripts/doc-retire.test.mjs`, `scripts/auto-archive.test.mjs`
- `autoArchiveEligible`, `classifyArchive`, `holdsLanding` (`scripts/lib/archive.mjs`) → `scripts/repo-exec.mjs` (`landFeature`), `scripts/lib/dashboard.mjs`, `scripts/doc-retire.mjs`
- `clearNotes`, `verifiedExportDir`, `atomicWrite` (`scripts/lib/export-notes.mjs`) → `scripts/tracker-sync.mjs:57`, `scripts/lib/dashboard.mjs`, `scripts/export-notes.test.mjs`
- `retireCheck` (`scripts/doc-retire.mjs:74`) → `scripts/approval-gate.mjs`, the `doc_retire_candidate` event in `scripts/repo-exec.mjs`
- `restoreCommandFor` (`scripts/tracker.mjs:558`) → `lookupArchive`, `scripts/lib/dashboard.mjs`

Owner follow-ups (recorded, not fixed): `auto: true` can be passed by any stdin caller (covered by D1 option a); the lstat-to-rename time-of-check gap in `atomicWrite` needs a local writer in `.craftsman`, low risk; `restoreCommandFor` falls back to the owner folder for a primary plan named `scrutinise-*` or `investigate-*` when `git ls-tree` fails (`tracker.mjs:558-566`). Residual risks from round 1 still stand: the Stop fingerprint ignores workspace-manifest, config and test changes; Stop cost grows with closed plans; bare-slug ledger keys are never auto-archive candidates; a leaked test row (`docs/plans/p.md`, u1) sits in the real ledger.
