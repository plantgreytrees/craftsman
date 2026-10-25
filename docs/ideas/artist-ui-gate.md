---
slug: artist-ui-gate
status: architected
verdict: pursue-with-changes
confidence: medium
depth: standard
isolation: isolated
created: 2026-10-25
updated: 2026-10-25
related: [docs/ideas/plugin-overhaul.md, docs/architecture/slim.rules.md, docs/architecture/gates.rules.md, docs/builtins.md]
touches: [scripts/gate-select.mjs, scripts/gate-select.test.mjs, commands/_shared-execution.md, commands/_shared-machinery.md, commands/_scrutinise-deep.md, agents/ui-ux-reviewer.md, skills/design-review/SKILL.md, scripts/doc-size-policy.mjs, scripts/entry-surface.test.mjs, scripts/log-specialist.mjs, docs/architecture/slim.rules.md, docs/architecture/slim.md, docs/builtins.md, EXTENDING.md, README.md, CHANGELOG.md]
---

# Idea: route the advisory "ui" gate to the Artist plugin

## Proposal (neutral restatement)
**Problem:** the same owner maintains two UI review surfaces — craftsman's diff
checklist (`agents/ui-ux-reviewer.md`, `skills/design-review/SKILL.md`) and the
separate Artist plugin, which knows the project's declared tokens and inventory
(`Artist/scripts/reuse-check.mjs:1`). Craftsman's reviewer finds tokens by grepping
(`agents/ui-ux-reviewer.md:22`). **Benefit:** one owner for UI design, a
deterministic token/reuse floor, a smaller craftsman doc surface. **Who:** projects
with UI files (`scripts/gate-select.mjs:37`). **Done:** the advisory `ui` gate runs
Artist when it is enabled and the project has a format-2 `DESIGN.md`; otherwise a
reduced built-in check; `design-review` is gone; caps, tests and docs follow.

## Verdict
**PURSUE-WITH-CHANGES** (medium). The proposal as written (critic replaces the
reviewer) does not work in a unit gate: `artist:design-critic` takes only
screenshots, `report.json`, `DESIGN.md` and a rubric (`Artist/agents/design-critic.md:3,7`),
and screenshots need `verify.mjs <url>` against a running app
(`Artist/skills/create/SKILL.md:42-45`), while the gate holds only a diff
(`commands/_shared-execution.md:32`). Split by input instead: reuse-check on the
diff, the critic only when a verify run exists, a reduced built-in reviewer as the
fallback. Flip fact: Artist's critic accepting diff-only input would allow full replacement.

| criterion | score 1–5 | evidence |
|---|---|---|
| value | 3 | real overlap; telemetry cannot show use either way — 0 events for *every* specialist in `~/.craftsman/events.jsonl` |
| system fit | 3 | split shape fits the advisory floor (`_shared-execution.md:33`); full swap scored 1 |
| cost | 3 | ~16 touch points plus a cross-plugin path resolver |
| risk | 3 | fallback keeps a floor when Artist/DESIGN.md is absent (`reuse-check.mjs:246-248` throws otherwise) |
| reversibility | 4 | files return via git; SLIM-13 carve-out is the sticky part |
| evidence strength | 3 | seams verified at file:line; Artist not installed on this machine, so no live run |

## Overlap & prior work
- **Conflicts:** `docs/ideas/plugin-overhaul.md:82,276-284` kept `ui-ux-reviewer` + `design-review` and planned a craftsman-owned DESIGN.md. Superseded by the user's decision that Artist owns UI design.
- **Conflicts:** ARCH-SLIM-13 [decided] (`docs/architecture/slim.rules.md:23`) — needs an amendment; user chose optional, detected.
- **Touches:** ARCH-SLIM-01/02 caps (`scripts/doc-size-policy.mjs:41,77`), SLIM-08 changelog, SLIM-09 agent budget, SLIM-14 entry surface (`scripts/entry-surface.test.mjs:54-58`).
- **Extends:** Artist already documents the craftsman allowance (`Artist/skills/create/SKILL.md:54`, `Artist/README.md:42`); `scripts/agent-mode-guard.mjs:101-102` honours `execution.builtinAgents`.
- Searched: `docs/ideas/*.md`, TRACKER + archive, `docs/architecture/*.rules.md`, CHANGELOG [Unreleased] (empty after 2.3.0), README.

## System fit (whole project)
- contract ripple: `gate-select.mjs` output `ui` unchanged; dispatch target changes in `commands/_shared-execution.md:33`, `_shared-machinery.md:51`, `_scrutinise-deep.md:20`.
- data: Artist writes `.artist/runs/<ts>/reuse.json` in the unit worktree; per-worktree, no shared state.
- config & flags: optional `"artist:design-critic"` in `execution.builtinAgents` (docs only; guard unchanged).
- security: allowlist widens by one Read/Glob-only agent (`Artist/agents/design-critic.md:4`); reuse-check is run as a script from a resolved plugin path — resolver must not execute arbitrary paths.
- tests: gate-select resolver tests; `entry-surface.test.mjs` keeps `ui-ux-reviewer` (fallback); doc-size entry for `design-review` removed.
- observability: `log-specialist.mjs` logs the Artist path vs fallback under distinct names.
- UI: N/A (craftsman has no UI).
- docs: README :120, :502; EXTENDING.md; `docs/builtins.md:17`; slim rules.
- Second-order: craftsman couples to Artist's CLI, exit codes and `formatOf === 2`; Artist is v0.1.0.

## Research
- Plugin manifest `dependencies` exists ("Plugins that must be enabled for this one to work") — https://code.claude.com/docs/en/plugins-reference (critic-verified). Not used: user chose optional.
- Install paths: `~/.claude/plugins/installed_plugins.json` lists `installPath` per plugin (this machine: craftsman only; Artist absent).
- reuse-check: `--project --run [--files|--all] [--base]`, exit 0/1/2 (`Artist/skills/create/SKILL.md:49-50`, `Artist/scripts/reuse-check.mjs:244-258`).

## Critique
- **Steelman** — one owner, deterministic token checks, Artist already craftsman-aware, ~4.8 KB less doc.
- **Strongest case against** — the critic cannot run in a diff-only gate; reuse-check fails without a format-2 DESIGN.md (none of the user's repos has one today).
- **Hidden assumptions** — Artist's root is resolvable from craftsman (test: resolver over `installed_plugins.json`); reuse-check honours `--base <merge-base>` in a worktree (test: fixture repo).
- **Failure modes** — gate silently empty (mitigated by fallback + logged skip reason); Artist CLI change breaks craftsman (mitigate: treat exit 2 as "fallback, noted").
- **Kill criteria** — no reliable resolver; Artist drops the reuse-check CLI.
- **Cheaper alternatives** — do nothing; make `ui-ux-reviewer` DESIGN.md-aware (critic's option B, declined by user).

## Disputed
- "Problem barely exercised (0 ui-ux-reviewer events)" — softened: `events.jsonl` has 0 events for every specialist, so it signals a logging gap, not non-use.
- "REJECT as proposed" — accepted for the full swap; the user chose the split shape, which removes the diff-vs-screenshot mismatch.

## Recommendations
1. Split by input: reuse-check (`--base <merge-base>`) on the diff; critic only with an existing verify `report.json`.
2. Fallback = reduced `ui-ux-reviewer` (cap lowered), `design-review` folded in and removed.
3. Record the SLIM-13 carve-out as "optional detected integration, never assumed".
4. Resolve Artist's root deterministically in a script, tested with fixtures.

## Open questions
- Dependency: **optional, detected** (user, 2026-10-25).
- Absent behaviour: **minimal built-in check** (user, 2026-10-25).
- Shape: **split by input** (user, 2026-10-25).
- Dirty 2.3.0 tree: **committed first** (0a2fc6f).

## Next step
`/architect artist-ui-gate`
