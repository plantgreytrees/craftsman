---
description: Update every install of craftsman (user scope and each project) to the latest pushed commit, then load it and refresh this project. The one command to run after the plugin changes.
argument-hint: "[--dry-run]"
allowed-tools: Bash, Read
---

# Upgrade — move every install to the latest plugin

Craftsman leaves `version` unset in `plugin.json`, so Claude Code versions each
install by commit and every push to `main` is an update. Installs are recorded
per scope (the user install, plus one per project that installed it), and
`claude plugin update` moves only the one it is pointed at. This command moves
them all.

## 1. Update

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/self-update.mjs" $ARGUMENTS
```

It refreshes the marketplace, updates each install from its own directory, and
prints one row per install: `updated` (old → new commit), `current`, `skipped`
(the project directory is gone), or `failed` (with the reason, usually the
network). With `--dry-run` it only lists what it would update. Report the rows
as printed. A `failed` row means that install is still on the old copy — say
so, and suggest re-running once the cause is fixed.

## 2. Load it

This session still runs the copy it started with. Tell the user to run
**`/reload-plugins`** (hooks switch to the new copy) or restart. The old copy
stays on disk for 14 days, so a session already running is never broken by the
update.

## 3. Refresh each project

After reloading, run **`/craftsman:init`** in each project the output lists
(and this one). Its `--update` pass refreshes the project's config,
`.claude/CLAUDE.md`, `.claudeignore`, and plan `craftsman_version` stamps, and
its `architecture` section names the next step when the project has plans or
legacy architecture prose but no rules docs, normally `/architect --backfill`.

## Updates without asking

To have updates arrive on their own: `/plugin` → **Marketplaces** →
`craftsman-marketplace` → **Enable auto-update**. Claude Code then refreshes
the marketplace at startup and updates installs in the background, prompting
for `/reload-plugins`. If a project-scope install still shows an older commit,
run `/craftsman:upgrade`: it is the way to update everything right now.
