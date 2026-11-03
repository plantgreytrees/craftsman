---
description: Protocol for /sync-docs --archive/--prune.
disable-model-invocation: true
user-invocable: false
---
# Sync-docs `--archive` / `--prune` protocol

Read only under `--archive`/`--prune`. Grant as `sync-docs.md`.

## `--archive`

Retire each COMPLETE plan (`tracker.mjs` action `status`, not `lookup`) with `node "${CLAUDE_PLUGIN_ROOT}/scripts/doc-retire.mjs"`, stdin `{"plan":"docs/plans/<slug>.md","sid":"<session>"}`. A refusal is final: report the referrer, never force. Not with `CRAFTSMAN_SAFETY=off`.

With an archive project, show the link-rewrite dry run; wait for confirmation. Push the archive repo with a plain push, owner-run only; retry any `archive_push_pending`.

## `--prune`

1. **Dry run first:** list candidates; delete nothing.
2. **Skip list:** a doc named by a live ledger row, a claim or a hand-off, or cited live.
3. **Scope:** `docs/`; another folder only when the user names it.
4. **Rounds of at most 15 docs.** STOP for confirmation each round.
5. **Ideas:** a rejected or deferred idea no live doc cites is pruned to its `TRACKER-archive.md` index heading `## idea <slug> (<date>) — <verdict> · <deciding fact> · doc <sha>`.
6. **Architecture:** a paired `.rules.md`/`.md` area is superseded through `/architect --update`, never pruned.

`--prune --archive` prunes the archive repo in the same confirmed rounds; docs keep their sha.

## Never pre-approved

An active `/goal` or any pre-approval does **not** cover `--archive`, `--prune` or `--prune --archive`: every round needs the user's explicit confirmation.
