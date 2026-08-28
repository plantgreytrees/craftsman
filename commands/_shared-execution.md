> Canonical protocol for the per-unit execution loop (`/orchestrate` Phase C).
> `Read` this file only once you're actually about to run Phase X on a unit —
> it's the expensive half of the shared machinery, deliberately split out of
> `_shared-machinery.md` (Standing constraints + MCP conventions + the tooling
> manifest — read unconditionally, so kept light) so a run that hasn't reached
> execution yet — including `--step`'s pre-approval summary — never pays for it.
> Not user-invocable on its own.

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
   - Any other specialist named in the manifest (e.g. `standards-keeper` in audit mode, for a family with a documented convention worth conforming to).
6. **Simplify** — implementer tightens the diff (remove speculative abstractions, dead code, debug output). Minimal diff.
7. **GATE** (detected commands only, in order) — format → lint → typecheck → tests. Tests **100%** (no skips added, no assertions weakened). **Coverage** where tooling exists: touched code below the acceptance/standard threshold (default 80%) = fail → implementer adds tests; no coverage tooling → note in tracker, don't skip silently. Failure #1 → raw output back to implementer. Failure #2 → `build-doctor` (gate-triage: the failing command + full output) → hand its `FIX FOR IMPLEMENTER` to the implementer for the final retry. **Max 2 retries**, then PARK: `wip:` commit on `feat/<slug>`, `git worktree remove <path>` (**branch survives, preserving work**), tracker → BLOCKED(failing gate + triage + branch). **Never halt the whole run for one unit.**
8. **Review — routed.** Delegate `review-router` (haiku) on the unit's diff first; log the verdict via `node "${CLAUDE_PLUGIN_ROOT}/scripts/log-router.mjs" <verdict> "<reason>"` before acting on it. This is the highest-volume review path in the whole plugin — every unit passes through here, so routing it is where the token saving actually is.
   - **SKIP** (small, low-risk: no new API/endpoint, no auth/permissions/migration/concurrency/contract change, ≤~120 lines, and the unit's manifest names no mandatory specialist gate) — the deterministic GATE (step 7) already passed; skip the `code-reviewer` pass entirely, note `reviewed: skipped(router)` in the tracker.
   - **ESCALATE** — `code-reviewer`. Reject → implementer fixes → re-review. **Max 2 rounds**; unresolved → PARK as BLOCKED.
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
