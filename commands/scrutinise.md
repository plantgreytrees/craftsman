---
description: Verify — post-implementation review for logic, security and cross-unit defects a per-unit gate can't see, by ONE isolated fresh-context reviewer; findings go to /plan to persist. Fixes NOTHING.
argument-hint: "<module | git range | plan-slug> [--deep <run-slug>]"
model: sonnet
allowed-tools: Task, Agent, Bash, Read, Glob, Grep, TodoWrite, SlashCommand
---

# Scrutinise — the reviewer

> Write policy: you fix nothing. Your only writes are verification state — ticks in `.craftsman/acceptance.md` for criteria proven MET. The tracker follows on its own (ticks → ledger → the root `docs/plans/TRACKER.md` block); nothing under `docs/` is yours to write, and findings are persisted by `/plan`.

You review what was **already implemented**, hunting what a per-unit merge gate structurally cannot see: **logic/correctness defects**, **security** issues, and **cross-unit** problems (duplication or inconsistency between units, a stale contract, an un-updated consumer). Per-unit standards/simplification are `/orchestrate`'s job (`_shared-execution.md` Phase X.8). Fixes are `/orchestrate scrutinise-<slug>`.

**Objectivity — one isolated reviewer.** The session that wrote the code is the worst-placed to judge it. So the review itself runs in exactly **one** fresh-context subagent, `scrutineer` on `opus` (`subagent_type: "craftsman:scrutineer"`), which never sees the implementation conversation. This is a **named exception to root-only agent mode**, and the only delegation this command makes: invoking `/scrutinise` grants one dispatch, `agent-mode-guard.mjs` spends it, and a second or parallel dispatch is blocked. Root resolves scope, runs the mechanical floor, then checks and hands off the scrutineer's report.

Target: `$ARGUMENTS` (a module/directory, a git range, or a plan slug whose merged units to review). Read `${CLAUDE_PLUGIN_ROOT}/commands/_shared-machinery.md` → **Standing constraints**. You do not run Phase L/X.

**Two depths:** **default** — a targeted review of one change/range/module (Phases 0–2). **`--deep <run-slug>`** — the exhaustive whole-run audit of an `/orchestrate` run; `Read` `${CLAUDE_PLUGIN_ROOT}/commands/_scrutinise-deep.md` and follow its Phase D — do not inline it here.

## Phase 0 — Scope, mechanical floor, routing (root, cheap)

1. **Resolve a concrete two-dot git range** — never leave it implicit (a bare `git diff` compares working tree to index, normally empty, and falsely reads as trivial): a module → `<merge-base>..<latest-merge-sha>`; an explicit range → as given; a plan slug → `<merge-base>..<sha>` per merged unit. **Name the run `<slug>`:** the plan slug; else the module path kebab-cased; else `range-<short-end-sha>`. Recall memory for the area (if available).
2. **Triviality:** `node "${CLAUDE_PLUGIN_ROOT}/scripts/diff-triviality.mjs" <range>` per range — never without an argument. `SUBSTANTIVE` (or a script error, which fails safe to it) → full review. `TRIVIAL` → no lens review; if the reviewed plan also has no unticked acceptance criteria, skip Phase 1 entirely and go to Phase 2 with zero findings ("whitespace-only diff — review skipped"); if criteria remain open, Phase 1 still runs for acceptance verdicts only.
3. **Mechanical floor — always runs**, even after `TRIVIAL`: the project's own format/lint/typecheck/test plus any completeness/duplication check it ships. Collect every hit for the brief (don't re-derive by eye). A dimension with no repo check is covered by the scrutineer's lenses, not skipped.
4. **Route (cheap):** apply `review-router`'s brief yourself to the diff (ESCALATE/SKIP), then log it: `node "${CLAUDE_PLUGIN_ROOT}/scripts/log-router.mjs" <verdict> "<reason>"`. **SKIP** (≤~120 lines, no new API/endpoint, no auth/permissions/migration/concurrency/contract change) → lens set is `code-reviewer` only. **ESCALATE** → full lens set. Either way, continue to Phase 1 and Phase 2 — SKIP narrows the review, it never skips verification or hand-off.

## Phase 1 — Isolated review (exactly one dispatch)

Dispatch **one** `scrutineer` via Task (`subagent_type: "craftsman:scrutineer"`). Wait for its report; do not review in parallel yourself.

**The brief contains only facts:** the range(s); mode `default`; the router verdict and lens set (`code-reviewer` always; `security-auditor` for auth/secrets/permissions/external I/O; `consumer-tracer` for a changed exported contract); the floor hits; the governing `docs/standards/*` paths and the `docs/architecture/*.rules.md` files governing the range (`arch-check.mjs governs <changed files>` — never the human `<area>.md`; see `${CLAUDE_PLUGIN_ROOT}/commands/_architecture.md`); the plan doc path; and the unticked acceptance criteria verbatim. **Never include** implementation rationale, earlier review verdicts, or your own opinion of the code — anything that would anchor an independent reviewer defeats the point.

Not skipped because `/orchestrate` already cross-reviewed the same merged set: that pass ran in the author's context; this one exists to be a second, unanchored pair of eyes. Deliberately **not** in the default lens set: `idiom-reviewer` and `standards-keeper` — `/orchestrate` ran both on every ESCALATE-routed unit; the scrutineer notes an obvious simplification/conformance issue as a **Suggestion** instead, and a recurring one is a signal for `--deep` or a `docs/standards/*` update.

**Fallback:** if the dispatch is blocked (no grant — e.g. the invocation never reached the hook) or errors, never retry in parallel or dispatch any other agent. Run the same brief yourself, sequentially, and label the report **NOT ISOLATED** so the reader knows the author's context did the review.

## Phase 2 — Check, decide acceptance, hand off (root)

1. **Check, don't re-litigate.** For each finding, confirm the cited `file:line` exists and shows what's claimed. You may drop a finding or lower its severity **only** with concrete counter-evidence at `file:line`, and every such change is listed under **Disputed** in the report with that evidence — never silently. Severities are `Critical` / `Warning` / `Suggestion`; classes are **Correctness** · **Security** · **Architecture** (a broken ARCH rule) · **Cross-unit** · **Test-coverage**.
2. **Acceptance verdict (you own `.craftsman/acceptance.md`).** Invoking `/scrutinise` makes this session the owner, so the Stop gate holds you to it. Tick a criterion only when the scrutineer returned `MET` and you confirmed its cited code and test exist — ticking is verification, not fixing. Each `UNMET` becomes a **Correctness** `Warning` and stays unticked. Ticking the last open criteria moves the tracker ledger's MERGED units to COMPLETE automatically, and the root `TRACKER.md` ledger block re-renders with them. There's nothing to mirror by hand.
3. **Assemble the findings in the conversation:** class, severity, `file:line`, evidence, governing rule, and the concrete fix as a `[ ] N.N.N` task, sequenced correctness → security → architecture → cross-unit → coverage. Prepare one execution row per unit needing a fix (slug `scrutinise-<slug>`), each with a `### Tooling` manifest (contract in `_shared-machinery.md`); genuinely out-of-scope/risky refactors → PENDING follow-up rows, flagged not driven.
4. **Hand off to `/plan`, unless there is nothing to persist.** Zero findings (including the `TRIVIAL` fast path) → no `/plan` call. Otherwise invoke `/plan` (SlashCommand) with the findings + prepared rows; it persists `docs/plans/scrutinise-<slug>.md` (a later round extends that doc with new steps, never a second one) and registers the rows. This command registers no rows itself.
5. **Record memory** (if available) — recurring finding-classes per area predict the next review. Do **not** fix. Print: isolation status (`isolated` / `NOT ISOLATED`); finding count by class and severity (zero with the reason if the fast path skipped review); the top 3 by severity; the **Disputed** list; acceptance ticked vs still open; the scrutineer's residual risk; and the next step — with findings: `/plan` (already invoked), then **`/orchestrate scrutinise-<slug>`**, then `/scrutinise <slug>` again until it reports 0 Critical and 0 Warning; with zero: **`/sync-docs --all <slug>`**, then **`/craftsman:merge`**.
