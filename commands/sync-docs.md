---
description: Maintain — reconcile docs/ against live code: verify architecture/feature docs still match reality, update drifted docs (or flag intentional-but-undocumented divergence), and reconcile tracker status chips. Keeps documentation truthful.
argument-hint: "[module | git range | doc path] [--tracker | --arch (default) | --all]"
model: sonnet
allowed-tools: Task, Bash, Read, Write, Edit, Glob, Grep, TodoWrite
---

# Sync-docs — the reconciler

> Doc authority: /sync-docs is one of the two commands allowed to write under docs/. **First action:** run `node "${CLAUDE_PLUGIN_ROOT}/scripts/doc-write.mjs" on` to authorise doc writes this turn.

You keep `docs/` **truthful against the code**. Where shipped reality has drifted from a doc, you **update the doc**; where a divergence looks intentional but undocumented, you **flag it** for the user rather than silently rewriting. This is how "the docs always know what the system is, does, and how" stays true. Modes: **`--arch`** (default — architecture/feature docs), **`--tracker`** (TRACKER status chips), **`--all`**.

Target: `$ARGUMENTS`. Read [_shared-machinery.md](_shared-machinery.md) → **Standing constraints** + **optional-MCP conventions**. Recall memory for doc conventions + past reconciliations (if available).

**Governing standard:** the doc standard in `docs/` (if the repo ships one) is authoritative; `docs/README.md` is the authority map. Treat the architecture docs + feature docs + the tracker as the truth source; `archive/` is history, out of scope.

## `--arch` (default) — architecture & feature docs

1. **Drift guard first (mechanical):** if the repo ships a doc-citation check, run it (scoped to the docs in play); else Grep the scoped docs for `file:line` cites and confirm each resolves. Every broken cite and every missing/stale status banner is a concrete drift to fix — start from evidence, not a blank re-read.
2. **Scope the docs to check:** a git range → the architecture/feature docs that own the changed code (map code→doc via Grep + any feature-map); a module → its owning docs; a doc path → that doc. Skip `archive/`, `docs/plans/`, `docs/api/`, `docs/standards/` (out of scope).
3. **Verify claim-by-claim (parallel, read-only where broad):** for each doc, confirm its cited behaviours/caps/wiring still hold in code — delegate `Explore` to confirm "does the code still do what the doc says", cite `file:line`. Classify each divergence:
   - **Doc stale, code correct** → **update the doc** to match shipped reality, re-date the status banner, fix the citation lines. This is the common case and you own it.
   - **Intentional-but-undocumented** (code deliberately changed, doc never followed — a new gate, a removed path) → update the doc AND **flag it in the summary** so the user knows the behaviour changed, not just the prose.
   - **Code wrong, doc right** (rare — code regressed from documented intent) → do **not** rewrite the doc to match a bug; open a PENDING tracker row + recommend `/investigate`.
4. **Enforce the doc standard on every doc you touch:** status banner present + dated, citations resolve, capability lines labelled, no drift-by-omission. Delegate bulk consistency to `docs-curator`. A doc you edited that still fails the guard is not done.

## `--tracker` — TRACKER reconciliation

The known failure mode: rows already built but still chipped open — trusting the chip wastes a session re-implementing shipped work. Evidence beats chips.
1. Parse in-scope rows (default: every open row; `$ARGUMENTS` may narrow to a bucket/id): id, claimed status, area, plan link. The linked plan's `[ ]`/`[x]` marks are claims too.
2. **Verify against code (parallel fan-out):** batch by area, dispatch read-only `phase-tracker`/`Explore` verifiers. Each returns **evidence, not vibes**: does the change exist in the named area (Grep the endpoints/classes/migrations/components/flags the plan names)? Verified status `NOT_STARTED`/`PARTIAL`/`IMPLEMENTED`/`IMPLEMENTED+TESTED`, each citing `file:line` (or "searched X,Y,Z — nothing"). Check git: `git log --oneline --all --grep=<row-id>`.
3. **Drift report:** table — row id · claimed · verified · evidence · proposed action. Categories: chip-lags-code (propose update + archive if fully shipped) · code-lags-chip (the dangerous direction — flag loudly with what's missing) · confirmed-accurate · unverifiable (propose a concrete row rewrite, don't guess).
4. **Archive shipped rows now — every pass, not a note for later.** Any row confirmed shipped gets **actually moved** this run: append a one-line condensed entry (id + outcome + evidence SHA/link) to the tracker's archive file, then delete the row from the live table. A `--tracker` run that verifies rows but leaves shipped ones in the live table is incomplete, not a smaller version of the job.
5. **Compress, don't append, on every edit.** When updating a row's Status cell or the tracker's `Last updated` line, **replace** the prior text with the current state — do not prepend/append a new paragraph on top of the old one (those chains are how a tracker grows an unreadable inline cell). History worth keeping belongs in the row's linked plan doc or as one dated one-line bullet in the changelog block, never as growing inline prose in a live cell.
6. **Recompute the counts from the surviving rows**, not by incrementing the old total — after step 4's archiving, count the actual open rows left in each bucket and rewrite each bucket's line as terse one-liners (`**id** (chip) — ≤15-word reason — [link]`).

## Apply (both modes) — confirmed only

`docs/` is shared with concurrent sessions. **Present the report and STOP for confirmation** (`--arch` doc edits and `--tracker` chip edits alike), then apply the confirmed changes row-by-row or as an approved batch — never reformat/prune foreign rows or docs outside the audited set. `--tracker`'s archive step (above) is part of "apply", not a separate optional pass. Bump the doc's/tracker's last-updated line **by replacing it**, per step 5. Record memory (if available) — which docs drift most (they need the tightest citations). Summary: docs updated / chips corrected, rows archived this pass (count + bucket), intentional divergences flagged for the user, code-regressions routed to `/investigate`, unverifiable items awaiting a rewrite.
