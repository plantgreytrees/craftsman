> Canonical protocol for `/architect --init` and `/architect --update`. `/architect`
> `Read`s this only when one of those flags is passed. Not user-invocable.
> Doc authority, the two-file format, and rule states are in `_architecture.md`
> and `references/architecture-template.md`.

# Maintenance modes

**Accuracy bar (both modes):** every verdict is backed by code you read at `file:line` in this run — never by memory, a doc's own claim, or a filename. Refute each candidate verdict once before recording it (is the behaviour elsewhere? behind a flag? dead code?). A verdict you cannot prove is `UNPROVEN` and is reported, not applied. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/arch-check.mjs" lint` first (its errors are your starting evidence) and last (must PASS).

## `--init [area]` — create missing architecture docs

The goal is a truthful baseline of **how the system is built today**, so the loop has something to enforce. Code observed is not a decision made — the user confirms.

1. **Find the areas (bounded).** From repo markers and top-level module boundaries (packages, services, apps, layers), plus existing `docs/` that already describe architecture, list candidate areas — cap **~8 per run**, largest/most-depended-on first; list the rest by name for a later run. `area` given → only that one. Skip areas that already have a valid pair.
2. **Classify each:** **missing** (no files) · **half-pair** (a human `.md` with no `.rules.md`, or the reverse — `lint` reports both) · **legacy** (architecture prose elsewhere in `docs/` that should be migrated; leave the original in place and link to it).
3. **Trace the as-is architecture per area** (bounded per `_shared-analysis.md`): entry points, internal layering, the contracts it exposes/consumes and their consumers, data it owns, enforcement points (auth, validation), concurrency model, error model, cross-cutting conventions (logging, config, testing). Each finding `file:line`.
4. **Draft rules as `[observed]`** — only patterns that hold **consistently** (≥ 3 independent sites, or a single explicit enforcement point) and that a change could plausibly violate. One-off code is not a rule. Note inconsistencies separately — they are findings, not rules.
5. **Confirm with the user** (AskUserQuestion, `multiSelect`, ≤4 questions/call, one area at a time): "Which of these observed patterns are intended rules?" Confirmed → `[decided]`; rejected → dropped (and recorded in the human doc's trade-offs as "not a rule: …"); unanswered → stay `[observed]` (advisory). For each inconsistency, ask which side is intended — the losing side becomes a PENDING tracker row via `/plan` (recommended, not driven).
6. **Write the pair** per `references/architecture-template.md` (`source: init`, `verified_at` = HEAD), set `governs` to the traced module boundaries, update `docs/architecture/README.md`, `lint` → PASS.

## `--update [area | range]` — repair stale architecture docs

Code moved; the docs must stay truthful **without laundering violations into rules**.

1. **Scope.** `area` → that pair. A git range → the rules docs whose `governs` intersect `git diff --name-only <range>` (`arch-check.mjs governs`). Nothing given → per rules doc, `<verified_at>..HEAD` filtered by its `governs`; a doc whose governed paths have no commits since `verified_at` is **fresh** — skip it and say so. Never sweep every doc unbounded.
2. **Re-verify every rule in scope** against current code (read the changed governed files, not just the diff). Classify each:
   - **HOLDS** — still true; refresh any drifted `cite:` line numbers.
   - **STALE-DESCRIPTIVE** — the decision stands but its wording/cite/`governs` points at moved or renamed code → update the wording, cite, or globs. You own this.
   - **VIOLATED** — code contradicts a `decided` rule with no evidence it was intended → **do not rewrite the rule.** Report it with `file:line` and recommend `/investigate` or a `/plan` fix row. This is the case `/sync-docs` would get wrong, and why this mode exists.
   - **SUPERSEDED?** — evidence the change was deliberate (a plan doc, commit message, or idea doc that chose it) → ask the user: amend (new id, old `[superseded by …]`) or treat as a violation.
   - **OBSERVED-DRIFT** — an `[observed]` rule no longer holds → ask: drop it, or keep it and fix the code.
   - **ORPHANED** — its governed code was deleted → ask: retire the rule (superseded/removed) or keep for the replacement.
3. **New unruled patterns** in governed code (≥ 3 consistent sites added since `verified_at`) → propose as `[observed]`, confirm like `--init` step 5.
4. **Human doc:** regenerate the mermaid diagram and plain-English description from the verified state; update the decisions table to match the rules file exactly (ids, supersessions); fix every broken link.
5. **Present the report and STOP for confirmation** (table: rule id · verdict · evidence · proposed action), then apply only the confirmed changes. A standing pre-approval (e.g. an `/instruction` `/goal`) covers HOLDS and STALE-DESCRIPTIVE fixes only; VIOLATED, SUPERSEDED?, OBSERVED-DRIFT and ORPHANED always stop. Bump `verified_at` to HEAD and `updated`, **replacing** the old values. `lint` → PASS.

Print (both modes): areas created/updated/fresh/skipped-by-cap; rules added/decided/observed/superseded/retired; violations routed (with the recommended `/investigate` or `/plan` command); `UNPROVEN` items; and that `/sync-docs` does not touch these files.
