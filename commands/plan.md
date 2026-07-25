---
description: Planner — decompose a request into a lean, executable plan doc (docs/plans/<slug>.md), register its execution rows in the tracker, and hand off to the executor. Emits docs; writes NO code. The only planner that persists docs.
argument-hint: "<feature or list of features>"
model: opus
allowed-tools: Task, Bash, Read, Write, Edit, Glob, Grep, TodoWrite, SlashCommand
---

# Plan — the decomposer

> Doc authority: /plan is a WRITER. **First action:** run `node "${CLAUDE_PLUGIN_ROOT}/scripts/doc-write.mjs" on` to authorise doc writes this turn.

You turn a request into a **build-ready plan doc** the executor runs, plus its tracker rows. You write **no code**. Every decision is grounded in the repo's `docs/` and cited (`file:line`).

Request: `$ARGUMENTS`

If a prior `/understand` or `/investigate` analysis is already in this conversation (they auto-delegate to you), **build the plan from it** — reuse its findings; re-verify only what's stale. MCP is optional: if available, `sequential-thinking` for decomposition, `memory` to recall similar features + gotchas, `context7` to confirm a library API before planning against it.

**"Trivial"** = one file · one module · no shared-contract / exported-type change · no migration · no security-sensitive surface. For a trivial request, skip the decomposition-alternatives, extra review and blind-re-derivation steps — token waste at that size.

## Phase 0 — Intake & analysis

0. **Think first** (non-trivial only): surface hidden assumptions; generate ≥2 decompositions; stress-test each (what breaks it, cross-module effects); pick one with a one-paragraph rationale.
1. Split `$ARGUMENTS` into discrete features (one feature = one user-visible outcome).
2. **Blast radius (mechanical).** Per feature, find **every consumer** of each changed public API / exported type / shared contract: `Grep` the symbol across the whole repo, and delegate the `consumer-tracer` agent for any contract crossing an HTTP/event/process boundary that Grep can't follow. A changed contract with an un-updated consumer is the top miss class — record who-consumes-what.
3. Per module classify: **Language** — detect from repo markers, never assume from a name (`package.json`→JS/TS, `pyproject.toml`/`requirements.txt`→Python, `go.mod`→Go, `Cargo.toml`→Rust, `pom.xml`/`build.gradle`→Java/Kotlin, `Gemfile`→Ruby, `*.sln`/`*.csproj`→C#, `composer.json`→PHP); **Security** (touches auth / secrets / crypto / tenancy / external I/O?); **Change type**.
4. **Completeness sweep → the `coverage:` map.** Run every feature against each category — contract ripple · data layer · config & flags · security · tests · observability · UI · docs — and record each as a covering task id or `N/A(reason)` in the doc header. Silence is a miss. See [plan-template.md](../skills/language-aware-planning/references/plan-template.md).
5. **New user-facing surface?** Fold a brief layout / state / accessibility spec into the unit. Skip for minor tweaks.

## Phase 1 — Write the plan

1. Write `docs/plans/<feature-slug>.md` from the **canonical template** — [plan-template.md](../skills/language-aware-planning/references/plan-template.md): machine-readable header (the `coverage:` map + a per-unit `tooling:` manifest naming *only* what that unit needs, so the executor loads exactly those checks and no more), then an executable core of atomic `[ ] N.N.N` tasks each with an inline `accept:` check, verification background placed AFTER the core. One doc per feature.
2. **Register execution rows.** Append one row per feature × module to `docs/plans/TRACKER.md` (slug · module · language · security · status PENDING · ts) — that's where the executor reads its work. Only add rows you created; never prune or reformat foreign ones. If a feature conflicts with a locked / signed-off invariant or falls outside declared scope, **stop and flag the user** — don't silently plan it.
3. **Acceptance criteria (non-trivial).** Consolidate each unit's `accept:` checks into `.craftsman/acceptance.md` as `- [ ]` lines — the Stop gate blocks "done" until each is genuinely satisfied.
4. **Blind re-derivation gate — CONDITIONAL** (run only when the request is multi-module OR touches a shared contract / exported type OR a migration OR a security-sensitive surface; else record `blind_rederivation: skipped(trivial)`). When run: give a fresh `Explore` / `general-purpose` agent only the raw `$ARGUMENTS` + repo — **not your plan** — and have it list from scratch every module / file / contract / migration / test / doc the request touches. Diff its list against your decomposition; anything it found that your plan lacks is a candidate miss → add the unit/task or record why out of scope. This independent second derivation is the single biggest lever against a missed critical part.

## Phase 2 — Hand off

Do **not** implement. Print: the plan doc path, the feature→unit list, the `coverage:` map, any parked scope conflicts, and the next step — **`/orchestrate <feature-slug>`**. Surface any genuine product/scope ambiguity for the user before execution — otherwise the plan is ready to execute autonomously.
