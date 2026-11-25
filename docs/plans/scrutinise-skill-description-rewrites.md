---
slug: scrutinise-skill-description-rewrites
goal: The vendored-skill check enforces ARCH-SLIM-19 again, the README states the measured eval cost, and the evals/slim rules cite live lines after the three skills' removal.
level: feature
priority: P3
parent: docs/plans/skill-description-rewrites.md
classification: in-scope  # /scrutinise round 1 findings; rules docs/architecture/evals.rules.md, docs/architecture/slim.rules.md
tracker_rows: [fix-vendored-check, fix-arch-cites, fix-vendored-assert, fix-evals-cites, fix-evals01-cite]
guards:
  blast_radius: done
  completeness_sweep: done
  blind_rederivation: skipped(config:never — craftsman.config.json:164)
coverage:
  contract:      N/A(test file and README prose only; no exported API)
  data:          N/A(no persistence)
  config:        N/A(no config key)
  security:      N/A(no auth, I/O or guard surface)
  tests:         1.1 | 1.2 (skills-vendored.test.mjs discovers vendored skills by content, test-first)
  observability: N/A(no runtime path)
  interface:     N/A(no UI)
  docs:          1.3 (README cost) | 2.1 | 2.2 (rules cites via /architect --update)
  rollback:      git revert of the two merge commits
units:
  - id: fix-vendored-check
    scope_id: fix-vendored-check
    project: .
    depends_on: []
    module: scripts/skills-vendored.test.mjs, README.md
    language: JavaScript (Node ESM, node:test) + Markdown
    security: normal
    scope:
      read: [scripts/skills-vendored.test.mjs, .claude-plugin/plugin.json, README.md]
      docs: [docs/architecture/slim.rules.md, docs/architecture/evals.rules.md]
      write: [scripts/skills-vendored.test.mjs, README.md]
    arch: [ARCH-SLIM-19, ARCH-EVALS-05]
    tooling: { implementer: root, gates: [], skills: [], guards: [], mcp: [] }
  - id: fix-arch-cites
    scope_id: fix-arch-cites
    project: .
    depends_on: [fix-vendored-check]
    module: docs/architecture/{evals,slim}.rules.md cites (via /architect --update)
    language: Markdown
    security: normal
    scope:
      read: [scripts/evals.test.mjs, scripts/skills-vendored.test.mjs, scripts/descriptions.test.mjs, scripts/doc-size-policy.mjs]
      docs: [docs/architecture/evals.rules.md, docs/architecture/slim.rules.md]
      write: [docs/architecture/evals.rules.md, docs/architecture/evals.md, docs/architecture/slim.rules.md, docs/architecture/slim.md]
    arch: [ARCH-EVALS-08, ARCH-EVALS-09, ARCH-EVALS-10, ARCH-SLIM-19]
    tooling: { implementer: root (runs /architect --update; never edits rule text), gates: [], skills: [], guards: [], mcp: [] }
  - id: fix-vendored-assert
    scope_id: fix-vendored-assert
    project: .
    depends_on: [fix-arch-cites]
    module: scripts/skills-vendored.test.mjs
    language: JavaScript (Node ESM, node:test)
    security: normal
    scope:
      read: [scripts/skills-vendored.test.mjs]
      docs: [docs/architecture/slim.rules.md]
      write: [scripts/skills-vendored.test.mjs]
    arch: [ARCH-SLIM-19]
    tooling: { implementer: root, gates: [], skills: [], guards: [], mcp: [] }
  - id: fix-evals-cites
    scope_id: fix-evals-cites
    project: .
    depends_on: [fix-vendored-assert]
    module: docs/architecture/evals.rules.md cites (via /architect --update)
    language: Markdown
    security: normal
    scope:
      read: [scripts/evals.test.mjs, scripts/skills-vendored.test.mjs]
      docs: [docs/architecture/evals.rules.md, docs/architecture/slim.rules.md]
      write: [docs/architecture/evals.rules.md, docs/architecture/evals.md, docs/architecture/slim.rules.md]
    arch: [ARCH-EVALS-01, ARCH-EVALS-02, ARCH-EVALS-05, ARCH-EVALS-08, ARCH-SLIM-19]
    tooling: { implementer: root (runs /architect --update; never edits rule text), gates: [], skills: [], guards: [], mcp: [] }
  - id: fix-evals01-cite
    scope_id: fix-evals01-cite
    project: .
    depends_on: [fix-evals-cites]
    module: docs/architecture/evals.rules.md ARCH-EVALS-01 cite (via /architect --update)
    language: Markdown
    security: normal
    scope:
      read: [scripts/evals.test.mjs]
      docs: [docs/architecture/evals.rules.md]
      write: [docs/architecture/evals.rules.md, docs/architecture/evals.md]
    arch: [ARCH-EVALS-01]
    tooling: { implementer: root (runs /architect --update; never edits rule text), gates: [], skills: [], guards: [], mcp: [] }
---

# Plan: Fix /scrutinise round 1 suggestions for skill-description-rewrites

## Summary
Round 1 (isolated scrutineer, range abf221a..a61c2e8): 0 Critical, 0 Warning, 3 Suggestions (1 Test-coverage, 1 Correctness, 1 Architecture); every acceptance criterion MET. Disputed: none (the scrutineer's `:119` for `required` is `:120`, scripts/evals.test.mjs:120 — position only).

## Round 1 (2026-11-25)
1. [Suggestion][Test-coverage] scripts/skills-vendored.test.mjs:12 — `const SKILLS = []` registers no tests, so ARCH-SLIM-19's named check is vacuous and a future vendored skill would go unchecked.
2. [Suggestion][Correctness] README.md:427 — "about $0.50 per suite run (6 runs)" is below the measured ≈$0.10–0.115 per run (CHANGELOG.md:14, $1.56 / 15; after-run $1.38 / 12).
3. [Suggestion][Architecture] cite drift — ARCH-EVALS-08 cites scripts/evals.test.mjs:16-18,121; ARCH-EVALS-09 scripts/skills-vendored.test.mjs:16; ARCH-EVALS-10 scripts/doc-size-policy.mjs:78-80 and README.md:564 (deleted); ARCH-SLIM-19 scripts/skills-vendored.test.mjs:10-16.

### Step 1 — fix-vendored-check (., JavaScript, normal)
Tooling: implementer root · gates none · skills none · guards none
Depends on: none
- [ ] 1.1 Test first: export a `vendoredSkills(root)` that returns the `skills/*/SKILL.md` names whose text carries the `obra/superpowers (MIT` attribution, and a temp-dir fixture test that writes one attributed and one plain skill and expects exactly the attributed one → accept: red before 1.2 (no export).
- [ ] 1.2 Replace the hard-coded `SKILLS` list with `vendoredSkills(ROOT)`; keep the per-skill attribution, ≤110-char description and no-`superpowers:`/`Skill(`/`install` assertions; add an always-running test that `.claude-plugin/plugin.json` has no `dependencies` key (ARCH-SLIM-19), so the file never registers zero tests → accept: `node --test scripts/skills-vendored.test.mjs` reports ≥ 2 passing tests and 0 failing.
- [ ] 1.3 README.md:427 → "about $0.60 per suite run (6 runs)" → accept: `node --test scripts/*.test.mjs scripts/lib/*.test.mjs` exits 0.

### Step 2 — fix-arch-cites (., Markdown, normal)
Tooling: implementer root · gates none · skills none · guards none
Depends on: fix-vendored-check
- [ ] 2.1 Run `/architect --update evals` → accept: ARCH-EVALS-08/09/10 cites point at live lines (evals.test.mjs `required`, skills-vendored.test.mjs 110-char assertion, the removal commit instead of deleted lines); verdicts HOLDS; rule text unchanged.
- [ ] 2.2 Run `/architect --update slim` → accept: ARCH-SLIM-19 cites skills-vendored.test.mjs at live lines; verdict HOLDS; `arch-check.mjs lint` passes.

## Round 2 (2026-11-25, isolated, range a61c2e8..421f0d0)
1. [Warning][Architecture] docs/architecture/evals.rules.md:11 — ARCH-EVALS-01 cites its own line and slim.rules.md:29; the enforcement is scripts/evals.test.mjs:81-82,114-117.
2. [Warning][Architecture] docs/architecture/evals.rules.md:12,15 — ARCH-EVALS-02 and ARCH-EVALS-05 cite their own lines; enforcement is scripts/evals.test.mjs:15,109 and :19,154-161.
3. [Suggestion][Architecture] evals.rules.md:18 — ARCH-EVALS-08's cite omits the grader match and orphan-case check (scripts/evals.test.mjs:127-136,149-150).
4. [Suggestion][Correctness] scripts/skills-vendored.test.mjs:39 — `assert.match(text, ATTRIBUTION)` cannot fail (discovery filters on the same regex at :24); header :3-5 overclaims.
- Disputed: "ARCH-EVALS-09's 110 cap is enforced for no current skill" — dropped. ARCH-EVALS-09 covers only skills no command or agent names; deep-research is linked at commands/understand.md:13 and language-aware-planning is exempt (commands/plan.md), so no current skill is in its scope.

### Step 3 — fix-vendored-assert (., JavaScript, normal)
Tooling: implementer root · gates none · skills none · guards none
Depends on: fix-arch-cites
- [ ] 3.1 Drop the redundant `assert.match(text, ATTRIBUTION)` and narrow the header to "skills vendored from obra/superpowers, found by their MIT attribution" → accept: `node --test scripts/skills-vendored.test.mjs` passes; `grep -c "assert.match(text, ATTRIBUTION)" scripts/skills-vendored.test.mjs` prints 0.

### Step 4 — fix-evals-cites (., Markdown, normal)
Tooling: implementer root · gates none · skills none · guards none
Depends on: fix-vendored-assert
- [ ] 4.1 `/architect --update evals`: re-point ARCH-EVALS-01 → scripts/evals.test.mjs:81-82,114-117; 02 → :15,109; 05 → :19,154-161; 08 → :17,120-136,149-150; refresh ARCH-SLIM-19's skills-vendored cite if 3.1 moved lines → accept: no evals rule cites its own rules-doc line; `arch-check.mjs lint` passes; rule text unchanged.

## Round 3 (2026-11-25, isolated, range 421f0d0..95c7c43)
1. [Suggestion][Architecture] docs/architecture/evals.rules.md:11 — ARCH-EVALS-01's cite `scripts/evals.test.mjs:81-82,114-117` omits the stray-file rejection (:99) and the case.yaml `graders:` rejection (:101) its `check:` names. (The scrutineer gave the rule as :13; it is :11.)
- 0 Critical, 0 Warning; every criterion MET.

### Step 5 — fix-evals01-cite (., Markdown, normal)
Tooling: implementer root · gates none · skills none · guards none
Depends on: fix-evals-cites
- [ ] 5.1 `/architect --update evals`: ARCH-EVALS-01 cite → `scripts/evals.test.mjs:81-101,114-117` → accept: the cite covers the case walk, stray-file and `graders:` rejections and the plugin.json key check; rule text unchanged; `arch-check.mjs lint` passes.

## Round 4 (2026-11-25, isolated, range 95c7c43..acff448) — final
0 Critical, 0 Warning, 0 Architecture, 0 UNMET.
- Disputed: [Suggestion][Architecture] "ARCH-EVALS-01's cite stops at :101; :102-104 (missing prompt.md / grader) is outside it" — dropped. The rule's `check:` (docs/architecture/evals.rules.md:11) names only the case walk, the case.yaml `graders:` rejection and the plugin.json keys, all inside the cited `scripts/evals.test.mjs:81-101,114-117`; the scrutineer called the cite accurate for that check.
- Follow-up (flagged, not driven): [Suggestion][Test-coverage] scripts/skills-vendored.test.mjs:34-41 runs on no live skill, so ARCH-EVALS-09's ≤110-char cap has no live enforcement for a future skill no command names (descriptions.test.mjs:13 caps at 200). No current skill is in ARCH-EVALS-09's scope (deep-research is linked at commands/understand.md:13). Closing it needs a rule decision — scope the cap to vendored skills, or add a 110 cap for description-only skills to descriptions.test.mjs — so it goes to `/architect --update evals` when the next description-only skill is added.

## Verification background
- CONSUMERS: `scripts/skills-vendored.test.mjs` — run by ci.yml's `node --test scripts/*.test.mjs`; named by ARCH-SLIM-19's check (docs/architecture/slim.rules.md). No other reader.
- `arch-check governs scripts/skills-vendored.test.mjs README.md` → no rules doc governs them; the rules docs are /architect's to edit (commands/_architecture.md).

## Out of scope
A ceiling run for test-driven-development and verification-before-completion (ARCH-EVALS-09 read as one ceiling per harness; the scrutineer flagged it as a reading, not a defect).
