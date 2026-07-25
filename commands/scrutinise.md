---
description: Verify — post-implementation review that hunts simplifications and rigorously reviews the change against what docs/ mandate, then hands the findings to /plan to persist. Reviews only; fixes NOTHING.
argument-hint: "<module | git range | plan-slug> [--deep <run-slug>]"
model: fable
allowed-tools: Task, Bash, Read, Glob, Grep, TodoWrite, SlashCommand
---

# Scrutinise — the reviewer

> Doc-write policy: this command writes NOTHING under docs/. It produces analysis and hands off to /plan.

You review what was **already implemented** and produce findings the `/orchestrate` executor then fixes. Two lenses at once: (1) is it **simpler than it needs to be** (reinvented stdlib, speculative abstraction, dead flexibility, duplicated logic), and (2) does it **conform to what `docs/` mandate** (the family standard, the design rubric, the architecture/exception rules, the acceptance gates). You **report; you do not fix** (single purpose: fixes are `/orchestrate scrutinise-<slug>`).

Target: `$ARGUMENTS` (a module/directory, a git range, or a plan slug whose merged units to review). Read [_shared-machinery.md](_shared-machinery.md) → **Standing constraints** + **optional-MCP conventions**. You do not run Phase L/X.

**Two depths:** **default** — a targeted, fast review of one change/range/module (Phases 0–2, one pass). **`--deep <run-slug>`** — the exhaustive whole-run audit of everything an `/orchestrate` run produced (Phase D): comprehensive, adversarial, loop-until-dry, designed to leave **no** defect unfound. Use when "find everything" matters more than speed.

## Phase 0 — Scope & the mechanical floor (cheap, first)

1. Resolve the target to a concrete changed-file set: a module → its recent merges; a range → `git diff --name-only <range>`; a plan slug → the files its execution units touched. Recall memory for the area's standard + past scrutiny findings (if available).
2. Run the project's own deterministic checks and fold every hit into the inventory (don't re-derive by eye): format/lint/typecheck/test as detected, plus any completeness/duplication check the repo ships. Duplicated cross-file logic → shared-helper promotion candidates. UI changes → `design-reviewer` (conformance mode). No repo check for a dimension → that dimension is covered by the agents in Phase 1, not skipped.

## Phase 1 — Rigorous review (parallel, read-only)

**Routing first (cheap).** Before spending the full panel, delegate `review-router` (haiku) on the diff — it returns ESCALATE or SKIP in one word. On **SKIP** for a small, low-risk change (no new API/endpoint, no auth/permissions/migration/concurrency/contract change, ≤~120 lines): run only the mechanical floor + `code-reviewer` and stop; don't fan out the panel. On **ESCALATE**: proceed to the full dispatch. This keeps trivial diffs cheap and reserves the expensive reviewers for changes that warrant them.

Dispatch, briefing each with the *governing doc* so review is against the standard, not taste:
- `code-reviewer`: correctness, security, maintainability **against** the family `docs/standards/*` standard, the architecture/exception rules (fail-closed), and the plan's acceptance gates. context7 (if available) to confirm any claimed library-API usage is actually correct.
- `idiom-reviewer` (the simplification lens, above linters): the smallest correct diff — reinvented stdlib/native, one-impl interfaces, factories for one product, config for a constant, dead flexibility, boilerplate scaffolding, and patterns imported from another language. Each finding names what to cut and what replaces it.
- HIGH-sensitivity diff (auth/secrets/permissions/external I/O) → `security-auditor`; UI/presentation → `design-reviewer` (conformance + experience critique).
- sequential-thinking (if available) to structure the review across lenses when the change is large/multi-contract.

## Phase 2 — Verify findings, then hand off

1. **Adversarially verify** each finding before recording it (trace the cited lines yourself; try to refute it first — a simplification that would break an edge case is not a simplification). Classify: **Correctness** (bug/gap) · **Conformance** (violates a documented standard — cite the rule id) · **Simplification** (safe reduction) · **Reuse** (should call an existing helper/shared primitive) · **Test-coverage** (path below the coverage gate).
2. Assemble the findings **in the conversation** (this command writes nothing under `docs/`): each finding with class, `file:line`, evidence, the governing doc/rule it relates to, and the concrete fix as a `[ ] N.N.N` task. Sequence: correctness → conformance → reuse/simplification → coverage. Prepare one execution row per unit that needs a fix (slug `scrutinise-<slug>`), each with a `### Tooling` manifest (contract in [_shared-machinery.md](_shared-machinery.md)) so the executor loads only what each fix needs; genuinely out-of-scope/risky refactors → PENDING follow-up rows, flagged not driven.
3. **Auto-delegate persistence to `/plan`:** invoke `/plan` (SlashCommand tool) with a concise request plus your full findings + prepared row set — `/plan` persists `docs/plans/scrutinise-<slug>.md` and registers the execution rows. This command registers no rows itself.
4. Record memory (if available) — recurring finding-classes per area predict the next review. Do **not** fix. Print: the finding count by class, the top 3 by severity, and the next step — **`/plan`** (now invoked to persist), then **`/orchestrate scrutinise-<slug>`**, then `/sync-docs` to reconcile any doc the change should have updated.

## Phase D — `--deep`: exhaustive whole-run audit

Triggered by `--deep <run-slug>`. The mandate is **completeness, not speed**: find *every* defect across the entire surface an orchestrate run produced. Scale the fan-out to the run; do not stop at the first plausible pass.

1. **Resolve the full surface (not a single diff).** From the run's execution rows: every unit, every merge SHA. Build the complete changed-file set (`git diff --name-only <merge-base>..main` per merged unit). Re-read the originating plan doc(s) — the promised user-visible outcomes are the yardstick. Recall memory per area.
2. **Mechanical floor across the whole surface** — run the full Phase-0 check set over *every* touched module + range, plus any completeness pre-filter over `<run-base>...HEAD`. Every hit seeds the inventory.
3. **Exhaustive multi-dimensional fan-out (parallel, read-only).** Dispatch a reviewer **per defect-class × per module**, each briefed with its governing `docs/` reference — cover *all* of these, not just the obvious ones (a class no agent is told to hunt is a class you miss): correctness/logic · swallowed/mis-handled exceptions vs intended fail-closed · missing input validation · auth/permissions bypass (`security-auditor`) · race/ordering · N+1 / missing pagination / perf · **stale contract between components** (`consumer-tracer`) · dead/mis-set config/dangling flags · **UI conformance + experience** (`design-reviewer`) · **simplification** (`idiom-reviewer`) · **reuse/duplication** · **test-coverage gaps** on every new path · observability gaps. **The completeness hunt (#1 miss class):** a dedicated pass for *what the plan did not mention* — a contract consumer left un-updated, a path not wired, an endpoint unguarded, a UI call site not rendering, a half-implementation.
4. **Adversarial verification (every finding, no exceptions).** Trace the cited lines, try to **refute** first, record only survivors (sequential-thinking / context7 if available for the harder ones). An unverified "defect" is noise — discard it.
5. **Loop-until-dry.** Re-fan-out on anything the first round surfaced (a found defect often points at siblings). Keep going until **two consecutive rounds find nothing new**; log what each round added so the exhaustiveness is auditable.
6. **Emit + hand off.** Assemble **every verified finding in the conversation** (class, `file:line`, evidence, governing rule, severity, fix task), sequenced correctness → security → conformance → reuse/simplification → coverage, plus one execution row per module needing fixes with a `### Tooling` manifest — then **auto-delegate persistence to `/plan`** (SlashCommand) with the full audit; `/plan` persists `docs/plans/scrutinise-<run-slug>.md` and registers the rows. Record memory. Report: total findings by class + severity, rounds run until dry, residual confidence (proven vs. couldn't-prove, e.g. runtime-only defects if nothing ran). Do **not** fix — next step **`/plan`**, then **`/orchestrate scrutinise-<run-slug>`**, then `/sync-docs`.
