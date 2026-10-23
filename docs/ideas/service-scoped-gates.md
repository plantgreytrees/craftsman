---
slug: service-scoped-gates
status: architected
verdict: pursue-with-changes
confidence: medium
depth: deep
isolation: isolated
created: 2026-10-23
updated: 2026-10-23
related: [docs/ideas/plugin-overhaul.md, docs/architecture/state.rules.md, docs/architecture/landing.rules.md, docs/architecture/engine.rules.md]
touches: [scripts/lib/core.mjs, scripts/stop-gate.mjs, scripts/quality-gate.mjs, scripts/snapshot.mjs, scripts/lib/gate-command.mjs, scripts/telemetry.mjs, craftsman.config.json, EXTENDING.md, CHANGELOG.md, scripts/*.test.mjs]
---

# Idea: Per-service config, cwd and test scope for multi-service superprojects

## Proposal (neutral restatement)
**Problem.** Craftsman resolves config, language tools, test commands and command cwd per repository root. In a multi-service superproject (observed: Gleam, a .NET solution with 61 git submodules, one per service; `Gleam/.gitmodules`) this leaves: no regression test gate (Gleam set `stopGate.commands: {}` and `repoExec.verifyTestsBeforeMerge: false` after a whole-solution `dotnet test` failed on an unrelated duplicate; `Gleam/craftsman.config.json`), a wrapper script for ESLint because tools spawn with cwd = root (`scripts/lib/core.mjs:864`), and a workspace manifest listing 18 of 61 submodules (`Gleam/craftsman.workspace.json`).
**Claimed benefit.** Gates run, scoped to what changed, without per-repo wrappers.
**Who.** The single maintainer; Gleam is their busiest repo.
**Done.** Editing a file in a service runs that service's checks with cwd = the service; stop and merge gates run only the touched services' tests; Gleam can drop its workarounds.

## Verdict
**PURSUE-WITH-CHANGES** (medium). The pain is real and owner-documented, but the full "resolve every file to its owning service and run an affected-set engine" design strains four standing rules and has an unsolved snapshot problem. Ship the cheap, rule-compatible slices first (config layering, downward cwd, a `{changed}` placeholder), and instrument before building anything larger. **Most likely to flip it to DEFER:** a week of telemetry showing dirty root-session stops with no test command are rare in Gleam.

| criterion | score 1–5 | evidence |
|---|---|---|
| value | 3 | Owner's three dated workarounds in `Gleam/craftsman.config.json`; frequency UNPROVEN (stop-gate logs nothing for a dirty stop with no command, `scripts/stop-gate.mjs:184-191`) |
| system fit | 2 (full) / 4 (slices) | Full design fights ARCH-STATE-06, ARCH-LAND-07, ARCH-ENGINE-22, `core.mjs:92-94`; slices stay inside them |
| cost — 5 = cheap | 2 (full) / 4 (slices) | Full: ~19 files, 3 ARCH docs. Slices: `core.mjs` + `gate-command.mjs` + tests |
| risk — 5 = low | 3 | Silent fallback to root config for unregistered submodules; budget skips (`stop-gate.mjs:220`) |
| reversibility — 5 = easy | 3 | Config-flagged, but rule edits stick |
| evidence strength | 2 | Code paths verified; telemetry counts only sampled |

## Overlap & prior work
Searched: `docs/ideas/*.md` (incl. rejected), `docs/plans/TRACKER.md` + archive + plan goals, `docs/architecture/*.rules.md`, plan memory (no records). **Novel**: no idea or plan covers per-service gates. **Related, not duplicate:** `docs/ideas/plugin-overhaul.md:157` (F7, Gleam gate friction, cause UNPROVEN); ARCH-STATE-01/06/11, ARCH-LAND-03/07, ARCH-VIEWS-04.

## System fit (whole project)
- **contract ripple:** `loadConfig` signature unchanged for a layering slice; `runOne` gains an optional per-language `cwd` (`core.mjs:864`).
- **data:** N/A(no schema). Session snapshot shape changes only if per-service snapshots are built (`snapshot.mjs:22-25`).
- **config & flags:** a new config layer (workspace → project) with deep-merge (`core.mjs:588-594`) — harder to explain "why did this tool run".
- **security:** no shell, cwd stays inside root; nothing new.
- **tests:** new fixtures for layering, cwd, placeholder; existing `core`, `stop-gate`, `gate-command` tests.
- **observability:** a `no-command` skip event and a `project` field on `gate`/`stop` events are prerequisites.
- **UI:** N/A(no UI).
- **docs:** EXTENDING.md, CHANGELOG; ARCH rules only if the owner-lookup engine is revived.
- **Second order:** `loadWorkspaceManifest` does realpath + `git rev-parse` per project (`core.mjs:125-131`) — 61 spawns per hook if called per edit. Unit sessions already run per-unit gates (`quality-gate.mjs:23-26`), then `repo-exec` re-runs the gate before merge (`repo-exec.mjs:317-330`); a per-service stop gate adds a third run.

## Research
- moon: workspace tasks inherited by language/tag, merged with project config; language must be explicit. https://moonrepo.dev/docs/concepts/task-inheritance
- Nx affected: changed files → owning project via graph → transitive dependents. https://nx.dev/docs/features/ci-features/affected
- Turborepo `--filter=[HEAD^1]` / `--affected`; shallow clones make everything "changed". https://turborepo.org/docs/core-concepts/filtering
- Pants `--changed-since` + dependents; over-invalidation pitfalls. https://chat.pantsbuild.org/t/9729028/ (community thread, 2020–22)
- lefthook `root:` sets cwd and filters files; globs stay repo-relative. https://lefthook.dev/configuration/root
- Claude Code loads subdirectory CLAUDE.md on demand, hook stdin carries `cwd`. https://code.claude.com/docs/en/memory , https://code.claude.com/docs/en/hooks
- `git ls-files --recurse-submodules` supports only `--cached`/`--stage`, active submodules. https://git-scm.com/docs/git-ls-files
- `dotnet test` per project rebuilds each time; build once then `--no-build`. https://github.com/microsoft/vstest/issues/411
- UNVERIFIED: prek workspace mode (page 404), hk subprojects, AGENTS.md merge semantics.
- Viable approaches: (A) full owner resolution + config layering; (B) affected-set gates; (C) `{changed}` placeholder delegating to a repo script; (S1) config layering + downward cwd.

## Critique
- **Steelman** — Craftsman already has the shape: unit scope switches to `active.project_root` (`quality-gate.mjs:23-26`), plan units carry `project:`, gitlink reads exist (`scripts/lib/plan-submodules.mjs`). Every comparable tool scopes per project.
- **Strongest case against** — it bundles two gaps: config/cwd (cheap, clearly real) and an affected-test engine (expensive, frequency unmeasured). The "green at session start" invariant (`stop-gate.mjs:184-187`) breaks because the touched service set is unknown at SessionStart: snapshot all 61, baseline lazily, or block on pre-existing failures — the failure Gleam hit.
- **Hidden assumptions** — (1) dirty no-command stops are frequent: add one log line, count a week. (2) per-service `dotnet test` fits the 280 s budget: time three services with `--no-build`. (3) owner lookup stays manifest/gitlink-only with no `readdir` above root. (4) Gleam will register all touched submodules (today 18/61). (5) UNPROVEN: no submodule ships its own `craftsman.config.json` that layering would shadow.
- **Failure modes** — files in unregistered submodules silently get root behaviour; serial per-service test runs exceed budget and skip silently; parallel sessions spawn .NET build servers (Gleam memory incidents, per Gleam CLAUDE.md); manifest drifts.
- **Kill criteria** — fewer than ~5 dirty no-command stops/week; median per-service test >120 s; owner lookup needs a directory scan above root or adds >50 ms per hook; manifest left at 18/61.
- **Cheaper alternatives** — **Do nothing:** orchestrated units are already scoped; leaves interactive edits ungated. **S1:** merge workspace-root config under the project's in `loadConfig`, plus a per-language `cwd` resolved *down* from root toward the file (rules intact). **C:** `{changed}`/`{changedDirs}` placeholders so Gleam supplies a ~20-line script mapping files → csproj → `dotnet test --no-build`; keeps the adapter model (ARCH-ENGINE-22). S1 + C ≈ a tenth of the touch list.

## Disputed
None. Checked against code: stop-gate emits no event for a dirty stop with no command (`stop-gate.mjs:184-191`); quality-gate already uses the unit's project root (`quality-gate.mjs:23-26`); Gleam's `.editorconfig:11` deliberately sets `charset = utf-8-bom`, so the BOM complaint is a Gleam-side contradiction, not a cwd problem. One note beyond the critic: Gleam's config comment that `init --write` re-arms `stopGate.commands` is stale — `scripts/init.mjs:366-374` now preserves declared maps, including `{}`.

## Recommendations
1. Instrument first: `stop-tests-skipped` with `reason: "no-command"` and a `project` field on `gate`/`stop` events.
2. Config layering: workspace-root config merged under a project's own in `loadConfig` (fixes orchestrated-unit gaps now).
3. Per-language `cwd` option, resolved downward only — deletes Gleam's `eslint-ui.py`.
4. `{changed}` / `{changedDirs}` placeholder for `stopGate.commands` and pre-merge gate; document that it cannot be pre-snapshotted.
5. Defer owner-resolution/affected-set engine; if revived, registered projects plus gitlinks of a registered root only, never directory scans.
6. Separately, Gleam-side: fix the stale `init` warning and decide `charset` for `.cs`.

## Open questions
- Will Gleam register all 61 submodules (or should `workspace-init` discover gitlinks)? Unanswered.
- Is a root-session interactive edit of a submodule a normal path in Gleam, or is everything via `/orchestrate`? Unanswered (Gleam rule says never edit the superproject for a unit).

## Corrections found by /architect (2026-10-23, isolated analyst, checked against code)
- **Mechanism of the "disabled" gate was wrong.** `stopGate.commands: {}` does not drop the defaults (`deepMerge`, `scripts/lib/core.mjs:588-596`), so Gleam's whole-solution `dotnet test` still runs at every session start and is red, and Stop skips it (`scripts/stop-gate.mjs:185-186`). The Problem section's "set `stopGate.commands: {}` ... after a whole-solution failure" describes intent, not effect.
- **The frequency was measurable and is high.** Gleam root `events.jsonl` 2026-10-21..23: 836 stops, 770 clean skips, so about 65 dirty stops in 3 days, none running a test. The A1 kill criterion ("<5/week") is not met.
- **Manifest count:** 18 entries including the root `.`, so 17 of 61 submodules.
- **"Do nothing" is weaker than stated:** units read the submodule's root, which has no config, so they get plugin defaults (`dotnet format`, no `extraChecks`); config layering fixes that.
- **Recommendation 1 is about 10 lines, not one,** across `stop-gate.mjs` and `quality-gate.mjs`; the skip taxonomy also needs `red-at-start` and `snapshot-pending`.
- **Hidden cost found:** `loadWorkspaceManifest` already runs 17 `git rev-parse` per hook in Gleam (`core.mjs:152,157`); a cached manifest is a separate fix.
- **Decisions taken with the owner:** inherit workspace config by default with `{workspaceRoot}`; `nearest:<marker>` downward cwd; session change list as the Stop source; scoped failures block; `extraChecks` get the placeholders; a budget kill is said once. Rules: ARCH-STATE-16 to 19, ARCH-LAND-30.

## Next step
`/architect service-scoped-gates` (add `--deep`: it touches STATE/LAND/ENGINE rules if the owner lookup is revived). Start with recommendation 1 — a one-line telemetry change needs no architecture pass.
