> Canonical protocol for the per-unit execution loop (`/orchestrate` Phase C).
> `Read` this file only once you're actually about to run Phase X on a unit —
> it's the expensive half of the shared machinery, deliberately split out of
> `_shared-machinery.md` (Standing constraints + MCP conventions + the tooling
> manifest — read unconditionally, so kept light) so a run that hasn't reached
> execution yet — including `--step`'s pre-approval summary — never pays for it.
> Not user-invocable on its own.

## Phase L — Merge-only locking

Concurrent sessions may target the same base branch. A lock guards **the merge only**, never the work.

- Locking, base-branch discovery, worktree paths, and merge operations are
   repository-local. For each step's selected `project`, use
   `scripts/repo-exec.mjs` rather than assuming `main`, `origin/main`, or the
   controller checkout. Its atomic lock lives under that repository's Git-common
   directory and includes the real session id, project, and unit.
- **The lock guards the merge only.** Every unit works in its own worktree on its own branch (Phase X.2), so implement → gates → review → conflict-resolution are all **lockless**. Acquire the lock only for the final merge to the base branch; release the instant it validates.
- Merge-time rules (checked right before the merge, Phase X.9d):
  - **Absent** → create lock, do `checkout <base> && pull` + `merge --no-ff` + validate + push, **delete lock immediately**.
  - **Present, heartbeat < 30 min** → another session mid-merge. **Don't wait, don't block** — set this merge aside on a deferred-merge queue, do other lockless work / other merges, retry next pass. A merge that never lands → SKIPPED(locked), worktree left for a later pass.
  - **Present, heartbeat > 30 min** → stale (crash). Overwrite (log the reclaim in tracker notes), proceed.
  - **Release is mandatory + immediate** on every path (incl. abort/conflict/error). Never hold across a wait, build, gate, or approval.

---

## Phase X — Per-unit execution loop

For each unit, in **dependency order** (shared/library units → their consumers → UI/presentation last):

1. **Claim** — atomically claim the plan/unit before changing the tracker: pass the
   real session id, plan, and unit to `scripts/claim.mjs`; an existing claim is a
   BLOCKED/duplicate execution and must not be overwritten. `claim.mjs` records the
   same transition in the structured tracker ledger (`scripts/tracker.mjs`) and
   the human-readable row remains a concise projection. Release the claim only
   after close-out or an explicit PARKED state.
2. **Worktree + branch** — call `repo-exec.mjs` with `action: "prepare"`, the
   selected `project`, unit, slug, session id, and optional worktree path. It
   discovers the repository's actual base branch, fetches its own remote, and
   creates or reattaches a worktree under that repository. ALL edits/gates/review/
   conflict-resolution run there; the base branch is untouched until step 9.
   **No worktree → no edits.**
3. **Detect language & tooling** (record in tracker notes; **never assume**). Read repo markers to identify the stack and derive commands from the project's own config — e.g. `package.json` scripts (prefer the lockfile's package manager), `pyproject.toml`/`tox.ini`, `go.mod`, `Cargo.toml`, `*.csproj`/`.sln`, `build.gradle`, `Gemfile`, `Makefile`. Resolve the build, test, lint, format, and typecheck commands that actually exist; a missing one = skip + note (don't invent it). If a `docs/standards/` standard governs the code, pass it to the implementer.
4. **Delegate implementation** via Task to `implementer` with: plan-doc path, the **worktree path** (its only writable scope), the unit's task list, any design spec, and the detected commands. Before the first implementation read/write in that worktree, activate `scripts/scope.mjs` there with the unit's exact manifest, including the absolute `worktree_path`, and mark it scope-required. The implementer edits + runs the local checks; it **does not commit**. Activation records the session's branch/worktree binding in shared Git state.
   After activation, recall bounded plan memory with `printf '%s' '{"action":"recall","plan":"<plan>","unit":"<unit>","scope_id":"<scope_id>","query":"<task area>","max_items":6,"max_chars":3000,"summary_only":true}' | node "${CLAUDE_PLUGIN_ROOT}/scripts/plan-memory.mjs"`. Treat the result as unverified hints; verify cited files inside the active scope and never widen the manifest from memory.
5. **Specialist gates** (read-only, parallel where multiple apply; per the unit's manifest). Critical/Major → back to implementer (counts toward retry budget); Minor → tracker notes. After each specialist runs (this step and step 8), log it via `node "${CLAUDE_PLUGIN_ROOT}/scripts/log-specialist.mjs" <agent-name> <finding-count>` (Bash) so `/craftsman:stats` can show which specialists actually find something.
   - **Security** (mandatory on HIGH units): `security-auditor` with the diff. HIGH = touches auth/secrets/crypto/tenancy/permissions/external I/O.
   - **Deterministic floor for the rest:** run `node "${CLAUDE_PLUGIN_ROOT}/scripts/gate-select.mjs" <unit's merge-base>..<worktree-head>` (Bash) once per unit — it reads the diff itself, so it never depends on the orchestrating turn remembering a file-pattern rule correctly. It prints zero or more of `ui`/`migration`/`api`/`dependency`/`performance`/`observability`; dispatch the matching specialist(s) below with the diff. This is a **floor, not a ceiling** — the implementer or any reviewer who separately notices one of these risks (e.g. DDL embedded somewhere the script's heuristics miss) escalates to the matching specialist regardless of the script's output.
     - `ui` → `ui-ux-reviewer` (hierarchy, accessibility, generic-AI-slop patterns). Advisory-only, same as `idiom-reviewer` in step 8 — never blocks the merge.
     - `migration` → `migration-reviewer` (reversibility, data loss, lock risk). Advisory-only.
     - `api` → `api-reviewer` (contract design, versioning). Advisory-only — a breaking-change verdict still routes through `consumer-tracer`/`security-auditor` where those already apply.
     - `dependency` → `dependency-auditor` (license/vulnerability/maintenance risk). Advisory-only.
     - `performance` → `performance-reviewer` (N+1/unbounded work/missing pagination). Advisory-only.
     - `observability` → `observability-reviewer` (silent failure paths, missing instrumentation). Advisory-only.
   - Any other specialist named in the manifest for a gate beyond the standing ESCALATE panel (step 8) — e.g. `consumer-tracer` for a contract crossing a network/process boundary. Standards conformance no longer needs a manifest entry; it's part of step 8 for every ESCALATE-routed unit.
6. **Simplify** — implementer tightens the diff (remove speculative abstractions, dead code, debug output). Minimal diff.
7. **GATE** (detected commands only, in order) — format → lint → typecheck → tests. Tests **100%** (no skips added, no assertions weakened). **Coverage** where tooling exists: touched code below the acceptance/standard threshold (default 80%) = fail → implementer adds tests; no coverage tooling → note in tracker, don't skip silently. Failure #1 → raw output back to implementer. Failure #2 → `build-doctor` (gate-triage: the failing command + full output) → hand its `FIX FOR IMPLEMENTER` to the implementer for the final retry. **Max 2 retries**, then PARK: `wip:` commit on `feat/<slug>`, `git worktree remove <path>` (**branch survives, preserving work**), tracker → BLOCKED(failing gate + triage + branch). **Never halt the whole run for one unit.**
8. **Review — routed.** Delegate `review-router` (haiku) on the unit's diff first; log the verdict via `node "${CLAUDE_PLUGIN_ROOT}/scripts/log-router.mjs" <verdict> "<reason>"` before acting on it. This is the highest-volume review path in the whole plugin — every unit passes through here, so routing it is where the token saving actually is.
   - **SKIP** (small, low-risk: no new API/endpoint, no auth/permissions/migration/concurrency/contract change, ≤~120 lines, and the unit's manifest names no mandatory specialist gate) — the deterministic GATE (step 7) already passed; skip the whole panel, note `reviewed: skipped(router)` in the tracker.
   - **ESCALATE** — dispatch the basic-hygiene panel in parallel, the same diff to each: `code-reviewer` (correctness/security/maintainability), `standards-keeper` (audit mode — does this unit match the repo's own conventions), and `idiom-reviewer` (simplification — reinvented stdlib, dead flexibility, wrong paradigm). This is the "should have caught it sooner" bar, enforced at merge time, so `/scrutinise` never has to re-litigate a single unit's style/conformance later. `performance-reviewer`/`observability-reviewer` are **not** part of this standing panel — they only run when step 5's `gate-select.mjs` (or a reviewer's own judgment) actually flags that concern, so a diff with no loop/query/external-call/background-job pays nothing for either.
     - **Blocking:** `code-reviewer` `VERDICT: REJECT`, or a `standards-keeper` Critical/Major deviation → implementer fixes → re-review. **Max 2 rounds**; unresolved → PARK as BLOCKED.
     - **Advisory-only, never blocks:** `idiom-reviewer` findings and `standards-keeper` Minor deviations — implementer folds in the cheap ones this same round; the rest go to tracker notes as `reviewed: idiom-advisory(...)`. Step 5's specialist findings (including `performance-reviewer`/`observability-reviewer` when dispatched) are folded in the same way.
9. **Sync → resolve (lockless) → merge → cleanup** — commit all changes in the
   selected repository's worktree. Before entering that repository's primary
   checkout for the locked merge, release the session's worktree binding with
   `scripts/scope.mjs` using `{"action":"release","session_id":"...","project":"<id>","worktree_path":"<absolute worktree>"}`. Reactivate the next unit's scope before implementation resumes.
    - **a. Pre-merge sync in the worktree (no lock):** call `repo-exec.mjs` with
       `action: "sync"`; it fetches and merges that selected repository's own base
       ref. Conflicts surface in that worktree, off the primary checkout.
   - **b. Resolver:** clean → skip to c. Conflict → resolve **in the worktree** (implementer; 2nd attempt `build-doctor` triage first), re-commit, **re-run the full gate (step 7)**. Max 2 attempts; still bad → `git -C <worktree> merge --abort`, PARK BLOCKED("merge conflict"), branch kept.
    - **c. Pre-merge guard:** the helper confirms the selected repository's
       worktree is clean and the branch carries commits beyond that repository's
       discovered base branch.
    - **d. Locked merge:** call `repo-exec.mjs` with `action: "merge"`; it atomically
       locks that repository, merges into its discovered base branch, validates
       ancestry, pushes its own remote when configured, and releases the lock on
       every path. If the base advanced, sync and retry in the same repository.
    - **e. Cleanup (not optional):** call `repo-exec.mjs` with `action: "cleanup"`;
       it removes only that repository's worktree and deletes the branch only after
       a successful local merge.
10. **Suite hygiene** — pre-existing failures UNRELATED to this unit found during the gate: mechanical/clear → `build-doctor` triage → implementer as a separate `test:`/`fix:` commit in the same worktree before merge (folded into the same merge); non-trivial → PENDING follow-up row. A unit never merges leaving the suite red.
11. **Close out** — lockless bookkeeping only (lock already released): tracker row → MERGED, note the merged SHA; release the plan/unit claim with `scripts/claim.mjs` using the same session id; **record memory** (if available). A PARKED/BLOCKED unit keeps its claim until the hand-off records the surviving branch and explicit recovery owner.
12. **Unit hand-off and context reset** — write a hand-off before leaving the unit:
   `printf '%s' '<JSON>' | node "${CLAUDE_PLUGIN_ROOT}/scripts/handoff.mjs"` (the
   JSON must include the real `session_id`, so hand-offs cannot cross sessions).
   Include the plan, unit id, merged/blocked status, changed files, acceptance and
   gate results, unresolved risks, and the exact next unit. Then invoke `/compact`
   before the next unit. After compaction, re-read only the tracker, the next
   unit's `scope.read` + `scope.docs`, and its task text. If the phase is complete,
   use the phase hand-off protocol in `/orchestrate` and begin the next phase fresh.

## Memory before context reset

   Before leaving a unit, pass only compact, post-gate ledger entries in the
   hand-off JSON's `memory_entries` array, using categories such as `decision`,
   `dependency`, `contract-consumer`, `tooling-gotcha`, `review-finding`,
   `acceptance-result`, or `unresolved-risk`. Include the scope id, source files,
   commit identity, and `verified`/`unproven` status. The hand-off records them
   best-effort; a malformed entry is logged and cannot block the reset. Recall
   for the next unit happens after its scope activation and never changes that
   scope.

## Finalization (calling command's close-out)

- **Worktree sweep (mandatory):** `git worktree list` shows **only the primary checkout**. Leftover with a merged+clean branch → remove worktree + `branch -d` + `worktree prune`. Leftover with an **unmerged** branch (parked) → remove worktree, **keep branch**, ensure a BLOCKED/PARKED/SKIPPED row names it. The run doesn't reach COMPLETE while any worktree survives.
- **Integration build (if the project defines one):** run the project's build/packaging step once on the merged base to confirm the integrated tree is sound; a failure here → BLOCKED follow-up row (merged code stays; the row is the fix vehicle). No build step → note it.
- **Tracker consistency:** delegate `phase-tracker` to confirm every touched row reflects its true merged/parked state before the feature is called COMPLETE.
- **Memory compaction:** after the phase hand-off and only when a plan has accumulated more than one entry per unit/category, run `scripts/plan-memory.mjs` with `{"action":"compact","plan":"<plan>","project":"<project>"}`. Compaction replaces history with bounded summaries and does not alter tracker, scope, claim, or acceptance state.
