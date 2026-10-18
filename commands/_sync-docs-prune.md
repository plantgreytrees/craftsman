---
description: Protocol for /sync-docs --archive and --prune. Not invoked.
disable-model-invocation: true
---
# Sync-docs `--archive` / `--prune` protocol

Read only under `--archive` or `--prune` (ARCH-DOCS-04/05). Doc-write grant as in `sync-docs.md`.

## `--archive`

Retire each COMPLETE plan (`tracker.mjs lookup` confirms) with `node "${CLAUDE_PLUGIN_ROOT}/scripts/doc-retire.mjs"`, stdin `{"plan":"<slug>","sid":"<session>"}`. It removes the plan and closed siblings, archives the ledger rows and commits. A refusal is final: report the referrer; never force.

## `--prune`

1. **Dry run first:** list candidate stale docs and the reason for each. Delete nothing.
2. **Skip list:** skip any doc named by a live ledger row, a claim or a hand-off, and any doc a live doc cites. Log the skip.
3. **Scope:** craftsman folders only (`docs/`, plans, ideas). Touch another folder only when the user names it.
4. **Rounds of at most 15 docs.** Present each round and STOP for confirmation before deleting; the remainder waits for the next round. State the round count.
5. **Ideas:** a rejected or deferred idea no live doc cites is pruned to its `TRACKER-archive.md` index heading `## idea <slug> (<date>) — <verdict> · <deciding fact> · doc <sha>`, written before the doc goes. A cited idea stays.
6. **Architecture:** a paired `.rules.md`/`.md` area is superseded through `/architect --update`, never pruned.

## Never pre-approved

An active `/goal` or any pre-approval does **not** cover `--archive` or `--prune`: every round needs the user's explicit confirmation.
