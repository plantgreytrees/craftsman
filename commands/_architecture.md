> Canonical contract for how the loop (`/plan`, `/orchestrate`, `/scrutinise`,
> `/instruction`) consumes architecture decisions written by `/architect`.
> `Read` it only when `docs/architecture/*.rules.md` exists — a repo with no
> rules docs pays nothing. Not user-invocable.

# Architecture contract

Each architecture area is **two files**, written and maintained only by `/architect`:

- `docs/architecture/<area>.md` — the **human** reference: plain English, mermaid diagrams, rationale, rejected options. **Never load it** in the loop — not in a scope manifest, not in a brief, not "for context". Its content is for people; everything binding is restated in the rules file.
- `docs/architecture/<area>.rules.md` — the **enforced** contract. Frontmatter `governs:` lists the paths/globs it owns. One line per rule: `- **ARCH-<AREA>-NN** [state] MUST/MUST NOT … — check: <how to verify> — cite: <file:line>`.

Rule states: **`decided`** — binding; deviating is a defect. **`observed`** — inferred from code by `/architect --init`, not yet confirmed by the user; follow it by default, deviation is a `Suggestion`, never a block. **`superseded by ARCH-…`** — history; never cite it, follow its replacement.

## Finding the rules (cheap, mechanical)

`node "${CLAUDE_PLUGIN_ROOT}/scripts/arch-check.mjs" governs <path>...` prints only the rules docs governing those paths. Load **only** those — never glob the whole directory.

## The loop's obligations

- **`/plan`** — per unit: run `governs` over its `scope.write`; add each returned `.rules.md` to `scope.docs`; record the ids the unit must obey as `arch: [ARCH-…]` in the unit header; honour them in the approach. Before hand-off dry-run each step manifest (with its `arch`) through `arch-check.mjs scope` on stdin — exit 1 is a plan defect, fix it. A request that **requires breaking a `decided` rule** is not plannable as-is: stop, name the rule and the conflict, and route to `/architect` for an amendment. Never plan around a rule silently.
- **`/orchestrate`** — pass the step's `arch` into `scope.mjs` with the manifest. **Mechanically enforced:** `scope.mjs` refuses to activate a step that writes a governed path without loading its rules doc and citing a live rule from it (unknown and superseded ids are refused too), so `pre-guard.mjs` keeps every edit blocked. Fix the manifest (and the plan unit), never the check. An implementation that cannot satisfy a `decided` rule → PARK the unit with the rule id; recommend `/architect`.
- **Implementer / reviewers** — the rules in `scope.docs` are binding constraints, read like a standard. `plan-reviewer` and the `scrutineer` check conformance against each cited rule's `check:`.
- **`/scrutinise`** — put the governing `.rules.md` paths (never the human `.md`) in the scrutineer's brief. A violated `decided` rule is an **Architecture** finding at `Warning` or above; a violated `observed` rule is a `Suggestion` plus a prompt to confirm or drop it via `/architect --update`.
- **`/sync-docs`** — does not edit `docs/architecture/**`; `/architect --update` owns it, because code drifting from a decision is usually a violation to fix, not a doc to rewrite.

`architecture.enforce: false` in `craftsman.config.json` switches the scope gate off (the prose obligations stay); `architecture.dir` relocates the docs.
