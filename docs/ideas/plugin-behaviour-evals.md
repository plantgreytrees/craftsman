---
slug: plugin-behaviour-evals
status: architected
verdict: pursue-with-changes
confidence: medium
depth: standard
isolation: isolated
created: 2026-11-19
updated: 2026-11-20
related: [docs/architecture/slim.rules.md, docs/architecture/safety.md, docs/architecture/evals.rules.md]
touches: [evals/** (new), scripts/evals.test.mjs (new), .gitignore, README.md, CONTRIBUTING.md, CHANGELOG.md]
---

# Idea: A small behaviour-eval suite for craftsman's skills and commands (using first-party `claude plugin eval`)

## Proposal (neutral restatement)
**Problem.** Craftsman's behaviour lives in prose (commands, agents, skills) and hooks. Its tests check scripts and that prose exists, not that the model follows the prose or that skills fire. Who hits it: the maintainer, on every prose trim or model change. How often: every change to commands/agents/skills.
**Claimed benefit.** Catch behavioural regressions (a skill no longer fires, a hook not wired, a command step skipped) before release.
**Who benefits.** The maintainer and users of released versions.
**Done looks like.** A few eval cases run on demand and report with-plugin vs without-plugin scores.

## Verdict
**PURSUE-WITH-CHANGES** (medium): a 3–4 case suite with deterministic graders, run manually before release, no CI gate. The fact most likely to flip it: whether the harness can stably seed a craftsman-initialised repo under this machine's sandbox; if not, cut to the skill-firing cases only.

| criterion | score 1–5 | evidence |
|---|---|---|
| value | 4 | Real blind spot: three vendored skills are referenced by no command or agent, so whether they ever fire is unknown. |
| system fit | 4 | First-party tool exists locally (`claude plugin eval --help`, Claude Code 2.1.328); evals do not trip the doc caps (`scripts/doc-size-policy.mjs:157-163` scans only commands, agents, skills). |
| cost — 5 = cheap | 3 | Real model calls per run; unmeasured on this account. |
| risk — 5 = low | 4 | No change to shipped behaviour; flaky scores are the risk. |
| reversibility — 5 = trivial | 5 | A new directory. |
| evidence strength | 3 | First-party docs are primary; the benefit here is unmeasured. |

## Overlap & prior work
Classification: **novel** (extends the ad-hoc headless proofs). Searched: `docs/ideas/*.md`, `TRACKER.md` + archive, `docs/architecture/`, `CHANGELOG.md`, README for `plugin eval|evals/|llm judge|headless`.
- Only ad-hoc headless runs exist: `README.md:534`, `docs/architecture/safety.md:56-62`.
- CI runs `node --test`, `model-policy`, `doc-size-policy` only (`.github/workflows/ci.yml:39,41,43`); 89 `*.test.*` files under `scripts/`.
- `scripts/wiring.test.mjs` asserts prose presence (ARCH-SLIM-05, `docs/architecture/slim.rules.md`).
- Vendored skills (`test-driven-development`, `systematic-debugging`, `verification-before-completion`) appear only in `scripts/skills-vendored.test.mjs` and `scripts/doc-size-policy.mjs`; of the skills, only `commands/understand.md:13` names `deep-research`.
- Descriptions are capped at 4500 total (`scripts/descriptions.test.mjs:17`); ARCH-SLIM-06 checks trims by test results and block rates, not by triggering.

## System fit (whole project)
- contract ripple: N/A(no API). data: results land in `<plugin>/evals/results/` (`claude plugin eval --help`), so `.gitignore` needs an entry. config & flags: none; `--max-cost-usd` caps spend.
- security: the eval loads the plugin's hooks and runs as the user; Bash grants need the OS sandbox; `--trust-plugin` must not be used casually (https://code.claude.com/docs/en/plugin-evals).
- tests: adds a behavioural layer beside `node --test`. observability: eval cost shown per run. UI: N/A. docs: README.md "changing craftsman" checklist (`README.md:415-417`, corrected by /architect: PUBLISH.md is a first-time publish guide); ARCH-SLIM-06 superseded by ARCH-SLIM-18.
- Second-order: whether `evals/` is copied into the installed plugin cache is UNPROVEN (size and trust surface). Commands such as `/orchestrate` need `.craftsman` state and long runs (default 10 turns, 300s), so only skill-firing and single-step commands are cheap to test.

## Research
- `claude plugin eval`: cases under `evals/` with graders `llm`, `regex`, `file`, `tool_used`, `tool_order`; 3 runs per arm with and without the plugin; isolated `claude -p` sessions in an empty workspace; opt-in `--scaffold` fixtures; costs real model usage. https://code.claude.com/docs/en/plugin-evals
- Prefer deterministic graders; LLM judges have verbosity/position bias and about 80% human agreement: https://agentskills.io/skill-creation/evaluating-skills ; skill invocation reached only about 70% in LangChain's tests and similar names cause wrong-skill calls: https://blog.langchain.com/evaluating-skills
- Superpowers keeps a separate eval harness (https://github.com/obra/superpowers); details secondhand, and a first-party tool now makes porting it unnecessary.
- Approaches: (1) do nothing; (2) 3–4 deterministic cases, manual pre-release; (3) full suite gated in CI; (4) port Superpowers' harness. Chosen: 2.

## Critique
- **Steelman** — closes a real blind spot cheaply with a first-party tool, and formalises the ad-hoc headless proofs already in the repo.
- **Strongest case against** — a pre-guard "blocks destructive command" case duplicates 12 deterministic `pre-guard*.test.mjs` files; long commands do not fit the harness defaults; roughly 70% invocation rates make a CI gate noisy.
- **Hidden assumptions** — firing of vendored skills is worth knowing (test: one `tool_used: Skill` case each; if they never fire, delete or rewire them); the harness can scaffold a craftsman-initialised repo (test: one `--scaffold` case with `--keep-temp`); Bash grants work under the sandbox here (test: one local case).
- **Failure modes** — flaky scores get ignored; cost creep if put in CI; graders drift from the prose they check; `--trust-plugin` in CI skips the trust prompt; model upgrades shift baselines; results dir dirties the tree.
- **Kill criteria** — no stable pass (≥2 of 3) after two description rewrites; one pre-release run costs more than the set budget (the critic suggested ~$5, an opinion not a measurement); over three releases no eval catches a regression `node --test` missed.
- **Cheaper alternatives** — do nothing; statically remove or explicitly reference the never-referenced vendored skills, which removes the question without evals.

## Disputed
- Critic's "evals/**/*.md will not trip ARCH-SLIM-01" verified at `scripts/doc-size-policy.mjs:157-163`; I had left it as UNPROVEN in the brief and it is resolved. Nothing dropped or softened.

## Recommendations
1. Deterministic graders only (`tool_used`, `file`, `regex`); no long-text `llm` judges.
2. Start with the three vendored-skill firing cases plus `/idea` writing only `docs/ideas/`; keep one hook-wiring smoke test and drop the rest of the pre-guard case.
3. Run manually before moving `stable` and after trims, with `--max-cost-usd 5` and `--no-publish`, documented in README.md (ARCH-EVALS-05/06); no CI gate.
4. Add `evals/results/` to `.gitignore`; confirm whether `evals/` ships in the plugin cache.
5. Add an ARCH-SLIM-06 clause: a description trim reruns the skill-firing cases. If the skills never fire, prefer deleting or wiring them over keeping the eval.

## Open questions
- What per-release eval budget is acceptable? (cost is unmeasured on this account)
- Is a failure to seed a craftsman-initialised repo acceptable grounds to cut the suite to the skill-firing cases only? Assumed yes.

## Next step
`/architect plugin-behaviour-evals` (not `--deep`; additive and reversible). First spike, before architecting: run one `tool_used: Skill` case locally and read its cost and stability.
