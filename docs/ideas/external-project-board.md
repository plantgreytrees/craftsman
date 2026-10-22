---
slug: external-project-board
status: architected
verdict: pursue-with-changes
confidence: medium
depth: standard
isolation: NOT ISOLATED
created: 2026-10-23
updated: 2026-10-23
related: [docs/architecture/views.rules.md, docs/architecture/archive.rules.md, docs/architecture/docs.rules.md, docs/architecture/tracker.rules.md, docs/architecture/plan.rules.md, docs/architecture/landing.rules.md, docs/architecture/slim.rules.md, docs/ideas/dev-lifecycle-docs-plan.md (branch worktree-idea-dev-lifecycle-docs-plan), docs/architecture/approval.md (same branch)]
touches: [scripts/digest.mjs, commands/digest.md, commands/idea.md, commands/sync-docs.md, scripts/doc-retire.mjs, scripts/lib/dashboard.mjs, scripts/lib/export-notes.mjs, scripts/lib/next-queue.mjs, scripts/lib/archive.mjs, docs/plans/NEXT.md, scripts/tracker.mjs, scripts/lib/plan-index.mjs, scripts/plan-graph.mjs, craftsman.config.json, docs/architecture/tracker.rules.md, docs/architecture/plan.rules.md, CHANGELOG.md]
---

# Idea: A visual, multi-view layer over Craftsman's docs, with session planning

> **Re-evaluation (2026-10-23).** Round 1 judged "move docs into GitHub Projects" and concluded *reject replace, defer mirror, build a read-only board*. The owner then corrected the problem: it is **not** lost status. They still want docs to monitor current sessions. The repo has become chunky and they cannot browse it, being a visual learner, and want to plan sessions ahead and persist next steps. That changes the verdict's reasoning, not its direction. Round 1's isolated critique (idea-critic, standard) stands for the GitHub-Projects readings. **Round 2's critique below is NOT ISOLATED**: the one dispatch an `/idea` run is granted was spent in round 1.

## Proposal (neutral restatement)
**Problem.** Craftsman's output is dense markdown the maintainer finds hard to scan: `docs/ideas` 7 files / 172 KB, `docs/architecture` 19 files / 100 KB, `docs/plans` 17 files / 404 KB (largest: `scrutinise-autonomous-e2e-loop.md` 60 KB, `scrutinise-feature-branch-plans.md` 59 KB), plus `docs/plans/TRACKER.md` (111 lines). The maintainer reads visually and wants to scroll, see structure and switch views (board, roadmap, map, tree) instead of opening long files. They also want to lay out upcoming sessions in advance and have "next steps" persist between sessions.
**Claimed benefit.** Faster orientation, easier planning, less cumbersome review of trackers, architecture docs, ideas and plans.
**Beneficiary.** One maintainer, ~5 repos, several concurrent sessions.
**Done.** From any repo the maintainer can open one visual view, see ideas by verdict, plans by ledger state, the plan hierarchy, the architecture areas and what each governs, and an ordered "next sessions" queue, and can write down that queue so the next session starts from it. The docs stay; nothing is replaced.

## Verdict
**PURSUE-WITH-CHANGES** (medium). The reframing *strengthens* the case for a visual layer and *removes* the case for GitHub Projects. Pursue, in this order:
1. A **generated, local, read-only visual dashboard** from data Craftsman already has (idea/plan frontmatter, the ledger, `governs:` globs, existing Mermaid). Extend `/digest`, which already reads the ledger and carries "no new state to maintain" (`scripts/digest.mjs:1-5`), with an HTML output.
2. A **session queue**: a computed "ready, ordered" list (the future script `ARCH-PLAN-05` already reserves) plus one small hand-written file holding only the order and intent of planned sessions.
3. **Spike an off-the-shelf viewer first** (Obsidian over the repo folder) for a day, to learn which views you actually use, before writing generator code.
**Deciding facts:** (a) the data to draw already exists as structure: all 7 idea docs carry `status, verdict, confidence, created, updated, related, touches`, plans carry `slug, goal, priority, parent, idea, units, tracker_rows`, and 9 of 19 architecture docs already hold a Mermaid diagram; (b) plan frontmatter has **no `status` key**, because status lives in the ledger (ARCH-TRACKER-01, `tracker.rules.md:11`), so a generic frontmatter viewer can board the *ideas* but not the *plans*, and only a ledger-aware generator can; (c) the earlier rejection of a docs site was conditioned on "nobody but you and Claude reads these docs" in the source Artifact; the owner is a reader and says so. **Most likely to flip it:** the Obsidian spike showing an off-the-shelf viewer covers every view you want, so the generator is not worth maintaining.

| criterion | score | evidence |
|---|---|---|
| value | 4 | Stated first-hand pain (chunky repo, visual learner, session planning); size numbers above. Frequency still unmeasured |
| system fit | 4 | Reads derived data only, no second writer; extends `/digest` and the reserved queue slot; consistent with generated, pre-guard-protected views (ARCH-TRACKER-10, `tracker.rules.md:20`) |
| cost (5 = cheap) | 3 | One generator script plus a rule amendment; viewer spike costs a day; no service |
| risk (5 = low) | 4 | Read-only; local file, nothing leaves the machine; one hand-written queue file is the only new truth |
| reversibility | 5 | Delete the script and the flag; no migration |
| evidence strength | 3 | Repo facts verified; tool claims mostly from vendor pages, several features unconfirmed (see Research) |

## Overlap & prior work
Searched: `docs/ideas/*.md`, `docs/plans/TRACKER.md` and `TRACKER-archive.md`, `docs/architecture/*.rules.md`, `CHANGELOG.md`, `README.md` on main, plus `commands/` and `scripts/` for digest, focus, queue, kanban, graph. Nothing on main proposes a visual layer. **Novel on main; extends two shipped pieces.**
- **`/digest` (extends).** `commands/digest.md` and `scripts/digest.mjs` already render what shipped, what needs a decision, what is next and % complete from the ledger, read-only, as text.
- **`ARCH-PLAN-05` (extends).** `plan.rules.md:15` reserves `execution.maxSessions` "for a future ready/queue script". The session queue is that script.
- **Sibling design (conflict resolved).** Branch `worktree-idea-dev-lifecycle-docs-plan` (`dev-lifecycle-docs-plan`) deferred a docs site and rejected Backlog.md as a third tracker. Both rejections stand for status. It also adds an approval page (private Artifact) and doc budgets. A dashboard must not become another truth, and any publishing to claude.ai counts as external publication under its ARCH-STATE-13.
- **Round 1 (GitHub Projects).** Reject replace (A), defer mirror (B), defer import/export (C). Reasons unchanged: ARCH-TRACKER-01/04 (`tracker.rules.md:11`, `:14`), unit runners hold no credentials (`agents/unit-runner.md:42`, ARCH-LAND-19 `landing.rules.md:29`), forge-neutral host table (`scripts/lib/land.mjs:54,70,88`), and the token lacks the `project` scope.

## System fit (whole project)
- **contract ripple:** `digest.mjs` imports `currentState` from `tracker.mjs`; a new output mode and a queue reader reuse it. Ledger and run manifest unchanged.
- **data:** inputs are existing (ledger, frontmatter parsed by `scripts/lib/plan-index.mjs`, rules `governs:`). New: a generated `docs/plans/DASHBOARD.html` (or `.craftsman/` if it should stay uncommitted) and **one** hand-written `docs/plans/NEXT.md` holding an ordered list of plan slugs with a one-line intent each, and no status copies.
- **config & flags:** candidate `digest.html: off|on` and `queue.file`; the reserved `execution.maxSessions` (ARCH-PLAN-05) stays unread by the mod.
- **security:** local file only; no credentials, no network. Do **not** publish the dashboard to a claude.ai Artifact by default (code summaries leave the machine; external publication waits for approval under the sibling's ARCH-STATE-13). Plan titles and goals may name private repos.
- **tests:** golden-file test for the HTML from a fixed ledger and fixtures; a test that the queue never contradicts the ledger (a COMPLETE plan in `NEXT.md` is flagged, not hidden).
- **observability:** `N/A(read-only report)`, except a lint warning for a `NEXT.md` slug that no longer resolves (ARCH-DOCS-06 slug lookup).
- **UI:** the dashboard itself is the UI. It must be one self-contained file (inline CSS/JS, no CDN) to open from `file://` and survive offline.
- **docs:** one amendment each to the tracker and plan areas through `/architect`. `commands/digest.md` gains a line, paying bytes under ARCH-SLIM-01/02 (`slim.rules.md:11-12`). Scripts are only warn-only size-checked (ARCH-SLIM-07, `scripts/script-size-delta.mjs:2`).
- **Second-order:** a generated file in git adds merge noise (keep it uncommitted by default); `NEXT.md` can rot if nothing checks it (hence the lint); the generator is code that must keep pace with frontmatter changes.

## Research
- **Obsidian Bases** (core plugin) makes database-like views of notes and their properties with **Table, List, Cards, Kanban and Map** layouts, saved as `.base` files or embedded in markdown, with formulas and filters (https://obsidian.md/help/bases). The page does not say how properties are stored, so reading YAML frontmatter is **UNPROVEN** from this source; a secondary blog says Bases and Dataview both read frontmatter (https://blog.openreplay.com/5-obsidian-note-taking-tips/, secondary). Obsidian is **free for personal and commercial use but not stated to be open source** (https://obsidian.md/pricing). It adds a `.obsidian/` folder to the repo (gitignore it). Whether markdown-relative links, as Craftsman uses, feed its graph view is **UNPROVEN**.
- **Foam** (MIT) runs inside VS Code with graph view, backlinks and wikilinks, and warns of "alpha-grade software" (https://github.com/foambubble/foam). Mermaid support is not stated. It leans on `[[wikilinks]]`, which Craftsman docs do not use.
- **Quartz** (MIT) builds a static site from a folder of markdown, 13.4k stars (https://github.com/jackyzha0/quartz); it has a local and global graph view (https://quartz.jzhao.xyz/features/graph-view). Search, backlinks and Mermaid are **UNPROVEN** from the pages opened. It needs a Node build and hosting for sharing; the sibling design deferred a docs site.
- **Markwhen** (MIT, but "the web app (the editor) is the only thing that isn't open source") turns markdown-ish dated text into a timeline and has a VS Code extension (https://github.com/mark-when/markwhen). HTML export and CLI are not stated. It needs dates written in its syntax; session planning is ordering, not dating, so it fits poorly.
- **mdBook, Docusaurus, Zensical** (MIT): books and doc sites with search and sidebars; Mermaid support not confirmed in the results (https://docsio.co/blog/zensical-vs-docusaurus, secondary). Material for MkDocs entered maintenance mode in Nov 2025 per the same source. They give navigation, not kanban or roadmap views.
- **Backlog.md** (MIT) gives a kanban terminal and a local web UI over per-task markdown files plus an MCP server (https://github.com/MrLesk/Backlog.md). It is a second task writer, which the sibling design rejected. It is the right shape only if Craftsman's ledger were not the truth.
- **GitHub Projects** gives table, board and roadmap views (https://docs.github.com/en/issues/planning-and-tracking-with-projects/learning-about-projects/about-projects) but needs the `project` token scope, cannot use `GITHUB_TOKEN`, and is GitHub-only (round 1).
- **Viable approaches:** (1) off-the-shelf viewer over the folder (Obsidian); (2) a generated static dashboard (extend `/digest`); (3) a published docs site (Quartz or similar); (4) external board mirror (round 1, deferred); (5) do nothing. (2), tried after a short (1), fits this codebase best.

## Critique (NOT ISOLATED)
- **Steelman.** The docs are fine as machine input and bad as human reading; the cheap fix is a derived view, not a new store. The structure is already there (frontmatter, ledger, `governs:`, Mermaid), `/digest` is the existing precedent for "render from the ledger, keep no state", and the queue slot is already reserved.
- **Strongest case against.** A generator is another thing to maintain and it chases a moving frontmatter schema; Obsidian might do 80% for free. And "plan sessions in advance" could quietly re-create a second tracker if `NEXT.md` grows status.
- **Hidden assumptions, with tests.**
  1. A rendered view is easier for them than the markdown. Test: the one-day Obsidian spike; note which views they open.
  2. Ideas and architecture need only frontmatter-level views. Test: does the spike's ideas-by-verdict board feel enough?
  3. The ledger kanban (plans by state) is the view they most want, and only a generator can give it. Test: ask which view comes first.
  4. They are fine with a local file rather than a hosted page. Test: do they need to open it on a phone or share it?
  5. Obsidian reads markdown-link graphs and frontmatter as the secondary sources claim. UNPROVEN until the spike.
- **Failure modes.** `NEXT.md` gains status and contradicts the ledger. The HTML grows heavy on 400 KB of plans if it inlines bodies (render titles, goals and links only). A renamed frontmatter key silently empties a column (golden test). The Obsidian config pollutes the repo (gitignore it).
- **Kill criteria.** The spike covers every wanted view: do not build the generator. `NEXT.md` is edited with status text: delete the queue file, keep the computed queue. The dashboard goes unopened for two weeks: remove it.
- **Cheaper alternatives.** Only the Obsidian spike (a day, no code). `/digest` text output with Mermaid blocks (no HTML).

## Disputed
- Round 1's critic recommended "read-only generated cross-repo board from TRACKER.jsonl" as the whole answer. Kept as the base, but widened to ideas, architecture and the session queue because the problem is browsing, not status. Round 1 also assumed "no non-Claude reader"; the owner has clarified they are the reader.
- Round 1 listed `docs/plans/TRACKER.jsonl` as "already derived and committed". On main it does not exist in this repo (`ls docs/plans/TRACKER.jsonl` fails; only `.craftsman/events.jsonl` is present), because `tracker.publish` is the sibling design's subject (`tracker.rules.md:21-22`). A cross-repo view must read each repo's local ledger or committed `TRACKER.jsonl` where present.

## Architecture outcome (2026-10-23)
The first architecture pass built only the dashboard and dropped two things the owner had asked for: **other open-source tools should see this**, and **plan docs should stop cluttering the repo**. The owner caught it, and a second pass added both. Final shape, all decided with the owner:
- **Views** ([views.rules.md](../architecture/views.rules.md)): per repo, `.craftsman/export/` (gitignored) holds the HTML dashboard (seven sections including Archive), a `notes/` folder with one frontmatter note per plan, idea, area and archived plan (so Obsidian Bases, Foam and Quartz can board and graph them), and a user-owned `inbox/` whose notes seed `/idea`. Nothing else flows back from a tool. `docs/plans/NEXT.md` holds your session order.
- **Archive** ([archive.rules.md](../architecture/archive.rules.md)): a dedicated archive repo registered as a workspace project holds finished plans and rejected or deferred ideas for every project. Archiving copies, verifies and commits there before anything is removed. Prose links to an archived plan are rewritten to archive pointers after a confirmed dry run; rules, tests and top-level docs still refuse. A plan with no referrers is archived automatically at landing; the rest wait for `/sync-docs --archive`. The archive repo is pushed only owner-run or in an approved landing.
- **Amendments:** ARCH-DOCS-02 to 12 to 13 (referrers), ARCH-DOCS-04 to 14 (automatic archive only for a lossless move).
- **Kanban for in-progress work** is the dashboard's plans board and, in Obsidian, a Bases board over the plan notes.

**Not chosen:** replacing docs with GitHub issues (round 1 evidence stands), a GitHub Projects or Backlog.md export (deferred; Backlog.md's file schema is undocumented), a shared export folder across repos, writing status or order back from tools.

## Recommendations
1. **Build in this order:** (1) `next-queue.mjs` and `NEXT.md`; (2) `export-notes.mjs` (the notes tree) and the dashboard; (3) the archive-repo copy, verify and commit step in `doc-retire`, plus the `archive <sha>` index field; (4) the prose-link rewrite with its dry-run confirmation; (5) automatic archive at landing; (6) the `/idea` inbox.
2. **Spike two unknowns early:** that Obsidian Bases reads the generated frontmatter and its graph follows plain markdown links (half a day), and whether Quartz renders the Mermaid blocks. Neither is proven from the sources read.
3. **Sequence** after the sibling design's ledger-guard step, and note that this depends on the sibling's `ARCH-LAND-22/24` landing rules, which are not on main.
4. **Dry-run on a copy of Gleam first** before the first real sweep: the Archive tab will show how many plans are blocked by rules, tests or top-level docs, which are an `/architect` job, not a force.
5. **GitHub Projects mirror** stays deferred until you want to share the roadmap with other people.

## Open questions
- Name and location of the archive repo in your workspace (the architecture only requires a Git root registered as a project, id `archive` by default).
- Whether to keep Obsidian as the suggested viewer, given it is free but not open source; Foam and Quartz are MIT.

## Next step
`/craftsman:instruction external-project-board` to generate the build prompt.
