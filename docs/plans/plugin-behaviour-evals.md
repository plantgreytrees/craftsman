---
slug: plugin-behaviour-evals
goal: A small deterministic `claude plugin eval` suite checks that craftsman's four unreferenced skills fire and its SessionStart hook reaches a live session, run by hand before moving stable and after trims.
level: feature
priority: P2
idea: docs/ideas/plugin-behaviour-evals.md
classification: in-scope  # architected idea (docs/ideas/plugin-behaviour-evals.md status architected); rules docs/architecture/evals.rules.md ARCH-EVALS-01..07, docs/architecture/slim.rules.md ARCH-SLIM-08/18
tracker_rows: [eval-spike, eval-suite, eval-run]
guards:
  blast_radius: done
  completeness_sweep: done
  blind_rederivation: skipped(config:never — craftsman.config.json:164)
coverage:
  contract:      N/A(no exported API, type or event changes; new files only, plus additive .gitignore/README/CHANGELOG lines — see CONSUMERS)
  data:          N/A(no persistence; eval results are local, git-ignored files — 1.2)
  config:        1.2 | 2.6 (.gitignore entry; the README run command and its flags; no craftsman.config.json key and no plugin.json key — ARCH-EVALS-01)
  security:      1.1 | 2.3 (no tool grants beyond read-only/Skill; no --trust-plugin, --scaffold or --allow-real-servers; reports kept local with --no-publish — ARCH-EVALS-05)
  tests:         2.1 | 2.2 (scripts/evals.test.mjs, test-first, with negative temp-dir fixtures; picked up by ci.yml:39)
  observability: 1.3 | 3.2 (measured cost per run recorded as tracker evidence; per-case scores in the CHANGELOG Evals line — ARCH-EVALS-06)
  interface:     2.6 (README run command; no UI)
  docs:          2.6 | 3.2 (README run command + Layout line; CHANGELOG [Unreleased])
  rollback:      see Risk & rollback
units:
  - id: eval-spike
    scope_id: eval-spike
    project: .
    depends_on: []
    module: evals/hook-guards-line, .gitignore
    language: Markdown (claude plugin eval case files)
    security: normal
    scope:
      read: [scripts/session-context.mjs, .gitignore]
      docs: [docs/architecture/evals.rules.md]
      write: [evals/hook-guards-line/prompt.md, evals/hook-guards-line/graders/guards-line.md, .gitignore]
    arch: [ARCH-EVALS-01, ARCH-EVALS-02, ARCH-EVALS-04, ARCH-EVALS-05]
    tooling: { implementer: root (runs a paid `claude plugin eval` probe; never a fresh implementer agent), gates: [], skills: [verification-before-completion], guards: [], mcp: [] }
  - id: eval-suite
    scope_id: eval-suite
    project: .
    depends_on: [eval-spike]
    module: scripts/evals.test.mjs, evals/skill-fires-*, README.md
    language: JavaScript (Node ESM, node:test) + Markdown
    security: normal
    scope:
      read: [evals/hook-guards-line/prompt.md, evals/hook-guards-line/graders/guards-line.md, .gitignore, .claude-plugin/plugin.json, scripts/skills-vendored.test.mjs, README.md]
      docs: [docs/architecture/evals.rules.md]
      write: [scripts/evals.test.mjs, evals/skill-fires-test-driven-development/prompt.md, evals/skill-fires-test-driven-development/graders/skill-fired.md, evals/skill-fires-systematic-debugging/prompt.md, evals/skill-fires-systematic-debugging/graders/skill-fired.md, evals/skill-fires-verification-before-completion/prompt.md, evals/skill-fires-verification-before-completion/graders/skill-fired.md, evals/skill-fires-deep-research/prompt.md, evals/skill-fires-deep-research/graders/skill-fired.md, README.md]
    arch: [ARCH-EVALS-01, ARCH-EVALS-02, ARCH-EVALS-03, ARCH-EVALS-04, ARCH-EVALS-05, ARCH-EVALS-07]
    tooling: { implementer: implementer, gates: [], skills: [test-driven-development], guards: [], mcp: [] }
  - id: eval-run
    scope_id: eval-run
    project: .
    depends_on: [eval-suite]
    module: CHANGELOG.md
    language: Markdown
    security: normal
    scope:
      read: [CHANGELOG.md, README.md, scripts/changelog.test.mjs]
      docs: [docs/architecture/evals.rules.md, docs/architecture/slim.rules.md]
      write: [CHANGELOG.md]
    arch: [ARCH-EVALS-05, ARCH-EVALS-06, ARCH-SLIM-08]
    tooling: { implementer: root (runs the one paid suite run), gates: [], skills: [verification-before-completion], guards: [], mcp: [] }
---

# Plan: Behaviour evals for craftsman's skills and hooks

## Outcome
A small deterministic `claude plugin eval` suite checks that craftsman's four unreferenced skills fire and its SessionStart hook reaches a live session, run by hand before moving `stable` and after trims.

## Scope Steps (executable core)

### Step 1 — eval-spike (., Markdown, normal)
Tooling: implementer root · gates none · skills verification-before-completion · guards none
Depends on: none
- [ ] 1.1 Write `evals/hook-guards-line/prompt.md`: frontmatter `name: hook-guards-line`, `tags: [hook]`, `runs: 3`, `max_turns: 3`, `allowed_tools: []`; prompt asks Claude to quote verbatim the line in its session context that begins `craftsman guards:` and use no tools → accept: file exists; frontmatter has `tags: [hook]` and no tool beyond the read-only set (ARCH-EVALS-04).
- [ ] 1.2 Write `evals/hook-guards-line/graders/guards-line.md` (`type: regex`, `target: last_message`, `pattern: "craftsman guards: on\\."`) and add `evals/results/` to `.gitignore` → accept: grader type is regex; `grep -qx 'evals/results/' .gitignore` exits 0 (ARCH-EVALS-02/05).
- [ ] 1.3 Run the probe once from the repo root: `claude plugin eval . --case hook-guards-line --runs 1 --ablation none --max-cost-usd 5 --no-publish`; record in the tracker row's `evidence` whether the regex matched and the reported cost per run → accept: evidence names PASS/FAIL and a dollar cost. If the run is refused by the trust prompt → stop BLOCKED ON USER (run `claude plugin eval .` once in a terminal); never `--trust-plugin`. If the hook line does not reach the session → PARK naming ARCH-EVALS-04, route to `/architect`.

### Step 2 — eval-suite (., JavaScript + Markdown, normal)
Tooling: implementer implementer · gates none · skills test-driven-development · guards none
Depends on: eval-spike
- [ ] 2.1 Write `scripts/evals.test.mjs` first, with a `checkEvals(root)` function and negative temp-dir fixtures, asserting: only `prompt.md`, `case.yaml` and `graders/*.md` under `evals/<case>/` (results dir ignored); no `graders:` key in any `case.yaml`; plugin.json has no `experimental` or `dependencies` key (ARCH-EVALS-01) → accept: each fixture turns its assertion red; the real-repo assertions for 2.4–2.6 are red before those tasks.
- [ ] 2.2 In the same file assert every grader's `type:` is one of tool_used, tool_order, file_exists, regex (ARCH-EVALS-02); exactly one case tagged `hook`, with no `allowed_tools` beyond Read/Glob/Grep (ARCH-EVALS-04); a `skill-fires-<name>` case with a `tool_used` grader on `Skill` for the four named skills, and for every `skills/<dir>` other than the five present today (`language-aware-planning` is referenced by path in commands/plan.md:34 and exempt) (ARCH-EVALS-03) → accept: fixtures prove each rule; a fixture with an extra skill dir and no case fails.
- [ ] 2.3 In the same file assert `.gitignore` lists `evals/results/` and the README run command carries `--ablation none`, `--max-cost-usd 5` and `--no-publish` (ARCH-EVALS-05) → accept: removing either from a fixture turns it red.
- [ ] 2.4 Write the four `evals/skill-fires-<name>/prompt.md` cases (natural-phrased task that the skill's description should match; `runs: 3`, which ARCH-EVALS-07's "2 of 3 runs" depends on; `allowed_tools: [Skill]`). If 1.3's cost per run × 15 exceeds $5, PARK the unit with that figure for a decision rather than lowering `runs` → accept: the required-cases assertion passes and every case has `runs: 3`.
- [ ] 2.5 Write each case's `graders/skill-fired.md` (`type: tool_used`, `tool: Skill`, `input_match` = the skill name) → accept: grader-type and required-cases assertions pass.
- [ ] 2.6 Document the run in README.md beside "Changing craftsman itself?" (README.md:414-417): the command `claude plugin eval . --ablation none --max-cost-usd 5 --no-publish` (plus `--allow-tools Skill` only if 1.3 showed Skill is not granted by `allowed_tools`), when it is required (before moving `stable`, after trims), the Claude Code ≥ 2.1.269 minimum, and one `evals/` line in the Layout block (README.md:536-554) → accept: `node --test scripts/*.test.mjs scripts/lib/*.test.mjs` exits 0.

### Step 3 — eval-run (., Markdown, normal)
Tooling: implementer root · gates none · skills verification-before-completion · guards none
Depends on: eval-suite
- [ ] 3.1 Run the suite exactly once with the README command → accept: one invocation; exit 0 or 2 (cost cap) with per-case scores, or the "unavailable" error text captured.
- [ ] 3.2 Add one CHANGELOG `[Unreleased]` bullet for the feature plus an `Evals:` line with each case's score and the run's cost, or `Evals: unavailable — <error>` (ARCH-EVALS-06) → accept: `node --test scripts/changelog.test.mjs` exits 0 ([Unreleased] ≤ 8 KB; 6,595 bytes before this task).

## Sequencing
Spike first: it gates spend and proves ARCH-EVALS-04's premise before any skill case is paid for. The structure test then precedes the remaining cases (test-first). The single full suite run comes last, so it runs only cases the test has checked. CHANGELOG is the last task.

## Verification background   (citations — for the reviewer, not the executor)
- The hook line exists: `scripts/session-context.mjs:303` emits `craftsman guards: on.`
- `claude plugin eval` is installed (`claude --version` = 2.1.328); case layout, grader types `tool_used|tool_order|file_exists|regex|llm|baseline`, `--case`, `--runs`, `--ablation`, `--max-cost-usd`, `--no-publish`, results under `evals/results/`, the trust prompt and its terminal-only answer — https://code.claude.com/docs/en/plugin-evals
- Trust: a repo already trusted in an interactive `claude` session skips the prompt; otherwise a non-terminal run exits 1 — same doc, "Trust the plugin directory".
- CI runs `scripts/*.test.mjs` (`.github/workflows/ci.yml:39`), so `scripts/evals.test.mjs` is gated with no CI change; no eval job is added (ARCH-EVALS-06).
- `doc-size-policy` scans only commands/agents/skills (`scripts/doc-size-policy.mjs:157-163`), so `evals/**/*.md` carries no byte cap.
- `language-aware-planning` is referenced by path (`commands/plan.md:34`, `commands/idea.md:65`); `deep-research` by link (`commands/understand.md:13`).
- `"one real run"` is read as one unfiltered suite invocation; the 1.3 probe is the spike the goal itself requires (`--case`, `--runs 1`).
- CONSUMERS:
  - `README.md` — tests asserting its text: `scripts/safety-docs.test.mjs:35` (Safety section only) and the version line via `scripts/changelog.test.mjs`; the new section touches neither.
  - `.gitignore` — `scripts/init.mjs:331-391` edits a *target* project's `.gitignore`, not this repo's; no consumer of this repo's file.
  - `CHANGELOG.md` — `scripts/changelog.test.mjs:9-15` caps [Unreleased] at 8 KB (ARCH-SLIM-08).
  - `evals/` — new; no existing reader. The plugin cache is a git checkout, so committed cases ship to users (results do not).

## Risk & rollback
Behaviour of the shipped plugin does not change: evals are inert files plus one test. Risks: real model spend (capped at $5 per invocation, two invocations total), flaky 3-run scores (recorded, not gated), Skill tool grant semantics (resolved by 1.3). Rollback: delete `evals/`, `scripts/evals.test.mjs`, the README section, the `.gitignore` line and the CHANGELOG bullet.

## Out of scope
A CI eval job; cases for `/orchestrate`, `/auto` or other multi-step commands; re-testing guard decisions (covered by `scripts/pre-guard*.test.mjs`); acting on ARCH-EVALS-07 (needs two description rewrites first); `cross-plan-learnings` (deferred).
