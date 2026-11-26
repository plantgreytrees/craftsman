---
slug: run-outcome-clarity
status: architected
verdict: pursue-with-changes
confidence: medium
depth: standard
isolation: isolated
created: 2026-11-25
updated: 2026-11-26
related: [docs/ideas/external-project-board.md, docs/ideas/session-dispatcher.md, docs/plans/investigate-auto-flow-friction.md, docs/architecture/tracker.rules.md, docs/architecture/auto.rules.md, docs/architecture/views.rules.md, docs/architecture/slim.rules.md, docs/architecture/plan.rules.md]
touches: [commands/auto.md, commands/instruction.md, scripts/tracker.mjs, scripts/digest.mjs, scripts/lib/dashboard.mjs, skills/language-aware-planning/references/plan-template.md, docs/plans/TRACKER.md, .craftsman/tracker/events.jsonl, docs/architecture/tracker.rules.md, docs/architecture/auto.rules.md, docs/architecture/views.rules.md]
---

# Idea: Say plainly whether a run delivered its goal, stopped, or left only follow-ups

## Proposal (neutral restatement)
**Problem.** After an unattended run (`/craftsman:auto` → `/goal` → `/orchestrate` → `/scrutinise`), the maintainer cannot quickly tell which of three things happened:
(a) the requested outcome was delivered;
(b) the session stopped (blocked, parked or turn cap) with planned work still open;
(c) the planned work is done and only follow-ups remain.
The maintainer runs many background sessions at once: up to 10, and two or more for 44% of active time (`docs/ideas/session-dispatcher.md`, measured there and not re-checked). How often a misread actually costs them is UNPROVEN.
**Claimed benefit.** Every run ends with an unambiguous outcome, and follow-ups no longer blur when the original goal is done.
**Who benefits.** The single maintainer.
**Done looks like.** For any slug, one line separates the planned rows (X/Y COMPLETE) from the follow-ups (N open). `/auto`'s finish and `/digest` both print it, and they agree on what "done" means.

## Verdict
**PURSUE-WITH-CHANGES** (medium). The ambiguity comes from rules that conflict. A missing view is not the cause.
- "Goal met" fires both on completion and on `BLOCKED ON USER` (`commands/instruction.md:44`).
- "Done" means every row for the slug is COMPLETE, follow-ups included (`commands/auto.md:35`, `commands/instruction.md:56`). Follow-ups are appended to that same slug (`commands/orchestrate.md:44-46`).
- `/digest` counts MERGED as done (`scripts/digest.mjs:11`).

Fix the rule first. A slug is delivered when its planned `tracker_rows` are COMPLETE. Follow-ups are reported but never block. Separate "stopped" from "delivered" in the run's last line. Clean the ledger data underneath. Do **not** add a new three-state status vocabulary or a status line that claims to drive the background-job list.

**Deciding fact:** `sandbox-auto-flow` has all 6 planned rows COMPLETE (its `tracker_rows`, `docs/plans/sandbox-auto-flow.md:7`), plus 12 follow-up rows, 5 of them PENDING (`docs/plans/TRACKER.md:169-180`). Under today's rule it can never read as done.

**Most likely to flip it:** if `tracker_rows` cannot be made authoritative across plans, defer until follow-up rows carry an explicit origin tag. A backfill diff would show this.

| criterion | score 1–5 | evidence |
|---|---|---|
| value | 3 | Shown in the ledger: sandbox-auto-flow (planned work delivered, read as open) and the live investigate-auto-flow-friction (7 MERGED, 0 COMPLETE). How often the maintainer misreads is UNPROVEN |
| system fit | 4 | A derived computation from the ledger and plan frontmatter keeps ARCH-TRACKER-01 (one status source) and ARCH-VIEWS-11 (views read-only). `tracker_rows` already exists in 38 of 40 plan docs |
| cost (5 = cheap) | 4 | The smallest slice is about 2 units: a rule plus `tracker.mjs` normalisation, and data hygiene. Command byte caps ratchet (ARCH-SLIM-17), so the finish text must stay terse |
| risk (5 = low) | 3 | Main hazard: a wrong planned set gives a false "delivered". Mitigate by listing unclassified rows instead of guessing |
| reversibility | 4 | Derived output plus a rule-text change; the only data change is a fixture purge |
| evidence strength | 3 | Ledger facts verified. Frequency unproven; one research premise (job-list status lines) is contested (see Disputed) |

## Overlap & prior work
- **Extends** `docs/ideas/external-project-board.md` (architected). It built the dashboard and `/digest` views. Its re-evaluation records that the problem then was "not lost status". This idea is the lost-status case it set aside. Its constraints apply: ARCH-VIEWS-11 (read-only, derived).
- **Adjacent** `docs/ideas/session-dispatcher.md` (pursue-with-changes, not built): it orders and caps sessions; it does not report outcomes.
- **Adjacent, in flight** `docs/plans/investigate-auto-flow-friction.md`: it stops `/auto` looping on stale bindings and parked criteria (95 of 96 goal evaluations were met:false). It does not change what "done" means. The two should land in sequence, not in parallel: both edit `commands/instruction.md` and `commands/auto.md`.
- **No conflict found** with `tracker.rules.md`. ARCH-TRACKER-04 (COMPLETE only via ticked criteria) is untouched: this changes which rows count toward *slug* done, not how a row reaches COMPLETE.
- Searched: `docs/ideas/*.md` (14), `docs/plans/TRACKER.md`, the "follow-up" grep across `commands/`, `scripts/` and `docs/architecture/`, `docs/architecture/auto.md`, `views.md`.

## System fit (whole project)
- **Contract ripple:** `.craftsman/runs/<slug>.json` gains a planned/follow-up split. Its consumers are `/auto` Phase C (`commands/auto.md:31`), `scripts/digest.mjs` and `scripts/lib/dashboard.mjs`. `tracker_rows` gains its first reader; it has none today (grep of `scripts/*.mjs` and `scripts/lib/*.mjs`, non-test: zero hits).
- **Data:** purge 14 fixture events from `.craftsman/tracker/events.jsonl`. They put 17–19 rows for non-existent plans (`example`, `f`, `a`, `demo`, `release`) into TRACKER.md, published in commit `a92226a` (2026-10-25). Triage the 35 rows stuck at MERGED (28 from 2026-08-27/28).
- **Config & flags:** N/A (no new key needed).
- **Security:** N/A (read-only derivation; the fixture purge goes through `tracker.mjs`, not a hand edit).
- **Tests:** a `tracker.mjs` status test for planned/follow-up/unclassified; a test that both `TRACKER#id` and bare ids normalise; a digest test that MERGED is not done. Also find and fix the test that leaked fixtures into the real ledger (UNPROVEN which one).
- **Observability:** the existing `tracker_transition` events suffice; optionally log the outcome computed at Finish.
- **UI:** `/auto` Finish text (`commands/auto.md:35`), the `/goal` template's met clause (`commands/instruction.md:44,56`), and the dashboard's plans board.
- **Docs:** `tracker.rules.md` (slug-done definition), `auto.rules.md` (ARCH-AUTO-03 finish), `views.rules.md` (digest's done set); the `plan-template.md:22` `tracker_rows` format.
- **Second-order effects:**
  - Follow-ups become easier to ignore. A follow-up count must stay visible, or debt grows silently: there are already 29 PENDING `followup-*` rows against 3 COMPLETE.
  - Every new plan must keep `tracker_rows` honest.
  - Command bytes rise slightly under a ratcheting cap.

## Research
- Status and conclusion are kept separate. GitHub check runs report a run's state apart from its conclusion (`success`, `neutral`, `action_required`, `failure`, …), and `action_required` means a human must act: https://docs.github.com/en/rest/guides/using-the-rest-api-to-interact-with-checks, https://docs.github.com/en/pull-requests/reference/status-checks. A run status is also kept independent of a semantic verdict here: https://silfaran.github.io/ai-standards/concepts/status-block-contract.
- Claude Code agent view groups background sessions as Needs input / Working / Completed: https://code.claude.com/docs/en/agent-view. The critic read the docs as deriving that state from the runtime, not from model text (see Disputed).
- Handoffs should tie back to the original request with evidence, deviations, next action and owner: https://docs.plannotator.ai/learn/code-context/ai-coding-agent-handoff. An agent's "all done" is a claim until checked: https://levelup.gitconnected.com/spec-driven-development-done-is-a-claim-until-the-spec-says-how-to-check-it-ecad8757644c. This argues for deriving the outcome from the ledger, not from the model's summary.
- Definition of Done stays fixed, and new work goes to a separate linked item: https://www.atlassian.com/blog/development/4-how-tos-dealing-with-scope-creep, https://www.atlassian.com/agile/project-management/definition-of-done. No source gave a formal follow-up-link convention.
- Approaches weighed:
  1. Derived outcome from the ledger plus `tracker_rows`. Chosen.
  2. Explicit origin tag on follow-up rows. Fallback if (1)'s source proves unreliable.
  3. A final status-line convention. Kept only as human-readable text.
  4. Data hygiene alone. Necessary but not sufficient.

## Critique
- **Steelman.** The ledger already shows the failure. A plan whose planned work is all COMPLETE reads as unfinished forever, because follow-ups share its slug and "done" means every row. "Goal met" means "stopped", not "delivered". `/digest` and `/auto` disagree on done. The planned set is already recorded per plan, so the fix is a pure derivation with no new state.
- **Strongest case against.** The planned-set source is unread and inconsistently formatted (`TRACKER#id` in `docs/plans/sandbox-auto-flow.md:7`, the form `plan-template.md:22` documents, versus bare ids in `investigate-auto-flow-friction`). A derivation built on it can confidently say "delivered" when it is wrong. That is worse than today's honest ambiguity.
- **Hidden assumptions.**
  - *`tracker_rows` matches each plan's planned rows.* Test: diff it against the plan's non-`followup-*` ledger rows across all plans. sandbox-auto-flow passes (6/6).
  - *The maintainer actually misreads outcomes.* Test: look in transcripts for `/auto` re-runs on slugs whose planned rows were already COMPLETE.
  - *The 35 MERGED rows are lag, not gaps.* Test: check them for unticked criteria (ARCH-TRACKER-04).
- **Failure modes.**
  - A wrong planned set gives a false "delivered".
  - New plans skip `tracker_rows` and the outcome decays silently. Needs a lint or test.
  - The fixture leak recurs unless the leaking test is fixed.
  - Follow-up debt becomes invisible once it no longer blocks "done".
- **Kill criteria.**
  - The owner confirms the remaining-rows list already printed at `auto.md:35` is enough.
  - More than about 20% of plans fail the `tracker_rows` diff and won't be backfilled.
  - The finish change cannot fit the command byte cap.
  - After hygiene and the rule fix, no slug remains ambiguous. Then stop: the smallest slice was the whole job.
- **Cheaper alternatives.**
  - *Do nothing.* sandbox-like slugs never read as done, and `/auto` keeps prompting on follow-up debt.
  - *Smallest slice (recommended).* Rule fix plus normalisation plus hygiene, with no new vocabulary.
  - *Origin tag.* More robust, but writers must comply and it needs a schema change.

## Disputed
- **Critic: sandbox-auto-flow has 7 non-follow-up rows missing from `tracker_rows`.** Dropped. The critic's match on `sandbox-auto-flow.md) |` also caught `scrutinise-sandbox-auto-flow` rows (e.g. `bracket-literal-fallback` at `docs/plans/TRACKER.md:277`). Rows linked exactly to `[sandbox-auto-flow]` are the 6 `tracker_rows`, all COMPLETE, plus 12 `followup-*` rows. The planned set matches here. This *raises* confidence in approach 1, and the inconsistent format (`TRACKER#` vs bare) remains a real issue.
- **Critic: the job-list status-line premise is false.** Softened, not dropped. The agent-view docs describe state from the runtime and pending prompts. But this very background session's harness instructions state that a classifier reads the model's message text for `result:` / `needs input:` / `failed:` lines to track job-list state. Neither is a stable public contract for craftsman to build on, so the job-state mapping is dropped as a *goal*. A plain first-line `OUTCOME:` text is still recommended for the human reader. It costs a line and harms nothing.
- **Critic: 35 MERGED, not 28.** Accepted. 28 rows date from August and 7 from the live run (`grep -c '| MERGED |' docs/plans/TRACKER.md` = 35).

## Recommendations
1. **Redefine slug-done** in `commands/auto.md:35`, `commands/instruction.md:56` and `tracker.rules.md`: delivered = every row in the plan's `tracker_rows` is COMPLETE. Follow-ups are reported in a second line ("follow-ups: N open → `/craftsman:plan` or park") and never block.
2. **Separate stopped from delivered** in the `/goal` template (`commands/instruction.md:44`). The final turn's first line is `OUTCOME: delivered` or `OUTCOME: stopped — needs you: <one thing>`, derived from the ledger, not asserted.
3. **Normalise and validate `tracker_rows`** in `scripts/tracker.mjs`: accept `TRACKER#id` and bare ids, and put the split into `.craftsman/runs/<slug>.json`. A row that is neither planned nor `followup-*` is listed as **unclassified**, never guessed. Add a check that every plan has `tracker_rows`. First, run the diff across all plans as a spike.
4. **Clean the ledger.** Purge the fixture rows (`example`, `f`, `a`, `demo`, `release`) and find and fix the test that leaked them. Make `scripts/digest.mjs:11` count only COMPLETE as done (show MERGED as "shipped, awaiting COMPLETE", as `digest.mjs:64` already phrases it). Triage the 35 MERGED rows.
5. **Sequence after** `investigate-auto-flow-friction` lands (r3c/r3d open), since both edit `auto.md` and `instruction.md`.
6. **Cut:** a new three-state vocabulary across every view, and any claim that a status line drives the background-job list.

## Open questions
- Does "runs are lost" also mean *finding* which session or repo a run is in? That would be a cross-session index, which session-dispatcher / agent view covers. Or does it only mean telling a run's outcome? **Answered 2026-11-25: outcome only.** Finding runs is not the issue, so `session-dispatcher` stays separate.
- Should follow-ups keep living under the originating slug (reported separately), or move to a `followups-<slug>` child plan with `parent:`, as scrutinise already does (`docs/plans/scrutinise-sandbox-auto-flow.md:5`)? **Answered 2026-11-25: keep them under the slug and report them separately**, as Recommendation 1 says. No child plan, no row migration.

## Next step
`/craftsman:architect run-outcome-clarity`. Standard depth is enough: the change is a rule plus a derivation, not cross-cutting infrastructure. Start with the `tracker_rows` diff spike.
