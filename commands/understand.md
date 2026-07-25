---
description: Comprehend — read-only deep trace of a feature/area (execution paths, layers, contracts, dependencies, gaps) → an understanding brief that makes the next plan far better-informed. Writes NO code and NO docs.
argument-hint: "<feature, file, subsystem, or question to understand>"
model: opus
allowed-tools: Task, Bash, Read, Glob, Grep, TodoWrite, SlashCommand
---

# Understand — the comprehension pass

> Doc-write policy: this command writes NOTHING under docs/. It produces analysis and hands off to /plan.

You build a **complete, verified understanding** of a specified feature or piece of code, so the plan that follows is informed by how the system *actually* works — not a guess. You **write no code and no plan** (comprehension only; the plan is `/plan`, fix-diagnosis is `/investigate`). Output is a brief the next step consumes. First in the loop: **UNDERSTAND → PLAN → EXECUTE → SCRUTINISE → SYNC-DOCS**.

Target: `$ARGUMENTS`. Prefer the [deep-research](../skills/deep-research/SKILL.md) skill for the isolated-research discipline. MCP is optional: if available, `context7` for current library docs, `memory` to recall prior understanding of this area.

**Two objectives, held together:**
- **Efficiency** — anchor in the authoritative docs first (don't re-derive what's written), fan out **read-only in parallel**, read *excerpts to locate* not whole files, and stop when the model is complete. `Explore` agents return conclusions + `file:line`, not file dumps. Trace what the target *and its dependents* touch, nothing wider.
- **Total coverage** — the point of this pass is that the plan **misses nothing**. Trace not just the asked-for code but everything it **depends on and everything that depends on it** (the full blast radius), and pre-enumerate every dependent item so `/plan`'s completeness sweep starts from a filled-in checklist, not a blank one.

## Phase 0 — Anchor in existing docs (don't re-derive what's written)

1. **Start from the authoritative docs.** Check the repo's `docs/` (README / authority map, architecture docs) — does a doc already own this area? Read it first; it's the intended truth source. `memory` recall for prior understanding of this area, if available.
2. **Trust but verify.** Spot-check the doc's key claims against code. If the doc has drifted, note it as a finding for `/sync-docs` — but keep building your understanding from the **code**, which wins on conflict.

## Phase 1 — Trace it end to end (read-only fan-out)

Dispatch parallel read-only agents (`Explore` for "where is X / how does this flow", `general-purpose` for deeper tracing) across the segments the feature crosses. Each claim carries `file:line`:
- **Entry points & execution path** — request/data flow from the outermost caller (endpoint, UI action, job) through every layer to the datastore and back.
- **Layers & responsibilities** — which module / class owns what; the seams between them.
- **Contracts & dependencies** — the shared types / DTOs / events / exported APIs it produces or consumes; `Grep` each across the repo (+ the `consumer-tracer` agent for a contract crossing a network/process boundary) for the blast radius, so a later plan knows what a change here would ripple to.
- **State, config & flags** — feature flags, env keys, migrations / tables, caches that gate behaviour.
- **Enforcement points** — auth / RBAC, tenancy, input validation, fail-closed guards on the path.
- **Tests & observability** — what's covered, what isn't; the metrics / logs it emits.
- Confirm any library / framework behaviour on the path against its docs (or `context7` if available) rather than assuming.

## Phase 2 — Synthesise the understanding brief

Reconcile the traces into one coherent model (skip the ceremony for a small single-file target). Assemble the brief **in the conversation** (this command writes nothing under `docs/`), ready to hand to `/plan`:
- **What it is / does** — one-paragraph plain-language summary.
- **Execution flow** — an inline ```mermaid``` sequence/flow diagram of the real path + a step list with `file:line`.
- **Layer & ownership map** — table: layer → module / file → responsibility.
- **Contracts & blast radius** — what it produces/consumes and who a change here would affect.
- **Enforcement, config, state** — the gates / flags / migrations that govern it.
- **Gaps, risks & open questions** — dead config, weak coverage, stale contracts (route real defects to `/investigate`, not here).
- **Coverage checklist for `/plan` (the payoff)** — pre-fill each completeness dimension with what *this* area touches, so the plan can't silently skip one: **contract ripple** (which consumers a change hits) · **data layer** (tables/migrations) · **config & flags** · **security** (which gates apply) · **tests** (what exists, what a change needs) · **observability** · **UI** (call sites / states) · **docs** (which doc owns it). Each line names the concrete files — the plan turns these into units.
- **Doc reconciliation note** — if the owning doc drifted, name the drift for `/sync-docs`.

## Phase 3 — Hand off

Do **not** plan or fix. **Persistence auto-delegates to `/plan`:** invoke `/plan` (SlashCommand tool) with a concise request plus your full understanding brief (the model, the blast-radius list, the coverage checklist) — `/plan` owns writing the plan doc and tracker rows; this command writes nothing under `docs/`. Then print a 3–5 bullet executive summary, the blast-radius list, and the next step — **`/plan`** (now invoked) to persist and plan the feature, or **`/investigate`** if what you surfaced is actually a bug. If the owning doc was stale, also recommend **`/sync-docs`**.
