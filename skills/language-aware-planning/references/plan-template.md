# Emitted plan-doc template (canonical)

The single source of truth for the shape of every plan `/plan` writes to
`docs/plans/<slug>.md`. Load this only when actually writing a plan. Design
goals: **comprehensive** (the `coverage:` map forces every dimension to be
addressed), **lightweight** (executable core first, prose last), and **optimised
for an executor** (a machine-readable header it parses; atomic tasks it acts on
without re-reading).

## Skeleton

````markdown
---
slug: <feature-slug>
goal: <short user-visible outcome; one sentence, easy to scan in the tracker>
classification: in-scope | deferred | out-of-scope   # cite the deciding line/source
tracker_rows: [TRACKER#<id>, ...]                     # rows this plan registers
guards:
  blast_radius: done
  completeness_sweep: done
  blind_rederivation: skipped(trivial) | <verifier-agent-id>
coverage:            # every category → the task id that covers it, or N/A(reason). Silence is a miss.
  contract:      1.2 | N/A(no shared API/type/schema change)
  data:          2.1 | N/A(no persistence/migration)
  config:        ... | N/A
  security:      ... | N/A(no authn/authz/input/secret surface)
  tests:         ...
  observability: ... | N/A
  interface:     ... | N/A(no UI/API/CLI surface)
  docs:          ... | N/A
  rollback:      ...
units:
  - id: 1
    scope_id: <stable scope-step id>
    project: <selected repository or project root, relative to the workspace>
    depends_on: []
    module: <path or component>
    language: <detected>
    security: high | normal
    scope:
      read: [<source/test/config files required to understand this unit>]
      docs: [<specific docs required by this unit, incl. every governing docs/architecture/<area>.rules.md>]
      write: [<files this unit may create or edit>]
    arch: [<ARCH-<AREA>-NN ids this unit must obey — required when scope.write touches a governed path>]
    tooling: { implementer: implementer, gates: [<review agents the diff triggers>],
               skills: [<1-3>], guards: [<repo guards>], mcp: [<optional calls>] }
---

# Plan: <title>

## Outcome
One sentence — the user-visible result when this is done. Keep this identical in meaning to `goal`.

## Scope Steps (executable core)

### Step 1 — <scope_id> (<project>, <language>, <security>)
Tooling: implementer implementer · gates <…> · skills <…> · guards <…>
Depends on: <scope_id list, or none>
- [ ] 1.1 <verb-first: one file / one test / one command> → accept: <inline pass/fail check>
- [ ] 1.2 …

## Sequencing
<dependency order + one line of rationale, e.g. shared lib → services → UI; tests-first>.

## Verification background   (citations — for the reviewer, not the executor)
- <claim the plan relies on> — `path:line`

## Risk & rollback
<behavioural changes · mitigations · how to revert>

## Out of scope
<adjacent work explicitly excluded>
````

## Rules

- Header fields are mandatory. The `coverage:` map is the completeness sweep made
  checkable — each category maps to a task id or `N/A(reason)`, never silence.
- Tasks are atomic and self-contained: one file/test/command, verb-first, with an
  inline `accept:` check. If a task would take >~15 min, split it.
- The per-unit `tooling:` block is the executor's **allow-list** (format defined
  in `_shared-machinery.md` → "The tooling manifest") — name only what the unit
  needs so the executor loads nothing extra.
- The per-unit `scope:` block is the context and write **allow-list**. `read` and
  `docs` must contain concrete paths or narrow globs; `write` must contain every
  file the unit may create or edit. Never use a repository-wide glob or a whole
  directory when a file list can express the scope.
- The per-unit `arch:` list names the architecture rules the unit is bound by
  (`commands/_architecture.md`). Find them with `scripts/arch-check.mjs governs
  <scope.write…>`; `scope.mjs` refuses to activate a step that writes a governed
  path without loading its `.rules.md` and citing one of its live rules. Never
  list a human `docs/architecture/<area>.md` in `scope.docs`.
- A scope step is the smallest context-reset boundary: group all changes that
  affect the same project/repository and dependency boundary together. Use one
  `scope_id` per step, list explicit `depends_on` ids, and keep `project` stable.
  The executor topologically orders steps and activates one manifest for the
  whole step instead of reloading context for every task.
- In a multi-repository workspace, `project` is a selected repository boundary,
  not a license to inspect the workspace. Enumerate only affected projects in
  the plan; unrelated repositories remain out of scope.
- Executable core FIRST; citations/background AFTER. The executor acts on
  units+tasks; the reviewer uses the background to verify.

## Completeness sweep — the categories (fill the `coverage:` map)

Run every unit against each; map to a task id or `N/A(reason)`:

1. **contract** — every consumer of a changed public API / exported type / shared schema/event is updated.
2. **data** — schema/migration + access rules + backfill where needed.
3. **config & flags** — env vars, config files, feature flags all wired.
4. **security** — authn/authz on new surfaces, input validation at boundaries, no secrets in code, fail-closed.
5. **tests** — unit + integration to the project's coverage bar.
6. **observability** — a metric and/or structured log for the new path.
7. **interface** — every call site / UI state (loading/empty/error) / API response / CLI flag; accessibility where applicable.
8. **docs** — the README/architecture/reference entry the change needs.
9. **rollback** — the change is revertable; state how.
