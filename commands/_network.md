---
description: Root network phase for workflows.
disable-model-invocation: true
user-invocable: false
---
# Network phase (ARCH-LAND-19)

Unit runners are sandboxed and hold no credentials; the sandbox is never loosened (no allowlisted `~/.config/gh`, no tokens). So **root** runs every remote step outside the sandbox. `R <json>` = `printf '%s' '<json>' | node "${CLAUDE_PLUGIN_ROOT}/scripts/repo-exec.mjs"` at root, `project` in <json>, run with the sandbox disabled for that call only. Unattended, auto mode passes it only via the user-scope `autoMode.allow` entry `/craftsman:init --user-settings-diff` shows; else the user approves it.

## Around a workflow run
1. **Args.** `{"plan":"docs/plans/<slug>.md","session_id":"<id>"}` to `scripts/run-args.mjs` → `{runs:[{project, units, args}], warnings}`. Never pass a plan path as `args`. A plan across projects is several `runs` in plan-graph order; launch `Workflow({name:"craftsman:run", args: run.args})` for each and stop at the first with a unit not `MERGED`.
2. **Fetch first.** For each run's project: `R {"action":"network","step":"fetch","project":"<p>"}`. Runners stop if that fetch is older than `repoExec.offlineMaxFetchAgeMinutes`.
3. **Drain after.** When a run ends: `R {"action":"network","step":"drain","project":"<p>"}` pushes what runners queued. Each `parked[]` entry (origin or the drain refused it) → `tracker.mjs` `PARKED` with its `decision` (ARCH-LAND-06).

## A run returns `needs_network`
`{results, needs_network:{unit, action, resume:{stage, worktree_path}, feature?}}` — nothing was blocked or parked. Run `action` with `R` (its JSON, `network:"online"`); then relaunch the same `args` plus `landed` (every unit already `MERGED`), `resume:{<unit>:{stage:"land", worktree_path}}` when it stopped at `land`, `featureWorktrees:{<feature>:<path>}` and, after a `land-feature` stop, `featuresDone:[<feature>]`. A classifier refusal (`[Safety Bypass Flag]`, `[Auto-Mode Bypass]`) or a failure that still says "needs credentials" (root is sandboxed) is handled like `needs_network`: stop, name that one `R` command for the user, park nothing.

## State a background session cannot write
A background session cannot `Write`/`Edit` `.craftsman/acceptance.md` or `.craftsman/instructions/<slug>.goal.txt` in the main checkout: `{"file":"acceptance.md"|"instructions/<slug>.goal.txt","content":"…"}` to `scripts/state-write.mjs`.

Never: `--force`, `+refspec`, `--mirror`, `reset --hard`, `worktree remove --force` (ARCH-LAND-05); a credential in a command, log, tracker evidence or file.
