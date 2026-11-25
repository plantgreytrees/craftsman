---
slug: skill-description-rewrites
status: architected
verdict: pursue-with-changes
confidence: medium
depth: standard
isolation: isolated
created: 2026-11-25
updated: 2026-11-25
related: [docs/ideas/plugin-behaviour-evals.md, docs/plans/plugin-behaviour-evals.md, docs/plans/scrutinise-plugin-behaviour-evals.md, docs/ideas/plugin-overhaul.md, docs/architecture/evals.rules.md, docs/architecture/slim.rules.md, docs/architecture/engine.rules.md]
touches: [skills/systematic-debugging/SKILL.md, skills/test-driven-development/SKILL.md, skills/verification-before-completion/SKILL.md, evals/skill-fires-*/prompt.md, scripts/evals.test.mjs, scripts/skills-vendored.test.mjs, scripts/doc-size-policy.mjs, README.md, CHANGELOG.md]
---

# Idea: Make the three never-firing vendored skills fire, or remove them

## Proposal (neutral restatement)
- **Problem.** In the first behaviour-eval run (2026-11-24; CHANGELOG.md:14) three vendored skills never fired on a natural request: `systematic-debugging` 0/3, `test-driven-development` 0/3, `verification-before-completion` 0/3. `deep-research` and the SessionStart hook case scored 3/3. Nothing in commands/, agents/, workflows/, hooks/ or scripts/ names the three skills (only tests and doc-size caps do), so description matching is their only path to firing.
- **Claimed benefit.** Ad-hoc requests made outside `/plan → /orchestrate` get the debugging, test-first and verify-before-done disciplines; or, if they can't be made to fire, the plugin stops paying always-loaded description bytes for dead skills.
- **Who benefits.** Users who ask Claude for a fix or feature directly. Inside the loop the disciplines are already enforced (see System fit).
- **Done.** Each skill fires in ≥2 of 3 runs on its eval case and on held-out paraphrases, or it is removed (or wired into a step that genuinely lacks the rule), with before/after scores recorded (ARCH-SLIM-18, ARCH-EVALS-06).

## Verdict
**PURSUE-WITH-CHANGES** (medium). This is a cheap, reversible experiment that the existing rule ARCH-EVALS-07 (docs/architecture/evals.rules.md:17) already calls for, and it ends in a decision either way. But the current suite can't tell a good description from one that echoes its test prompt, and the empty eval workspace may be suppressing firing. So it must start with a harness check and add held-out prompts. Removal counts as a good outcome. The fact most likely to flip it: if a description that copies its own case prompt's key words still scores 0/3, the fault is the harness, not the wording, and rewriting is pointless.

| criterion | score 1–5 | evidence |
|---|---|---|
| value (problem is real and frequent) | 2 | Real (0/3 ×3, CHANGELOG.md:14) but only ad-hoc use benefits, unmeasured; in-loop enforcement exists (agents/implementer.md:24, commands/investigate.md:15-38, hooks/hooks.json:30) |
| system fit (aligns with architecture + direction) | 4 | ARCH-EVALS-07 prescribes the path; ARCH-SLIM-15 (slim.rules.md:25) keeps vendored skills inside the descriptions budget |
| cost (build + maintain) — 5 = cheap | 4 | Three one-line edits; ≈$0.90 per three-case rerun (CHANGELOG.md:14, $1.56 per 15 runs) |
| risk (blast radius, failure modes) — 5 = low | 3 | Overfitting to one prompt; over-firing on every coding request; 88-char total budget |
| reversibility — 5 = trivially undone | 5 | Description edits or file deletions only |
| evidence strength (research + repo proof) | 2 | n=3, one prompt per skill; the deep-research pass may be keyword echo |

## Overlap & prior work
- **Extends** plugin-behaviour-evals (docs/ideas/plugin-behaviour-evals.md). ARCH-EVALS-07 already decides wire-or-remove after two rewrites; acting on it was out of scope there (docs/plans/plugin-behaviour-evals.md, Out of scope) and flagged as this follow-up (docs/plans/scrutinise-plugin-behaviour-evals.md, Out of scope).
- **Conflicts (amendment needed)** with ARCH-EVALS-07's "two description rewrites": the owner accepts removal after one (Open questions).
- Origin of the skills: docs/ideas/plugin-overhaul.md and ARCH-SLIM-15 vendored them from obra/superpowers (MIT) "inside the descriptions budget and load only when their step runs".
- Searched: docs/ideas/*.md, docs/plans/TRACKER.md + TRACKER-archive.md, docs/architecture/*.rules.md (`arch-check governs` → evals, slim, engine), CHANGELOG [Unreleased]. No tracker row exists.

## System fit (whole project)
- **Contract ripple:** N/A(no exported API; skills are loaded by Claude Code by name).
- **Data:** N/A(no persistence).
- **Config & flags:** N/A(no config key; the owner ruled out `when_to_use` and cap raises).
- **Security:** N/A(prose only; no tool grants change).
- **Tests:** scripts/skills-vendored.test.mjs:10-16 (list of vendored skills, 110-char description cap) and scripts/evals.test.mjs:16 (`NAMED_SKILLS`) must drop a removed skill. scripts/descriptions.test.mjs:17 caps the combined total at 4,500, measured at 4,412 (88 chars headroom). ARCH-EVALS-03 requires a case per skill, so a removed skill's case goes with it.
- **Observability:** before/after eval scores in the CHANGELOG (ARCH-EVALS-06, ARCH-SLIM-18). `/skill-doctor` reports per-skill usage (https://code.claude.com/docs/en/skills.md, "Find unused skills").
- **UI:** N/A(no UI).
- **Docs:** README.md Layout line listing the three skills; ARCH-SLIM-15's text names them; CHANGELOG entry.
- **Second-order effects:**
  - Over-firing: directive wording ("Use before new behaviour") could load ≈500 bytes on most coding turns.
  - Crowded installs: the listing "drops descriptions starting with the skills you invoke least" (https://code.claude.com/docs/en/skills.md, "Skill descriptions are cut short"), so a skill that rarely fires loses its description first, whatever its wording.
  - Removal edits ARCH-SLIM-15's named pattern list. That rule says "borrowed patterns … are vendored", so removing one is an amendment for `/architect`.
  - Plan tooling `skills:` lists (skills/language-aware-planning/references/plan-template.md:52) are read by no runner (agents/unit-runner.md, workflows/run.js, scripts/run-args.mjs), so plans naming these skills load nothing today.

## Research
- **Official docs** (https://code.claude.com/docs/en/skills.md):
  - `description` = "What the skill does and when to use it… Put the key use case first."
  - `when_to_use` is appended to the description in the listing; the pair is capped at 1,536 chars.
  - The listing budget is 1% of the context window, and the least-invoked descriptions are dropped first.
- **Subagent preload** (https://code.claude.com/docs/en/sub-agents.md, frontmatter table): an agent's `skills:` field injects the full skill content at startup. This is a deterministic wire-in route. It would load in every role of agents/unit-runner.md, which is one file for implement, review and land (ARCH-ENGINE-04, engine.rules.md:14).
- **Trigger-optimisation method** (https://agentskills.io/skill-creation/optimizing-descriptions):
  - Wording: imperative "Use this skill when…", focused on user intent.
  - Query set: ~20 queries, 8-10 should-trigger and 8-10 near-miss should-not-trigger.
  - Scoring: 3 runs each, 0.5 trigger-rate threshold.
  - Overfitting guard: a 60/40 train/validation split.
- **Community reports** (third-party; magnitudes UNPROVEN):
  - Directive "ALWAYS invoke when…" was reported at 100% vs 77% for "Use when…".
  - Default descriptions activated about 50% of the time.
  - Matching may lean on keyword overlap with the prompt (claudeissues.com #46952).
  - Prompt hooks reportedly raised firing 15%→62% (https://towardsdatascience.com/a-session-start-hook-raised-claude-code-skill-firing-from-15-to-62/, page not readable here) and 20%→84% (https://scottspence.com/posts/claude-code-skills-dont-auto-activate).
- **Upstream wording** (obra/superpowers, third-party mirror https://www.skills.sh/obra/superpowers-skills/systematic-debugging): "Use when encountering any bug, test failure, or unexpected behavior, before proposing fixes" is trigger-only and longer than the 110-char cap.

## Critique
- **Steelman.** The failure is measured and consistent. Description matching is the skills' only path. The rule for what to do next already exists. A rerun is about $0.90 and every change is easy to undo, so the experiment always ends in a decision.
- **Strongest case against.** The suite can't distinguish a good description from one that echoes its single test prompt. `deep-research`'s prompt ("Give me a concise summary with file references", evals/skill-fires-deep-research/prompt.md) nearly repeats its description (skills/deep-research/SKILL.md:3), so its 3/3 may be echo. Rewriting to pass one prompt would go green without improving real firing. Meanwhile the disciplines are already enforced inside the loop.
- **Hidden assumptions:**
  - *Wording is the cause.* Test: a ceiling run, temporarily copying the case prompt's key words into one description and rerunning that case (≈$0.30). 0/3 means the harness is the cause.
  - *The eval predicts real firing.* Test: two fresh paraphrases per skill, never seen while rewriting, run after the final rewrite.
  - *Rewrites fit the budget.* Test: run descriptions.test before each rerun.
  - *Ad-hoc users exist in meaningful numbers.* Test: telemetry (`stats.mjs`) or `/skill-doctor`.
- **Failure modes:**
  - Overfit green suite.
  - Over-firing that adds context to every turn.
  - Silent decay after model updates (the suite runs only at release, ARCH-EVALS-06).
  - n=3 noise: 2/3 vs 1/3 is within chance.
- **Kill criteria:**
  - Ceiling test 0/3 → stop rewriting; revisit case design (empty workspace, `allowed_tools: [Skill]`, `max_turns: 4`).
  - A rewrite passes its case but fails ≥2 of 3 held-out paraphrases → overfit; count it as failed.
  - A rewrite fires on a near-miss (e.g. "rename this variable" for TDD) → reject that wording.
  - It fits only by raising the cap or using `when_to_use` → remove the skill instead (owner decision).
- **Cheaper alternatives:**
  - Do nothing: keeps about 217 always-loaded chars for dead skills.
  - Remove all three now: needs ARCH-EVALS-07 amended; loses unmeasured ad-hoc value.
  - Wire in only via `skills:` preload in unit-runner: redundant in-loop and no help ad-hoc.
  - **Smallest useful slice (recommended):** ceiling test, one disciplined rewrite each within 110 chars, held-out and near-miss checks, then wire-or-remove.

## Disputed
- The critic gave the current description lengths as 74/79/63; measured, they are 76/78/63 (skills/*/SKILL.md:3). Headroom to the 110 cap is ≈113 chars across the three, still more than the 88-char total budget, so the critic's budget point stands unchanged.

## Recommendations
1. **Run the ceiling / harness check first** (one skill, ≈$0.30). If it scores 0/3, fix case design before any rewrite.
2. **One rewrite per skill**, imperative and user-intent, ≤110 chars, with an explicit share of the 88-char total set before writing (e.g. ≤+29 each). Wording shape: "Use when a bug, failing test or wrong output is reported, before proposing a fix."
3. **Held-out checks:** two fresh paraphrases plus one near-miss per skill, run once after the final rewrite and recorded in the PR or CHANGELOG. Keep them out of evals/ unless ARCH-EVALS-03 is amended to allow should-not-trigger cases.
4. **Removal is a success outcome.** Whatever still fires <2/3 is removed: SKILL.md, its eval case, its doc-size cap, and its entries in skills-vendored.test and evals.test. Wire one in instead only if a step genuinely lacks the rule; none does today.
5. **No `when_to_use`, no MAX_TOTAL raise** (owner decision).
6. **Record before/after scores** (and held-out results) in the CHANGELOG [Unreleased] entry (ARCH-SLIM-18, ARCH-EVALS-06).
7. For `/architect`: amend ARCH-EVALS-07 (one rewrite, then remove) and ARCH-SLIM-15's named pattern list if any skill is removed.

## Open questions
- *Is removing a skill after one failed rewrite acceptable?* — **Yes** (owner, 2026-11-25). This conflicts with ARCH-EVALS-07's "two rewrites", so `/architect` must record it as an amendment.
- *May a rewrite use `when_to_use` or a raised MAX_TOTAL?* — **No**: stay inside the 110-char and 4,500-total caps; a skill that can't fit is removed (owner, 2026-11-25).
- Still open (evidence, not a decision): how much ad-hoc use these skills would see. `/skill-doctor` or telemetry can answer it.

## Next step
`/architect skill-description-rewrites` — amend ARCH-EVALS-07 (one rewrite) and settle how removal edits ARCH-SLIM-15.
