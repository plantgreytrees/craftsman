---
slug: scrutinise-plugin-behaviour-evals
goal: The behaviour-eval structure test rejects loose firing graders and accepts real context files, and the README and CHANGELOG state the measured suite cost and an `Evals:` line.
level: feature
parent: plugin-behaviour-evals
priority: P3
classification: in-scope  # /scrutinise round 1 findings on plugin-behaviour-evals; rules docs/architecture/evals.rules.md, docs/architecture/slim.rules.md
tracker_rows: [fix-evals-suggestions]
guards:
  blast_radius: done
  completeness_sweep: done
  blind_rederivation: skipped(config:never — craftsman.config.json:164)
coverage:
  contract:      N/A(test-internal helpers only; checkEvals has no importer — see CONSUMERS)
  data:          N/A(no persistence)
  config:        N/A(no config key)
  security:      N/A(test reads local repo files only)
  tests:         1.1 | 1.2 | 1.3 (each fix ships the fixture that was missing)
  observability: N/A(no runtime path)
  interface:     1.4 (README cost figure)
  docs:          1.4 | 1.5
  rollback:      revert the unit's merge commit
units:
  - id: fix-evals-suggestions
    scope_id: fix-evals-suggestions
    project: .
    depends_on: []
    module: scripts/evals.test.mjs, README.md, CHANGELOG.md
    language: JavaScript (Node ESM, node:test) + Markdown
    security: normal
    scope:
      read: [scripts/evals.test.mjs, README.md, CHANGELOG.md, scripts/changelog.test.mjs, evals/hook-guards-line/prompt.md, evals/skill-fires-deep-research/graders/skill-fired.md]
      docs: [docs/architecture/evals.rules.md, docs/architecture/slim.rules.md]
      write: [scripts/evals.test.mjs, README.md, CHANGELOG.md]
    arch: [ARCH-EVALS-01, ARCH-EVALS-03, ARCH-EVALS-05, ARCH-EVALS-06, ARCH-SLIM-08]
    tooling: { implementer: implementer, gates: [], skills: [test-driven-development], guards: [], mcp: [] }
---

# Plan: scrutinise plugin-behaviour-evals — round 1 fixes

## Summary
Round 1 (2026-11-24, isolated scrutineer, ranges 0364238..a26ba57, 7fd4a48^..7fd4a48, ce83768^..ce83768): **0 Critical · 0 Warning · 0 Architecture · 0 UNMET**, 6 Suggestions, none disputed; all 10 plugin-behaviour-evals criteria MET. Five Suggestions are fixed here; one is flagged, not driven (see Out of scope).

Round 2 (2026-11-24, isolated scrutineer, range 3995173^..3995173): **0 Critical · 0 Warning · 0 Architecture · 0 UNMET**; all 4 fix-evals-suggestions criteria MET. Four Suggestions accepted, not driven (no row), all in the YAML subset `scripts/evals.test.mjs` parses:
- `contextEntries` (:61-64) misses an indentless block list (`add_dirs:` then `- fixtures` at the same indent) — fails safe (false "unexpected file").
- A trailing `# comment` on a context value is read as part of the name — fails safe.
- `CONTEXT_FIELDS` (:51) matches those keys under any parent, not only `context:` — a slight loosening of the ARCH-EVALS-01 walk.
- `unquote` (:22-26) maps only `\n`, `\t` and `\X → X`, not the full YAML escape set.
Pick these up if a case ever needs a `case.yaml`; none of the five shipped cases has one.

## Outcome
`scripts/evals.test.mjs` parses frontmatter by whole-line fences, rejects a firing grader that would also match another skill, and accepts the files a `case.yaml` `context` field names; README and CHANGELOG carry the measured cost and an `Evals:` line.

## Scope Steps (executable core)

### Step 1 — fix-evals-suggestions (., JavaScript + Markdown, normal)
Tooling: implementer implementer · gates none · skills test-driven-development · guards none
Depends on: none
- [ ] 1.1 [Correctness/Suggestion] `frontmatter()` (scripts/evals.test.mjs:26) ends the block only at a `---` line of its own (`/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/`), and a double-quoted value has `\\` unescaped to `\` → accept: new fixtures, red first: `name: a---b` keeps `runs: 3`; a double-quoted `input_match: "\"skill\"\\s*:\\s*\"(?:[\\w-]+:)?<name>\""` passes ARCH-EVALS-03.
- [ ] 1.2 [Correctness/Suggestion] The ARCH-EVALS-03 firing check (evals.test.mjs:94) also requires that `input_match` does NOT match `{"skill":"craftsman:<other>"}` for every other required skill → accept: fixture with `input_match: '.*'` reports "no tool_used grader on Skill" (red first); the shipped suite stays clean.
- [ ] 1.3 [Test-coverage/Suggestion] Entries a case's `case.yaml` names under `context.add_dirs`, `context.history_file` or `context.scaffold_script` are allowed in that case dir (ARCH-EVALS-01 allows `context` fields) → accept: fixture with `add_dirs: [fixtures]` and a `fixtures/` dir stays clean (red first); an unnamed extra dir still fails.
- [ ] 1.4 [Cross-unit/Suggestion] README.md:427: replace "about $0.07 per run (15 runs)" with the measured "about $1.60 per suite run (15 runs)" → accept: `grep -n '1.60 per suite run' README.md` hits; evals.test passes.
- [ ] 1.5 [Cross-unit/Suggestion] CHANGELOG.md:14: spell the line `Evals: 2026-11-24, 3 runs each, $1.56 — <scores>` (edit the existing behaviour-evals bullet, no new bullet) → accept: `grep -n '^  Evals: ' CHANGELOG.md` hits; `node --test scripts/changelog.test.mjs` exits 0 ([Unreleased] ≤ 8 KB, ARCH-SLIM-08).

## Verification background   (citations — for the reviewer, not the executor)
- Truncation reproduced: `"---\nname: a---b\nruns: 3\n---\n".match(/^---\r?\n([\s\S]*?)\r?\n?---/)[1]` = `"name: a"`.
- `new RegExp(".*").test('{"skill":"craftsman:x"}')` = true, so a `.*` grader passes today.
- `context.add_dirs`, `history_file`, `scaffold_script` are case.yaml fields pointing at files inside the case dir (https://code.claude.com/docs/en/plugin-evals, case.yaml fields).
- Measured cost: CHANGELOG.md:14 and the eval-run tracker evidence ($1.56 for 15 runs).
- CONSUMERS:
  - `checkEvals`/`frontmatter` (scripts/evals.test.mjs:24,43) — exported but imported nowhere (`grep -rn "evals.test" scripts/` has no hits).
  - `README.md` — safety-docs.test.mjs:35 (Safety section only) and changelog.test.mjs (version line); line 427 touches neither.
  - `CHANGELOG.md` — changelog.test.mjs:9-15 caps [Unreleased] at 8 KB.

## Risk & rollback
Test-only and doc changes; no runtime behaviour. Risk: a stricter firing check rejects a legitimately broad grader — none exists (all four name one skill). Rollback: revert the merge.

## Out of scope
- **Flagged, not driven:** systematic-debugging, test-driven-development and verification-before-completion scored 0/3 in the first suite run. ARCH-EVALS-07 asks for up to two description rewrites before wiring or removal, and the case design (Skill-only grant, 4 turns, empty workspace) may also depress the score. Recommend `/idea skill-description-rewrites`; no row is registered here.
- Accepting suite-level `evals/mocks/` or nested case groups (the strict ARCH-EVALS-01 shape forbids them today).
