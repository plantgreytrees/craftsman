---
area: landing
governs: ["scripts/repo-exec.mjs", "scripts/lib/land.mjs", "scripts/workspace-init.mjs", "scripts/plan-graph.mjs", "scripts/lib/plan-submodules.mjs", "commands/merge.md", "commands/workspace-init.md", "scripts/worktree-sweep.mjs"]
human: docs/architecture/landing.md
source: docs/ideas/autonomous-e2e-loop.md
verified_at: ac57d0e891bc7343dcb07f174e179ab8f1fd68c9
updated: 2026-10-18
---
# ARCH landing — enforced rules

- **ARCH-LAND-01** [decided] /auto is standing approval to commit, branch, merge base in, push, land and clean up worktrees/branches in every registered project — check: auto.md, merge.md — cite: commands/merge.md:89-94
- **ARCH-LAND-02** [superseded by ARCH-LAND-08]
- **ARCH-LAND-03** [decided] A parent's submodule pointer bump MUST be an explicit parent unit after the submodule unit lands; repo-exec stays single-repo — check: plan-submodules.test.mjs — cite: scripts/lib/plan-submodules.mjs:1-89
- **ARCH-LAND-04** [superseded by ARCH-LAND-07]
- **ARCH-LAND-07** [decided] Only registered projects are touched; submodules come only from gitlinks (mode 160000, `git ls-files -s`) in a registered root's index, plus a refuse-only read of the workspace-root index; never by scanning directories — check: plan-submodules + plan-graph tests — cite: scripts/lib/plan-submodules.mjs:11-47
- **ARCH-LAND-05** [decided] /auto MUST NOT use --force, push -f, reset --hard or worktree remove --force; pre-guard blocks them under /auto — check: pre-guard.test.mjs — cite: scripts/pre-guard.mjs:180-196
- **ARCH-LAND-06** [decided] Conflicts, ff-only failures, rejected pushes and pr auto-merge errors PARK with a Phase C decision; nothing else stops landing — check: repo-exec errors — cite: scripts/repo-exec.mjs:222-251
- **ARCH-LAND-08** [superseded by ARCH-LAND-18] Units land by repo-exec merge onto their target (base or feature/<plan>-<id>) in plan-graph order; a finished feature lands by repo-exec land-feature (detached temp worktree, base merged in, gate re-run, --no-ff, push; feature lock, then base) — check: repo-exec.test — cite: scripts/repo-exec.mjs:278-310
- **ARCH-LAND-09** [decided] A feature branch is pushed at creation, never inferred as base, never swept — check: repo-exec, sweep tests — cite: scripts/repo-exec.mjs:31
- **ARCH-LAND-10** [decided] Feature landing ships only after a spike shows feature merge, sync, land-feature, a conflict park and a sparing sweep — check: spike evidence — cite: docs/architecture/engine.rules.md:12
- **ARCH-LAND-11** [decided] A submodule bump shares its submodule steps' feature — check: plan-submodules.test — cite: scripts/lib/plan-submodules.mjs:73-86
- **ARCH-LAND-12** [decided] pr mode: unit PRs → feature; one feature PR → base — check: repo-exec.test — cite: scripts/repo-exec.mjs:347-379
- **ARCH-LAND-13** [decided] A feature session owns exactly one long-lived worktree: repo-exec prepare {slug "<plan>-<id>", branch feature/<plan>-<id>} under <main checkout>/.worktrees, anchored at the main checkout root and never at the session's linked .claude/worktrees directory; every unit of the feature reattaches to it, and .claude/worktrees/ is gitignored — check: repo-exec.test.mjs reattach and linked-worktree anchoring — cite: scripts/repo-exec.mjs:44-56
- **ARCH-LAND-14** [decided] A unit lands by repo-exec land-unit inside the feature worktree: gate re-run, feature branch checked out, merge --no-ff of the unit branch, feature branch pushed, unit branch deleted; a conflict PARKs (ARCH-LAND-06) and a PARKED or BLOCKED unit keeps its branch and leaves the feature branch checked out clean for the next smoke gate — check: repo-exec.test.mjs land-unit cases — cite: scripts/repo-exec.mjs:196-259
- **ARCH-LAND-15** [decided] A wave unit (ARCH-ENGINE-16) runs in a short-lived worktree branched from the feature branch, lands back through land-unit and is removed at once; the feature keeps its single long-lived worktree — check: repo-exec.test.mjs wave worktree cleanup — cite: scripts/repo-exec.mjs:392-416
- **ARCH-LAND-16** [decided] Feature prepare refuses while the plan doc or its parent chain differs from origin/<base>; generated rollups are excluded because every tracker transition rewrites them locally; /orchestrate Phase A lands the plan docs through /craftsman:merge first, and a mid-run plan amendment trips the gate again at the next prepare — check: repo-exec.test.mjs plan-gate refusal — cite: scripts/repo-exec.mjs:126-156
- **ARCH-LAND-17** [decided] publish's push (ARCH-TRACKER-11) is governed by config tracker.publish off|push (default push, also outside /auto), limited to generated pathspecs and a plain push under the force block; a protected base logs tracker_publish_rejected and continues; this authority is separate from ARCH-LAND-01 — check: pre-guard.test.mjs force block, tracker.test.mjs — cite: scripts/lib/force-block.mjs:1
- **ARCH-LAND-18** [decided] A unit lands by repo-exec land-unit inside its feature's worktree onto feature/<plan>-<id> (ARCH-LAND-14), in plan-graph order; a finished feature lands by repo-exec land-feature (detached temp worktree, base merged in, gate re-run, --no-ff, push; feature lock, then base) — check: repo-exec.test land-unit and land-feature cases — cite: scripts/repo-exec.mjs:278-310
