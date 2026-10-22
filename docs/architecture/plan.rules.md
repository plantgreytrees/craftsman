---
area: plan
governs: ["scripts/lib/plan-index.mjs", "commands/plan.md", "commands/orchestrate.md", "commands/instruction.md", "skills/language-aware-planning/references/plan-template.md", "scripts/init.mjs"]
human: docs/architecture/plan.md
source: docs/ideas/plan-hierarchy.md
verified_at: bc8c6e5f577f3f6e11f2b7ade0fa5ae4b7a8aee3
updated: 2026-10-18
---
# ARCH plan — enforced rules

- **ARCH-PLAN-01** [decided] Plan docs form epic > story > feature > unit: `level:` is epic|story|feature (absent = feature); an epic is a thin doc with no units; a story is a plan doc whose `features:` groups are its features; a feature is a `features:` group (branch feature/<plan>-<id>) or, in a plan without `features:`, the whole plan as one implicit feature (id = slug); `parent:` (slug or docs/plans path) points a story or a feature-level plan to its epic; one shape per level, `parent: <story>` on a separate plan is refused — check: plan-index.test.mjs — cite: skills/language-aware-planning/references/plan-template.md:13-49
- **ARCH-PLAN-02** [decided] scripts/lib/plan-index.mjs is the only parser of docs/plans frontmatter for hierarchy: it refuses a dangling or cyclic `parent:`, a parent of the wrong level and a `children:` list that disagrees with the children's `parent:`; a scrutinise-/investigate- doc's `parent:` is its source plan and inherits that plan's level and feature; arch-check lint runs it — check: plan-index.test.mjs, arch-check.test.mjs — cite: scripts/arch-check.mjs:193-227
- **ARCH-PLAN-03** [decided] /orchestrate and /auto accept `--level epic|story|feature|unit` (default feature) and `--feature <id>`; a parent slug resolves through plan-index to its children in `children:` order, else priority then slug; the default on a story runs one feature (the first with open rows and no live feature claim) and stops, `--level story|epic` runs the whole subtree, `unit` is `--step` — check: auto-command.test.mjs — cite: commands/orchestrate.md:16-23
- **ARCH-PLAN-04** [decided] No migration rewrites a plan: /init --update and /upgrade stamp `level: feature` into canonical docs only, never touch scope_id or the hand-written tracker rows of legacy plans, and an unstamped plan means feature — check: init.test.mjs — cite: scripts/init.mjs:281-317
- **ARCH-PLAN-05** [decided] `priority: P0|P1|P2|P3` (default P2) is a plan property inherited from `parent:`; `execution.maxSessions` (default 1) is reserved for a future ready/queue script and is never read by the mod — check: plan-index.test.mjs — cite: scripts/lib/core.mjs:753
- **ARCH-PLAN-06** [decided] Every command and hook that takes a slug (/plan, /orchestrate, /auto, /instruction, /digest, /focus, session-context, the auto stop rule and runner-grant sizing) resolves it through plan-index; /instruction's goal text names the level, the feature and the wave allowance (ARCH-ENGINE-16) — check: auto-command.test.mjs, core.test.mjs descendant rows — cite: commands/instruction.md:55-58
