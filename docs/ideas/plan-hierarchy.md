---
slug: plan-hierarchy
status: architected
verdict: pursue-with-changes
confidence: medium
depth: standard
isolation: isolated
created: 2026-10-18
updated: 2026-10-18
related: [docs/architecture/plan.rules.md, docs/ideas/plugin-overhaul.md, docs/ideas/feature-branch-plans.md (branch worktree-idea-feature-branch-plans, not on main), docs/architecture/tracker.rules.md, docs/architecture/landing.rules.md, docs/architecture/engine.rules.md, docs/architecture/state.rules.md, docs/architecture/auto.rules.md]
touches: [commands/plan.md, commands/orchestrate.md, commands/auto.md, commands/instruction.md, commands/merge.md, commands/sync-docs.md, commands/digest.md, commands/init.md, commands/upgrade.md, commands/focus.md (new, from plugin-overhaul), commands/_shared-execution.md, commands/_shared-machinery.md, scripts/tracker.mjs, scripts/tracker-sync.mjs, scripts/run-manifest.mjs, scripts/plan-graph.mjs, scripts/repo-exec.mjs, scripts/scope.mjs, scripts/session-context.mjs, scripts/handoff.mjs, scripts/focus.mjs (new), scripts/merge-tree.mjs (new, from plugin-overhaul), scripts/arch-check.mjs, agents/unit-runner.md, workflows/run.js, skills/language-aware-planning/references/plan-template.md, docs/architecture/tracker.rules.md, docs/architecture/landing.rules.md, docs/architecture/state.rules.md, docs/architecture/engine.rules.md, docs/plans/TRACKER.md, README.md, EXTENDING.md, CHANGELOG.md]
---

# Idea: An epic > story > feature > unit hierarchy, one worktree per feature, progress visible on main

## Proposal (neutral restatement)
**Problem (observable today).**
- Plans have two levels: a plan doc and its units. "Feature" is only a convention
  ("one feature = one user-visible outcome", "one doc per feature",
  `commands/plan.md:23,34`) and nothing enforces it. Nothing sits above a plan.
- `/orchestrate` can target a plan or one tracker row (`commands/orchestrate.md:4,18-21`).
  It cannot target a larger goal.
- Every unit gets its own worktree and branch (`agents/unit-runner.md:12`, branch
  `feat/<unit>` at `scripts/repo-exec.mjs:125`), so a feature of N units makes N worktrees.
- Progress is invisible on the remote. The ledger is gitignored (`.gitignore:2`) and
  `TRACKER.md` is rewritten only in the local main checkout
  (`scripts/tracker.mjs:105-124`). Its commits are manual and rare (last: `44f8360`).

**Claimed benefit.** Large initiatives can be planned, scoped and followed; fewer
worktrees; the maintainer sees progress on main without opening a worktree.

**Who benefits.** The solo maintainer running several sessions across Craftsman,
Gleam, Loost and Podling.

**Done looks like.**
1. Epic and story exist as plan levels above feature, each with its own `tracker.md`.
   An epic is light and lists the larger changes available; a story groups features
   under a goal.
2. Existing tools and plans work under the hierarchy.
3. `/orchestrate` and session focus can target epic, story, feature or unit; the default
   is feature.
4. A feature session creates exactly one worktree.
5. Docs stay in sync with every change.
6. A plan lands on main (or its parent branch) before the next step runs, and progress is
   pushed to main as implementation proceeds.

## Verdict
**PURSUE-WITH-CHANGES** (medium). Do it, but in a different shape from the pitch:
- Epic and story become **plan levels linked by an optional `parent:` field**. Their
  `tracker.md` files are **generated rollups of the ledger**, never hand-kept.
- **One worktree and one branch per feature**, reused by every unit. Each unit still lands
  on main one at a time.
- **Progress reaches main through a batched, idempotent tracker publish**, not a push per
  status change.
- Nothing is migrated by force. A plan without `parent:` is a standalone feature.

**Deciding fact.** The rollup for an epic or story is a pure function of its children's
ledger rows, and ARCH-TRACKER-01 already says derived views are generated from the ledger
(`docs/architecture/tracker.rules.md:11`). Hand-kept epic and story trackers would add a
second source of truth that drifts. Generated ones satisfy "their own tracker.md" and keep
the rule.

**Most likely to flip it to DEFER.** A shared-worktree scope test showing that unit N+1
cannot be isolated from unit N without new state keying (see Weaknesses 4), or fewer than
three multi-plan initiatives across the four repos (see Kill criteria).

| criterion | score 1–5 | evidence |
|---|---|---|
| value (problem is real and frequent) | 4 | owner-stated need; N worktrees per feature and invisible remote progress are real (`unit-runner.md:12`, `tracker.mjs:112-124`); only one multi-feature initiative exists today (plugin-overhaul, Slices A–E) |
| system fit (aligns with architecture + direction) | 3 | after reshaping: keeps ARCH-TRACKER-01/02; still amends ENGINE-09 follow-ups, STATE-03 keying, LAND-02, and overlaps the sibling idea |
| cost (build + maintain) — 5 = cheap | 3 | reshaped version is additive: no forced migration, no new hand-kept files; still ~14 `scope_id` consumers and 37 files that name `docs/plans` or `TRACKER.md` |
| risk (blast radius, failure modes) — 5 = low | 3 | scope leak across units in a shared worktree; push races; partial features on main under per-unit landing |
| reversibility — 5 = trivially undone | 3 | `parent:` is optional and additive; generated views can be deleted; per-unit worktrees can come back |
| evidence strength (research + repo proof) | 3 | repo facts verified; hierarchy need unmeasured beyond one initiative; BMAD, spec-kit and trunk-based sources are secondary |

## Overlap & prior work
Searched: `docs/ideas/*` (3, incl. the sibling branch), `docs/plans/TRACKER.md` and plan
goals, `docs/architecture/*.rules.md`, `CHANGELOG.md` [Unreleased], README, plan memory
(`epic`, `story` queries return nothing), and `epic|story` across commands, scripts,
skills and agents (no relevant hit).
- **Extends** `docs/ideas/plugin-overhaul.md`. Its focus record reserves `kind` values
  `story` and `epic` and rejects them until these plan types exist (decision 5, now
  updated). Its merge command (decision 6) is the landing mechanism used here.
- **Conflicts with, and partly supersedes,** `docs/ideas/feature-branch-plans.md`
  (branch `worktree-idea-feature-branch-plans`, not on main, owned by another session).
  - Its part A: plan → features → units, units land on a **feature branch**, the feature
    lands on main in **one** merge, new `FEATURE_MERGED` status, size cap ~8 units.
  - Its part B: `/sync-docs --archive/--prune`, which this idea does not touch and which
    should still ship first.
  - The user's wording here ("land before continuing", "push updates to main as
    implemented") describes **per-unit landing to main**, which is the opposite of part A's
    long-lived feature branch. See Recommendation 3 and Open question 1.
- **Reverses a recorded decision** in `plugin-overhaul.md` (old item 3: "Plans stay
  feature-based… does not touch the plan format, the tracker"). That decision existed only
  because the plan format was in another session's hands; the owner has now asked for the
  change. The old lines are updated to point here.
- **Rules strained:** ARCH-ENGINE-09 (`engine.rules.md:19`), ARCH-STATE-03
  (`state.rules.md:13`), ARCH-LAND-02 (`landing.rules.md:12`), ARCH-TRACKER-02/04
  (`tracker.rules.md:12,14`), ARCH-AUTO-01 (`auto.rules.md:11`).

## System fit (whole project)
- **Contract ripple.** Plan frontmatter gains `parent:` (and a `level:` that defaults to
  `feature`). Ledger events gain `level` and `parent` fields, which ARCH-TRACKER-02
  allows because it is additive and `renderBlock` output stays unchanged. About 14
  consumers read `scope_id` (named in the sibling idea; not individually verified here).
  37 files name `docs/plans` or `TRACKER.md` today.
- **Data.** Craftsman has 11 plan docs; **7 of the 11 have no `scope_id` at all**
  (`audit-fixes`, `autonomous-e2e-loop-evidence`, `engine-hardening`,
  `engine-self-improvements`, `known-issues-doc`, `scrutinise-engine-hardening`,
  `token-efficiency`). Those plans never adopted the current format, so a forced migration
  would fail on them or be skipped. Gleam (~98 live plans) and Loost (~155) figures come
  from the sibling idea.
- **Config.** Defaults for `orchestrate.level` (feature), `tracker.publish` (on/off,
  batch points) and `repoExec.land`. `land` is `direct` today
  (`craftsman.config.json:96-100`).
- **Security.** No auth surface. Publishing to main uses the guards that already exist:
  `--force`, `+refspec`, `reset --hard`, `--no-verify` stay blocked
  (`scripts/lib/force-block.mjs`, ARCH-LAND-05).
- **Tests.** `tracker`, `run-manifest`, `plan-graph`, `repo-exec` and `scope` tests;
  a new two-units-one-worktree scope test; the wiring tests that lint command files.
- **Observability.** `logEvent` for `focus_set`, `tracker_published`, `feature_worktree`;
  `stats` groups by level.
- **UI / CLI.** `/plan` (emits a `parent:`), `/orchestrate --level`, `/focus`, `/digest`
  (rollups), `/init --update` / `/upgrade` (stamp, never rewrite), `/sync-docs`.
- **Docs.** `tracker`, `landing`, `state` and `engine` rules amended through
  `/architect`; README, EXTENDING, CHANGELOG; the plan template.

**Second-order effects.**
- Each extra file the SessionStart hook loads costs tokens in every concurrent session.
  Rollup files must be read only on demand, never injected (UNPROVEN how much SessionStart
  grows; measure in the spike).
- Per-unit landing means main holds a feature half-built between units. This is acceptable
  for a plugin of scripts and markdown, but not for a product repo without flags.
- `/auto` repeats until every row for the slug is COMPLETE (ARCH-AUTO-01); with a parent
  slug that must mean every row of every child, which changes its stop rule.

## Research
All fetched 2026-10-18.
- **Claude Code worktrees** — https://code.claude.com/docs/en/worktrees. `--worktree
  <name>` creates `.claude/worktrees/<name>` on branch `worktree-<name>`, one per
  interactive session, kept for resume. Subagent worktrees are temporary and swept after
  `cleanupPeriodDays` unless they hold work. `worktree.baseRef` is `fresh` (remote default)
  or `head`. Hooks keep `CLAUDE_PROJECT_DIR` at the project root while the hook input
  `cwd` follows the worktree. *Established:* one worktree per feature session matches how
  the platform models a session; the plugin's `.worktrees/<unit>` layout is its own.
- **Anthropic, effective harnesses for long-running agents** —
  https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents.
  A feature list whose only editable field is a `passes` status, one feature per session
  ("critical"), progress committed to git with a progress file, and named failure modes:
  declaring victory early, leaving undocumented state, marking features done early.
  *Established:* feature is the right default unit; status flips only on verification
  (ARCH-TRACKER-04 already does this); progress in git is endorsed.
- **Trunk-based development** — https://mergify.com/learn/trunk-based-development/short-lived-branches,
  https://www.flagsmith.com/blog/trunk-based-development. Branch divergence cost grows with
  lifetime; flags let unfinished work reach trunk. *Secondary vendor sources;* the DORA
  link and a "three or fewer branches" threshold are UNPROVEN.
- **BMAD-METHOD** — https://docs.bmad-method.org/. Has story-breakdown, ticket-tree and
  "finish an epic" pages and a loop that builds a whole epic unattended. *File formats and
  statuses are UNPROVEN* (the pages fetched did not show them).
- **GitHub spec-kit** — secondary pages only. One numbered branch plus a `specs/NNN-name/`
  folder per feature. *Official docs not verified.*

**Approaches.**
(a) Four typed levels, hand-kept tracker per level, migrate everything. Highest cost,
weakest evidence.
(b) Optional `parent:` link; epic and story as thin plan docs; **generated** rollup
trackers; no forced migration. **Fits this codebase.**
(c) Targeting plus one worktree only; defer epic and story. The fallback if (b)'s spike
fails.

## Critique
- **Steelman.** There is a real multi-feature initiative open now (plugin-overhaul
  Slices A–E, tracked only as prose). Focus already reserves `story` and `epic`. Units run
  one at a time (`workflows/run.js:166-183`), so they never need separate worktrees at
  once, and the extra worktrees and branches only add setup and cleanup cost
  (`repo-exec.mjs:139-140`). Remote main shows nothing today unless someone commits the
  tracker by hand. Anthropic's guidance backs feature-as-default and progress in git.
- **Strongest case against.** There is no measured need for two levels above a feature.
  Only one real initiative exists, an epic as "an index of larger changes" duplicates what
  `docs/ideas/*` already is, and the sibling's measurements (Gleam p90 36 units per plan,
  1,076 docs) say there are already too many docs, not too few.
- **Hidden assumptions, each with a test.**
  1. *People will plan at epic or story level.* Count initiatives spanning ≥3 plan docs
     across the four repos in the last 90 days.
  2. *One worktree is safe with per-unit scope.* A `scope.test.mjs` case: two units in
     sequence on one worktree; unit 2 must not be able to write unit 1's paths.
  3. *Main can absorb the push traffic.* Two sessions moving rows in the same minute; count
     rejected pushes.
  4. *Derived views are enough for epics.* Prototype `tracker status --by parent` and see
     whether the maintainer accepts it as "the epic tracker".
- **Failure modes.**
  - Push races and rejected pushes; rebasing a generated block inside the main checkout.
  - Hand-kept epic or story files drifting from the ledger.
  - A half-finished migration leaving two plan formats for ever.
  - A shared feature worktree left dirty by a BLOCKED unit, poisoning the next unit's
    smoke gate (ARCH-TRACKER-05).
  - A stale scope leaking from unit N to unit N+1: stale detection keys on the worktree
    still existing (`scripts/scope.mjs:81-94`), which is always true in a shared worktree,
    so correctness depends on an explicit release.
  - `/sync-docs` becoming a mandatory step on every edit.
- **Kill criteria.**
  - Fewer than 3 multi-plan initiatives across the four repos in 90 days (drop epic/story
    types; keep (c)).
  - The shared-worktree scope test needs new state keying beyond (worktree, unit).
  - More than 1 rejected push per day from tracker publishing in a two-session trial.
  - The sibling's one-merge feature-branch model is chosen instead. Reconcile; never build
    both landing models.
- **Cheaper alternatives.**
  - *Do nothing.* Focus stays feature-only and plugin-overhaul stays prose-tracked.
    Acceptable for one initiative.
  - *Smallest slice (b minus epic/story docs).* `parent:` + rollup view + `--level` +
    one worktree. Delivers items 3, 4 and most of 6.

## Disputed
- **Critic: "typed epic and story levels are deferred, not built."** Softened. The
  owner has stated the product intent and asked for these types and their trackers. I keep
  the types, but staged and cheap: a thin plan doc with `parent:`, plus generated
  trackers. The critic's evidence concern (one real initiative) stays as a kill criterion
  rather than a block.
- **Critic: "continuous push to main is rejected."** Softened, not dropped. Per-transition
  pushes are rejected for the reasons given. A **batched** publish at defined points is
  kept, because the owner explicitly asked for progress on main.
- **Critic recommendation: "commit the rendered tracker inside the unit's landing
  commit."** Not usable as written. `TRACKER.md` is rendered in the **main checkout**, and
  the ledger notes say it "never lives in a worktree" (`scripts/tracker.mjs:105,112-124`),
  so the landing commit made from the unit worktree cannot contain it today. Either the
  renderer must accept an output root (render into the worktree at land time), or a
  separate tracker-publish step is needed. `/architect` decides (Recommendation 4).
- **Critic count: "Craftsman has 11 plan docs, not 13."** Accepted and applied above.
- **Critic: "`plugin-overhaul.md:316` is contradicted."** Accepted, and updated. It is an
  owner-directed reversal, not a defect.

## Recommendations
(ordered by impact)
1. **Derive, don't keep.** Epic and story trackers are generated from the ledger by
   `tracker.mjs` (like `renderBlock`) and carry a "generated, do not edit" header. Each
   gets its own file, which meets "their own tracker.md". Rollup status is computed:
   a story is `COMPLETE` only when every child feature is `COMPLETE` (consistent with
   ARCH-TRACKER-04). This preserves ARCH-TRACKER-01/02.
2. **Make the hierarchy a link, not a migration.** Add optional `parent: <slug>` and
   `level: epic|story|feature` to plan frontmatter, default `feature`. A plan without
   `parent` is standalone. `/init --update` and `/upgrade` stamp `level: feature` into
   live plans that lack it and **never** renumber `scope_id` or rewrite old plans; the 7
   plans with no `scope_id` stay valid. Retired plans are left to the sibling's
   `--archive`. Epic and story docs are thin: a goal, child slugs, and the available
   changes (epic) or the feature grouping (story). Consider reusing `docs/ideas/<slug>.md`
   as the epic's "available changes" source instead of a new doc type.
3. **Pick one landing model, and reconcile with the sibling in one `/architect --deep`
   pass.** The recommended model: **one worktree, one branch per feature; after each
   unit's gate and review, land the branch's HEAD on main (fast-forward only) and continue
   on the same branch.** That honours "land before continuing" and "push as it is
   implemented", keeps per-unit landing (ARCH-LAND-02), and needs no long-lived feature
   branch, `FEATURE_MERGED` status or size cap. It replaces the sibling's part A; its
   part B (doc retirement) is unaffected and should ship first. Use `land: pr` for a
   story-level parent when main must never hold a partial feature.
4. **Publish progress in batches, idempotently.** Add `tracker.mjs publish`: re-render the
   generated blocks and epic/story rollups, commit only those files, `fetch`, `rebase` or
   take-theirs-and-re-render on conflict, push once, retry once. Run it at feature start,
   after each unit lands, and at feature close, never per transition. Never touch the main
   checkout's working tree while the user may be editing there: render in the feature
   worktree (renderer takes an output root) or in a short-lived publish worktree.
5. **Plans land first.** `/orchestrate` Phase A refuses to start until the plan doc,
   its parents and its tracker rows are on `origin/main` (`git merge-base --is-ancestor`),
   landing them through the merge command (plugin-overhaul decision 6) if not. This also
   fixes a feature worktree not seeing the plan.
6. **Target any level with one flag.** `/orchestrate <slug> --level epic|story|feature|unit`
   (default `feature`, `execution`-style default in config) and the focus record from
   plugin-overhaul decision 5. A parent slug resolves to its child feature plans in
   dependency order and runs them **sequentially** (ARCH-ENGINE-09 unchanged). `unit`
   maps to today's `--step`. `/auto` with a parent slug repeats until every child row is
   COMPLETE.
7. **One worktree per feature, with an explicit scope release.** `repo-exec prepare` takes
   the feature slug; later units attach to the same worktree and branch. Re-key
   scope by `(worktree, unit)` and make `release` mandatory between units; ship the
   two-units-one-worktree scope test first (it is the spike). A BLOCKED or PARKED unit
   leaves the feature worktree clean (commit `wip:` or stash by unit) before the next
   unit's smoke gate (ARCH-TRACKER-05).
8. **Docs in sync by construction, not by ceremony.** Every feature's last unit carries the
   existing `docs:` coverage criterion; `/sync-docs --tracker` runs once at feature close;
   `arch-check lint` gains a dangling-`parent:` and `source:` check (the sibling already
   proposes the second). Do not run `/sync-docs` on every edit.
9. **Order of work.** (1) the shared-worktree scope spike; (2) `parent:`/`level:` plus the
   generated rollups; (3) `--level` and focus kinds; (4) one worktree per feature and the
   landing gate; (5) tracker publish. Slices 2–3 are additive and can go to `/plan` once
   `/architect` settles landing.

## Open questions
Only what the owner can answer. Each has a stated assumption so nothing blocks
`/architect`.
1. **Landing model (assumed: per-unit landing on a reused feature branch).** Your wording
   ("land before continuing", "push updates to main as implemented") describes per-unit
   landing, which contradicts the other session's one-merge feature branch. I assumed
   yours. Say so if you want that session's model instead, since the two cannot both ship.
2. **Partial features on main (assumed: acceptable for this plugin, `land: pr` per story
   where it is not).** Per-unit landing leaves a half-built feature on main between units.
3. **`/auto` over a parent (assumed: runs every child feature, in order, until all rows are
   COMPLETE).**
4. **Epic doc type vs reusing ideas (assumed: a thin plan doc; reuse of `docs/ideas/` is
   an `/architect` option).**

## Next step
`/architect plan-hierarchy --deep`, together with `feature-branch-plans` in the same pass
(they amend the same rules: ARCH-LAND-02, ARCH-STATE-03, ARCH-TRACKER-04, ARCH-AUTO-01).
Ask it to: keep ARCH-TRACKER-01/02; add rules for `parent:`/`level:`, generated rollups,
batched publish and the plan-lands-first gate; decide whether the renderer takes an output
root; and sequence the shared-worktree scope spike first. Sibling part B (doc retirement)
can go to `/plan` now. Nothing here is implemented.

## Addendum: a session coordinator (checked 2026-10-18)
Question: can one session coordinate other sessions by task priority, running one, two
or more at a time, and is that what "mods" are for? Answer: yes, it is possible. Mods are
one of three ways to do it, and the cheapest one.

**What the docs and the installed CLI (2.1.302) provide.**
- **Background sessions** — https://code.claude.com/docs/en/agent-view. `claude --bg
  --name <n> "<prompt>"` starts a session; `claude agents --json [--all]` returns `state`,
  `status` and `waitingFor` for a script to poll; `claude logs`, `stop`, `respawn` manage
  them. Confirmed present in the installed CLI. The docs state no maximum; each session
  draws on the same quota, and an unattended finished session is stopped after about an
  hour. The page was truncated, so a cap in the unread part is UNPROVEN either way.
- **Cross-session messaging** — https://code.claude.com/docs/en/cross-session-messaging
  (v2.1.224+). `ListAgents` and `SendMessage`; `notify_when_idle` asks for one notice when
  another local session next goes idle and, on its own, "without starting a turn or
  spending tokens in the watched session". Limits: plain text, local sessions only for
  subscriptions, 12-hour expiry, and a message can never approve a permission prompt for
  the receiver. A delivered message counts as usage like a typed prompt. A `-p` worker
  must be started with `crossSessionInbound: accept` to receive anything.
- **Agent teams** — https://code.claude.com/docs/en/agent-teams. A lead with teammates,
  a shared task list with dependencies and self-claiming. Experimental
  (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`), "significantly more tokens", one team per
  session, no resume, and teammates edit the same checkout, so it does not give a
  worktree per feature.
- **Mods** — https://code.claude.com/docs/en/plugins/mods/reference. JavaScript running
  inside Claude Code, no model tokens. The API table lists `$.process.run/spawn`,
  `$.clock.every`, `$.store` (a key-value store shared by every session on the machine),
  `$.session.send` and the `session.receive` event, `$.agent.list`, `$.prompt.submit`.
  Craftsman already ships one (`hooks/register.js`, `docs/architecture/mod.md`). Mods run
  unsandboxed with the user's permissions.

**Options.**
- **A. Deterministic dispatcher (recommended).** A script, optionally driven from the
  mod's timer, reads the ledger and plan frontmatter, picks the next ready features up to
  `execution.maxSessions`, starts each with `claude --bg --name feat-<slug>
  "/craftsman:orchestrate <slug> --level feature"` in its own feature worktree, polls
  `claude agents --json`, and starts the next one when a slot frees. It surfaces PARKED
  decisions and sessions that need input. The coordinator spends **zero** model tokens.
- **B. LLM coordinator session.** A session that uses `ListAgents`, `SendMessage` and
  `notify_when_idle`. It can re-prioritise and answer a worker's question, but every
  notice and reply costs tokens. Use it only for judgement, not for scheduling.
- **C. Agent teams.** Built in but experimental, token-heavy and not worktree-isolated.

**What it needs in Craftsman.**
1. A `priority:` field (P0–P3) on feature plans; epics and stories supply a default, so a
   parent orders its children. No such field exists today (`plan-template.md`,
   `commands/plan.md`, `scripts/plan-graph.mjs` have no `priority`).
2. `execution.maxSessions`, default 1 (this session only), set per launch like the
   sub-agent cap. It is a different limit from the sub-agent cap and never raises it.
3. Dispatch rules: never start two features whose `depends_on` chain or `scope.write`
   paths overlap; at most N running; a feature that parks or needs input does not hold
   a slot while it waits.
4. Workers must run unattended: permissions pre-granted through `allowed-tools`, with
   `/craftsman:auto`'s park-and-ask behaviour for decisions, since a coordinator cannot
   answer a permission prompt for a worker.
5. An amendment to ARCH-MOD-01 ("launch, observe and draw only") if the mod does the
   scheduling, plus a decision on whether the dispatcher is a script the user runs or
   the mod's timer.

**Honest cost note.** Running sessions one at a time does not save tokens compared with
one session doing the same work. The saving is a small root context per feature and
smoother quota use. Running more at once finishes sooner but spends quota faster (the
agent-view page says ten parallel sessions use it about ten times faster).

**UNPROVEN until a spike:** that a mod's `$.process.spawn` can start `claude --bg`
cleanly; that `claude agents --json` is stable enough to poll; that several sessions
landing to main from separate worktrees stay safe under `repo-exec`'s merge lock and
ARCH-ENGINE-09 (units are sequential within one session only).

**Suggested place in the order of work:** after the shared-worktree scope spike and
`parent:`/`priority:`, as its own small idea (`/idea session-dispatcher`) rather than
part of this one.
