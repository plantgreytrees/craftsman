> **Human reference.** The loop never reads this file. What it enforces lives in
> [`plan.rules.md`](./plan.rules.md); if the two disagree, the rules file wins
> and `/architect --update plan` should be run.

# Plan architecture
_Last verified: 2026-10-18 at `a211674` · Source idea: [plan-hierarchy](../ideas/plan-hierarchy.md) (with [session-dispatcher](../ideas/session-dispatcher.md))_

## In plain English
Plans are organised in four levels. An **epic** is a thin document that lists
the larger changes ahead. A **story** is a plan document that groups
**features**. A **feature** is a group of units that one session owns, with its
own branch and exactly one long-lived worktree. A **unit** is today's unit.
Each epic and story gets a generated `TRACKER.md` rollup; the ledger stays the
only source of truth. `/orchestrate` and `/auto` target any level and default
to a feature. Existing plans need no rewrite: no `level:` means feature.

Progress reaches `main` through `tracker publish` (a locked, idempotent commit of
generated files only), so you can follow a run without opening a worktree.
Code reaches `main` once per feature (`land-feature`). A plan must be on
`main` before a feature worktree is created.

## How it fits
```mermaid
flowchart TD
  E[epic doc: level epic] --> S[story plan doc: features groups]
  S --> F[feature: branch feature/plan-id, one worktree]
  F --> U[unit]
  F -. wave, sub-agent cap >= 2 .-> W[short-lived wave worktrees]
  PI[scripts/lib/plan-index.mjs] --> RO[rollups docs/plans/slug/TRACKER.md]
  PI --> CMD[plan / orchestrate / auto / instruction / focus]
  L[(ledger)] --> RO
  L --> PUB[tracker publish] --> MAIN[origin/main]
```

## Decisions
| id | decision | why | rejected alternatives |
|---|---|---|---|
| ARCH-PLAN-01 | Adopt the feature-branch design's "feature" (a group of units in a plan); a plan with no groups is one implicit feature | Inherits the sibling's decided rules instead of reversing about eleven | Plan doc = feature (reverses them); both shapes (two code paths) |
| ARCH-PLAN-02 | One `plan-index` parser | Replaces three ad-hoc frontmatter regexes; `plan-graph` stays pure | Grow plan-graph; parse inside tracker.mjs |
| ARCH-PLAN-03 | `--level`, default feature, sequential subtree | Matches "orchestrator follows features by default, with the option" | Default to the slug's own level |
| ARCH-PLAN-04 | No forced migration | 7 of 11 plans have hand-written rows outside the ledger | Re-register legacy rows (invents history) |
| ARCH-PLAN-05 | `priority` now, scheduler later | Session-dispatcher verdict: ship the read-only queue after the spikes | Build the dispatcher now |
| ARCH-PLAN-06 | Every slug consumer goes through plan-index | Makes /auto and /instruction use the structure fully | Per-command parsing |
| ARCH-TRACKER-10 | Generated rollups in `docs/plans/<slug>/TRACKER.md` | Owner wants a tracker file per level; folder keeps slug names clean | `<slug>.tracker.md` (basename becomes a bogus slug) |
| ARCH-TRACKER-11/12 | `publish` + `TRACKER.jsonl` snapshot, refuse-to-blank | Ledger is gitignored per machine; output is a pure function of it, so a retry never needs a merge | Commit the ledger; render into the landing commit; progress ref |
| ARCH-LAND-13..15 | One feature worktree; `land-unit`; wave worktrees | Park/block semantics and reviewer diffs survive; one session = one long-lived worktree | Commit straight on the feature branch; two writers in one tree |
| ARCH-LAND-16 | Plan gate in `repo-exec prepare` | Mechanical, no hook latency | Hook marker; prose only |
| ARCH-LAND-17 | `tracker.publish` default push | Matches "always push updates to main" | Off by default |
| ARCH-STATE-09 | Keep scope keyed by worktree; replace and release per unit | Re-keying by (worktree, unit) makes `readScope` ambiguous | Key by unit |
| ARCH-ENGINE-16/17 | Waves of 2+ units, spike-gated | Your ask: sub-agents run two units at once | Same-worktree parallelism; sequential only |
| ARCH-AUTO-09 | `/auto` stops when all descendant rows are COMPLETE | An epic slug has no rows and would hold the marker for 24 h | — |

## Data & flows
Ledger → (plan-index) → rollups → `publish` → `origin/<base>`. `publish`
renders into a detached temp worktree at `origin/<base>` under the base merge
lock, so the working tree of the main checkout is never touched.

## Trade-offs & known limits
- Dozens of `docs(tracker)` commits a day with several sessions; a no-op for `land: pr` repos.
- Doc budgets are full (orchestrate.md, plan.md, _shared-execution.md, unit-runner.md): new protocol text goes in a conditionally read reference doc.
- Legacy hand-written rows stay invisible to rollups.
- UNPROVEN: whether Claude Code's worktree isolation lets a `node` script push from a `.claude/worktrees/` session, and the value of `CLAUDE_PROJECT_DIR` inside one.

## Amendments to the feature-branch-plans rules (applied 2026-10-18)
That work (branch `worktree-idea-feature-branch-plans`, 64c86de) is merged into this branch. Applied:
1. ARCH-ENGINE-14 is superseded by ARCH-ENGINE-18: a plan without `features:` is one implicit feature on the feature-worktree path.
2. ARCH-LAND-08 is superseded by ARCH-LAND-18: units land by `land-unit` inside the feature worktree; `land-feature` is unchanged.
3. ARCH-DOCS-01 is superseded by ARCH-DOCS-09: retirement also removes the rollup and refuses a parent with live children.
4. ARCH-TRACKER-11 names FEATURE_MERGED among the `publish` triggers.
Terminology: its "feature" is the hierarchy's feature; the idea doc's "plan doc = feature" is only the implicit-feature case.

## Glossary
**Wave**: units of one feature running together. **Rollup**: the generated tracker of an epic or story. **Publish**: the locked commit of generated progress files to base.

## Profile amendment (2026-10-23)
ARCH-PLAN-07: "how the owner wants Claude to work" lives in three places that already have loading and enforcement. Mechanism goes in config keys, judgement in `.claude/rules/craftsman-loop.md`, and invariants in ARCH rules. Four machine-wide plugin settings sit on top: autonomy level, review depth, model tier and budgets enforcement. A separate profile file was rejected as a fourth place to drift. See [approval](./approval.md).

ARCH-PLAN-05 -> 08: `execution.maxSessions` may be read by the queue script and the dashboard to size lanes (ARCH-VIEWS-07); still never by the mod or a hook. Rejected: keeping it unread, which left the dashboard with one lane.
