---
slug: plugin-optimisation-recheck
status: pursue-with-changes
verdict: pursue-with-changes
confidence: high
depth: standard
isolation: isolated
created: 2026-10-22
updated: 2026-10-22
related: [docs/ideas/plugin-overhaul.md, docs/ideas/session-dispatcher.md, docs/ideas/plan-hierarchy.md, docs/ideas/feature-branch-plans.md, docs/plans/fixes-and-safety.md (branch feat/fixes-and-safety), docs/plans/scrutinise-fixes-and-safety.md (branch feat/fixes-and-safety), docs/architecture/tracker.rules.md, docs/architecture/state.rules.md, docs/architecture/engine.rules.md, docs/architecture/safety.rules.md (branch feat/fixes-and-safety)]
touches: [scripts/tracker.mjs, scripts/tracker-publish.mjs, scripts/tracker.test.mjs, docs/architecture/tracker.rules.md, scripts/lib/core.mjs, scripts/pre-guard.mjs, scripts/scope.mjs, scripts/doc-size-policy.mjs, agents/unit-runner.md, commands/_shared-execution.md, CHANGELOG.md, commands/*.md, agents/*.md, workflows/spike.js, .claude-plugin/plugin.json]
---

# Idea: Re-rank the 18 Oct optimisation ideas against what landed, the open PR and live sessions

## Proposal (neutral restatement)
**Problem.** Four ideas dated 2026-10-18 proposed optimising craftsman (opt-in
activation, an agent cap, per-dispatch model routing, session focus and chain,
a session dispatcher, token trimming). Since then plan hierarchy and feature
branches shipped (2.2.0), main took network and sandbox work (22 Oct), a 78-commit
safety branch is open as PR #1, and live sessions in other repos report plugin
defects. It is unclear which proposals remain worth building.
**Claimed benefit.** Spend effort on the items that evidence supports; drop
stale or contradicted ones.
**Who benefits.** The solo maintainer, who runs sessions in Craftsman, Gleam
and Loost.
**Done.** A ranked, evidenced list: what to build next, what landed, what to cut.

## Verdict
**PURSUE-WITH-CHANGES** (high). Do not build the 18 Oct optimisation set as
written. The evidence ranks one live defect first (the tracker ledger can drop
committed rows), then landing PR #1, then upgrading installs and re-measuring,
then a trimmed cleanup bundle. The agent cap, session dispatcher, focus/chain and
the model-router script have no current demand. **Deciding fact:** a Loost
session is blocked because the local ledger holds 5 rows against 57 committed,
and no guard covers a partial ledger (`tracker-publish.mjs:57`,
`tracker.mjs:189-200`, `tracker.mjs:503`). **Most likely to flip it:** the owner
saying the safety direction of PR #1 was superseded by the "20 Oct review"
(not in the repo), which would drop item 2 and reopen opt-in.

| criterion | score | evidence |
|---|---|---|
| value | 4 | C9 blocks a live session; PR #1 hardens guards; the rest has no measured demand |
| system fit | 4 | C9 extends ARCH-TRACKER-12; opt-in collides with ARCH-SAFETY-05/08 on the branch |
| cost (5 = cheap) | 3 | C9 and the cleanup are small; PR #1 is +8411/-471 with 7 conflicts |
| risk (5 = low) | 3 | a wrong conflict resolution in `pre-guard.mjs` or `scope.mjs` silently weakens guards |
| reversibility | 4 | each step is a commit; config-gated |
| evidence | 4 | repo-verified; telemetry window is only 1.5 days; the 20 Oct review is unseen |

## Overlap & prior work
Searched: `docs/ideas/*`, `docs/plans/TRACKER.md`, `docs/architecture/*.rules.md`,
`CHANGELOG.md`, branch `feat/fixes-and-safety`, `~/.claude/jobs/*/state.json`,
`.craftsman/events.jsonl` in four repos.
- **Landed (2.2.0 and after):** plan hierarchy and feature branches (off by default);
  `execution.maxSubagents` wave cap, inert at 0 or 1 (`workflows/run.js:198`,
  `plan-graph.mjs:83-87`); size caps (`doc-size-policy.mjs`); `/auto`, `/merge`;
  network phase, run-args, state-write, ARCH-STATE-10/11 (22 Oct).
- **Reserved, unread:** `execution.maxSessions` (`scripts/lib/core.test.mjs:517`).
- **Absent everywhere:** `route-model.mjs`, `focus.mjs`, `chain.mjs`, `merge-tree.mjs`,
  `ready.mjs`, an opt-in marker, `CRAFTSMAN_MAX_AGENTS`, `execution.modelRouting`.
  `enabled()` is unchanged (`core.mjs:594-600`, `craftsman.config.json:2`).
- **On the unmerged branch:** safety rules ARCH-SAFETY-01..11, fail-closed launcher,
  `onFailure`, partials hidden from the menu, release identity from the changelog.
  It splits `enabled` so it switches off only the quality, doc and tracker machinery.
- **Conflicts:** adding `version` to `plugin.json` contradicts CHANGELOG 2.2.0
  "Installs track commits" (`CHANGELOG.md:56`) and the branch's step 19.

## System fit (whole project)
- **contract ripple:** C9 touches tracker publish and sync only; PR #1 touches 7 files that
  conflict with main (`CHANGELOG.md`, `agents/unit-runner.md`,
  `commands/_shared-execution.md`, `scripts/doc-size-policy.mjs`, `scripts/lib/core.mjs`,
  `scripts/pre-guard.mjs`, `scripts/scope.mjs`).
- **data:** C9 is a ledger-vs-committed-rows invariant; a union fix must honour archive events.
- **config & flags:** nothing new for C9; opt-in would add a key that collides with the branch.
- **security:** the highest-risk step is conflict resolution in the guards.
- **tests:** C9 needs a 5-versus-57 partial-ledger case; PR #1 needs the full guard suite rerun.
- **observability:** `scope_blocked` and `agent_mode_blocked` are the only measures; the log starts 2026-10-21.
- **UI:** N/A(no user-facing surface in the recommended slice).
- **docs:** the ARCH-TRACKER-12 cite `tracker.mjs:184-195` points at the wrong code; the guard is at `tracker-publish.mjs:57-60`.
- **Second-order:** every new component (slot ledger, router script) adds a hook or
  dispatch path to a plugin already at 32 commands, 22 agents and 82 scripts.

## Research
- Setting `version` in `plugin.json` pins the plugin until changed
  (https://code.claude.com/docs/en/plugins-reference). Do not add it.
- Subagents can nest to 3 layers; `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` defaults to 20;
  model resolves per-invocation `model` > frontmatter > env since 2.1.251; `maxTurns` exists
  (https://code.claude.com/docs/en/sub-agents). The platform already covers a concurrency cap
  and per-dispatch model choice.
- Hook `if` works on all handlers; `onFailure` needs 2.1.295; exec form is `command` plus `args`
  (https://code.claude.com/docs/en/hooks).
- Telemetry (Gleam, 21-22 Oct): 5074 events, 15 sessions, 90 `scope_blocked`, 0
  `agent_mode_blocked`; Craftsman repo 1 `agent_mode_blocked`. The earlier "34 blocks across
  3 repos" cannot be re-measured. UNPROVEN either way.
- Running installs use cache `792b8e4abf1b` (21 Oct), older than the 22 Oct plugin-root-read
  fix, so some Gleam read blocks may be stale installs. UNPROVEN.

## Critique
- **Steelman.** The plugin is user-scope, so every git repo is active, and live sessions
  stall on plugin state. Fixing the ledger, landing the fail-closed layer, then trimming
  gives safer, cheaper sessions.
- **Strongest case against.** Most of the 18 Oct set solves problems nobody is hitting
  now, and the platform already provides a concurrency cap and per-dispatch model.
  Landing 78 commits across guards carries more risk than any of the items it replaces.
- **Hidden assumptions.** Gleam plugin-cache blocks are stale-install artefacts (test: upgrade,
  count blocks over a day). The ledger hazard recurs (test: compare ledger and `TRACKER.jsonl`
  row counts per machine). Token cost is driven by plugin prose (test: `/context` in a fresh session).
- **Failure modes.** A bad merge in `pre-guard.mjs` or `scope.mjs` weakens guards in all repos.
  A union-style C9 fix could resurrect archived rows. Slot ledgers deadlock on leaks.
  A router script would silently route reviews to a weaker model.
- **Kill criteria.** Agent cap, dispatcher, focus: drop if `agent_mode_blocked` stays under about
  5 a week and nobody requests concurrent sessions in 30 days. Opt-in: drop if the branch's split
  lands with no uninitialised-repo complaint. PR #1: if the merge breaks guard tests, split it.
- **Cheaper alternatives.** Do nothing leaves C9 blocking work. Smallest slice: C9, PR #1, a
  trimmed cleanup. Native-first: document the native subagent variables and the dispatch `model`
  parameter in `_shared-execution.md` instead of building a cap or router.

## Disputed
- Mine, overturned by the critic and re-verified: I first read ARCH-TRACKER-12 as covering
  the Loost hazard. It refuses only a shrink to empty (`tracker-publish.mjs:57`).
- The critic's PR #1 status was unchecked on GitHub; I checked it: OPEN, `CONFLICTING`.

## Recommendations
1. **Fix the ledger shrink now, small, on main.** Publish and sync refuse any render that drops
   committed rows lacking an archive event; add a rehydrate-merge for a partial ledger; test
   5 versus 57; correct the ARCH-TRACKER-12 cite. Then unblock Loost.
2. **Land PR #1** by rebasing on main. Keep main's ARCH-STATE-10/11 in `core.mjs` and
   `scope.mjs`; rerun the full guard suite; close or defer the open
   `scrutinise-fixes-and-safety` rows first.
3. **Run `/craftsman:upgrade` everywhere**, then re-count `scope_blocked`.
4. **Trimmed cleanup:** `disable-model-invocation` on user-only commands, `maxTurns` on reviewers,
   delete `workflows/spike.js`, rotate `events.jsonl`. Drop `version`. Defer hook `if` and exec
   form to the branch's launcher.
5. **Opt-in:** restate as machinery-only on top of ARCH-SAFETY-05; defer until PR #1 lands.
6. **Model routing:** a dispatch-time prose rule, not a script. **Tokens:** measure first.
7. **Defer** agent cap, session dispatcher, focus, chain, merge-tree.

## Open questions
- Is the safety direction of PR #1 still the intended one, or did the "20 Oct review"
  (not in the repo) supersede it?
- Should the ledger fix go on main now, ahead of PR #1, given the conflict risk in `core.mjs`?

## Next step
`/architect plugin-optimisation-recheck` to amend ARCH-TRACKER-12 (partial-ledger shrink) and
record the defer/cut decisions; then `/plan` the ledger fix as its own unit. Reopen the deferred
items if `agent_mode_blocked` exceeds about 5 a week or concurrent sessions are requested.
