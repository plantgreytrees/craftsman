# Shared execution machinery

> Canonical, single-source protocol for every command that **executes** code changes
> (`/orchestrate` and the executor half of `/investigate`/`/design` plan docs). Commands
> **link here and `Read` this file at the phase that needs it** instead of inlining it — one edit,
> one source of truth. Not user-invocable on its own.

Referenced by: [orchestrate.md](orchestrate.md) · executed `investigate-*`/`design-*`/`scrutinise-*` plan docs.

---

## Standing constraints (non-negotiable, apply to every unit)

- **Decide from `docs/`, don't stall.** `docs/` is the standing authority. Resolve design/architecture/security judgement calls by reading the reference and acting, not by pausing for the user: load the relevant `docs/architecture/*`, `docs/design/*`, `docs/standards/*` into the plan's Background with `file:line`, follow it, record the decision. **Only stop the user** for a true product/scope ambiguity or a change to a locked/signed-off invariant — note every such stop in the tracker.
- **Acceptance is the contract.** `.craftsman/acceptance.md` (if present) lists the gates a unit must pass; a unit is not done until its acceptance items hold. The plan doc's acceptance section refines them per feature.
- **Plans** live in `docs/plans/`. Never elsewhere. Plan docs are `docs/plans/<slug>.md`.
- **Shared tracker** — `docs/plans/TRACKER.md` is shared with concurrent sessions. Only touch execution rows you created (this run's slugs). Never prune/reformat foreign rows.
- **Commit style** — Conventional Commits. Respect the repo's commit hooks / pre-commit checks; a hook rejection is fixed **in the worktree**, never bypassed (`--no-verify` is forbidden).
- **Deterministic guards are the backstop — run them, don't eyeball.** Blast radius via `consumer-tracer` before touching any exported/shared contract; the project's own checks (format / lint / typecheck / test — detected, never assumed) at each gate. A changed contract with an un-updated consumer is the #1 missed unit; the tracer, not judgement, decides who is affected.
- **Standards, same change.** If `docs/standards/` carries a standard that governs the touched code, the implementer conforms to it and `code-reviewer` checks it. Absent standard for a family the unit establishes → note "no standard — run `standards-keeper`".
- **Design governed in `docs/design/`, same unit.** Any unit that alters a rendered surface, a design token, a shared UI primitive, a component's state, or a motion/a11y rule updates the matching `docs/design/*` doc **in the same unit** (never a follow-up). A presentation change with a stale design doc is an incomplete unit; `design-reviewer` enforces the sync.

## Optional MCP conventions (use if available; skip if trivial)

MCP is never ritual — use where it earns tokens, skip otherwise. Each is optional; degrade gracefully if the server is absent:
- **context7** — before an implementer writes against an external library API, resolve + query current docs rather than trusting training data. Skip for pure in-repo edits.
- **memory** — at unit start, recall gotchas for the touched area + change-class (tooling quirks, known-flaky tests, past decisions). At close-out, record what was learned (tooling detected, gotcha hit, contract touched → consumers). This is the durability win — each run makes the next smarter.
- **sequential-thinking** — only for genuinely complex units (multi-contract ripple, ambiguous decomposition). Skip trivial single-file units.

---

## The tooling manifest (planner → executor contract)

Every plan doc a planner emits carries, **per unit**, a `### Tooling` block naming *only* what that unit needs — so the executor loads exactly those and ignores the rest (no scanning every agent/skill/check per unit; less context, faster, fewer wrong turns). The planner resolves this once, at plan time, when it already knows the change shape.

```
### Tooling — <unit-slug>
Implementer:  implementer                     # the routing target; language auto-detected at execute time
Gates:        security-auditor, design-reviewer   # ONLY the specialist gates this diff triggers
Skills:       <1–3 skills relevant to this unit>
Checks:       <the detected build/lint/typecheck/test commands this diff must pass>
MCP:          context7 (lib API), memory (recall+record)   # if available; skip-if-trivial
Design:       n/a | design-reviewer spec embedded          # only for UI/presentation units
```

**Executor rule:** treat the manifest as the allow-list for that unit. Use the named implementer, run the named gates + checks, load the named skills, make the named MCP calls — do **not** invoke gates/skills/agents the manifest omits. If the diff turns out to need one the planner missed, add it AND note the manifest gap in the tracker so the next plan is better. A unit with no manifest → fall back to full Phase X routing and flag the missing manifest.

## Phase L — Merge-only locking

Concurrent sessions may target the same base branch. A lock guards **the merge only**, never the work.

- Lock at `docs/plans/.sessions/<target-branch>.lock`, JSON: `{ session_id (the real SessionStart id — never invented), branch, unit, task:"merge", started_at, heartbeat_at }` (ISO-8601 UTC).
- **The lock guards the merge only.** Every unit works in its own worktree on its own branch (Phase X.2), so implement → gates → review → conflict-resolution are all **lockless**. Acquire the lock only for the final merge to the base branch; release the instant it validates.
- Merge-time rules (checked right before the merge, Phase X.9d):
  - **Absent** → create lock, do `checkout <base> && pull` + `merge --no-ff` + validate + push, **delete lock immediately**.
  - **Present, heartbeat < 30 min** → another session mid-merge. **Don't wait, don't block** — set this merge aside on a deferred-merge queue, do other lockless work / other merges, retry next pass. A merge that never lands → SKIPPED(locked), worktree left for a later pass.
  - **Present, heartbeat > 30 min** → stale (crash). Overwrite (log the reclaim in tracker notes), proceed.
  - **Release is mandatory + immediate** on every path (incl. abort/conflict/error). Never hold across a wait, build, gate, or approval.

---

## Phase X — Per-unit execution loop

For each unit, in **dependency order** (shared/library units → their consumers → UI/presentation last):

1. **Claim** — tracker row → IN_PROGRESS. No lock here (deferred to merge).
2. **Worktree + branch** — `git fetch origin` (skip if no remote), then `git worktree add .worktrees/<slug> -b feat/<slug> origin/main` (`main` if no remote; substitute the repo's base branch). Collisions: your interrupted run with that branch → reattach (no `-b`); a **live foreign** session holds it → `-b feat/<slug>--<sess8>`. `.worktrees/` is gitignored. ALL edits/gates/review/conflict-resolution run here; the base branch is untouched until step 9. **No worktree → no edits.**
3. **Detect language & tooling** (record in tracker notes; **never assume**). Read repo markers to identify the stack and derive commands from the project's own config — e.g. `package.json` scripts (prefer the lockfile's package manager), `pyproject.toml`/`tox.ini`, `go.mod`, `Cargo.toml`, `*.csproj`/`.sln`, `build.gradle`, `Gemfile`, `Makefile`. Resolve the build, test, lint, format, and typecheck commands that actually exist; a missing one = skip + note (don't invent it). If a `docs/standards/` standard governs the code, pass it to the implementer.
4. **Delegate implementation** via Task to `implementer` with: plan-doc path, the **worktree path** (its only writable scope), the unit's task list, any design spec, and the detected commands. The implementer edits + runs the local checks; it **does not commit**.
5. **Specialist gates** (read-only, parallel where multiple apply; per the unit's manifest). Critical/Major → back to implementer (counts toward retry budget); Minor → tracker notes.
   - **Security** (mandatory on HIGH units): `security-auditor` with the diff. HIGH = touches auth/secrets/crypto/tenancy/permissions/external I/O.
   - **Design conformance** (UI/presentation units): `design-reviewer` — token/component/state/motion/a11y conformance vs `docs/design/*`; a surface change with a stale design doc routes back to the implementer. Skip when `design-reviewer` itself crafted the unit (self-audits).
   - Any other specialist named in the manifest.
6. **Simplify** — implementer tightens the diff (remove speculative abstractions, dead code, debug output). Minimal diff.
7. **GATE** (detected commands only, in order) — format → lint → typecheck → tests. Tests **100%** (no skips added, no assertions weakened). **Coverage** where tooling exists: touched code below the acceptance/standard threshold (default 80%) = fail → implementer adds tests; no coverage tooling → note in tracker, don't skip silently. Failure #1 → raw output back to implementer. Failure #2 → `build-doctor` (gate-triage: the failing command + full output) → hand its `FIX FOR IMPLEMENTER` to the implementer for the final retry. **Max 2 retries**, then PARK: `wip:` commit on `feat/<slug>`, `git worktree remove <path>` (**branch survives, preserving work**), tracker → BLOCKED(failing gate + triage + branch). **Never halt the whole run for one unit.**
8. **Review** — `code-reviewer`. Reject → implementer fixes → re-review. **Max 2 rounds**; unresolved → PARK as BLOCKED.
9. **Sync → resolve (lockless) → merge → cleanup** — commit all changes on `feat/<slug>` in the worktree.
   - **a. Pre-merge sync in the worktree (no lock):** `git fetch origin` then `git -C <worktree> merge origin/main` (local base if no remote). Conflicts surface here, off the primary checkout.
   - **b. Resolver:** clean → skip to c. Conflict → resolve **in the worktree** (implementer; 2nd attempt `build-doctor` triage first), re-commit, **re-run the full gate (step 7)**. Max 2 attempts; still bad → `git -C <worktree> merge --abort`, PARK BLOCKED("merge conflict"), branch kept.
   - **c. Pre-merge guard:** worktree clean (`git -C <worktree> status --porcelain` empty) AND branch carries work (`git rev-list --count main..feat/<slug>` ≥ 1).
   - **d. Locked merge:** acquire the merge-only lock (Phase L). Primary checkout: `git checkout main && git pull`, then `git merge --no-ff feat/<slug>` (always `--no-ff`). Should be trivial (a already synced); if the base advanced again, abort, **release lock**, loop to a. **Validate:** `git merge-base --is-ancestor feat/<slug> main`. Push if remote (push failure → note, don't park). **Release lock now.**
   - **e. Cleanup (not optional):** `git worktree remove <path> && git worktree prune && git branch -d feat/<slug>` (`-d` refuses if unmerged — a safety net). A validated merge always cleans up immediately.
10. **Suite hygiene** — pre-existing failures UNRELATED to this unit found during the gate: mechanical/clear → `build-doctor` triage → implementer as a separate `test:`/`fix:` commit in the same worktree before merge (folded into the same merge); non-trivial → PENDING follow-up row. A unit never merges leaving the suite red.
11. **Close out** — lockless bookkeeping only (lock already released): tracker row → MERGED, note the merged SHA; **record memory** (if available). 

## Finalization (calling command's close-out)

- **Worktree sweep (mandatory):** `git worktree list` shows **only the primary checkout**. Leftover with a merged+clean branch → remove worktree + `branch -d` + `worktree prune`. Leftover with an **unmerged** branch (parked) → remove worktree, **keep branch**, ensure a BLOCKED/PARKED/SKIPPED row names it. The run doesn't reach COMPLETE while any worktree survives.
- **Integration build (if the project defines one):** run the project's build/packaging step once on the merged base to confirm the integrated tree is sound; a failure here → BLOCKED follow-up row (merged code stays; the row is the fix vehicle). No build step → note it.
- **Tracker consistency:** delegate `phase-tracker` to confirm every touched row reflects its true merged/parked state before the feature is called COMPLETE.
