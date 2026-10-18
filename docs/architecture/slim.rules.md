---
area: slim
governs: ["commands/**", "agents/**", "skills/**", "scripts/doc-size-policy.mjs", "scripts/descriptions.test.mjs", "CHANGELOG.md"]
human: docs/architecture/slim.md
source: docs/ideas/feature-branch-plans.md
verified_at: 9c4f8f4658784069efa875aad4d010d2e92376a2
updated: 2026-10-18
---
# ARCH slim — enforced rules

- **ARCH-SLIM-01** [decided] Every shipped .md a command or the harness can load (commands, _* shared docs, agents, SKILL.md, skill references) has a byte cap in doc-size-policy.mjs; an unmatched file is a failure, not a skip — check: doc-size-policy in init --update and CI — cite: scripts/doc-size-policy.mjs:47-61
- **ARCH-SLIM-02** [decided] Caps ratchet: each cap is the file's size when set and may only be lowered; raising one needs a rule amendment that lowers another file read in the same invocation by at least as much — check: budget diff in review — cite: scripts/doc-size-policy.mjs:21-33
- **ARCH-SLIM-03** [decided] Load is also capped per invocation: a command's bytes plus every shared doc it reads unconditionally; doc-size-policy reports and caps the total per command — check: doc-size-policy per-invocation table — cite: commands/orchestrate.md:14
- **ARCH-SLIM-04** [decided] Detail that applies only under a config or plan condition lives in a reference doc read at the point of need, never in the always-read body — check: Read placement review — cite: commands/_shared-execution.md:5
- **ARCH-SLIM-05** [decided] Duplicate prose is removed in this order: delete what a hook or script enforces; else move it into a doc the command already reads; never into a newly loaded doc. Call-site directives kept on purpose are asserted in a test — check: wiring.test.mjs prose assertions — cite: scripts/wiring.test.mjs:152-160
- **ARCH-SLIM-06** [decided] A MUST sentence may leave a command or agent only when a hook or script enforces it or a test asserts its replacement; a trim keeps the suite, doc-size-policy and descriptions.test green and reports stats.mjs block rates before and after — check: PR evidence — cite: scripts/stats.mjs:59-66
- **ARCH-SLIM-07** [decided] Scripts have no hard byte cap: CI warns when the scripts/ source total grows, and hook latency (quality gate, pre-guard, stop-gate p50/p95 in stats.mjs) is the hard budget under hooks.json timeouts — check: stats latency section — cite: scripts/stats.mjs:34-51
- **ARCH-SLIM-08** [decided] CHANGELOG.md [Unreleased] stays under 8 KB; a release is cut before it grows past that — check: changelog size test — cite: CHANGELOG.md:6
- **ARCH-SLIM-09** [decided] New behaviour is a role in an existing agent, not a new agent, unless its description fits the descriptions.test total without raising it — check: descriptions.test.mjs — cite: scripts/descriptions.test.mjs:13-16
