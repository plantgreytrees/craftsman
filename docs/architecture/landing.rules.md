---
area: landing
governs: ["scripts/repo-exec.mjs", "scripts/lib/land.mjs", "scripts/workspace-init.mjs", "scripts/plan-graph.mjs", "scripts/lib/plan-submodules.mjs", "commands/merge.md", "commands/workspace-init.md"]
human: docs/architecture/landing.md
source: docs/ideas/autonomous-e2e-loop.md
verified_at: 256913f42d004100f55ed7bc1115c151b8d9466f
updated: 2026-10-09
---
# ARCH landing — enforced rules

- **ARCH-LAND-01** [decided] Invoking /auto is standing approval to commit, branch, merge base in, push, land and clean up worktrees and branches across every registered project — check: auto.md + merge.md — cite: commands/merge.md:89-94
- **ARCH-LAND-02** [decided] Every repo lands through its own repo-exec merge (direct | pr) in plan-graph order — check: plan dry-run order — cite: scripts/repo-exec.mjs:186-259
- **ARCH-LAND-03** [decided] A parent repo's submodule pointer bump MUST be an explicit dependent unit in the parent, after the submodule unit lands; repo-exec stays single-repo — check: plan dry-run contains the bump unit; plan-submodules.test.mjs cases — cite: scripts/lib/plan-submodules.mjs:1-89
- **ARCH-LAND-04** [decided] Only registered workspace projects are touched; submodules are found only via git submodule status on registered roots, never by scanning — check: grep for directory walks — cite: scripts/lib/core.mjs:90-130
- **ARCH-LAND-05** [decided] /auto MUST NOT use --force, -f on push, reset --hard or worktree remove --force; pre-guard blocks them while /auto is active — check: pre-guard.test.mjs — cite: scripts/pre-guard.mjs:178-194
- **ARCH-LAND-06** [decided] Merge conflicts, ff-only failures, rejected pushes and pr auto-merge errors PARK the unit with a decision for Phase C; nothing else stops landing — check: repo-exec error paths — cite: scripts/repo-exec.mjs:222-251
