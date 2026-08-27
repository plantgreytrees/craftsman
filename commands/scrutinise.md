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

**Two depths:** **default** — a targeted, fast review of one change/range/module (Phases 0–2, one pass). **`--deep <run-slug>`** — the exhaustive whole-run audit of everything an `/orchestrate` run produced: comprehensive, adversarial, loop-until-dry, designed to leave **no** defect unfound. Use when "find everything" matters more than speed. On `--deep <run-slug>`, `Read` [_scrutinise-deep.md](_scrutinise-deep.md) and follow its Phase D there — do not inline that content back into this file.

## Phase 0 — Scope & the mechanical floor (cheap, first)

1. Resolve the target to a concrete **two-dot git range** (never leave it implicit — an unqualified `git diff` compares the working tree to the index, which is normally empty and would falsely read as trivial): a module → `<merge-base>..<latest-merge-sha>` from its recent merges; an explicit range → used as given; a plan slug → `<merge-base>..<sha>` per merged unit (run the triviality/mechanical steps per unit if it touched more than one). Recall memory for the area's standard + past scrutiny findings (if available).
2. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/diff-triviality.mjs" <range>` (Bash) with the range from step 1 — never invoke it with no argument. On `TRIVIAL`: skip Phase 1 only (no `review-router` call, no `code-reviewer`, no panel) — **step 3 below still runs**, then go to Phase 2 with zero findings, recording "whitespace-only diff — review skipped" as the reason. On `SUBSTANTIVE` (including if the script itself errored — it fails safe to `SUBSTANTIVE`): proceed to step 3 and Phase 1 exactly as today.
3. Run the project's own deterministic checks and fold every hit into the inventory (don't re-derive by eye): format/lint/typecheck/test as detected, plus any completeness/duplication check the repo ships. **Always runs, even after a `TRIVIAL` verdict in step 2** — the triviality check only ever gates the LLM review panel, never the mechanical floor. Duplicated cross-file logic → shared-helper promotion candidates. UI changes → `design-reviewer` (conformance mode). No repo check for a dimension → that dimension is covered by the agents in Phase 1, not skipped.

## Phase 1 — Rigorous review (parallel, read-only)

**Routing first (cheap).** Before spending the full panel, delegate `review-router` (haiku) on the diff — it returns ESCALATE or SKIP in one word. Immediately log the verdict by running `node "${CLAUDE_PLUGIN_ROOT}/scripts/log-router.mjs" <verdict> "<reason>"` via Bash, before acting on it. On **SKIP** for a small, low-risk change (no new API/endpoint, no auth/permissions/migration/concurrency/contract change, ≤~120 lines): run only the mechanical floor + `code-reviewer` and stop; don't fan out the panel. On **ESCALATE**: proceed to the full dispatch. This keeps trivial diffs cheap and reserves the expensive reviewers for changes that warrant them.

Dispatch, briefing each with the *governing doc* so review is against the standard, not taste:
- `code-reviewer`: correctness, security, maintainability **against** the family `docs/standards/*` standard, the architecture/exception rules (fail-closed), and the plan's acceptance gates. context7 (if available) to confirm any claimed library-API usage is actually correct.
- `idiom-reviewer` (the simplification lens, above linters): the smallest correct diff — reinvented stdlib/native, one-impl interfaces, factories for one product, config for a constant, dead flexibility, boilerplate scaffolding, and patterns imported from another language. Each finding names what to cut and what replaces it.
- HIGH-sensitivity diff (auth/secrets/permissions/external I/O) → `security-auditor`; UI/presentation → `design-reviewer` (conformance + experience critique).
- sequential-thinking (if available) to structure the review across lenses when the change is large/multi-contract.

## Phase 2 — Verify findings, then hand off

1. **Adversarially verify** each finding before recording it (trace the cited lines yourself; try to refute it first — a simplification that would break an edge case is not a simplification). Classify: **Correctness** (bug/gap) · **Conformance** (violates a documented standard — cite the rule id) · **Simplification** (safe reduction) · **Reuse** (should call an existing helper/shared primitive) · **Test-coverage** (path below the coverage gate).
2. Assemble the findings **in the conversation** (this command writes nothing under `docs/`): each finding with class, `file:line`, evidence, the governing doc/rule it relates to, and the concrete fix as a `[ ] N.N.N` task. Sequence: correctness → conformance → reuse/simplification → coverage. Prepare one execution row per unit that needs a fix (slug `scrutinise-<slug>`), each with a `### Tooling` manifest (contract in [_shared-machinery.md](_shared-machinery.md)) so the executor loads only what each fix needs; genuinely out-of-scope/risky refactors → PENDING follow-up rows, flagged not driven.
3. **Auto-delegate persistence to `/plan`, unless there is nothing to persist.** Zero findings (including the Phase 0 `TRIVIAL` fast path) → skip this step entirely, no `/plan` invocation — there is no fix to schedule. Otherwise invoke `/plan` (SlashCommand tool) with a concise request plus your full findings + prepared row set — `/plan` persists `docs/plans/scrutinise-<slug>.md` and registers the execution rows. This command registers no rows itself.
4. Record memory (if available) — recurring finding-classes per area predict the next review. Do **not** fix. Print: the finding count by class (zero if the fast path skipped review — say so, don't invoke `/plan` for nothing), the top 3 by severity, and the next step — if findings exist: **`/plan`** (now invoked to persist), then **`/orchestrate scrutinise-<slug>`**, then `/sync-docs` to reconcile any doc the change should have updated; if zero, no next step is needed.
