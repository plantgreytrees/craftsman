---
description: Root-side network phase for workflow runs. Not invoked.
disable-model-invocation: true
---
# Network phase (ARCH-LAND-19)

Unit runners are sandboxed and hold no credentials; the sandbox config is never loosened (no allowlisting `~/.config/gh`, no tokens passed in). So **root** runs every step that talks to the remote, outside the sandbox. `R <json>` = `printf '%s' '<json>' | CLAUDE_PROJECT_DIR="<root>" node "${CLAUDE_PLUGIN_ROOT}/scripts/repo-exec.mjs"`, run with the sandbox disabled for that call only (the user approves it). Nothing else needs it.

## Around a workflow run
1. **Args.** `{"plan":"docs/plans/<slug>.md","session_id":"<id>"}` to `scripts/run-args.mjs` → `{runs:[{project, units, args}], warnings}`. Never pass a plan path as `args`. A plan across projects is several `runs` in plan-graph order; launch `Workflow({name:"craftsman:run", args: run.args})` for each, and stop at the first run with a unit that is not `MERGED`.
2. **Fetch first.** For each run's project: `R {"action":"network","step":"fetch","project":"<p>"}`. Runners then work from that fresh `origin/<base>` (older than `repoExec.offlineMaxFetchAgeMinutes`, default 120, they stop).
3. **Drain after.** When a run ends: `R {"action":"network","step":"drain","project":"<p>"}` pushes what runners queued (plain refspecs, never forced). Each `parked[]` entry (origin refused the push) → `tracker.mjs` `PARKED` with its `decision`, for Phase C (ARCH-LAND-06). Check the queue any time with `"step":"status"`.

## A run returns `needs_network`
`{results, needs_network:{unit, action, resume:{stage, worktree_path}, feature?}}` — nothing was blocked or parked. Run `action` with `R` (its JSON, `network:"online"`); then relaunch the same `args` plus `landed` (every unit already `MERGED`), `resume:{<unit>:{stage:"land", worktree_path}}` when it stopped at `land`, `featureWorktrees:{<feature>:<path>}` and, after a `land-feature` stop, `featuresDone:[<feature>]`. A failure that still says "needs credentials" means root itself is sandboxed: tell the user to run that one `R` command outside it.

## State a background session cannot write
`Write`/`Edit` in the main checkout is blocked for a background session, but `.craftsman/acceptance.md` and `.craftsman/instructions/<slug>.goal.txt` live there: `{"file":"acceptance.md"|"instructions/<slug>.goal.txt","content":"…"}` to `scripts/state-write.mjs`.

Never: `--force`, `+refspec`, `--mirror`, `reset --hard`, `worktree remove --force` (ARCH-LAND-05); a credential in a command, log, tracker evidence or file.
