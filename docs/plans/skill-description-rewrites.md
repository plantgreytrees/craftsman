---
slug: skill-description-rewrites
goal: The three loop-discipline skills (systematic-debugging, test-driven-development, verification-before-completion) each fire in at least 2 of 3 eval runs after one description rewrite and pass a held-out check, or are removed with every trace.
level: feature
priority: P2
idea: docs/ideas/skill-description-rewrites.md
classification: in-scope  # architected idea (status architected); rules docs/architecture/evals.rules.md ARCH-EVALS-01,02,04,05,06,08,09,10 and docs/architecture/slim.rules.md ARCH-SLIM-08,18,19
tracker_rows: [sdr-ceiling, sdr-test-derive, sdr-rewrite, sdr-outcome]
guards:
  blast_radius: done
  completeness_sweep: done
  blind_rederivation: skipped(config:never — craftsman.config.json:164)
coverage:
  contract:      N/A(no exported API or type; skills are loaded by Claude Code by name — consumers of the skill names listed in CONSUMERS)
  data:          N/A(no persistence; eval results and held-out cases are local, git-ignored files under evals/results/ and .craftsman/)
  config:        N/A(no config key; no `when_to_use`, no cap raised — owner decision, ARCH-EVALS-09)
  security:      1.2 | 3.3 (no tool grants beyond Skill and, only if the case design is fixed, Read/Glob/Grep; no --trust-plugin, --allow-tools, --scaffold or --allow-real-servers; --no-publish keeps reports local — ARCH-EVALS-05)
  tests:         2.1 | 2.2 | 2.3 | 4.2 (evals.test.mjs derives required skills from skills/ test-first; skills-vendored, descriptions and doc-size-policy stay green)
  observability: 1.2 | 1.4 | 3.4 | 3.6 (every paid run's per-case score and cost recorded as tracker evidence) | 4.4 (CHANGELOG Evals line — ARCH-EVALS-06/09, ARCH-SLIM-18)
  interface:     N/A(no UI; the user-visible surface is which skills ship and their listing descriptions — 3.2)
  docs:          4.3 | 4.4 (README Layout line follows the kept set; CHANGELOG [Unreleased])
  rollback:      see Risk & rollback
units:
  - id: sdr-ceiling
    scope_id: sdr-ceiling
    project: .
    depends_on: []
    module: skills/systematic-debugging (temporary), evals/skill-fires-{systematic-debugging,test-driven-development,verification-before-completion} (only if the case design is fixed)
    language: Markdown (SKILL.md frontmatter, claude plugin eval case files)
    security: normal
    scope:
      read: [skills/systematic-debugging/SKILL.md, evals/skill-fires-systematic-debugging/prompt.md, evals/skill-fires-test-driven-development/prompt.md, evals/skill-fires-verification-before-completion/prompt.md, scripts/evals.test.mjs]
      docs: [docs/architecture/evals.rules.md, docs/architecture/slim.rules.md]
      write: [skills/systematic-debugging/SKILL.md, evals/skill-fires-systematic-debugging/**, evals/skill-fires-test-driven-development/**, evals/skill-fires-verification-before-completion/**]
    arch: [ARCH-EVALS-01, ARCH-EVALS-02, ARCH-EVALS-05, ARCH-EVALS-09, ARCH-SLIM-19]
    tooling: { implementer: root (runs paid `claude plugin eval` invocations; never a fresh implementer agent), gates: [], skills: [verification-before-completion], guards: [], mcp: [] }
  - id: sdr-test-derive
    scope_id: sdr-test-derive
    project: .
    depends_on: [sdr-ceiling]
    module: scripts/evals.test.mjs, scripts/skills-vendored.test.mjs, evals/skill-fires-*/prompt.md (citation only)
    language: JavaScript (Node ESM, node:test) + Markdown
    security: normal
    scope:
      read: [scripts/evals.test.mjs, scripts/skills-vendored.test.mjs, evals/skill-fires-deep-research/prompt.md, evals/skill-fires-systematic-debugging/prompt.md, evals/skill-fires-test-driven-development/prompt.md, evals/skill-fires-verification-before-completion/prompt.md]
      docs: [docs/architecture/evals.rules.md, docs/architecture/slim.rules.md]
      write: [scripts/evals.test.mjs, scripts/skills-vendored.test.mjs, evals/skill-fires-deep-research/prompt.md, evals/skill-fires-systematic-debugging/prompt.md, evals/skill-fires-test-driven-development/prompt.md, evals/skill-fires-verification-before-completion/prompt.md]
    arch: [ARCH-EVALS-01, ARCH-EVALS-02, ARCH-EVALS-04, ARCH-EVALS-05, ARCH-EVALS-08, ARCH-SLIM-19]
    tooling: { implementer: root, gates: [], skills: [test-driven-development], guards: [], mcp: [] }
  - id: sdr-rewrite
    scope_id: sdr-rewrite
    project: .
    depends_on: [sdr-test-derive]
    module: skills/{systematic-debugging,test-driven-development,verification-before-completion}/SKILL.md (description line only)
    language: Markdown (SKILL.md frontmatter)
    security: normal
    scope:
      read: [skills/systematic-debugging/SKILL.md, skills/test-driven-development/SKILL.md, skills/verification-before-completion/SKILL.md, evals/skill-fires-systematic-debugging/prompt.md, evals/skill-fires-test-driven-development/prompt.md, evals/skill-fires-verification-before-completion/prompt.md, scripts/descriptions.test.mjs, scripts/skills-vendored.test.mjs]
      docs: [docs/architecture/evals.rules.md, docs/architecture/slim.rules.md]
      write: [skills/systematic-debugging/SKILL.md, skills/test-driven-development/SKILL.md, skills/verification-before-completion/SKILL.md, .craftsman/heldout-evals/**, heldout-evals/**]
    arch: [ARCH-EVALS-05, ARCH-EVALS-09, ARCH-SLIM-18, ARCH-SLIM-19]
    tooling: { implementer: root (runs paid `claude plugin eval` invocations; never a fresh implementer agent), gates: [], skills: [verification-before-completion], guards: [], mcp: [] }
  - id: sdr-outcome
    scope_id: sdr-outcome
    project: .
    depends_on: [sdr-rewrite]
    module: removal of any skill not kept (ARCH-EVALS-10), README.md, CHANGELOG.md
    language: Markdown + JavaScript (Node ESM)
    security: normal
    scope:
      read: [scripts/doc-size-policy.mjs, scripts/skills-vendored.test.mjs, scripts/changelog.test.mjs, README.md, CHANGELOG.md]
      docs: [docs/architecture/evals.rules.md, docs/architecture/slim.rules.md]
      write: [skills/systematic-debugging/**, skills/test-driven-development/**, skills/verification-before-completion/**, evals/skill-fires-systematic-debugging/**, evals/skill-fires-test-driven-development/**, evals/skill-fires-verification-before-completion/**, scripts/doc-size-policy.mjs, scripts/skills-vendored.test.mjs, README.md, CHANGELOG.md]
    arch: [ARCH-EVALS-06, ARCH-EVALS-08, ARCH-EVALS-10, ARCH-SLIM-08, ARCH-SLIM-18, ARCH-SLIM-19]
    tooling: { implementer: root, gates: [], skills: [verification-before-completion], guards: [], mcp: [] }
---

# Plan: Make the three never-firing vendored skills fire, or remove them

The first behaviour-eval run (CHANGELOG.md:14) scored `systematic-debugging`, `test-driven-development` and `verification-before-completion` 0/3. Under ARCH-EVALS-09 each gets one honest description rewrite, gated by a ceiling run first and a held-out check after; a skill that does not pass is removed with every trace (ARCH-EVALS-10). Removal is a success outcome.

Every paid run is one `claude plugin eval .` invocation from the unit's worktree with `--ablation none --max-cost-usd 5 --no-publish` (ARCH-EVALS-05), run by root, never with `--trust-plugin`. A trust refusal (exit 1 asking to confirm) → stop BLOCKED ON USER: the owner runs `claude plugin eval <worktree>` once in a terminal. Each invocation's per-case scores and reported cost go into that unit's tracker `evidence`.

### Step 1 — sdr-ceiling (., Markdown, normal)
Tooling: implementer root · gates none · skills verification-before-completion · guards none
Depends on: none
- [ ] 1.1 In the worktree, temporarily replace `skills/systematic-debugging/SKILL.md`'s `description:` with the case prompt's key words (evals/skill-fires-systematic-debugging/prompt.md: "Use when customers report a bug such as a wrong checkout total and you need help to fix this bug.") → accept: `git diff` shows only that one line changed.
- [ ] 1.2 Run `claude plugin eval . --case skill-fires-systematic-debugging --ablation none --max-cost-usd 5 --no-publish` once → accept: one invocation; its score (n/3) and cost are in the tracker evidence as `ceiling`.
- [ ] 1.3 Revert the description (`git checkout -- skills/systematic-debugging/SKILL.md`) → accept: `git diff --quiet -- skills/` exits 0; nothing from 1.1 is committed.
- [ ] 1.4 Only if 1.2 scored 0/3: fix the case design once for the three loop-discipline cases — a small fixture folder per case named by `case.yaml` `context.add_dirs` (e.g. a `checkout.js` with the rounding bug, a `utils.js` without `slugify`, a CSV-export module with a test file) and `allowed_tools: [Skill, Read, Glob, Grep]`, `max_turns` unchanged — then re-baseline with one invocation `claude plugin eval . --case 'skill-fires-*' --ablation none --max-cost-usd 5 --no-publish` on the original descriptions; commit the case changes → accept: `node --test scripts/evals.test.mjs` exits 0; tracker evidence records the re-baseline per case. If 1.2 scored ≥1/3 → record `case design kept` and commit nothing.

### Step 2 — sdr-test-derive (., JavaScript, normal)
Tooling: implementer root · gates none · skills test-driven-development · guards none
Depends on: sdr-ceiling
- [ ] 2.1 Test first: add a fixture test to `scripts/evals.test.mjs` that deletes one skill's `skills/<name>/` and its `evals/skill-fires-<name>/` case from the temp fixture and expects `checkEvals` to return `[]` → accept: it fails against the current `NAMED_SKILLS` union (scripts/evals.test.mjs:121) with "missing firing case".
- [ ] 2.2 Make `required` the `skills/` directories minus `EXEMPT_SKILLS` only; delete `NAMED_SKILLS`; the fixtures build skills from a local list that names `deep-research` plus synthetic names (never the three loop-discipline skills, so a removal leaves no trace — ARCH-EVALS-10); move the `systematic-debugging` wrong-skill grader fixture (scripts/evals.test.mjs:298) to a synthetic name; relabel ARCH-EVALS-03 → 08 and the `runs` message's ARCH-EVALS-07 → 09 → accept: `node --test scripts/evals.test.mjs` exits 0 and `grep -c "systematic-debugging\|test-driven-development\|verification-before-completion" scripts/evals.test.mjs` prints 0.
- [ ] 2.3 Relabel the four `evals/skill-fires-*/prompt.md` `description:` citations from ARCH-EVALS-03 to ARCH-EVALS-08, and `scripts/skills-vendored.test.mjs`'s header from ARCH-SLIM-11 to ARCH-SLIM-19 → accept: `grep -rn "ARCH-EVALS-03\|ARCH-EVALS-07\|ARCH-SLIM-11" scripts/evals.test.mjs scripts/skills-vendored.test.mjs evals/` prints nothing; `node --test scripts/*.test.mjs scripts/lib/*.test.mjs` exits 0.

### Step 3 — sdr-rewrite (., Markdown, normal)
Tooling: implementer root · gates none · skills verification-before-completion · guards none
Depends on: sdr-test-derive
- [ ] 3.1 Before any rewrite, write the held-out set: per skill two fresh paraphrases (a different scenario and wording from its committed case prompt) and one should-not-fire near-miss (e.g. "rename this variable" for TDD), as `prompt.md` + `graders/skill-fired.md` cases (same shape as evals/skill-fires-*: `runs: 3`, `max_turns: 4`, `allowed_tools: [Skill]`, `tool_used` grader on Skill) under `.craftsman/heldout-evals/` (git-ignored by `.gitignore:2`) → accept: 9 cases exist there; `git status --short` shows none of them.
- [ ] 3.2 Rewrite each of the three `description:` lines once, imperative "Use when…" user-intent form, never copying the committed case prompt's words: systematic-debugging ≤ 105 chars, test-driven-development ≤ 107, verification-before-completion ≤ 92 (each ≤ 110 and current length + 29, so the combined rise stays ≤ 88 under MAX_TOTAL 4500) → accept: `node --test scripts/descriptions.test.mjs scripts/skills-vendored.test.mjs` exits 0.
- [ ] 3.3 Commit the three description lines (the one rewrite; no second attempt under any score) → accept: `git diff HEAD~1 --stat` lists only the three SKILL.md files, one line each.
- [ ] 3.4 Run `claude plugin eval . --case 'skill-fires-*' --ablation none --max-cost-usd 5 --no-publish` once → accept: tracker evidence records each skill's `after` score (n/3) and cost.
- [ ] 3.5 Run the held-out set once from an untracked copy at the worktree root (the eval writes `<eval-dir>/results/`, and pre-guard blocks writes under `.craftsman/`): `claude plugin eval . --eval-dir heldout-evals --ablation none --max-cost-usd 5 --no-publish`, then delete `heldout-evals/` → accept: tracker evidence records each paraphrase and near-miss score and the cost; the held-out cases are never committed.
- [ ] 3.6 Decide per skill: KEEP only at after ≥ 2/3, each paraphrase ≥ 2/3 and near-miss ≤ 1/3; else REMOVE → accept: tracker evidence lists KEEP/REMOVE per skill with the numbers that decided it.

### Step 4 — sdr-outcome (., Markdown + JavaScript, normal)
Tooling: implementer root · gates none · skills verification-before-completion · guards none
Depends on: sdr-rewrite
- [ ] 4.1 For each REMOVE skill, in one commit: delete `skills/<name>/` and `evals/skill-fires-<name>/`, its FILE_CAPS entry (scripts/doc-size-policy.mjs:78-80), its entry in `SKILLS` (scripts/skills-vendored.test.mjs:10; if the list empties, the file goes too) — scripts/evals.test.mjs names no loop-discipline skill after 2.2, so it is not edited — never wiring the skill into a command or agent (ARCH-EVALS-10) → accept: `git grep -n "<name>" -- . ':!CHANGELOG.md' ':!docs/'` prints nothing for each removed name.
- [ ] 4.2 Full checks, plus `node scripts/stats.mjs` block rates before and after the removal for ARCH-SLIM-18 evidence → accept: `node --test scripts/*.test.mjs scripts/lib/*.test.mjs` exits 0; block rates are in the tracker evidence; `node scripts/doc-size-policy.mjs` and `node <plugin>/scripts/arch-check.mjs lint` pass.
- [ ] 4.3 README.md:564 Layout line lists exactly the kept loop-discipline skills (the line goes if none is kept) → accept: README names no removed skill.
- [ ] 4.4 Edit the existing Behaviour evals bullet (CHANGELOG.md:13-14) — one entry per feature area — to cite ARCH-EVALS-08..10 and add one `Rewrites:` line with, per skill, baseline 0/3, ceiling (or `n/a`), after, paraphrase 1/2, near-miss and KEEP/REMOVE, plus total cost → accept: `node --test scripts/changelog.test.mjs` exits 0 ([Unreleased] ≤ 8 KB; 7,262 bytes before this task).

## Sequencing
The ceiling run goes first because it decides whether rewriting can help at all (ARCH-EVALS-09 step 1); a 0/3 there fixes the case design before any wording is touched. The test derive lands before any removal so removing a skill needs no test edit beyond its own entries. The held-out set is written before the rewrite so the paraphrases cannot shape the wording. Removal and the CHANGELOG come last because both depend on measured scores.

## Verification background   (citations — for the reviewer, not the executor)
- Baseline 0/3 for all three: CHANGELOG.md:14 (2026-11-24, $1.56 for 15 runs, ≈ $0.10 per run).
- `claude plugin eval` 2.1.332: `--case <glob>`, `--eval-dir <dir>` ("directory name below the plugin … results go to <plugin>/<dir>/results/"), first run in an untrusted directory asks to confirm (`claude plugin eval --help`). Held-out runs use the same plugin directory as the after-run, so trust is unchanged.
- `.craftsman/` is git-ignored (.gitignore:2), so `.craftsman/heldout-evals/` and its `results/` never reach a commit.
- Caps: per-skill description ≤ 110 (scripts/skills-vendored.test.mjs:16); total ≤ 4500, 4,412 measured (scripts/descriptions.test.mjs:17); current lengths 76/78/63 (skills/*/SKILL.md:3).
- [Unreleased] is 7,262 bytes against the 8 KB cap (ARCH-SLIM-08, scripts/changelog.test.mjs).
- Paid budget: ceiling 3 runs; optional re-baseline 12; after 12; held-out 27 → at most ≈ 54 runs ≈ $5.60 across four invocations, each capped at $5.
- CONSUMERS (who names the three skills; each must change on removal):
  - `skills/<name>/SKILL.md` — loaded by Claude Code by name; no command, agent, workflow or hook names them (idea doc, Proposal).
  - `evals/skill-fires-<name>/prompt.md`, `graders/skill-fired.md` — the case (ARCH-EVALS-08).
  - `scripts/evals.test.mjs:16,298` — removed by 2.2.
  - `scripts/skills-vendored.test.mjs:10` — `SKILLS` list (ARCH-SLIM-19 check).
  - `scripts/doc-size-policy.mjs:78-80` — FILE_CAPS (ARCH-SLIM-01).
  - `README.md:564` — Layout line.
  - `CHANGELOG.md:14,73` and `docs/` — history; stays.

## Risk & rollback
Shipped behaviour changes only in which skills ship and how their descriptions read. Risks: overfitting to one prompt (held-out check), over-firing on every coding request (near-miss check), n=3 noise (recorded, the threshold is fixed by ARCH-EVALS-09), paid runs (each invocation capped at $5). Rollback: `git revert` of the rewrite and removal commits restores the skills and their cases.

## Out of scope
A second rewrite; `when_to_use`; raising MAX_TOTAL or the 110-char cap; committed should-not-fire cases; wiring any skill into a command or agent; a CI eval job; rewriting `deep-research` (it passes 3/3 and is linked from commands/understand.md:13); the unused plan-template `skills:` field.
