---
slug: cross-plan-learnings
status: defer
verdict: defer
confidence: medium
depth: standard
isolation: isolated
created: 2026-11-19
updated: 2026-11-19
related: [docs/ideas/plugin-overhaul.md, docs/architecture/state.rules.md, docs/architecture/safety.rules.md]
touches: [scripts/plan-memory.mjs, scripts/plan-memory.test.mjs, commands/_shared-machinery.md, commands/plan.md, scripts/doc-size-policy.mjs]
---

# Idea: Cross-plan recall of learnings (modelled on Compound Engineering's `/ce-compound`)

## Proposal (neutral restatement)
**Problem.** A lesson learned while executing one plan (tooling gotcha, failed approach, review finding) is stored only under that plan's key, so a later, unrelated plan cannot recall it and may repeat the mistake. Who hits it: any `/plan` or `/orchestrate` run. How often: not shown to cause repeats that stay unfixed (see Overlap).
**Claimed benefit.** Fewer repeated mistakes and retries.
**Who benefits.** The maintainer and every craftsman-driven run.
**Done looks like.** A learning recorded in plan X is surfaced when planning or executing an unrelated plan Y touching the same area, and stale learnings are detected.

## Verdict
**DEFER** (medium). The repo already turns a recurring gotcha into a fix or a decided rule, and the evidence of a repeat that stayed unfixed is zero. The fact most likely to flip it: a gotcha that recurs in a later plan while still unfixed at source.

| criterion | score 1–5 | evidence |
|---|---|---|
| value (problem real and frequent) | 2 | Of 51 plan-memory records only 9 are tooling-gotcha or review-finding, failed-approach has 0; events show 50 records against 17 recalls (memory ledger and event log, counted this session). |
| system fit | 2 | A second memory path beside `docs/ideas/plugin-overhaul.md:296-306`'s slug chain and the ARCH rules. |
| cost — 5 = cheap | 4 | Small change to one script, but recall across files, expiry and tests add up. |
| risk — 5 = low | 3 | Stale records would be injected into unrelated plans. |
| reversibility — 5 = trivial | 5 | Additive recall mode. |
| evidence strength | 1 | Compound Engineering publishes no measured benefit; the 43%→8% figure is one self-reported small study. |

## Overlap & prior work
Classification: **extends**. Searched: `docs/ideas/*.md`, `TRACKER.md` + archive, `docs/architecture/*.rules.md`, `commands/ agents/ skills/ README.md` for lessons/learnings/retrospective (none), plan memory (needs a plan key; the ledger was read directly).
- `scripts/plan-memory.mjs:2` "Plan-scoped decision ledger… advisory context"; `:20-29` one file per hash of the plan; `:206` recall throws without a plan, so cross-plan recall does not exist today.
- `commands/_shared-machinery.md:33,38` recall gotchas at unit start, filtered by project/plan/unit/scope.
- The ledger is git-ignored (`.gitignore:2`), so it is local to one clone.
- **The evidenced recurrences are already fixed at source.** The prettier gotcha, recorded in two ledgers, was resolved by `.prettierignore` (`docs/plans/TRACKER.md:156` COMPLETE, `:167` followup CANCELLED "fixed by … .prettierignore"). The heredoc gotcha is now a decided rule (ARCH-STATE-16, `docs/architecture/state.rules.md:26`; ARCH-SAFETY-13, `docs/architecture/safety.rules.md:23`). The rm-approval hang also lives in the user's per-user auto-memory (outside the repo).
- `docs/ideas/plugin-overhaul.md:296-306` (pursue-with-changes) already proposes a slug-linked chain ending in memory.

## System fit (whole project)
- contract ripple: N/A(recall output is advisory, no consumer parses it). data: new read path over `plans/*.memory.jsonl`. config & flags: an all-plans option would be new surface.
- security: recalled text enters prompts as advisory data; must stay bounded (`MAX_ITEMS`/`DEFAULT_CHARS`, `plan-memory.mjs:11-12`). tests: `plan-memory` tests would need cross-file and expiry cases.
- observability: `memory_recall` events exist (17); no measure of whether a recall changed behaviour. UI: N/A. docs: `_shared-machinery.md` byte cap (ARCH-SLIM-03/17).
- Second-order: stale records (the prettier entry is now false but unexpired) would reach unrelated plans; the ledger grows with no refresh.

## Research
- Compound Engineering (26.1k stars, MIT): `/ce-compound` writes learnings to `docs/solutions/`, later plans read them, a refresh skill checks them against the code. No quantitative evidence. https://github.com/EveryInc/compound-engineering-plugin , https://skills.cat/skills/everyinc/compound-engineering-plugin/ce-compound-refresh (mirror, secondhand).
- Lesson files go stale silently: https://builder.aws.com/content/3LVv7v1qJ7fyd8buaDIKJYZbw9K/why-ai-coding-agents-forget-memory-handoffs-and-latent-context ; stale references in 23% of context files: https://arxiv.org/html/2606.09090 ; lessons are better compounded as gates than prose: https://dev.to/vasyltretiakov/make-it-a-check-compounding-a-coding-agents-lessons-as-gates-not-claudemd-prose-3170 (sources disagree with Compound's prose-file approach).
- Approaches: (1) do nothing; (2) close-out step promoting each cross-plan gotcha to a TRACKER followup or ARCH rule; (3) cross-plan recall of three categories with required `expires`/`status`; (4) committed `docs/learnings/` files. This repo's own loop is approach 2.

## Critique
- **Steelman** — recall is per-plan by construction; real cross-plan gotchas exist in the ledger (rm hang, heredoc trip, prettier, scope readdir order) and the auto-memory copies are per-user.
- **Strongest case against** — the cases that look like repeats were fixed at the source or ruled, which is what the cited critiques recommend; with fewer than ~10 facts the benefit is thin.
- **Hidden assumptions** — plans repeat mistakes a recall would catch (test: count gotchas that recur after first record and are still unfixed; critic counted 0); implementers act on recalled text (test: follow the 17 recall events); queries match across plans (test: run each gotcha's tags against the other ledgers).
- **Failure modes** — stale gotchas injected; context bloat (bounded); lock contention reading every file; ledger growth with no supersession.
- **Kill criteria** — no gotcha recurs unfixed; cross-plan recall over 30 days returns any superseded record; recall use stays below 1 per plan.
- **Cheaper alternatives** — do nothing; a close-out rule "promote cross-plan gotchas to a followup row or ARCH rule" (prose plus an optional human-read `list --all` report).

## Disputed
- I first offered the prettier gotcha to the critic as recurrence evidence; the critic showed it was already fixed (`TRACKER.md:156,167`) and I verified that. Corrected here. A related user auto-memory note about prettier reformatting `.mjs` is therefore likely stale too (UNPROVEN; not edited).
- No critic finding was dropped or softened.

## Recommendations
1. Do nothing now; if a later plan repeats a still-unfixed gotcha, reopen.
2. If anything, adopt the cheapest slice: at close-out, promote a cross-plan gotcha to a TRACKER followup or ARCH rule instead of recalling it.
3. Mark the stale prettier ledger record superseded and fold any future memory work into `plugin-overhaul`'s slug chain rather than a parallel path.
4. If recall is ever built, require `expires`/`status` and exclude superseded records.

## Open questions
- None that change the verdict. Would the owner want the close-out promotion step despite no measured repeats?

## Next step
Nothing now (deferred). Evidence that would reopen it: a gotcha recurring in a later plan while still unfixed at source, then re-evaluate this slug.
