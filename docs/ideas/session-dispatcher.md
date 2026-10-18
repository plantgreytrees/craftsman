---
slug: session-dispatcher
status: pursue-with-changes
verdict: pursue-with-changes
confidence: medium
depth: standard
isolation: isolated
created: 2026-10-18
updated: 2026-10-18
related: [docs/ideas/plan-hierarchy.md, docs/ideas/plugin-overhaul.md, docs/ideas/feature-branch-plans.md (branch worktree-idea-feature-branch-plans), docs/architecture/mod.rules.md, docs/architecture/engine.rules.md, docs/architecture/state.rules.md, docs/architecture/auto.rules.md, docs/architecture/landing.rules.md]
touches: [scripts/ready.mjs (new), commands/queue.md (new), scripts/claim.mjs, scripts/plan-graph.mjs, scripts/tracker.mjs, scripts/lib/core.mjs, scripts/session-context.mjs, commands/plan.md, commands/orchestrate.md, commands/auto.md, skills/language-aware-planning/references/plan-template.md, craftsman.config.json, docs/architecture/engine.rules.md, docs/architecture/state.rules.md, docs/architecture/auto.rules.md, README.md, EXTENDING.md, CHANGELOG.md]
---

# Idea: A session dispatcher — order features by priority and cap how many sessions run at once

## Proposal (neutral restatement)
**Problem (observable).** Craftsman runs one feature per Claude Code session. To run
several at once the user starts, watches and orders sessions by hand. Nothing in the
plugin knows a feature's priority, bounds how many sessions run together, or decides
which features can run side by side. More sessions at once draw the shared usage quota
faster (https://code.claude.com/docs/en/agent-view: ten parallel sessions use it "roughly
ten times as fast").

**Measured frequency (new, from the user's own event logs).** Counting a session as
active while its events are less than 15 minutes apart:

| repo | sessions | active days | max at once | ≥2 sessions at once, share of active time |
|---|---|---|---|---|
| Gleam | 190 | 40 | 8 | 46% |
| Loost (3 projects) | 41 | 11 | 4 | 22% |
| Podling | 35 | 9 | 3 | 13% |
| Craftsman | 41 | 14 | 3 | 14% |
| all, one machine | 652 | 50 | 10 | 44% |

Caveat: this is a proxy. A session left open with sparse events can overlap by
accident, and cross-repo overlap is counted in the last row only. Probe: the script is
reproducible from `.craftsman/events.jsonl` (`ts` is epoch milliseconds).

**Proposal.** A dispatcher picks the next ready feature(s) by priority, dependency and
write-scope overlap, starts each as a background session, never exceeds a set count
(default 1), and starts the next when one finishes.

**Who benefits.** The solo maintainer with four repos, mainly Gleam.

**Done looks like.** With `maxSessions: 2` and three ready features of different
priority, the two highest-priority independent ones run, the third starts when a slot
frees, and no two overlapping features run together.

## Verdict
**PURSUE-WITH-CHANGES** (medium). Build the **small, read-only slice first**: a `ready`
query that lists ready features by priority and prints the launch command, with an
advisory slot cap built on the claim locks that already exist. **Defer the automatic
dispatcher** until the landing and isolation spikes pass.

**Deciding fact.** Concurrency is real in Gleam (46% of active time, peak 8), but the
dispatcher does not reduce quota; it only orders and caps. The value is "stop
hand-ordering and stop accidental pile-ups", not "spend fewer tokens".

**Most likely to flip it.** Whether `claude --bg "/craftsman:auto <planned-slug>"` on a
fully planned feature runs to the end, lands through `repo-exec`, and coexists with
Claude's own worktree isolation, with no attach. If it does, the full dispatcher becomes
reasonable; if it does not, reject it.

| criterion | score 1–5 | evidence |
|---|---|---|
| value | 3 | concurrency measured and frequent in Gleam, rare elsewhere; quota not reduced |
| system fit | 3 | `claim.mjs` and the ledger already exist; the sibling's ARCH-ENGINE-15 gives a feature claim; no priority, feature-level dependency or write scope yet |
| cost (5 = cheap) | 4 for the slice, 2 for the full dispatcher | slice is ~2 new files plus a plan field; full one touches ~20 files |
| risk (5 = low) | 4 for the slice, 2 for the full dispatcher | slice launches nothing; full one starts unattended sessions |
| reversibility | 4 | default 1 and opt-in; slice is read-only |
| evidence strength | 3 | docs verified; concurrency now measured; worker behaviour and worktree coexistence unproven |

## Overlap & prior work
Searched: `docs/ideas/*` (4, incl. the sibling branch), `docs/plans/TRACKER.md`,
`docs/architecture/*.rules.md`, CHANGELOG [Unreleased], README, and `priority`,
`maxSessions`, `claude --bg`, `claude agents` across commands, scripts, hooks.
- **Novel as code.** `grep priority` finds one line of prose (`scripts/lib/core.mjs:724`);
  no `maxSessions`; no `--bg` or `claude agents` use anywhere.
- **Extends** `docs/ideas/plan-hierarchy.md` (parent links, generated rollups, its session
  coordinator addendum) and `docs/ideas/plugin-overhaul.md` (the sub-agent cap; this is a
  separate cap on sessions, and neither raises the other).
- **Builds on** `scripts/claim.mjs:1-30`: atomic lock directory with `owner.json` and a
  24-hour stale recovery that needs `confirm:true`.
- **Builds on the sibling's decided rule** ARCH-ENGINE-15 (branch
  `worktree-idea-feature-branch-plans`, commit `64c86de`): one session owns a feature
  through `claim.mjs` with unit `feature:<id>`; cross-session decisions live in the plan's
  `## Decisions`, "no message channel".
- **Terminology clash to settle in `/architect`.** The sibling's "feature" is a group of
  units *inside* a plan; `plan-hierarchy.md` treats a plan doc as the feature. The
  dispatcher's unit of work must be one of them.
- **Conflicts with / depends on:** ARCH-ENGINE-09 (units sequential until the ARCH-STATE-03
  spike), ARCH-LAND-10 (feature landing ships only after a spike), ARCH-LAND-06 (conflicts
  park), ARCH-AUTO-01 (Phase A is interactive).

## System fit (whole project)
- **Contract ripple.** Plan frontmatter gains `priority: P0|P1|P2|P3` (additive;
  inherited from `parent:` once that exists). Ledger events may carry it (ARCH-TRACKER-02).
  There is no feature-to-feature dependency and no feature-level write scope today:
  `depends_on` and `scope:` are per unit (`plan-template.md:37-42`,
  `scripts/plan-graph.mjs:24-46`).
- **Data.** A slot is the set of live `feature:*` claims, cross-checked against live
  sessions from `claude agents --json`, not claims alone.
- **Config.** `execution.maxSessions`, default 1 (no extra sessions).
- **Security.** Starting sessions that act without a human. Bypass mode needs the
  disclaimer on record (agent-view doc); the force and `--no-verify` guards
  (ARCH-LAND-05) stay the last defence. Mods run unsandboxed with the user's permissions.
- **Tests.** Ordering, overlap, cap, claim race, stale-claim cases.
- **Observability.** `logEvent` for `queue_listed`, `session_started`, `slot_freed`.
- **UI.** `/craftsman:queue` (or `ready`); agent view already shows the sessions.
- **Docs.** README, EXTENDING, CHANGELOG; engine, state, auto rules.

**Second-order effects.** Parallel sessions all write the one tracker file in the main
checkout (`scripts/tracker.mjs:112-124`) and land to main through `repo-exec`'s merge lock.
A background session is moved by Claude into its own worktree under `.claude/worktrees/`
and, per the v2.1.198 changelog entry, "commits, pushes its own isolated branch, never
main or master, and opens a draft pull request when it finishes instead of asking first".
That sits beside Craftsman's own `.worktrees/<slug>` and its landing model.

## Research
All fetched 2026-10-18.
- **Agent view** — https://code.claude.com/docs/en/agent-view (research preview). `claude
  --bg --name <n> "<prompt>"`, `claude agents --json [--all]` (`state`, `status`,
  `waitingFor`), `logs`, `stop`, `rm`, `respawn`. Verified in the installed CLI 2.1.302.
  No cap, queue or worker limit in the 100,000 characters read; the last ~37,000 were not
  read. A permission prompt leaves a session in `Needs input` and a peek reply "doesn't
  answer it"; a script gets `Workspace not trusted` in an untrusted directory;
  `--bg` cannot be combined with `-p`. The `Notification` hook fires with
  `agent_needs_input` / `agent_completed` (side-effect only); which session it fires in is
  UNPROVEN.
- **Run agents in parallel** — https://code.claude.com/docs/en/agents. Five approaches
  compared; "Running several sessions or subagents at once multiplies token usage."
- **Cross-session messaging** — https://code.claude.com/docs/en/cross-session-messaging.
  `notify_when_idle` costs no tokens in the watched session; messages cannot approve
  permission prompts.
- **Agent teams** — https://code.claude.com/docs/en/agent-teams. Experimental, heavy on
  tokens, one team per session, one shared checkout.
- **Mods** — https://code.claude.com/docs/en/plugins/mods/reference. In-process, no model
  tokens, `$.process.run/spawn`, `$.clock.every`, `$.agent.list`, `$.store` shared across
  sessions on the machine, `$.session.usage` with `rateLimits` percent used; a hook's own
  time limit is 10 s per event.
- **Prior art** (secondary listings, not verified against the repos): CCManager, Claude
  Squad (tmux + worktrees), claude-team MCP server. None showed a priority queue or a
  documented cap.
- **Quota** — third-party estimates only (one shared pool, rolling 5-hour and weekly
  caps); not relied on.

**Approaches.**
- *A.* Full token-free dispatcher script that launches and refills.
- *B.* LLM coordinator session; spends tokens to save tokens.
- *C.* Agent teams; experimental, shared checkout.
- *D.* **`ready` + advisory slot cap**: read-only list by priority with launch commands;
  warns when `maxSessions` live claims are held. *D+* adds `--start`, which launches only
  the top item when a slot is free.
- *E.* Do nothing and use agent view by hand.

## Critique
- **Steelman.** The plugin has no scheduling today. The pieces exist: an atomic claim
  (`claim.mjs`), one ledger in the main checkout, a feature-owner rule in the sibling's
  architecture, and Claude's own launch and observe commands. A token-free script that
  refuses session N+1 turns hand-ordering into a cap, and Gleam shows the need (46% of
  active time with two or more sessions, peak 8).
- **Strongest case against.** The stated goal is saving tokens, and a dispatcher adds
  sessions; it cannot lower quota. At the default of 1 it does nothing, so a cap the user
  must opt into controls quota no better than not opening a second terminal. "No manual
  step" is false for any feature with unanswered `/auto` Phase A decisions, because a
  background session stops at `Needs input`.
- **Hidden assumptions, each with a test.**
  1. *A background `/auto` worker finishes a planned feature unattended.* Run one on a
     scratch repo and see whether it reaches `Needs input`.
  2. *Claude's worktree isolation and Craftsman's coexist.* The same run; inspect
     `git worktree list` and where it landed (and whether it opens a draft PR).
  3. *Feature write scopes are mostly disjoint.* Union the unit `scope.write` globs of
     the ready plans in the four repos.
  4. *The measured overlap is real work, not idle terminals.* Re-count using only
     sessions with a tool call in the window.
- **Failure modes.**
  - Workers stuck in `Needs input` hold slots and the queue stalls silently.
  - A crashed worker keeps its claim until the manual 24-hour recovery
    (`claim.mjs:18-27`), so claims alone leak slots.
  - A wrong "disjoint" answer brings back push races and park storms (ARCH-LAND-06).
  - Rival landing paths: a draft PR next to a `repo-exec` merge.
  - `claude agents --json` is a research preview; its fields can change.
  - Unattended bypass leaves the force guards as the only defence.
- **Kill criteria.**
  - The re-counted concurrency is 1 almost all the time.
  - A background `/auto` worker cannot finish a planned feature without attach.
  - Claude's isolation cannot coexist with `repo-exec` landing except by turning
    `worktree.bgIsolation` off.
  - The ARCH-LAND-10 spike fails or is abandoned.
  - A dry run reports more than about 1 false "disjoint" per 10 dispatches.
- **Cheaper alternatives.** Do nothing (agent view by hand) · the `ready` query only
  (option D) · D plus a guarded `--start` (D+).

## Disputed
- **Critic: "the problem's frequency is unproven; 993 starts over 189 ids says nothing
  about concurrency."** Disputed with a measurement: Gleam had two or more sessions at
  once for 46% of its active time and a peak of 8; across the machine 44% and a peak of
  10. It is a proxy (15-minute activity window), recorded above with its caveat, and the
  kill criterion about "almost always 1" is not met in Gleam. It *is* met in Podling and
  Craftsman (13–14%).
- **Critic: "v2.1.198 draft-PR behaviour not in the text I read."** Verified by me in the
  agent-view version table (quoted in System fit). It stays flagged UNPROVEN only for how
  it interacts with Craftsman's landing.
- **Critic: "`$.clock.every` and `$.agent.list` unverified."** Verified in the mods
  reference table (`$.clock`: `now, sleep, after, every`; `$.agent`: `register, spawn,
  list`). The conclusion is accepted anyway: keep the scheduler in a script.
- **Accepted, not disputed:** the quota framing, the interactive Phase A limit, the
  slot-leak risk, dropping the ARCH-MOD-01 amendment, the landing-spike dependency.

## Recommendations
(ordered by impact)
1. **Restate the goal** as "order and cap", not "save tokens". If the aim is quota, add a
   separate guard: the existing mod already calls `$.session.usage`
   (`docs/mod-manifest.txt`); let it record `rateLimits` percent used where a script can
   read it, and make `--start` refuse above a set threshold. UNPROVEN that rate limits
   are reported for the user's plan.
2. **Ship option D first.** `scripts/ready.mjs` (read-only) plus `/craftsman:queue`:
   lists features that are *ready* — unclaimed, not blocked, and with **no unanswered
   Phase A decision** (idea, architecture and plan done) — in priority order, with the
   exact `claude --bg` command and `--model`/`--permission-mode` choices. It warns, and
   does not block, when `maxSessions` `feature:*` claims are live.
3. **Add `priority:` (P0–P3) to plans**, inherited from `parent:` when
   `plan-hierarchy` lands; default P2. Additive per ARCH-TRACKER-02.
4. **Count slots from reality.** Live `claude agents --json` sessions cross-checked with
   `feature:*` claims, with stale claims shown, so a crash cannot freeze the queue.
5. **Overlap, conservatively.** Treat two features in the same project as overlapping
   until a finer `scope.write` check is proven in a dry run.
6. **Gate the launcher.** `--start` (D+) only after (a) the background-worker spike
   (hidden assumptions 1 and 2), (b) ARCH-LAND-10, and (c) ARCH-STATE-03. Decide the
   `worktree.bgIsolation` and auto-draft-PR stance first.
7. **Keep it in a script.** Leave ARCH-MOD-01 alone; no mod timer (10-second hook limit,
   new job type for the mod).
8. **Workers, not bypass.** Dispatch only features whose Phase A is complete, with
   permissions pre-granted through `allowed-tools`; do not use `bypassPermissions`.

## Open questions
Only what the owner can answer; each has an assumption so `/architect` is not blocked.
1. **Goal (assumed: order and cap, not token saving).** Say so if quota is the real aim,
   since that needs the usage guard in Recommendation 1 first.
2. **Unattended permissions (assumed: no `bypassPermissions`).** Dispatch only fully
   planned features with pre-granted `allowed-tools`.
3. **Unit of dispatch (assumed: the sibling's `feature:<id>` claim).** Settled in
   `/architect` together with the "feature" terminology clash.

## Next step
`/architect plan-hierarchy --deep` next (as asked), which should also record these
decisions: a `priority:` field, `execution.maxSessions` as a session cap separate from the
sub-agent cap, slots counted from live sessions plus claims, the scripted (not mod)
scheduler, and the spike gates. Then `/plan` the read-only slice (D) once the plan-format
change is decided. Nothing here is implemented.
