---
slug: scrutinise-external-project-board
goal: The dashboard queue, NEXT.md retirement, archive restore paths and landing side effects behave as the views and archive rules say, and the export writes cannot follow a symlink out of the export tree.
level: feature
priority: P1
classification: in-scope # round 1 of an isolated /scrutinise of external-project-board (14 units merged, HEAD 2d2a67f); this doc keeps a rolling summary plus the latest round (ARCH-DOCS-10)
tracker_rows: []
guards:
  blast_radius: done
  completeness_sweep: done
  blind_rederivation: skipped(the decomposition came from an isolated /scrutinise with file-level fixes, and the root re-read the top findings at file:line)
coverage:
  security:      fix-export-write-safety # symlinked .craftsman/export and target files are refused, writes go through a temp file
  tests:         every unit # each fix ships a case that fails on the previous code
  docs:          fix-suggestions # one CHANGELOG bullet is corrected; rule mismatches wait for the owner (D1, D2)
  observability: fix-landing-side-effects # one doc_retired event carries auto
  rollback:      every unit is one commit; revert it
units:
  - id: fix-dashboard-queue
    scope_id: fix-dashboard-queue
    project: .
    depends_on: []
    module: scripts/lib/dashboard.mjs
    language: javascript
    security: normal
    scope:
      read: [scripts/lib/dashboard.mjs, scripts/lib/next-queue.mjs, scripts/dashboard.test.mjs]
      docs: [docs/architecture/views.rules.md]
      write: [scripts/lib/dashboard.mjs, scripts/dashboard.test.mjs]
    arch: [ARCH-VIEWS-07]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [arch-check], mcp: [] }
  - id: fix-retire-next-and-restore
    scope_id: fix-retire-next-and-restore
    project: .
    depends_on: [fix-dashboard-queue]
    module: scripts/doc-retire.mjs
    language: javascript
    security: normal
    scope:
      read: [scripts/doc-retire.mjs, scripts/tracker.mjs, scripts/lib/next-queue.mjs, scripts/doc-retire.test.mjs, scripts/tracker.test.mjs]
      docs: [docs/architecture/docs.rules.md, docs/architecture/archive.rules.md]
      write: [scripts/doc-retire.mjs, scripts/doc-retire.test.mjs, scripts/tracker.mjs, scripts/tracker.test.mjs]
    arch: [ARCH-DOCS-13, ARCH-ARCHIVE-04]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [arch-check], mcp: [] }
  - id: fix-landing-side-effects
    scope_id: fix-landing-side-effects
    project: .
    depends_on: [fix-retire-next-and-restore]
    module: scripts/lib/archive.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/lib/archive.mjs, scripts/doc-retire.mjs, scripts/repo-exec.mjs, scripts/auto-archive.test.mjs]
      docs: [docs/architecture/landing.rules.md, docs/architecture/docs.rules.md]
      write: [scripts/lib/archive.mjs, scripts/doc-retire.mjs, scripts/auto-archive.test.mjs]
    arch: [ARCH-LAND-30, ARCH-DOCS-14, ARCH-LAND-06]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [], guards: [arch-check], mcp: [] }
  - id: fix-export-write-safety
    scope_id: fix-export-write-safety
    project: .
    depends_on: [fix-landing-side-effects]
    module: scripts/lib/export-notes.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/lib/dashboard.mjs, scripts/lib/export-notes.mjs, scripts/tracker-sync.mjs, scripts/tracker-sync.test.mjs, scripts/export-notes.test.mjs, scripts/dashboard.test.mjs]
      docs: [docs/architecture/views.rules.md]
      write: [scripts/lib/dashboard.mjs, scripts/lib/export-notes.mjs, scripts/tracker-sync.mjs, scripts/tracker-sync.test.mjs, scripts/export-notes.test.mjs, scripts/dashboard.test.mjs]
    arch: [ARCH-VIEWS-11, ARCH-VIEWS-13]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [], guards: [arch-check], mcp: [] }
  - id: fix-one-classifier
    scope_id: fix-one-classifier
    project: .
    depends_on: [fix-export-write-safety]
    module: scripts/lib/archive.mjs
    language: javascript
    security: normal
    scope:
      read: [scripts/lib/archive.mjs, scripts/lib/dashboard.mjs, scripts/doc-retire.mjs, scripts/lib/plan-index.mjs, scripts/lib/export-notes.mjs, scripts/tracker.mjs]
      docs: [docs/architecture/views.rules.md, docs/architecture/docs.rules.md]
      write: [scripts/lib/archive.mjs, scripts/lib/dashboard.mjs, scripts/doc-retire.mjs, scripts/lib/plan-index.mjs, scripts/lib/export-notes.mjs, scripts/tracker.mjs, scripts/archive.test.mjs, scripts/dashboard.test.mjs, scripts/doc-retire.test.mjs]
    arch: [ARCH-VIEWS-15, ARCH-DOCS-14]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [arch-check], mcp: [] }
  - id: fix-suggestions
    scope_id: fix-suggestions
    project: .
    depends_on: [fix-one-classifier]
    module: scripts/lib/dashboard.mjs
    language: javascript
    security: normal
    scope:
      read: [scripts/lib/dashboard.mjs, scripts/lib/archive.mjs, scripts/tracker-sync.mjs, scripts/tracker.mjs, scripts/lib/export-notes.mjs, commands/_sync-docs-prune.md, CHANGELOG.md]
      docs: [docs/architecture/views.rules.md, docs/architecture/archive.rules.md, docs/architecture/slim.rules.md]
      write: [scripts/lib/dashboard.mjs, scripts/lib/archive.mjs, scripts/tracker-sync.mjs, scripts/tracker.mjs, scripts/lib/export-notes.mjs, scripts/archive.test.mjs, scripts/views-wiring.test.mjs, CHANGELOG.md]
    arch: [ARCH-VIEWS-11, ARCH-ARCHIVE-03, ARCH-SLIM-08]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [], guards: [arch-check], mcp: [] }
---

# Plan: scrutinise external-project-board

## Outcome
`/scrutinise` (isolated `craftsman:scrutineer`, HEAD `2d2a67f`) found that the 14 merged units pass their own tests but miss the real wiring: the dashboard queue is empty in real use, a canonical NEXT.md line is never removed on retirement, a sibling doc's restore path points at a folder that does not exist, every `land-feature` fast-forwards the main checkout, and the export writes follow symlinks. Root re-read the top findings at `file:line` (dashboard.mjs:94, doc-retire.mjs:269, archive.mjs:166-172, tracker.mjs:525-529). The units below fix them in a single chain (they share files, so no parallel merges). Two owner decisions (D1, D2) are not code and stay PARKED for `/auto` Phase C.

## Rolling summary
| Round | Steps | Built in | What the review found and what changed |
|---|---|---|---|
| 1 | 1.1-6.7 | (this round) | 10 Warnings, 2 unjustified ticks (`retire-copy` NEXT.md line, `changelog` behaves-as-before), 9 Suggestions; fixes below |

## Tasks

### Step 1 — fix-dashboard-queue (., javascript, normal)
Tooling: implementer implementer · gates code-reviewer
Depends on: none
- [ ] 1.1 In `scripts/lib/dashboard.mjs` (`buildModel`, ~:95) call `queue({ ...context, rows, sessions: loadConfig(context).execution?.maxSessions })` with the `rows` already computed at :77 → accept: `queue` receives rows and sessions
- [ ] 1.2 Add a test in `scripts/dashboard.test.mjs` that builds a real project (temp git repo with a ledger holding a PENDING row, no injected `rows` or `sessions`) and asserts `buildModel(projectContext(root)).queue` lists the ready plan and marks `execution.maxSessions` lanes → accept: the test fails on the previous code and passes now (ARCH-VIEWS-07)

### Step 2 — fix-retire-next-and-restore (., javascript, normal)
Tooling: implementer implementer · gates code-reviewer
Depends on: fix-dashboard-queue
- [ ] 2.1 In `scripts/doc-retire.mjs` (~:269) parse `docs/plans/NEXT.md` with `parseNext` from `scripts/lib/next-queue.mjs` and drop every entry whose slug is the retired plan, a retired sibling or a retired descendant; every other line stays byte-identical; keep the existing uncommitted-NEXT.md refusal → accept: a canonical `N. <slug> — <intent>` line is removed in the retire commit and unrelated lines are unchanged (ARCH-DOCS-13)
- [ ] 2.2 Replace the non-canonical fixtures at `scripts/doc-retire.test.mjs` (~:721, ~:729) with canonical lines; keep a case that a line for another slug survives → accept: the replaced test fails on the previous code
- [ ] 2.3 In `scripts/tracker.mjs` `restoreCommandFor` (~:525-529) resolve a sibling doc (`scrutinise-<slug>`, `investigate-<slug>`) to its owning plan slug, which is the folder `doc-retire.mjs:290` archives it under; plan docs keep their own slug → accept: `lookup` of a sibling prints the same path `doc-retire.test.mjs` asserts (`plans/<owner>/<sibling>.md`); add that test; the no-archive heading bytes and every existing fixture are unchanged (ARCH-ARCHIVE-04)
- [ ] 2.4 In `scripts/doc-retire.mjs` (~:235) rewrite the plan path and the slug form in one pass (a single alternation) so a product id equal to the slug cannot be rewritten inside a pointer just written → accept: a test with product id == slug yields exactly one `archive:<id>/plans/<slug>@<sha>` pointer
- [ ] 2.5 Run `node --test scripts/doc-retire.test.mjs scripts/tracker.test.mjs scripts/wiring.test.mjs` → accept: green; only the fixtures named in 2.2 changed

### Step 3 — fix-landing-side-effects (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor
Depends on: fix-retire-next-and-restore
- [ ] 3.1 In `scripts/lib/archive.mjs` (`autoArchive`, ~:160-176) move `holdsLanding` after `resolveArchive`, the all-rows-closed check and `autoArchiveEligible`, and fast-forward the main checkout only when a retire will actually run; otherwise log `doc_retire_skipped` and continue → accept: with no archive project, `land-feature` leaves the main checkout HEAD and working tree exactly as before (ARCH-LAND-30)
- [ ] 3.2 Log one `doc_retired` event per auto retire, carrying `auto: true`: have `retire` (`doc-retire.mjs`, event only) accept an `auto` flag and drop the second event at `archive.mjs:175` → accept: an auto retire writes exactly one `doc_retired` event with `auto: true`; a manual retire's event is unchanged (ARCH-DOCS-08)
- [ ] 3.3 Add tests in `scripts/auto-archive.test.mjs`: no archive project leaves the main checkout untouched; an ineligible plan leaves it untouched; the retire still never changes the landing result when it throws → accept: the first two fail on the previous code
- [ ] 3.4 Run `node --test scripts/auto-archive.test.mjs scripts/repo-exec.test.mjs scripts/doc-retire.test.mjs` → accept: green; `repo-exec.test.mjs` unedited

### Step 4 — fix-export-write-safety (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor
Depends on: fix-landing-side-effects
- [ ] 4.1 Add one helper in `scripts/lib/export-notes.mjs` that proves `.craftsman` and `.craftsman/export` under the main checkout are real directories (lstat, then realpath inside the main checkout) and refuses otherwise; refuse a symlinked target file → accept: a symlinked `export/`, a symlinked `.craftsman` and a symlinked `dashboard.html` are each refused (ARCH-VIEWS-11)
- [ ] 4.2 Write `dashboard.html`, the notes and `.fingerprint` through a temp file in the verified directory and rename it into place (`scripts/lib/dashboard.mjs` ~:230-233, `scripts/tracker-sync.mjs` ~:69-70, `export-notes.mjs`) → accept: a render killed before the rename leaves the previous file intact
- [ ] 4.3 In `scripts/tracker-sync.mjs` (~:73) compare `realpathSync` of both sides of the main-module check so a symlinked plugin path still runs the hook → accept: running the script through a symlink still calls `syncTrackerDoc`
- [ ] 4.4 Add the tests (symlinked export dir, symlinked file, symlinked script path, temp-file cleanup) and run `node --test scripts/tracker-sync.test.mjs scripts/export-notes.test.mjs scripts/dashboard.test.mjs scripts/wiring.test.mjs` → accept: green; any throw or timeout in the Stop render still exits 0 (ARCH-VIEWS-13)

### Step 5 — fix-one-classifier (., javascript, normal)
Tooling: implementer implementer · gates code-reviewer
Depends on: fix-export-write-safety
- [ ] 5.1 Add one exported classifier in `scripts/lib/archive.mjs` returning `auto | rewrite | blocked | not-archivable` with the blocking file, honouring the exemptions `retire` uses (the `removing` set, the parent rollup `docs/plans/<slug>/TRACKER.md`, the parent's `children` list, `docs/plans/NEXT.md`) and returning `not-archivable` when no archive project resolves → accept: a table test per class
- [ ] 5.2 Use it from `autoArchiveEligible` (`archive.mjs`), the dashboard candidates (`dashboard.mjs` ~:64-69) and `retire` (`doc-retire.mjs` ~:211-216), and export one `productIdFor(context)` (the `realpathSync` comparison) used by `doc-retire.mjs` and `tracker.mjs` → accept: no duplicate rule text remains; a test proves the dashboard label equals the `autoArchiveEligible` verdict for the same plan (ARCH-VIEWS-15, ARCH-DOCS-14)
- [ ] 5.3 Share `slugOf`, `listMd`, the `TRACKER[^/]*` pattern and the frontmatter-goal reader through `scripts/lib/plan-index.mjs` or `archive.mjs` → accept: `export-notes.mjs`, `dashboard.mjs`, `archive.mjs` and `doc-retire.mjs` import them
- [ ] 5.4 Run `node --test scripts/*.test.mjs scripts/lib/*.test.mjs` → accept: green; no existing assertion edited except where 2.2 and 3.3 already did

### Step 6 — fix-suggestions (., javascript, normal)
Tooling: implementer implementer · gates code-reviewer, security-auditor
Depends on: fix-one-classifier
- [ ] 6.1 Add `integrity="sha384-…"` and `crossorigin="anonymous"` to the pinned Mermaid script tag in `dashboard.mjs` (~:221), computing the hash from the pinned file; the offline source fallback stays → accept: the render test asserts both attributes and still finds exactly one external script
- [ ] 6.2 In `archive.mjs` `copyAndCommit` (~:85-98) `lstat` each path component under the archive root and the source file, and refuse a symlink → accept: a symlinked source and a symlinked archive subfolder are refused without any commit (ARCH-ARCHIVE-03)
- [ ] 6.3 Import `dashboard`, `export-notes` and `doc-retire` lazily inside `stopRefresh` (`tracker-sync.mjs`) and `restoreCommandFor` (`tracker.mjs`) so the `tracker → archive → doc-retire → tracker` cycle is gone and PostToolUse stays light → accept: no import cycle (a test imports `tracker.mjs` alone); `scripts/wiring.test.mjs` unchanged
- [ ] 6.4 Call `clearNotes` when `export.enabled` is false in `stopRefresh`, or delete the dead export → accept: disabling export removes the generated notes (only files marked `generated: true`)
- [ ] 6.5 Add `scripts/views-wiring.test.mjs` cases asserting `commands/_sync-docs-prune.md` has no `--force` or `-f`, names rounds of at most 15, is never covered by `/goal` pre-approval, and retries `archive_push_pending` → accept: the cases pass on the current text; no wording change to the command
- [ ] 6.6 Edit the existing `CHANGELOG.md` `[Unreleased]` bullet for this feature (no new bullet): the dashboard and notes render at Stop by default, `/digest --html`, `NEXT.md` queue and local auto-archive at `land-feature`; drop "all off without an archive project" → accept: `[Unreleased]` stays under 8 KB (ARCH-SLIM-08)
- [ ] 6.7 Run the full suite and `node scripts/arch-check.mjs lint` → accept: both pass

## Owner decisions (not code; PARKED rows for `/auto` Phase C)
- **D1 decide-auto-archive-authority.** `retire()` (`doc-retire.mjs:113`) ignores `auto: true` and still needs the session doc-write grant, which a landing session does not hold; the automatic archive probably always refuses, and every `auto-archive.test.mjs` case stubs `retire`. Options: (a) `land-feature` passes an explicit landing-approval token that `retire` accepts for the auto path only; (b) require and document the doc-write grant, so the auto archive works only in an owner session; (c) drop the automatic path. Recommended: (a). After the decision, add an end-to-end test with a real archive repo.
- **D2 decide-rule-mismatches.** (i) ARCH-VIEWS-04 says the workspace manifest is not read and ARCH-VIEWS-11 omits repo-wide content, but ARCH-VIEWS-15 needs referrer data (`dashboard.mjs:66` reads the manifest and runs three `git grep`s per candidate): amend VIEWS-04/11 via `/architect`, or derive candidates without the manifest. (ii) ARCH-VIEWS-08 names `.craftsman/dashboard.url`, `commands/digest.md:16` uses `.craftsman/export/dashboard.url`: amend the rule to the export tree (recommended), then tighten `views-wiring.test.mjs:17`. (iii) ARCH-ARCHIVE-07's check names a prune-round-cap case in `archive.test.mjs` that does not exist, and ARCH-ARCHIVE-05 requires a rejected archive push to PARK though the push is prose only (`commands/_sync-docs-prune.md:14`): add the test and a scripted push with park handling, or amend the checks.

## Verification background
CONSUMERS:
- `queue(context)` (`scripts/lib/next-queue.mjs:66`) → `scripts/lib/dashboard.mjs:94`, `scripts/arch-check.mjs`, `scripts/next-queue.test.mjs`
- `retire(input, context)` and the NEXT.md removal (`scripts/doc-retire.mjs:113,269`) → `scripts/lib/archive.mjs:172`, `scripts/doc-retire.test.mjs`, `scripts/auto-archive.test.mjs`, `scripts/approval-gate.mjs` (`retireCheck`)
- `parseArchiveHeading` / `lookupArchive` / `restoreCommandFor` (`scripts/tracker.mjs:477-530`) → `scripts/lib/export-notes.mjs`, `scripts/lib/dashboard.mjs`, `scripts/tracker.test.mjs`
- `autoArchive`, `autoArchiveEligible`, `holdsLanding` (`scripts/lib/archive.mjs:128-176`) → `scripts/repo-exec.mjs` (`landFeature` ~:557-667), `scripts/auto-archive.test.mjs`, `scripts/repo-exec.test.mjs`
- export writers (`dashboard.mjs:230`, `export-notes.mjs:186`, `tracker-sync.mjs:69`) → `scripts/tracker-sync.test.mjs`, `scripts/export-notes.test.mjs`, `scripts/dashboard.test.mjs`, `scripts/digest.mjs`

Residual risks (recorded, not fixed): the Stop fingerprint ignores workspace-manifest, config and test changes; Stop cost grows with the number of closed plans (one git spawn per heading, three `git grep`s per candidate; 204 ms on this repo); the ledger mixes bare-slug and path plan keys, so bare-slug plans are never auto-archive candidates (skipped silently); a leaked test row (`docs/plans/p.md`, u1, MERGED, evidence "abc", 2026-10-22) sits in the real ledger and predates this range, so find which test leaks.
