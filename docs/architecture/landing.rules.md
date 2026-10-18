---
area: landing
governs: ["scripts/repo-exec.mjs", "scripts/lib/land.mjs", "scripts/workspace-init.mjs", "scripts/plan-graph.mjs", "scripts/lib/plan-submodules.mjs", "commands/merge.md", "commands/workspace-init.md"]
human: docs/architecture/landing.md
source: docs/ideas/autonomous-e2e-loop.md
verified_at: 8dd9488dfea500934c30c0df39f3ca2b735bf21a
updated: 2026-10-09
---
# ARCH landing — enforced rules

- **ARCH-LAND-01** [decided] Invoking /auto is standing approval to commit, branch, merge base in, push, land and clean up worktrees and branches across every registered project — check: auto.md + merge.md — cite: commands/merge.md:89-94
- **ARCH-LAND-02** [decided] Every repo lands through its own repo-exec merge (direct | pr) in plan-graph order — check: plan dry-run order — cite: scripts/repo-exec.mjs:186-259
- **ARCH-LAND-03** [decided] A parent repo's submodule pointer bump MUST be an explicit dependent unit in the parent, after the submodule unit lands; repo-exec stays single-repo — check: plan dry-run contains the bump unit; plan-submodules.test.mjs cases — cite: scripts/lib/plan-submodules.mjs:1-89
- **ARCH-LAND-04** [superseded by ARCH-LAND-07] Only registered workspace projects are touched; submodules are found only via git submodule status on registered roots, never by scanning — check: grep for directory walks — cite: scripts/lib/core.mjs:90-130
- **ARCH-LAND-07** [decided] Only registered workspace projects are touched; submodules are found only from the gitlinks (mode 160000, `git ls-files -s`) in the index of a registered root, plus a read-only check of the workspace root's index whose only effect is to refuse the plan; never by scanning directories — check: plan-submodules.test.mjs gitlink cases; plan-graph.test.mjs unknown-project case; grep for directory walks — cite: scripts/lib/plan-submodules.mjs:11-47
- **ARCH-LAND-05** [decided] /auto MUST NOT use --force, -f on push, reset --hard or worktree remove --force; pre-guard blocks them while /auto is active — check: pre-guard.test.mjs — cite: scripts/pre-guard.mjs:178-194
- **ARCH-LAND-06** [decided] Merge conflicts, ff-only failures, rejected pushes and pr auto-merge errors PARK the unit with a decision for Phase C; nothing else stops landing — check: repo-exec error paths — cite: scripts/repo-exec.mjs:222-251
- **ARCH-LAND-13** [decided] A feature session owns exactly one long-lived worktree: repo-exec prepare {slug "<plan>-<id>", branch feature/<plan>-<id>} under <main checkout>/.worktrees, anchored at the main checkout root and never at the session's linked .claude/worktrees directory; every unit of the feature reattaches to it, and .claude/worktrees/ is gitignored — check: repo-exec.test.mjs reattach and linked-worktree anchoring — cite: scripts/repo-exec.mjs:44-56
- **ARCH-LAND-14** [decided] A unit lands by repo-exec land-unit inside the feature worktree: gate re-run, feature branch checked out, merge --no-ff of the unit branch, feature branch pushed, unit branch deleted; a conflict PARKs (ARCH-LAND-06) and a PARKED or BLOCKED unit keeps its branch and leaves the feature branch checked out clean for the next smoke gate — check: repo-exec.test.mjs land-unit cases — cite: scripts/repo-exec.mjs:196-259
- **ARCH-LAND-15** [decided] A wave unit (ARCH-ENGINE-16) runs in a short-lived worktree branched from the feature branch, lands back through land-unit and is removed at once; the feature keeps its single long-lived worktree — check: repo-exec.test.mjs wave worktree cleanup — cite: scripts/repo-exec.mjs:392-416
- **ARCH-LAND-16** [decided] Feature prepare refuses while the plan doc, its parent chain or its rollups differ from origin/<base>; /orchestrate Phase A lands them through /craftsman:merge first, and a mid-run plan amendment trips the gate again at the next prepare — check: repo-exec.test.mjs plan-gate refusal — cite: scripts/repo-exec.mjs:126-127
- **ARCH-LAND-17** [decided] publish's push (ARCH-TRACKER-11) is governed by config tracker.publish off|push (default push, also outside /auto), limited to generated pathspecs and a plain push under the force block; a protected base logs tracker_publish_rejected and continues; this authority is separate from ARCH-LAND-01 — check: pre-guard.test.mjs force block, tracker.test.mjs — cite: scripts/lib/force-block.mjs:1
