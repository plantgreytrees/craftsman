---
slug: external-project-board
goal: A generated dashboard and notes folder show Craftsman work in other tools, a NEXT.md queue plans sessions, and finished plans move to a workspace archive repo.
level: feature
idea: docs/ideas/external-project-board.md
priority: P2
classification: in-scope (docs/ideas/external-project-board.md verdict pursue-with-changes, status architected; docs/architecture/views.rules.md, archive.rules.md, docs.rules.md ARCH-DOCS-13/14)
tracker_rows: [TRACKER#external-project-board]
guards:
  blast_radius: done
  completeness_sweep: done
  blind_rederivation: skipped(config:never)
coverage:
  contract:      1.1 | archive heading gains `archive <sha>`; doc-retire gains findReferrers; digest gains --html; consumers in the CONSUMERS block
  data:          2.4 | archive repo tree layout; 8.2 export notes tree (generated, local, never committed)
  config:        2.1 | archive.project; 10.2 export.enabled, export.atStop; planning.featureBranches stays as is
  security:      2.3 | path traversal refused; 3.3 nothing removed before a verified copy; 8.4 inbox path and untrusted text; 9.2 HTML escaping; 11.2 Stop hook fail-open; 13.3 publish only by hand
  tests:         every step has its own test task; new files scripts/archive.test.mjs, auto-archive.test.mjs, next-queue.test.mjs, export-notes.test.mjs, dashboard.test.mjs, tracker-sync.test.mjs, views-wiring.test.mjs
  observability: 2.5 | archive_copied, archive_refused, archive_push_pending, archive_rewrite; 7.4 next_queue_lint; 11.3 dashboard_render; 11.4 stats p50/p95
  interface:     10.1 | digest --html, --publish; 6.3 /sync-docs --archive text; 13.2 /idea inbox; 9.2 the HTML page states (empty, offline diagram)
  docs:          6.2 | sync-docs trade; 13.1 digest.md; 14.1 CHANGELOG; docs/architecture already written by /architect
  rollback:      2.1 | no archive project means retirement is unchanged; export.enabled false removes all generation; archive repo commits are inert
units:
  - id: archive-lib
    scope_id: archive-lib
    project: .
    depends_on: []
    module: scripts/lib/archive.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/lib/core.mjs, craftsman.config.json]
      docs: [docs/architecture/archive.rules.md, docs/architecture/engine.rules.md]
      write: [scripts/lib/archive.mjs, scripts/archive.test.mjs, craftsman.config.json]
    arch: [ARCH-ARCHIVE-01, ARCH-ARCHIVE-02, ARCH-ARCHIVE-06, ARCH-ARCHIVE-08, ARCH-ENGINE-12]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [], guards: [], mcp: [] }
  - id: tracker-heading
    scope_id: tracker-heading
    project: .
    depends_on: [archive-lib]
    module: scripts/tracker.mjs
    language: javascript
    security: normal
    scope:
      read: [scripts/tracker.mjs, scripts/tracker.test.mjs, scripts/lib/archive.mjs]
      docs: [docs/architecture/archive.rules.md, docs/architecture/tracker.rules.md]
      write: [scripts/tracker.mjs, scripts/tracker.test.mjs]
    arch: [ARCH-ARCHIVE-04, ARCH-TRACKER-02, ARCH-TRACKER-09]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [], mcp: [] }
  - id: retire-copy
    scope_id: retire-copy
    project: .
    depends_on: [archive-lib, tracker-heading]
    module: scripts/doc-retire.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/doc-retire.mjs, scripts/doc-retire.test.mjs, scripts/lib/archive.mjs, scripts/tracker.mjs, scripts/wiring.test.mjs]
      docs: [docs/architecture/docs.rules.md, docs/architecture/archive.rules.md]
      write: [scripts/doc-retire.mjs, scripts/doc-retire.test.mjs]
    arch: [ARCH-DOCS-07, ARCH-DOCS-08, ARCH-DOCS-09, ARCH-DOCS-13, ARCH-ARCHIVE-03, ARCH-ARCHIVE-06, ARCH-ARCHIVE-08]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [], guards: [], mcp: [] }
  - id: retire-rewrite
    scope_id: retire-rewrite
    project: .
    depends_on: [retire-copy]
    module: scripts/doc-retire.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/doc-retire.mjs, scripts/doc-retire.test.mjs, scripts/lib/archive.mjs]
      docs: [docs/architecture/docs.rules.md, docs/architecture/archive.rules.md]
      write: [scripts/doc-retire.mjs, scripts/doc-retire.test.mjs]
    arch: [ARCH-DOCS-13, ARCH-ARCHIVE-08]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [], guards: [], mcp: [] }
  - id: auto-archive
    scope_id: auto-archive
    project: .
    depends_on: [retire-copy]
    module: scripts/repo-exec.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/repo-exec.mjs, scripts/doc-retire.mjs, scripts/lib/archive.mjs]
      docs: [docs/architecture/docs.rules.md, docs/architecture/landing.rules.md, docs/architecture/archive.rules.md]
      write: [scripts/lib/archive.mjs, scripts/repo-exec.mjs, scripts/auto-archive.test.mjs]
    arch: [ARCH-DOCS-14, ARCH-LAND-06, ARCH-LAND-19, ARCH-ARCHIVE-03, ARCH-ARCHIVE-05]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [], guards: [], mcp: [] }
  - id: archive-commands
    scope_id: archive-commands
    project: .
    depends_on: [retire-rewrite, auto-archive]
    module: commands/sync-docs.md
    language: markdown
    security: normal
    scope:
      read: [commands/sync-docs.md, commands/_sync-docs-prune.md, scripts/doc-size-policy.mjs, scripts/doc-size-policy.test.mjs]
      docs: [docs/architecture/docs.rules.md, docs/architecture/slim.rules.md, docs/architecture/archive.rules.md]
      write: [commands/sync-docs.md, commands/_sync-docs-prune.md, scripts/doc-size-policy.mjs]
    arch: [ARCH-DOCS-14, ARCH-ARCHIVE-05, ARCH-ARCHIVE-07, ARCH-SLIM-02, ARCH-SLIM-03]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [], mcp: [] }
  - id: next-queue
    scope_id: next-queue
    project: .
    depends_on: []
    module: scripts/lib/next-queue.mjs
    language: javascript
    security: normal
    scope:
      read: [scripts/lib/plan-index.mjs, scripts/tracker.mjs, scripts/arch-check.mjs, scripts/arch-check.test.mjs]
      docs: [docs/architecture/views.rules.md, docs/architecture/docs.rules.md, docs/architecture/plan.rules.md]
      write: [scripts/lib/next-queue.mjs, scripts/next-queue.test.mjs, scripts/arch-check.mjs, scripts/arch-check.test.mjs]
    arch: [ARCH-VIEWS-06, ARCH-VIEWS-07, ARCH-VIEWS-10, ARCH-DOCS-03, ARCH-PLAN-05]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [], mcp: [] }
  - id: export-notes
    scope_id: export-notes
    project: .
    depends_on: [tracker-heading]
    module: scripts/lib/export-notes.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/lib/core.mjs, scripts/lib/plan-index.mjs, scripts/tracker.mjs]
      docs: [docs/architecture/views.rules.md]
      write: [scripts/lib/export-notes.mjs, scripts/export-notes.test.mjs]
    arch: [ARCH-VIEWS-11, ARCH-VIEWS-12, ARCH-VIEWS-13, ARCH-VIEWS-14]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [], guards: [], mcp: [] }
  - id: dashboard-core
    scope_id: dashboard-core
    project: .
    depends_on: [next-queue, export-notes]
    module: scripts/lib/dashboard.mjs
    language: javascript
    security: normal
    scope:
      read: [scripts/lib/next-queue.mjs, scripts/lib/export-notes.mjs, scripts/lib/plan-index.mjs, scripts/digest.mjs]
      docs: [docs/architecture/views.rules.md]
      write: [scripts/lib/dashboard.mjs, scripts/dashboard.test.mjs]
    arch: [ARCH-VIEWS-04, ARCH-VIEWS-10, ARCH-VIEWS-11]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor, ui-ux-reviewer], skills: [], guards: [], mcp: [] }
  - id: digest-html
    scope_id: digest-html
    project: .
    depends_on: [dashboard-core]
    module: scripts/digest.mjs
    language: javascript
    security: normal
    scope:
      read: [scripts/digest.mjs, scripts/digest.test.mjs, scripts/loop-smoke.test.mjs, scripts/lib/dashboard.mjs, scripts/lib/export-notes.mjs, craftsman.config.json]
      docs: [docs/architecture/tracker.rules.md, docs/architecture/views.rules.md, docs/architecture/engine.rules.md]
      write: [scripts/digest.mjs, scripts/digest.test.mjs, craftsman.config.json]
    arch: [ARCH-TRACKER-01, ARCH-VIEWS-05, ARCH-VIEWS-11, ARCH-ENGINE-12]
    tooling: { implementer: implementer, gates: [code-reviewer], skills: [], guards: [], mcp: [] }
  - id: stop-refresh
    scope_id: stop-refresh
    project: .
    depends_on: [digest-html]
    module: scripts/tracker-sync.mjs
    language: javascript
    security: high
    scope:
      read: [scripts/tracker-sync.mjs, scripts/stats.mjs, scripts/stats.test.mjs, scripts/lib/dashboard.mjs, scripts/lib/export-notes.mjs, scripts/wiring.test.mjs, hooks/hooks.json]
      docs: [docs/architecture/tracker.rules.md, docs/architecture/views.rules.md, docs/architecture/mod.rules.md]
      write: [scripts/tracker-sync.mjs, scripts/tracker-sync.test.mjs, scripts/stats.mjs, scripts/stats.test.mjs]
    arch: [ARCH-TRACKER-01, ARCH-VIEWS-05, ARCH-VIEWS-10, ARCH-VIEWS-13, ARCH-MOD-03]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor, observability-reviewer], skills: [], guards: [], mcp: [] }
  - id: dashboard-archive-tab
    scope_id: dashboard-archive-tab
    project: .
    depends_on: [dashboard-core, retire-copy]
    module: scripts/lib/dashboard.mjs
    language: javascript
    security: normal
    scope:
      read: [scripts/lib/dashboard.mjs, scripts/dashboard.test.mjs, scripts/doc-retire.mjs, scripts/lib/archive.mjs, scripts/tracker.mjs]
      docs: [docs/architecture/views.rules.md, docs/architecture/docs.rules.md]
      write: [scripts/lib/dashboard.mjs, scripts/dashboard.test.mjs]
    arch: [ARCH-VIEWS-11, ARCH-VIEWS-15]
    tooling: { implementer: implementer, gates: [code-reviewer, ui-ux-reviewer], skills: [], guards: [], mcp: [] }
  - id: view-commands
    scope_id: view-commands
    project: .
    depends_on: [digest-html, export-notes]
    module: commands/digest.md
    language: markdown
    security: high
    scope:
      read: [commands/digest.md, commands/idea.md, scripts/doc-size-policy.mjs, scripts/doc-size-policy.test.mjs, scripts/lib/export-notes.mjs, scripts/descriptions.test.mjs]
      docs: [docs/architecture/views.rules.md, docs/architecture/slim.rules.md]
      write: [commands/digest.md, commands/idea.md, scripts/doc-size-policy.mjs, scripts/views-wiring.test.mjs]
    arch: [ARCH-VIEWS-08, ARCH-VIEWS-09, ARCH-VIEWS-14, ARCH-SLIM-02, ARCH-SLIM-03]
    tooling: { implementer: implementer, gates: [code-reviewer, security-auditor], skills: [], guards: [], mcp: [] }
  - id: changelog
    scope_id: changelog
    project: .
    depends_on: [archive-commands, stop-refresh, dashboard-archive-tab, view-commands]
    module: CHANGELOG.md
    language: markdown
    security: normal
    scope:
      read: [CHANGELOG.md]
      docs: [docs/architecture/slim.rules.md]
      write: [CHANGELOG.md]
    arch: [ARCH-SLIM-08]
    tooling: { implementer: implementer, gates: [], skills: [], guards: [], mcp: [] }
---

# Plan: A visual layer, notes for other tools, and a workspace archive

## Outcome
A generated dashboard and notes folder show Craftsman work in other tools, a NEXT.md queue plans sessions, and finished plans move to a workspace archive repo.

## Scope Steps (executable core)

### Step 1 — archive-lib (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor
Depends on: none
- [ ] 1.1 Add `archive: { project: "archive" }` to `craftsman.config.json` → accept: the config loads and the key is present; `node --test scripts/*.test.mjs scripts/lib/*.test.mjs` stays green
- [ ] 1.2 Add `resolveArchive(context)` in `scripts/lib/archive.mjs` returning `{id, root}` or `{off: reason}` when there is no workspace manifest, the id is not registered, or the checkout is uninitialised (ARCH-ARCHIVE-01) → accept: a test per off case and one hit using a temp workspace with a Git root
- [ ] 1.3 Add `archivePathFor({productId, kind, slug, file})` with layout `<productId>/<kind>/<slug>/<file>`, `kind` only plans or ideas, refusing `..`, absolute paths and any `docs/architecture` file (ARCH-ARCHIVE-02/06) → accept: traversal and rules-doc refusal tests
- [ ] 1.4 Add `copyAndCommit({archive, productId, kind, slug, files}, seams)`: copy each file, verify byte equality, commit only the copied pathspecs in the archive repo, never push; errors are thrown as `Error` (doc-retire turns them into its `refuse()`); `seams` injects the git runner and the copy function so failures can be simulated; re-running with identical content makes no new commit and returns the existing sha; a merge or rebase in progress in the archive repo, or an `index.lock`, refuses cleanly → accept: temp-repo tests for success, a corrupted copy aborting before any commit, idempotent re-run, an in-progress merge, and a held `index.lock`
- [ ] 1.5 Log `archive_copied {plan, archive_sha, files}` and `archive_refused {plan, reason}` through `logEvent` (ARCH-ARCHIVE-08) → accept: events asserted in the test
- [ ] 1.6 Add `restoreCommand(archiveRoot, sha, path)` returning the `git -C <archive> show <sha>:<path>` string → accept: a string test
- [ ] 1.7 Run `node --test scripts/archive.test.mjs` → accept: all pass

### Step 2 — tracker-heading (., javascript, normal)
Tooling: implementer implementer · gates code-reviewer
Depends on: archive-lib
- [ ] 2.1 Extend `formatArchiveHeading` with an optional `archive` appended after `landed <sha>` only when given → accept: a heading with and without it; every existing fixture line is byte-identical
- [ ] 2.2 Extend `parseArchiveHeading` and `lookupArchive` to return `archive` (null when absent); `lookup` also returns the `restoreCommand` when an archive project resolves → accept: lookup tests with and without the sha
- [ ] 2.3 Let `archivePlan` accept `archive` and pass it to the heading → accept: archive test reads the heading from `TRACKER-archive.md`
- [ ] 2.4 Run `node --test scripts/tracker.test.mjs scripts/doc-retire.test.mjs` unchanged → accept: green with no edits to existing assertions (ARCH-TRACKER-02)

### Step 3 — retire-copy (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor
Depends on: archive-lib, tracker-heading
- [ ] 3.1 Extract the referrer scan into an exported read-only `findReferrers(context, plan, slug)` (it keeps the existing `context.git` seam and writes nothing) returning `{hits, blocking, rewritable}`: blocking = a rule `cite:` or `source:`, a `scripts/*.test.mjs`, a top-level `*.md`; rewritable = a prose doc under `docs/plans` or `docs/ideas` incl. `related:`; `docs/plans/NEXT.md` ignored; with no archive project every hit except NEXT.md is blocking → accept: a table test by referrer kind with and without an archive project
- [ ] 3.2 Remove the retired plan's line from `docs/plans/NEXT.md` in the same commit when present; NEXT.md is never a referrer (ARCH-DOCS-13) → accept: a fixture with a NEXT.md line
- [ ] 3.3 When an archive project resolves, call `copyAndCommit` for the plan and its closed siblings before `git rm`; a failed copy, verification or commit refuses with nothing removed and the existing rollback intact (ARCH-ARCHIVE-03) → accept: a test where the copy fails leaves every doc, the ledger and `TRACKER-archive.md` untouched
- [ ] 3.4 Pass the archive sha to `archivePlan` so each heading carries `archive <sha>` → accept: the heading in the test fixture
- [ ] 3.5 Add `archive` to the `doc_retired` event (additive, ARCH-DOCS-08) → accept: event test
- [ ] 3.6 With no archive project the whole flow is unchanged → accept: `node --test scripts/doc-retire.test.mjs scripts/wiring.test.mjs` passes with no edits to existing assertions

### Step 4 — retire-rewrite (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor
Depends on: retire-copy
- [ ] 4.1 Add a dry-run mode returning `[{file, line, before, after}]` for every rewritable referrer, with pointers `archive:<productId>/<kind>/<slug>@<sha>` (sha shown as pending), writing nothing → accept: a test asserting no file changed and the output lists each line
- [ ] 4.2 Apply the rewrites only when the input carries the dry run's digest as `confirm_rewrites`; a missing or stale digest refuses and lists the referrers → accept: missing, stale and matching digest tests
- [ ] 4.3 Apply rewrites in the same commit as the removal; a blocking referrer still refuses the whole retirement; any failure restores the rewritten files with the existing rollback (ARCH-DOCS-13) → accept: rollback test restoring all files
- [ ] 4.4 Log `archive_rewrite {file, plan}` per file → accept: events asserted

### Step 5 — auto-archive (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor
Depends on: retire-copy
Note: `land-feature` runs only with `planning.featureBranches` (`scripts/repo-exec.mjs:571`). This step wires the automatic archive there. Whether non-feature repos get a second trigger is open question Q1 of the hand-off; do not add one without an answer. If the retire cannot run inside land-feature without breaking ARCH-LAND-14 or ARCH-TRACKER-11, PARK with a decision (ARCH-ENGINE-07).
- [ ] 5.1 Add `autoArchiveEligible(context, plan)` in `scripts/lib/archive.mjs`: an archive project resolves, every row of the plan is COMPLETE or CANCELLED, `findReferrers` returns no hit at all, and the doc is tracked and clean → accept: a reason-bearing table test per condition
- [ ] 5.2 After `land-feature` has promoted the rows and pushed, call the retire with `auto: true` only when eligible; the archive repo is committed locally and `archive_push_pending {commit}` is logged, never pushed (ARCH-ARCHIVE-05) → accept: a test that no push to the archive remote happens
- [ ] 5.3 A retire refusal or exception never changes the landing result and never parks the unit (ARCH-LAND-06 stays for real landing failures) → accept: the landing result is identical when retire is refused or throws
- [ ] 5.4 Run `node --test scripts/auto-archive.test.mjs scripts/repo-exec.test.mjs` unchanged → accept: green with no edits to repo-exec.test.mjs

### Step 6 — archive-commands (., markdown, normal)
Tooling: implementer implementer · gates code-reviewer
Depends on: retire-rewrite, auto-archive
- [ ] 6.1 Measure `commands/sync-docs.md` (cap 9312), `commands/_sync-docs-prune.md` (cap 1575) and the sync-docs invocation cap (16242) → accept: the three numbers recorded in the commit message
- [ ] 6.2 Trim `commands/sync-docs.md` by at least the bytes step 6.3 adds, deleting prose a script already enforces first, then prose moved into a doc the command already reads (ARCH-SLIM-05) → accept: file smaller by at least that many bytes
- [ ] 6.3 Extend `_sync-docs-prune.md` for `--archive`: retire into the archive project, show the link-rewrite dry run and wait for confirmation, push the archive repo with a plain push owner-run only, retry `archive_push_pending`, `--prune --archive` in confirmed rounds of at most 15, never covered by `/goal` pre-approval → accept: each clause present, no `--force`, no `-f`
- [ ] 6.4 Lower the `commands/sync-docs.md` cap and raise the `_sync-docs-prune.md` cap by no more than the bytes removed in `scripts/doc-size-policy.mjs`; the invocation cap does not rise → accept: `node --test scripts/doc-size-policy.test.mjs scripts/descriptions.test.mjs` passes

### Step 7 — next-queue (., javascript, normal)
Tooling: implementer implementer · gates code-reviewer
Depends on: none
- [ ] 7.1 Add `parseNext(text)` for `N. <slug> — <intent>` lines → accept: parse tests incl. blank lines and a missing file returning an empty list
- [ ] 7.2 Add `queue(context)`: NEXT.md entries in written order, then the computed ready list (plans with a PENDING or IN_PROGRESS row and none PARKED or BLOCKED, ordered by priority P0..P3, parent `children:` order, then oldest `updated_at`); the first `execution.maxSessions` entries are lanes (ARCH-VIEWS-07) → accept: an ordering table test
- [ ] 7.3 Add `lintNext(context)` returning problems (`unresolved`, `status-word`, `complete`) and print them from `arch-check.mjs lint` as warnings that do not change its exit status → accept: lint tests with and without NEXT.md, and `node --test scripts/arch-check.test.mjs` unchanged
- [ ] 7.4 Log `next_queue_lint {slug, problem}` → accept: event test

### Step 8 — export-notes (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor
Depends on: tracker-heading
- [ ] 8.1 Add `exportRoot(context)` = the main checkout's `.craftsman/export` → accept: from a linked worktree it resolves to the main checkout
- [ ] 8.2 Build notes per ARCH-VIEWS-12: plan (type, slug, status rollup, progress, priority, parent, goal, updated, source), idea, area, archived plan (archive_sha); body is one goal line plus the source path; frontmatter carries `generated: true`; rollup is exported as `planStatusRollup` (all closed COMPLETE, any PARKED/BLOCKED that, all MERGED MERGED, all PENDING PENDING, no rows UNTRACKED, else IN_PROGRESS) → accept: a key-set test per type and a fixture proving no document body appears
- [ ] 8.3 `writeNotes(context)` writes and updates notes and removes only files carrying `generated: true` whose source is gone; it never touches `inbox/` or an unmarked file → accept: stale-removal, foreign-file and inbox-untouched tests
- [ ] 8.4 Add `takeInboxNote(context, file)`: the real path must lie inside `inbox/` (symlinks resolved), size at most 20 KB, returns text to be treated as untrusted, and moves the note to `inbox/done/` only after the caller confirms → accept: traversal, symlink-escape, oversize and move-after-confirm tests
- [ ] 8.5 Write a `README.md` into the notes root saying the folder is generated → accept: file exists after a write and is removable by the generator

### Step 9 — dashboard-core (., javascript, normal)
Tooling: implementer implementer · gates code-reviewer, security-auditor, ui-ux-reviewer
Depends on: next-queue, export-notes
- [ ] 9.1 Add `buildModel(context)` for six sections: plans board by ledger state, session queue, ideas by verdict, architecture map (rules by state, governs count, source idea, Mermaid blocks), the plan tree from plan-index, and doc size bars; titles, goals, fields and links only → accept: a fixture test of the model
- [ ] 9.2 Add `renderHtml(model)`: one self-contained file, inline CSS and JS, the only external resource one pinned Mermaid script from `cdn.jsdelivr.net/npm/mermaid@10.9.1`, an offline fallback showing the diagram source, every interpolated value HTML-escaped, light and dark themes, readable at 400 px → accept: a golden test, a test that a goal containing `</script><img onerror=1>` is escaped, and a test that no other `src` or `href` points off-page
- [ ] 9.3 Empty states for a repo with no ledger, no ideas or no NEXT.md → accept: an empty-repo render test
- [ ] 9.4 Log `dashboard_render {ms, skipped, sections}` → accept: event test

### Step 10 — digest-html (., javascript, normal)
Tooling: implementer implementer · gates code-reviewer
Depends on: dashboard-core
- [ ] 10.1 `node scripts/digest.mjs --html` writes `dashboard.html` and the notes folder under the export root and prints the file path; with no flag the output is byte-identical to today → accept: the existing digest tests and `loop-smoke.test.mjs` pass with no edits, plus a new `--html` test
- [ ] 10.2 Add config `export: { enabled: true, atStop: true }`; `enabled: false` makes `--html` print a one-line notice and write nothing → accept: a disabled-config test
- [ ] 10.3 `--html --publish` behaves as `--html` and additionally prints a final line `publish: <path>` for the command to act on; the script itself never publishes (ARCH-VIEWS-08) → accept: a test that no network or Artifact call exists in `digest.mjs`

### Step 11 — stop-refresh (., javascript, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor, observability-reviewer
Depends on: digest-html
- [ ] 11.1 Compute an input fingerprint (ledger, mtimes and sizes of `docs/ideas`, `docs/plans`, `docs/architecture`, `NEXT.md`, `TRACKER-archive.md`) stored beside the export → accept: unchanged inputs give the same fingerprint, a touched plan changes it
- [ ] 11.2 In `tracker-sync.mjs`, on the Stop event only, re-render dashboard and notes when `export.enabled`, `export.atStop` and the fingerprint changed, within a 6-second budget; any throw or timeout still exits 0; SessionStart and PostToolUse never render; the compact gate is never armed → accept: tests for skip-when-unchanged, throw-still-exits-0, timeout, and no render on the other events, plus `node --test scripts/wiring.test.mjs` unchanged
- [ ] 11.3 Log `dashboard_render` with `skipped: true` on a fingerprint hit → accept: event test
- [ ] 11.4 Report `dashboard_render` p50 and p95 in `stats.mjs` beside the hook latency section → accept: `node --test scripts/stats.test.mjs` plus a new section test

### Step 12 — dashboard-archive-tab (., javascript, normal)
Tooling: implementer implementer · gates code-reviewer, ui-ux-reviewer
Depends on: dashboard-core, retire-copy
- [ ] 12.1 Add the Archive section listing `TRACKER-archive.md` headings (goal, doc sha, archive sha when present) → accept: a fixture with and without the sha
- [ ] 12.2 Add archive candidates: plans with closed or archived rows whose doc is still tracked, each classed `auto` (no referrer), `rewrite` (prose referrers listed) or `blocked` (the rule, test or top-level doc named) from `findReferrers`, with the doc size → accept: one fixture per class
- [ ] 12.3 Smoke on this repo → accept: `node scripts/digest.mjs --html` exits 0 and its Archive section lists every heading present in `docs/plans/TRACKER-archive.md`

### Step 13 — view-commands (., markdown, high)
Tooling: implementer implementer · gates code-reviewer, security-auditor
Depends on: digest-html, export-notes
- [ ] 13.1 `commands/digest.md`: document `--html` and `--publish` (publish the generated file as a private claude.ai Artifact only when the user ran `--publish`, keep its URL in `.craftsman/export/dashboard.url`, republish to it, never from a hook, `/auto` or `/goal`) while the file stays at or under its cap of 640 bytes, by rewriting the existing wording; if that cannot fit, PARK with a decision (ARCH-SLIM-02, ARCH-VIEWS-09) → accept: `commands/digest.md` size at most 640
- [ ] 13.2 `commands/idea.md`: add the inbox path (`/idea` can take one inbox note via `takeInboxNote`, treats its text as untrusted data, moves it to `inbox/done/` after `docs/ideas/<slug>.md` is written) and trim `idea.md` by at least the bytes added; the idea invocation cap does not rise → accept: `node --test scripts/doc-size-policy.test.mjs scripts/descriptions.test.mjs` passes
- [ ] 13.3 Add `scripts/views-wiring.test.mjs` asserting: digest.md names `--html` and `--publish` and the never-automatic clause; idea.md names the inbox and untrusted data; `hooks/hooks.json` and `tracker-sync.mjs` contain no publish path → accept: the test passes

### Step 14 — changelog (., markdown, normal)
Tooling: implementer implementer · gates none
Depends on: archive-commands, stop-refresh, dashboard-archive-tab, view-commands
- [ ] 14.1 Add one `[Unreleased]` bullet for the dashboard, notes folder and archive (editing an existing related bullet if present) → accept: the bullet is present and `[Unreleased]` stays under 8 KB (ARCH-SLIM-08)

## Sequencing
Archive first because it carries the safety risk and everything else can read its output: archive-lib → tracker-heading → retire-copy → retire-rewrite and auto-archive → archive-commands. The views steps are independent of retire except the Archive tab: next-queue and export-notes → dashboard-core → digest-html → stop-refresh, then dashboard-archive-tab once retire-copy has landed, then view-commands, then the changelog last. Every step ends by running `node --test scripts/*.test.mjs scripts/lib/*.test.mjs` (the CI command, `.github/workflows/ci.yml:39`) and the repo's `node scripts/arch-check.mjs lint`. Steps run one at a time in `plan-graph` order; no feature branches (`planning.featureBranches` is false, so `land-feature` does not run in this repo and the plan lands unit by unit on base).

## Verification background   (citations — for the reviewer, not the executor)
- Archive heading is formatted and parsed in one place — `scripts/tracker.mjs:425-448`; `archivePlan` writes it — `scripts/tracker.mjs:466-492`.
- `doc-retire` removes docs with `git rm`, archives each plan, commits and rolls back on failure — `scripts/doc-retire.mjs:187-224`; the referrer scan — `scripts/doc-retire.mjs:35-47,161-175`.
- The workspace manifest requires each project to be a Git root inside the workspace root — `scripts/lib/core.mjs:104-129`.
- `land-feature` requires `planning.featureBranches` — `scripts/repo-exec.mjs:571`; it promotes rows to COMPLETE — `scripts/repo-exec.mjs:642-647`.
- The Stop hook is `tracker-sync.mjs` with a 10 s timeout — `hooks/hooks.json:29`; it is fail-open — `scripts/tracker-sync.mjs:1-15`.
- `.craftsman/` is ignored — `.gitignore:2`.
- Caps ratchet down only; digest 640, idea 7232, sync-docs 9312, prune 1575; invocation caps — `scripts/doc-size-policy.mjs:21-110`.
- `blindRederivation` is `never` and `featureBranches` is false — `craftsman.config.json:142-146`.
- A step over `execution.unitContextBytes` 122880 is refused — `craftsman.config.json:7`; `repo-exec.test.mjs` (61 KB) is left unedited to keep step 5 under budget.

CONSUMERS:
- `formatArchiveHeading`, `parseArchiveHeading`, `lookupArchive` (`scripts/tracker.mjs:425-455`): `scripts/tracker.mjs:455,485,509`; tests `scripts/tracker.test.mjs:384-430`, `scripts/doc-retire.test.mjs:420,583-625`; slug resolution by `tracker.mjs lookup` in `/auto`, `/instruction`, `/orchestrate` (ARCH-DOCS-06, `commands/auto.md:16`).
- `archivePlan` (`scripts/tracker.mjs:466`): `scripts/doc-retire.mjs:214-216`, `scripts/tracker.mjs:508`.
- `doc-retire.mjs` exports and CLI: `scripts/wiring.test.mjs`, `scripts/doc-retire.test.mjs`, `commands/_sync-docs-prune.md`.
- `buildDigest` and the default `digest.mjs` output: `scripts/loop-smoke.test.mjs:7,43`, `commands/digest.md:9`.
- `land-feature` result shape: `workflows/run.js`, `agents/unit-runner.md` and `commands/_features.md` (unchanged: the retire never alters the result).
- `craftsman.config.json` new keys `archive.project`, `export.enabled`, `export.atStop`: read only by the new code; defaults keep current behaviour.

## Risk & rollback
- The only destructive path is `doc-retire`; it copies, verifies and commits to the archive before removing, and keeps its existing rollback. With no archive project nothing changes.
- The Stop-time render is fail-open and budgeted; `export.enabled: false` turns all generation off.
- Revert: `git revert` the unit commits in reverse order; archive repo commits are inert history.
- Open: how an automatic archive fits `land-feature`'s ordering (step 5 note); the digest.md byte budget (step 13.1). Both PARK rather than guess.

## Out of scope
- A GitHub Projects or Backlog.md export; writing status or order back from any tool; a cross-repo dashboard; real registration of an archive repo in your workspace (a one-time setup you do before first use); the manual Obsidian and Quartz checks (the notes folder is verified by tests, the viewers by hand).
