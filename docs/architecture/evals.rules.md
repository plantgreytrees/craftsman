---
area: evals
governs: ["evals/**", "scripts/evals.test.mjs"]
human: docs/architecture/evals.md
source: docs/ideas/plugin-behaviour-evals.md
verified_at: 1d354084927c910ef863f1e1d1c94bafc140a231
updated: 2026-11-24
---
# ARCH evals — enforced rules

- **ARCH-EVALS-01** [decided] Behaviour evals MUST run on first-party `claude plugin eval` with cases under evals/ as prompt.md plus graders/*.md; a case.yaml is allowed only for `context` fields and MUST NOT carry `graders`; no third-party harness, npm dependency or `experimental.evals` manifest key — check: evals.test.mjs walks evals/ for only those files and rejects a `graders:` key in case.yaml; plugin.json has no `experimental` or `dependencies` key — cite: docs/architecture/evals.rules.md:11, docs/architecture/slim.rules.md:25
- **ARCH-EVALS-02** [decided] Every grader MUST be deterministic: type tool_used, tool_order, file_exists or regex; no llm or baseline grader — check: evals.test.mjs fails on any other `type:` in graders/*.md frontmatter — cite: docs/architecture/evals.rules.md:12
- **ARCH-EVALS-03** [decided] The suite MUST hold one case named skill-fires-<name> with a `tool_used: Skill` grader for test-driven-development, systematic-debugging, verification-before-completion and deep-research, and for every skill added under skills/ later — check: evals.test.mjs maps each required skill to its case — cite: docs/architecture/evals.rules.md:13
- **ARCH-EVALS-04** [decided] The suite MUST hold exactly one hook smoke case, tagged `hook`: it asks Claude to quote the `craftsman guards:` line its SessionStart hook injects, graded by a regex on last_message, with no tool grants; guard behaviour itself stays covered by scripts/*.test.mjs and MUST NOT be re-tested in evals — check: evals.test.mjs counts cases tagged `hook` = 1 and finds no `allowed_tools` beyond read-only in it — cite: scripts/session-context.mjs:303
- **ARCH-EVALS-05** [decided] Every documented suite run MUST pass `--ablation none`, `--max-cost-usd 5` and `--no-publish` and grant only the tools a case exercises; results stay in evals/results/, which .gitignore MUST list — check: evals.test.mjs asserts the .gitignore line and all three flags in the README run command — cite: docs/architecture/evals.rules.md:15
- **ARCH-EVALS-06** [decided] The suite MUST be run, with each case's score recorded in the release's CHANGELOG entry, before the stable branch is moved (ARCH-MOD-06) and after any trim under ARCH-SLIM-18; when `claude plugin eval` is unavailable the entry records "Evals: unavailable" with the error and stable may still move; it MUST NOT run as a CI gate — check: .github/workflows/ci.yml has no `plugin eval`; each release entry carries an Evals line — cite: README.md:409-412
- **ARCH-EVALS-07** [decided] A skill that no command or agent names (by path or Skill call) and whose firing case passes fewer than 2 of 3 runs after two description rewrites MUST be named explicitly at the command or agent step that needs it, or removed from skills/ — check: eval report plus grep of commands/ and agents/ for the skill name — cite: docs/architecture/evals.rules.md:17
