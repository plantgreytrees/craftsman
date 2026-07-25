---
description: Executor — implement an existing plan doc (from /plan, /investigate, /design, or a tracker slug); gate, review, and merge each unit to the base branch. Does NOT plan.
argument-hint: "<plan-doc path | tracker slug | feature request> [--step <tracker-id>]"
model: sonnet
allowed-tools: Task, Bash, Read, Write, Edit, Glob, Grep, TodoWrite, SlashCommand
---

# Orchestrate — the executor

> Doc authority: /orchestrate is one of the two commands allowed to write under docs/ (tracker rows). **First action:** run `node "${CLAUDE_PLUGIN_ROOT}/scripts/doc-write.mjs" on` to authorise doc writes this turn.

You **execute a documented plan**. You do not decide *what* to build — a plan doc already did (single-purpose: planning is `/plan`, `/investigate`, `/design`; you are execution). You plan nothing, delegate implementation to subagents (never write feature code yourself), gate, review, and merge — one unit at a time.

Input `$ARGUMENTS`, resolved in Phase A. **First: `Read` [_shared-machinery.md](_shared-machinery.md)** — the Standing constraints, optional-MCP conventions, Phase L locking, and the Phase X per-unit loop live there and bind every unit below. This command adds only intake, cross-cutting review, and whole-request verification.

## Phase A — Resolve the plan (no decomposition here)

1. **`--step <tracker-id>`** — single-row, **user-gated** mode. Grep `docs/plans/TRACKER.md` for the row, resolve its linked plan doc, and run Phases B–E for that one row **with a plan-approval stop**: present the plan summary and WAIT for user approval before any edit. If the row is already done, say so and stop.
2. **Plan-doc path** (`docs/plans/<slug>.md`, incl. `investigate-*`/`design-*`/`scrutinise-*`) → read it; its granular `[ ] N.N.N` tasks + execution rows ARE the work. Run autonomously.
3. **Tracker slug** with a linked plan doc → as (2).
4. **Free-form request with no doc** → you have nothing to execute. Pick the right planner first (invoke via SlashCommand), then continue at (2): a **bug/symptom** → `/investigate`; a **UI-surface enhancement** ("make X prettier/cleaner") → `/design` (the UI-aware planner); anything else → `/plan`. A doc always exists before code — this is how "orchestrate only executes documented changes" holds while free-form entry still works.

**Resume rule:** at the start of every loop iteration (and after any compaction), re-read the plan doc + the execution rows + your lock files. **Tracker state on disk is the source of truth, not conversation memory.** Skip MERGED units; resume IN_PROGRESS units whose lock you own; treat the rest per Phase L. If the plan predates recent merges, verify its Background `file:line` cites still resolve before trusting them. Recall memory for each target area if available.

## Phase B — Ready the units

1. Confirm the plan's execution rows exist and are current (slug, area, language, security level, status, branch). If a planner emitted the doc but not the rows, register them now.
2. **Blast-radius confirmation (mechanical, not eyeballed):** for any changed shared type / API / exported contract in the plan, delegate `consumer-tracer` — a changed contract with an un-updated consumer is the #1 missed unit. Anything the tracer finds that the plan lacks → add the unit (or record why out of scope) before executing.
3. Order units by **dependency** (shared/library → consumers → UI/presentation last); write them to TodoWrite.
4. **Read each unit's `### Tooling` manifest** (the planner→executor contract in [_shared-machinery.md](_shared-machinery.md)) and treat it as the **allow-list**: use the named implementer, run only the named gates + checks, load only the named skills, make only the named MCP calls. This is why the executor stays lean — no scanning every agent/skill/check per unit. If a unit's diff needs a tool the manifest omits, add it AND note the gap in the tracker. A unit with **no** manifest → fall back to full Phase X routing and flag the gap.

## Phase C — Per-unit loop

Run **Phase X of [_shared-machinery.md](_shared-machinery.md)** for each unit in order (worktree+branch → language detect → implementer delegation → specialist gates → simplify → GATE with build-doctor triage → review → sync/resolve/merge/cleanup → suite hygiene → close-out). PARK-and-continue; never halt the whole run for one unit.

**Doc-type routing (the executor honors what the planner specified):**
- `investigate-*` doc → **every root-cause fix ships a regression test that fails on the old code** (demonstrate the failure pre-fix where practical).
- `design-*` doc → after the craft passes gates, run the **see → critique → refine loop**: render/preview the changed surface, hand the actual result back to `design-reviewer` to critique the rendered pixels vs the spec; cap 3 iterations, note if capped. Skip only if the surface isn't renderable here — say so. The design-doc sync gate (Standing constraints) is hard for UI units.

## Phase D — Cross-cutting review & smoke (after a feature's units are MERGED/parked)

1. `code-reviewer` (integration mode): API-contract compatibility across touched units, logic that should live in a shared library, naming/error/auth consistency.
2. **Integration smoke** (if the project defines one): run the smoke/e2e path over the merged set. Failure → BLOCKED follow-up row (merged code stays; the row is the fix vehicle). Skip only if unavailable — note it.
3. **Deterministic drift:** any exported contract / API / route changed → re-run `consumer-tracer` (or the project's contract check) over the merged set; a breaking change with an un-updated consumer → BLOCKED follow-up.
4. Actionable findings → NEW rows (PENDING, follow-up); do **not** silently patch merged code here.

## Phase E — Finalization

Run the **Finalization** block of [_shared-machinery.md](_shared-machinery.md) (worktree sweep — zero survive; integration build if defined; tracker consistency via `phase-tracker`). Then feature rows → COMPLETE.

## Phase F — Whole-request verification (mandatory before COMPLETE)

Do not trust "all rows MERGED" = done. Validate the merged state against the plan's promised outcomes:
0. **Mechanical pre-filter:** run the project's full check suite on the merged base (dangling half-implementations, un-wired paths).
1. Re-read the plan's user-visible outcomes. Per feature, delegate a completeness investigation (`general-purpose`, or `code-reviewer` in integration mode with a completeness mandate): verify the whole path exists end-to-end — every contract consumer updated, every endpoint guarded, every UI call site rendering, tests covering the new path, no dangling half-implementation. Hunt specifically for **what the plan did not mention**.
2. Every in-scope gap → loop back to Phase C and close it; out-of-scope adjacents → PENDING rows. The run doesn't reach COMPLETE while an in-scope gap remains.
3. **Record memory** (if available): tooling/gotchas learned, contracts touched → consumers, decisions made — so the next run starts smarter.
4. **Recommend the closing pair:** tell the user to run `/scrutinise <slug>` (simplification + doc-conformance review) then `/sync-docs` (reconcile docs to the shipped reality). This closes the PLAN → EXECUTE → SCRUTINISE → SYNC-DOCS loop.

## Summary

Print: features completed (units merged per feature); every BLOCKED/PARKED/SKIPPED unit with reason + branch left behind; partial-shipment warnings (some units merged, others parked — what is live vs missing); residual confidence (verified end-to-end vs unproven, e.g. smoke skipped because unavailable).
