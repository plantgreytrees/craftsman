---
description: Feature worktree protocol for unit-runner. Not invoked directly.
disable-model-invocation: true
---
# Feature protocol (unit-runner roles with `feature: <id>`, and role `land-feature`)

Needs `planning.featureBranches`. `S`, `session_id` and runner rules are as in `agents/unit-runner.md`; this gives only feature differences. One feature = one worktree on `feature/<plan>-<id>` (ARCH-LAND-13); units run one at a time inside it (ARCH-ENGINE-17).

## implement: prepare or reattach
- Prompt has `worktree_path:` → the feature worktree exists: reuse it, skip prepare. Otherwise `S repo-exec` `{action:"prepare", session_id, project, plan, feature, unit}` creates it, or reattaches (`reattached:true`); plan-gate refusal (ARCH-LAND-16) → `BLOCKED`. Return its `worktree_path`. Publish after prepare (ARCH-TRACKER-11).
- Wave unit (`wave: true`) → `{action:"prepare", …, unit, slug:unit, base_branch:<feature branch>}`: its own short-lived worktree (ARCH-LAND-15).
- In the feature worktree create unit branch `feat/<unit>`, then do implement steps 1, 3 to 8 there. Activating scope replaces the prior unit's scope file (ARCH-STATE-09).

## land (unit): land-unit
Replaces land steps 3 and 4's merge. After the acceptance tick and `S scope` release: `S repo-exec` `{action:"land-unit", session_id, project, unit, slug:unit, worktree_path, feature_branch}` (a wave unit adds `unit_worktree`, then `cleanup` it). It gates, merges `feat/<unit>` into the feature branch `--no-ff`, pushes the feature branch. `{parked:true, decision}` → `PARKED` with `parked:[decision]`. Else `S tracker` → `FEATURE_MERGED` (evidence: merge sha), `S claim` release.

## land-feature (role)
Prompt gives `worktree_path`, `units[]`; the unit is the feature's last. `S repo-exec` `{action:"land-feature", session_id, project, plan, feature}` merges base in, re-runs the gate, merges onto base, pushes, promotes the rows to `COMPLETE` and removes the feature worktree. Return `MERGED` with `merge_sha`. `{parked:true, decision}` (conflict, ff-only, rejected push) → `PARKED` with `parked:[decision]`; refusal → `BLOCKED`.

## park and block
Every feature-mode `S tracker` transition (IN_PROGRESS, FEATURE_MERGED, PARKED, BLOCKED) carries `feature`, `feature_branch`, `session_id` (ARCH-TRACKER-07). A land-feature park → `S tracker` `PARKED` with `decision`.
First `S scope` release (`{action:"release", session_id, project, worktree_path}`). Park/block keep the unit branch, leave the feature worktree clean on the feature branch (ARCH-LAND-14); then publish.

## publish
After each unit lands (`FEATURE_MERGED`), park, block and land-feature: `S tracker` `{action:"publish", project}`. Pushes only generated tracker files; honours `tracker.publish`; ignore `published:false`. After land-feature pass `approved:true`.

## levels and flags
Read only when `--level`, `--feature` or `level:` applies. Slugs resolve through plan-index (ARCH-PLAN-06); a parent expands to `children:` order, else priority then slug.
- `--level epic|story|feature|unit` (default feature); `--feature <id>`. A story defaults to one feature (first open, unclaimed); `story|epic` run the whole subtree; `unit` is `--step` (ARCH-PLAN-03).
- /auto ends when every resolved row is COMPLETE (ARCH-AUTO-09).
- /instruction goal text opens `Level: <level> · feature: <id> · wave allowance: <n>` (n = `execution.maxSubagents`, 1 = no wave; ARCH-ENGINE-16).
- /plan writes `level`, `parent`, `children`, `priority`.
