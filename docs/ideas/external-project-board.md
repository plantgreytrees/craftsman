---
slug: external-project-board
status: pursue-with-changes
verdict: pursue-with-changes
confidence: medium
depth: standard
isolation: isolated
created: 2026-10-23
updated: 2026-10-23
related: [docs/architecture/tracker.rules.md, docs/architecture/landing.rules.md, docs/architecture/docs.rules.md, docs/architecture/slim.rules.md, docs/ideas/dev-lifecycle-docs-plan.md (branch worktree-idea-dev-lifecycle-docs-plan), docs/architecture/approval.md (same branch)]
touches: [scripts/tracker.mjs, scripts/run-manifest.mjs, scripts/lib/core.mjs, craftsman.config.json, docs/architecture/tracker.rules.md, CHANGELOG.md]
---

# Idea: A kanban/roadmap view of Craftsman work, via an external project tool

## Proposal (neutral restatement)
**Problem.** Craftsman persists work as markdown: idea docs, architecture docs (`<area>.md` + `<area>.rules.md`), plan docs, and an event-sourced status ledger rendered to `docs/plans/TRACKER.md` and committed as `TRACKER.jsonl` by `tracker.mjs publish`. The maintainer runs about five repos with several concurrent sessions and finds the docs hard to see and manage at that scale. There is no cross-repo view. How often status is actually lost is unmeasured (UNPROVEN).
**Proposal.** Let a project opt into an external project tool (GitHub Projects v2 through `gh`, which the plugin already uses for PR landing) so ideas, plans and roadmap items appear as tickets on a kanban board and roadmap. Craftsman would create tickets from plans, import existing ones, track status and take updates there, and might adopt other open-source tools to manage generated docs.
**Three readings, judged separately.** (A) Replace: the board is the source of truth and the docs are not written. (B) Mirror: the ledger and docs stay authoritative, with a one-way projection to the board. (C) Import/export: a manual command, no continuous sync.
**Beneficiary.** One maintainer, five repos (Gleam, also on Azure DevOps; Loost; Loost-Gallery; Podling; Craftsman).
**Done.** A board (or equivalent) shows every repo's work by status on one screen, without a second place to keep it up to date.

## Verdict
**PURSUE-WITH-CHANGES** (medium), in a much smaller form than proposed. **Reject A. Defer B and C.** Build first a read-only, locally generated cross-repo board from each repo's committed `TRACKER.jsonl`. It needs no credentials, no external service and no second writer, and it works on any forge. **Deciding fact:** the docs are machine input the loop and hooks read at tool-call time, and the ledger is the declared single truth (`docs/architecture/tracker.rules.md:11`, `:14`). A board that is also written to is a second status store. The owner's own architected design rejected exactly that, for Backlog.md, as "a third tracker … the exact failure in Loost-Gallery" (source Artifact, "Dev Lifecycle & Docs Plan"). **Most likely to flip it:** the maintainer needs to share the roadmap with, or assign work to, other humans on GitHub. Then B (one-way) is worth its cost.

| criterion | A Replace | B Mirror | C Import/Export | Smallest slice (static board) |
|---|---|---|---|---|
| value | 2 | 3 | 2 | 4 |
| system fit | 1 | 2 | 3 | 5 |
| cost (5 = cheap) | 1 | 2 | 3 | 4 |
| risk (5 = low) | 1 | 2 | 3 | 5 |
| reversibility | 1 | 4 | 4 | 5 |
| evidence strength | 2 | 2 | 2 | 3 |

Evidence for the scores is in the sections below. Value is capped at 4 because the pain is anecdotal.

## Overlap & prior work
Searched: `docs/ideas/*.md`, `docs/plans/TRACKER.md`, `TRACKER-archive.md`, `docs/architecture/*.rules.md`, `CHANGELOG.md`, `README.md` on main, grepping for kanban, github project, projects v2, gh issue, backlog.md, linear and jira. No hits on main: **novel on main**.
- **Extends / conflicts with a sibling, not yet merged:** branch `worktree-idea-dev-lifecycle-docs-plan` (commits `b0328f6`, `0d94f59`) holds the architected "Slim Craftsman" design, which was produced from the owner's Artifact "Dev Lifecycle & Docs Plan" (https://claude.ai/artifact/Lwwwn7ZyuLRmKqGjD8Psx6). Relevant decisions in it:
  - Principle "Docs as code, in git … no external database owns the truth … portable between GitHub, Azure DevOps or a future Forgejo".
  - "One fact, one home": status lives in the ledger, bugs in the forge's issues, the rest is generated.
  - Backlog.md (MIT) was considered and rejected as a third tracker. A static docs site was also deferred "until a non-Claude reader appears".
  - Doc budgets and an approval page (private Artifact) already attack the sprawl. `ARCH-STATE-13` on that branch makes external publication wait for approval.
- The existing tools list in that Artifact (just, pre-commit, markdownlint-cli2, lychee, gitleaks, git-cliff) already answers "other open-source tools to manage the docs". It reaches the plugin as config slots (`ARCH-ENGINE-20` on the sibling branch). Nothing further is needed for that part.

## System fit (whole project)
- **contract ripple:** a projection hooks in at `tracker.mjs publish` (`docs/architecture/tracker.rules.md:21`, ARCH-TRACKER-11), the single path that commits derived progress. The ledger and run manifest are unchanged (ARCH-TRACKER-01, `:11`).
- **data:** the static slice reads `TRACKER.jsonl` (already derived and committed, ARCH-TRACKER-12, `:22`) and writes one generated page. Any external mirror needs a new row-to-item key map, which is a new derived store.
- **config & flags:** candidate `tracker.board` (off | static | github) beside `tracker {nudgeLines, publish}` at `craftsman.config.json:95-98`.
- **security:** `gh` is logged in as `plantgreytrees` with scopes gist, read:org, repo, workflow, so it **lacks `project`**. Projects mutations need `project` (https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-api-to-manage-projects). In Actions, `GITHUB_TOKEN` cannot access projects, and a user-owned project needs a classic PAT with `project` and `repo` (https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/automating-projects-using-actions). Unit runners hold no credentials (`agents/unit-runner.md:42`, ARCH-LAND-19 at `docs/architecture/landing.rules.md:29`), so any write would run at root and queue like `network drain`.
- **tests:** fixtures for idempotent render; for B, a duplicate-item fixture under two concurrent worktree publishes.
- **observability:** a `board_rendered` or `board_sync_failed` event (B only).
- **UI:** the board itself. The static slice could be a section of the sibling's approval page instead of a new surface.
- **docs:** one tracker-area rule amendment through `/architect`. Prose added to commands pays bytes under ARCH-SLIM-01/02 (`docs/architecture/slim.rules.md:11-12`).
- **forge fit:** `scripts/lib/land.mjs` keeps a per-host table (`gh` at `:54`, `glab` at `:70`, `az` at `:88`), so the plugin is forge-neutral today. GitHub Projects is GitHub-only and Gleam is also on Azure DevOps.
- **Second-order:** B makes main's board lag (external writes wait for approval), adds a reconcile problem the moment a card is dragged, and adds ID caching, field bootstrap and retry. About 44% of the maintainer's time has two or more concurrent sessions (source Artifact), and each could publish.

## Research
- `gh project` offers item-add, item-create, item-edit, field-create, field-list, item-list, view and more, with minimum token scope `project` (https://cli.github.com/manual/gh_project). `item-edit` changes one field value per call and needs project and field ids (https://cli.github.com/manual/gh_project_item-edit, via search summary).
- Projects offer table, board and roadmap layouts, up to 50 fields, and can be user- or org-owned (https://docs.github.com/en/issues/planning-and-tracking-with-projects/learning-about-projects/about-projects). The item-count limit was not on that page: UNPROVEN. The github.com GraphQL point budget was not confirmed (the page found was Enterprise Server): UNPROVEN.
- The built-in project workflow auto-adds items by filter and does not sweep existing items; per-plan caps on auto-add workflows come from a secondary post (https://dev.to/suzukishunsuke/pull-together-github-issues-and-pull-requests-across-repositories-to-github-projects-automatically-a87): UNPROVEN.
- Backlog.md (MIT) stores each task as a markdown file in the repo with a terminal and local web kanban and an MCP server; it advises using its commands over hand edits (https://github.com/MrLesk/Backlog.md). It is a **second writer to a tracker**, which the owner already rejected. The smaller git-issue tools surfaced have tiny adoption (maturity UNPROVEN).
- Viable approaches: (1) replace docs with board items; (2) one-way projection at publish; (3) manual export/import; (4) adopt a git-native tracker; (5) do nothing, or render a generated board from existing derived data. (5) fits this codebase best.

## Critique
- **Steelman.** The pain is real for one person running five repos: seeing status means reading `docs/plans/TRACKER.md` (111 lines) plus about 15 plan docs per repo, with no cross-repo view. A board gives table, kanban and roadmap views and filters for free. The plugin already calls `gh` and has a host-adapter pattern, and `publish` is already the single choke point for derived output, so a projection is structurally cheap.
- **Strongest case against.** (A) fights the enforcement loop: ARCH-TRACKER-04 gates COMPLETE on ticked `[unit:]` criteria held in plan docs (`tracker.rules.md:14`), ARCH-DOCS-03 fails lint if a rules `source:` file is missing (`docs.rules.md:13`), `/idea`'s overlap scan reads idea docs (ARCH-DOCS-05, `:15`), and hooks need local files and cannot make a GraphQL call per tool use. (B) adds the second visible status store the owner already rejected, and once cards exist they will be dragged; one-way then silently diverges and two-way breaks ARCH-TRACKER-01/04. (C) solves moving data, not visibility, and its issues go stale on creation.
- **Hidden assumptions, with tests.**
  1. They want a GUI board, not one place to look. Test: render the static page and see whether it is opened weekly for two weeks.
  2. They will not edit cards. Test: ask, or check whether they edit GitHub issues by hand today.
  3. GitHub covers every repo. It does not (Gleam is also on Azure DevOps). Test: list each repo's forge.
  4. Approval-gated writes are acceptable. Test: count publish events per `/auto` run (ARCH-TRACKER-11 lists at least four triggers).
  5. Item and rate limits are fine at five repos. UNPROVEN.
- **Failure modes.** Board and ledger diverge after a card drag. A renamed or deleted project field breaks sync silently. Two worktrees publish at once and create duplicate items unless keys are stored. The token must be widened to `project`. An offline session must queue the update. The GitHub-only adapter rots in repos that never use it.
- **Kill criteria.**
  - The maintainer edits cards during any trial: kill B.
  - The static page is opened weekly and no gap remains: kill B and C.
  - Board updates need a per-event approval prompt in `/auto`: kill B.
  - Any in-scope repo cannot use GitHub Projects: kill B as a general feature.
  - The sibling design merges and its approval page already gives the cross-session view: kill everything beyond the static board.
- **Cheaper alternatives.** Do nothing (the sibling's budgets and approval page already attack sprawl). A generated cross-repo static board (recommended). Manual export only when a human collaborator appears.

## Disputed
- The critic's line cites were off for ARCH-DOCS-03 (`docs.rules.md:13`, not 11), ARCH-DOCS-05 (`:15`, not 13) and the `az` adapter (`land.mjs:88`, not 92). Corrected here; the claims themselves hold.
- The critic could not find the Backlog.md rejection in the sibling branch's docs and marked it UNPROVEN. It is verified: it is in the source Artifact ("Considered and rejected for now"), which I read in full. It is not in any repo file.
- The proposer's own wording suggested reading (A) and two-way updates. These are judged and rejected above, not softened.

## Recommendations
1. **Reject A** outright and record why (ARCH-TRACKER-01/04, ARCH-LAND-19, forge neutrality).
2. **Reframe the problem as cross-repo status visibility.** Build first `tracker.mjs board`: read-only, generated from each configured repo's `TRACKER.jsonl`, rendering a kanban-style page (columns by ledger state, links to plan docs). Make it a section of the sibling's approval page if that lands first.
3. **Sequence after** `worktree-idea-dev-lifecycle-docs-plan` merges (ledger guard first), so the board is not built over a ledger that can lose rows.
4. **Use the trial as the test.** Use the static board for two weeks. Only if a human collaborator appears, or a real gap remains, build B: one-way, hooked at `publish`, behind `tracker.board: github`, titles and status only, a stored row-to-item key map, cards marked "managed by Craftsman", never read back, writes batched at approval (ARCH-STATE-13).
5. **Take the docs-tool half as already answered.** just, markdownlint-cli2, lychee and pre-commit reach Craftsman through config slots; no new Craftsman work.

## Open questions
- Do you need to share or assign work to other people on GitHub, or is the board for you alone? (This is the fact most likely to flip the verdict.)
- Would you ever drag a card to change status? If yes, one-way mirroring is unsound.
- Which repos are GitHub-only, and which are Azure DevOps-primary?
- How often do you actually lose track of status today? Even a rough count would anchor the value score.

## Next step
For the smallest slice: `/architect external-project-board` (a short amendment to the tracker area for a read-only board command), after the sibling's ledger-guard step lands. To reopen B: answer the first two open questions above.
