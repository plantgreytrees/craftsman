---
description: Executor — implement an existing plan doc (from /plan, /investigate, or a tracker slug); gate, review, and merge each unit to the base branch. Does NOT plan.
argument-hint: "<plan-doc path | tracker slug | feature request> [--step <tracker-id>]"
model: sonnet
allowed-tools: Task, Bash, Read, Write, Edit, Glob, Grep, TodoWrite, SlashCommand
---

# Orchestrate — the executor

> Doc authority: /orchestrate is one of the two commands allowed to write under docs/ (tracker rows). **First action:** run `node "${CLAUDE_PLUGIN_ROOT}/scripts/doc-write.mjs" on` to authorise doc writes this turn.

You **execute a documented plan** — a plan doc already decided what to build (planning is `/plan`/`/investigate`; you are execution only). Plan nothing, delegate implementation, gate, review, and merge — one unit at a time.

Input `$ARGUMENTS`, resolved in Phase A. Before Phase B, `Read` `${CLAUDE_PLUGIN_ROOT}/commands/_shared-machinery.md` (Standing constraints + MCP conventions + tooling-manifest contract, deliberately light). The heavier per-unit protocol — `${CLAUDE_PLUGIN_ROOT}/commands/_shared-execution.md` — is read only at the start of Phase C, once execution actually starts. Exception: `--step`'s pre-approval summary defers both reads until after user approval (Phase A.1).

## Phase A — Resolve the plan (no decomposition here)

1. **`--step <tracker-id>`** — single-row, user-gated. Grep the main checkout's `docs/plans/TRACKER.md` for the row, resolve its plan doc, run Phases B–E for that one row **with a plan-approval stop**. Build the summary from the TRACKER.md row + plan doc only — don't `Read` either shared-machinery file yet. Present it and WAIT for approval before any edit; already-done row → say so and stop. After approval, `Read` `_shared-machinery.md`, then run Phases B–E (which reads `_shared-execution.md` itself, per Phase C).
2. **Plan-doc path** (`docs/plans/<slug>.md`, incl. `investigate-*`/`scrutinise-*`) → its `[ ] N.N.N` tasks + execution rows ARE the work. Run autonomously.
3. **Tracker slug** with a linked plan doc → as (2).
4. **Free-form request, no doc** → nothing to execute yet. Pick the right planner via SlashCommand first, then continue at (2): bug/symptom → `/investigate`; anything else → `/plan`. A doc always exists before code.

**Resume rule:** at every loop iteration (and after any compaction), re-read the tracker — the **main checkout's** `docs/plans/TRACKER.md` ledger block (never a worktree's copy, which is stale), or `printf '%s' '{"action":"status"}' | node "${CLAUDE_PLUGIN_ROOT}/scripts/tracker.mjs"` — + your lock files — cheap, authoritative, always happens. **Tracker state on disk is truth, not conversation memory.** Skip MERGED units; resume IN_PROGRESS units whose lock you own; rest per Phase L. Re-read the full plan doc's task text only when first resolving the request, right after a compaction, or right before Phase C executes that unit — not every iteration once a row reads MERGED. Predates recent merges → verify Background `file:line` cites still resolve. Recall memory per target area if available.

## Phase B — Ready the units

1. Confirm execution rows exist and are current (slug, area, language, security level, status, branch); register any the planner missed.
2. **Blast-radius confirmation.** `/plan` already ran `consumer-tracer` per changed contract and persisted its `CONSUMERS:` block into the plan's Verification background — read that first. Re-run `consumer-tracer` only when no persisted manifest covers a contract this run touches, or the plan predates a merge that could've added a consumer. Anything found (persisted or fresh) the plan lacks → add the unit or record why out of scope.
3. Validate and topologically order the `scope_id`/`depends_on` graph: `{"steps":[...]}` (id, scope_id, project, depends_on) on stdin to `node "${CLAUDE_PLUGIN_ROOT}/scripts/plan-graph.mjs"` — exits non-zero on a missing dependency, cycle, or unknown `project`; fix the plan and re-run, never hand-order by eye. Write the returned order to TodoWrite.
4. Treat each scope step as one execution packet — read its `project`, task text, `scope`, `### Tooling` manifest once, keep active until all its tasks complete; don't reload per task. Each project runs through its own worktree, base branch, merge lock, remote, cleanup lifecycle.
5. **Read each step's `scope` manifest** as a hard allow-list — load only `scope.read`+`scope.docs` (plus tracker row + task text) before delegating; `scope.write` is the only writable set. No broad `Glob`/`Grep`, no unselected workspace projects.
6. **Activate the scope before Phase C** — exact step manifest as JSON on stdin to `scripts/scope.mjs`, creating the session-owned allow-list. A blocked tool call = mandatory re-scope: re-analyse the dependency boundary, update the plan's scope, reactivate, retry. Never widen to a repo-wide search.
7. Before each step: claim via `scripts/claim.mjs`, mark scope-required via `printf '%s' '{"action":"require","session_id":"<real session id>"}' | node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.mjs"`, activate the packet. **Mechanical, not just this instruction:** `orchestrate-scope-guard.mjs` (`PostToolUse` on `SlashCommand`, and `UserPromptSubmit` so a user-typed `/orchestrate` arms it too) sets the same flag the instant `/orchestrate` is invoked, so `pre-guard.mjs` hard-blocks every Read/Write/Edit/Bash call before any scope is active — even if this step is skipped. Implementer repeats activation in its worktree before its first tool call; activation failure = no implementation-context tool call, mechanically.

## Phase C — Per-unit loop

`Read` `${CLAUDE_PLUGIN_ROOT}/commands/_shared-execution.md` now. Run its **Phase X** per unit (worktree+branch → language detect → implementer delegation → specialist gates → simplify → GATE with build-doctor triage → routed review → sync/resolve/merge/cleanup → suite hygiene → close-out). PARK-and-continue; never halt the whole run for one unit.

**Doc-type routing:** `investigate-*` doc → every root-cause fix ships a regression test that fails on the old code (demonstrate the pre-fix failure where practical).

## Phase D — Cross-cutting review & smoke (after a feature's units are MERGED/parked)

1. **Skip entirely for a single-unit feature** — no cross-unit surface to check; that unit's merge-time panel (`_shared-execution.md` step 8) already reviewed it, and `/scrutinise` will again later. Re-running `code-reviewer` here would be a pure duplicate. For 2+ units: `code-reviewer` (integration mode) — API-contract compatibility across units, logic that belongs in a shared library, naming/error/auth consistency.
2. **Integration smoke** (if defined): run over the merged set. Failure → BLOCKED follow-up row (merged code stays). Unavailable → note it.
3. **Deterministic drift:** any exported contract/API/route changed → re-run `consumer-tracer` (or the project's contract check) over the merged set; breaking change + un-updated consumer → BLOCKED follow-up.
4. Actionable findings → NEW PENDING follow-up rows; never silently patch merged code here.

## Phase E — Finalization

Run `_shared-execution.md`'s **Finalization** block (worktree sweep — zero survive — integration build if defined, tracker consistency via `phase-tracker`). Before marking feature rows → COMPLETE, write the phase hand-off (`scripts/handoff.mjs`, JSON: plan, completed units, tracker state, remaining units, changed files, next action), then invoke `/compact` and start the next phase re-reading the tracker + that phase's scope manifests. `/clear` instead when a clean session is preferable — SessionStart restores the hand-off either way. **Mechanically enforced:** `handoff.mjs` marks the session compact-required as soon as the hand-off is on disk (pass the real `session_id`, or the marker lands under the wrong session and the gate fails open); `compact-gate.mjs` hard-blocks every other tool call (including any other slash command) until a real `/compact`/`/clear` fires SessionStart. No path to continuing without compacting.

## Phase F — Whole-request verification (mandatory before COMPLETE)

"All rows MERGED" ≠ done. Validate the merged state against the plan's promised outcomes:
0. **Mechanical pre-filter:** run the project's full check suite on the merged base.
1. Re-read the plan's user-visible outcomes. Per feature, delegate a completeness investigation (`general-purpose`, or `code-reviewer` integration-mode with a completeness mandate): the whole path exists end-to-end — every contract consumer updated, every endpoint guarded, every UI call site rendering, tests on the new path, no dangling half-implementation. Hunt for **what the plan didn't mention**.
2. In-scope gap → loop back to Phase C and close it; out-of-scope adjacent → PENDING row. No COMPLETE while an in-scope gap remains.
3. **Record memory:** tooling/gotchas learned, contracts touched → consumers, decisions made.
4. **Recommend the closing pair:** `/scrutinise <slug>` (simplification + doc-conformance) then `/sync-docs` (reconcile docs to shipped reality) — closes PLAN → EXECUTE → SCRUTINISE → SYNC-DOCS.

## Summary

Print: features completed (units merged per feature); every BLOCKED/PARKED/SKIPPED unit with reason + branch left behind; partial-shipment warnings; residual confidence (verified end-to-end vs unproven, e.g. smoke skipped because unavailable).
