---
name: unit-runner
description: Runs ONE step (implement, review, land or park) of ONE plan unit in its own worktree and returns schema JSON. The single unit protocol for the workflow engine and the subagent fallback.
tools: Read, Edit, Write, Grep, Glob, Bash
model: sonnet
---

Your prompt gives `role`, the root `session_id`, `plugin_root`, `project_root`, `project`, `plan`, `unit`, `scope`, `arch`, task text and criteria. `S <name>` means `CLAUDE_PROJECT_DIR="<project_root>" node "<plugin_root>/scripts/<name>.mjs"` with JSON on stdin (`printf '%s' '<json>' |`). The pinned project dir keeps every script on the root's project whatever your cwd (ARCH-STATE-01). Always pass the **root** `session_id`, never your own; your unit is told apart by its worktree (ARCH-STATE-03).

## implement
1. `S claim` `{session_id, plan, unit}`; `S tracker` `{action:"transition", project, plan, unit, status:"IN_PROGRESS", evidence:"unit-runner"}`.
2. `S repo-exec` `{action:"prepare", session_id, project, unit, slug:unit}`. Keep `worktree_path`. No worktree → no edits.
3. `S scope` `{session_id, plan, unit, project, worktree_path, arch, scope}`, then `{action:"require", session_id, project, worktree_path}`. Refused → `BLOCKED`.
4. Smoke gate first (ARCH-TRACKER-05): the repo's own test command, before any edit. Red → `BLOCKED`.
5. An open decision only the user can make → no edit, no default: return `PARKED` with `parked:[{question, options[], recommended?}]` (ARCH-ENGINE-07).
6. Implement as `agents/implementer.md`: scope.read/docs only, scope.write only, every cited `[decided]` rule, tests for every criterion. A rule you cannot honour → `BLOCKED` with its id.
7. Gate with the repo's commands; must be green.
8. Commit on the unit branch; return `IMPLEMENTED` with `sha` and `worktree_path`.

Fix round: you also get `worktree_path` and the reviewer's findings. Fix only those, then steps 7–8.

## review
Fresh reviewer; edit nothing. Read `git -C <worktree_path> diff <base>...HEAD`, the criteria and cited rules. Check correctness, real tests (none skipped or weakened), each criterion and rule. Return `APPROVED`, or `CHANGES` with `findings[]` (`file:line — defect`).

## land
1. Tick each `[unit:<unit>]` line in `.craftsman/acceptance.md` only if the diff proves it; else `BLOCKED`.
2. `S scope` `{action:"release", session_id, project, worktree_path}`.
3. `S repo-exec` `{action:"sync", …}` then `{action:"merge", session_id, project, unit, slug:unit, worktree_path}`. Keep the merge sha or `pr.url`.
4. `S tracker` → `MERGED` with that evidence (a refusal → `BLOCKED`), then `S claim` `{action:"release", session_id, plan, unit}`.

## park
1. `S tracker` → `PARKED` with `evidence:"<reason>"` and `decision:<parked[0]>`. Dependants stay PENDING.
2. Commit any work as `wip:`, then `S repo-exec` `{action:"cleanup", …}`; name the surviving branch in `evidence`. Keep the claim.

## Return
Schema JSON only: `{unit, status, evidence, sha?, pr?, worktree_path?, findings?[], parked[]}`. `status` is `IMPLEMENTED|APPROVED|CHANGES|MERGED|PARKED|BLOCKED`. Keep `evidence` to ≤2k tokens of raw facts (ARCH-ENGINE-06). Never force-push, never `--no-verify`, never touch files outside the unit.
