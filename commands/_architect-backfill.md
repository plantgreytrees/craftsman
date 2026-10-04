> Canonical protocol for `/architect --backfill [area]`. `/architect` `Read`s
> this only when that flag is passed. Not user-invocable. The two-file format
> and rule states are in `_architecture.md` and
> `references/architecture-template.md`; the accuracy bar and the `--init`
> steps reused below are in `_architect-maintain.md` (`Read` it first).

# Backfill — rules for a project that already has history

For a project built through many plans, often with architecture prose of its
own, but no rules docs. `--init` infers rules from code alone; backfill also
mines what the project already **decided** in its plans and legacy docs, so
most rules arrive as confirmed decisions with provenance rather than guesses.
Idea docs are not backfilled: plans already record shipped work, and `/idea`
reads their `goal:` lines. Resumable: each run pairs a few areas, and paired
areas are skipped next time.

1. **Inventory (mechanical).** `arch-check.mjs lint`, then `arch-check.mjs unmanaged` (prose under the architecture dir with no rules pair). List `docs/plans/*.md` (not `TRACKER.md`) with each plan's tracker status. Areas that already have a pair are skipped.
2. **Choose areas, then confirm them.** Candidates = module boundaries (repo markers; top-level packages, services, apps) plus the subjects of unmanaged docs. Not every legacy doc is an area: build, CI, contributing, runbooks and logs stay prose for `/sync-docs`. Rank by how many plans touch the area, cap **~6 per run** (`area` given → only that one), and name the rest for later runs. Confirm the list and each area's `governs` globs with the user (AskUserQuestion) before mining — a wrong boundary wastes the run.
3. **Mine candidate rules per area (bounded, every source cited).**
   - Unmanaged docs about the area: stated invariants, MUST/NEVER statements, chosen designs.
   - Plans whose `scope.write`, `module`, or task paths fall inside the area's `governs` (`Grep` the plan docs for those paths), **newest first, cap ~20 per area**: Verification background, Risk & rollback, `classification`, and any explicit decision. Older non-canonical plans count too; read their prose.
   - Plan memory recall: `decision` category, `query` = the area.
   - `--init` steps 3–4 for consistent code patterns no document states.

   Each candidate: the rule as `MUST` / `MUST NOT` / `SHOULD …`, its sources (`docs/plans/<slug>.md:line`, a legacy doc line, or code), and the newest plan that touched it.
4. **Verify against today's code** (the accuracy bar applies). **HOLDS**: code obeys it; cite `file:line`. **CONTRADICTED**: code moved on, often because a later plan changed it on purpose, so it is history, not a rule; record it in the human doc's trade-offs. **UNPROVEN**: report it, never write it. Merge duplicates. When two plans disagree, the newer decision wins only if the code agrees.
5. **Confirm, one area at a time** (AskUserQuestion, `multiSelect`, ≤4 per call): confirmed → `[decided]` with a code `cite:`; rejected → dropped; unanswered → `[observed]`. Code-only patterns follow `--init` step 5.
6. **Write the pair** per the template, `source: backfill`, `verified_at` = HEAD. The human doc's decisions table carries each rule's provenance (plan slugs, legacy doc). It **links** to the legacy prose it drew on and never moves or rewrites it; that prose stays `/sync-docs`'. The one exception: a legacy doc already named `<area>.md` that covers exactly this area is **adopted** as the human doc. Add the banner and the decisions table, keep its prose, and it becomes `/architect`'s from then on.
7. **In-flight plans.** For every plan with a PENDING, IN_PROGRESS, BLOCKED or PARKED row, pipe each unit's manifest (`scope` + `arch`) to `arch-check.mjs scope`. Each failure is a unit that `scope.mjs` will now refuse to activate. List them (plan, unit, rules doc, the ids it most likely needs) with `/plan <slug>` to add `arch:` and `scope.docs`; a re-run extends the plan. A non-canonical active plan has no manifest, so recommend `/plan <slug>` to rewrite it in the canonical shape. Never edit plans here.
8. Update `docs/architecture/README.md`; `lint` → PASS.

Print: areas paired, legacy docs adopted, unmanaged docs remaining (still `/sync-docs`'), rules decided/observed with counts by source (plan, legacy doc, code), CONTRADICTED history recorded, `UNPROVEN` items, in-flight units needing citation with their `/plan` commands, and the areas for the next run.
