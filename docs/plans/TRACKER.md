# Execution tracker

Shared across sessions. This is the compact human view of execution state.
Only touch rows you created; never prune foreign rows without `/sync-docs --tracker` evidence.

## How to read this

- **Goal** is the user-visible result, not an implementation description.
- **Plan** is a direct link to the plan document. Open it, then use the link's context menu to copy its target into a new session.
- **Status** is one short state only. Review notes, gate results, and merge SHAs belong in **Evidence** or the linked plan.
- **Evidence** is terse: use a commit SHA, test result, review verdict, or a short blocker. Keep the table scannable.
- `PENDING -> IN_PROGRESS -> MERGED -> COMPLETE` is the normal path. Use `BLOCKED` or `PARKED` only with a reason in Evidence.

## Feature goals

| plan | goal | open rows |
|------|------|-----------|
| [engine-self-improvements](./engine-self-improvements.md) | Improve engine telemetry, scrutiny, and stop-time verification. | 0 |
| [token-efficiency](./token-efficiency.md) | Reduce repeated context, review, and orchestration token cost. | 0 |
| [audit-fixes](./audit-fixes.md) | Close the verified audit findings across guards, reviews, docs, and CI. | 0 |
| [known-issues-doc](./known-issues-doc.md) | Preserve skipped and pre-existing findings as truthful project documentation. | 0 |
| [engine-hardening](./engine-hardening.md) | Harden lifecycle, security-scan, scope, and session behavior. | 0 |
| [scrutinise-engine-hardening](./scrutinise-engine-hardening.md) | Simplify and correct verified hardening findings after implementation review. | 3 |

## Execution rows

| id | plan | unit / module | language | security | status | evidence | updated |
|----|------|--------------|----------|----------|--------|----------|---------|
| 1 | [engine-self-improvements](./engine-self-improvements.md) | craftsman.config.json | JSON/JS | normal | MERGED | shipped | 2026-08-27 |
| 2 | [engine-self-improvements](./engine-self-improvements.md) | stats, log-router, scrutinise | JS | normal | MERGED | shipped | 2026-08-27 |
| 3 | [engine-self-improvements](./engine-self-improvements.md) | core.test.mjs | node:test | normal | MERGED | shipped | 2026-08-27 |
| 4 | [engine-self-improvements](./engine-self-improvements.md) | snapshot, stop-gate | JS | normal | MERGED | shipped | 2026-08-27 |
| 5 | [token-efficiency](./token-efficiency.md) | orchestrate.md | Markdown | normal | MERGED | shipped | 2026-08-27 |
| 6 | [token-efficiency](./token-efficiency.md) | scrutinise, deep review, triviality | Markdown/JS | normal | MERGED | shipped | 2026-08-27 |
| 7 | [token-efficiency](./token-efficiency.md) | config, plan, EXTENDING | JSON/Markdown | normal | MERGED | shipped | 2026-08-27 |
| 8 | [token-efficiency](./token-efficiency.md) | CHANGELOG | Markdown | normal | MERGED | shipped | 2026-08-27 |
| 9 | [audit-fixes](./audit-fixes.md) | core, quality, stop, session, snapshot, pre-guard, baseline | JS | normal | MERGED | shipped | 2026-08-27 |
| 10 | [audit-fixes](./audit-fixes.md) | craftsman.config.json | JSON | normal | MERGED | shipped | 2026-08-27 |
| 11 | [audit-fixes](./audit-fixes.md) | review agents | Markdown | normal | MERGED | shipped | 2026-08-27 |
| 12 | [audit-fixes](./audit-fixes.md) | shared machinery and execution | Markdown | normal | MERGED | shipped | 2026-08-27 |
| 13 | [audit-fixes](./audit-fixes.md) | orchestrate.md | Markdown | normal | MERGED | shipped | 2026-08-27 |
| 14 | [audit-fixes](./audit-fixes.md) | plan.md | Markdown | normal | MERGED | shipped | 2026-08-27 |
| 15 | [audit-fixes](./audit-fixes.md) | scrutinise commands | Markdown | normal | MERGED | shipped | 2026-08-27 |
| 16 | [audit-fixes](./audit-fixes.md) | understand, investigate, fix-tests, sync-docs | Markdown | normal | MERGED | shipped | 2026-08-27 |
| 17 | [audit-fixes](./audit-fixes.md) | plugin manifests | JSON | normal | MERGED | shipped | 2026-08-27 |
| 18 | [audit-fixes](./audit-fixes.md) | README, EXTENDING, CONTRIBUTING, CHANGELOG | Markdown | normal | MERGED | shipped | 2026-08-27 |
| 19 | [audit-fixes](./audit-fixes.md) | core tests and CI | JS/YAML | normal | MERGED | shipped | 2026-08-27 |
| 20 | [known-issues-doc](./known-issues-doc.md) | core, baseline, core tests | JS | normal | MERGED | shipped | 2026-08-28 |
| 21 | [known-issues-doc](./known-issues-doc.md) | config, baseline, docs, install, README, CHANGELOG | JSON/Markdown | normal | MERGED | shipped | 2026-08-28 |
| 22 | [engine-hardening](./engine-hardening.md) | stop-gate, snapshot, core, config, EXTENDING | JS/JSON/Markdown | normal | MERGED | 0b5557a + review addenda | 2026-08-28 |
| 23 | [engine-hardening](./engine-hardening.md) | core, session-context, baseline | JS | normal | MERGED | 94bfbc7 + review | 2026-08-28 |
| 24 | [engine-hardening](./engine-hardening.md) | understand, investigate, sync-docs | Markdown | normal | MERGED | 0e860db + router skip | 2026-08-28 |
| 25 | [engine-hardening](./engine-hardening.md) | CHANGELOG | Markdown | normal | MERGED | 42f9265 | 2026-08-28 |
| 26 | [scrutinise-engine-hardening](./scrutinise-engine-hardening.md) | stop-gate budget truncation | JS | normal | MERGED | eda9173 + review correction | 2026-08-28 |
| 27 | [scrutinise-engine-hardening](./scrutinise-engine-hardening.md) | core, session-context, tests | JS | normal | MERGED | 6ceb8a4 + review | 2026-08-28 |
| 28 | [scrutinise-engine-hardening](./scrutinise-engine-hardening.md) | stop-gate comment compression | Markdown | normal | MERGED | 586a78a + router skip | 2026-08-28 |
| follow-up-1 | [scrutinise-engine-hardening](./scrutinise-engine-hardening.md) | dirty-gate and marker runtime fixtures | JS | normal | PENDING | partly shipped — the process/hook harness now exists (`stop-gate.test.mjs` spawns real processes over tmp fixtures) and covers the dirty-gate/`shouldScan` decision and the `secrets-scanned` marker state machine; the acceptance-criteria ownership path (`acceptance.ref` hash) remains untested | 2026-09-14 |
| follow-up-2 | [scrutinise-engine-hardening](./scrutinise-engine-hardening.md) | test/extra own-timeout classification | JS | normal | PENDING | no plan yet; investigate timeout semantics | 2026-08-28 |
| follow-up-3 | [scrutinise-engine-hardening](./scrutinise-engine-hardening.md) | missing secrets scanner signal | JS | normal | COMPLETE | shipped — `secrets-scan.mjs`'s `scanTree` is the built-in fallback when the configured scanner is absent, opt-out via `security.builtinFallback: false` (`stop-gate.mjs:199-216`); covered by three `stop-gate.test.mjs` cases: fallback-disabled blocks visibly without marking the session scanned, fallback passes a clean tree, fallback blocks on a real finding | 2026-09-14 |

## Live ledger

<!-- craftsman:ledger:begin -->
<!-- Generated from the tracker ledger (.craftsman/tracker/events.jsonl) after every transition. Do not edit by hand: change a row with scripts/tracker.mjs. -->

| plan | unit | module | status | evidence | updated |
|---|---|---|---|---|---|
| [feature-branch-plans](./feature-branch-plans.md) | changelog-cut | CHANGELOG.md | COMPLETE | all 1 acceptance criteria ticked; changelog+descriptions tests 5/5; direct merg… | 2026-10-18 |
| [feature-branch-plans](./feature-branch-plans.md) | doc-retire | scripts/doc-retire.mjs | COMPLETE | all 4 acceptance criteria ticked; merged to main 27d2ac9 (direct push) | 2026-10-18 |
| [feature-branch-plans](./feature-branch-plans.md) | doc-retire-tree | scripts/doc-retire.mjs | COMPLETE | all 2 acceptance criteria ticked; merged to main 3805942 (direct ff) | 2026-10-18 |
| [feature-branch-plans](./feature-branch-plans.md) | hook-timing | scripts/pre-guard.mjs | COMPLETE | all 1 acceptance criteria ticked; merged to main 7e9998c | 2026-10-18 |
| [feature-branch-plans](./feature-branch-plans.md) | lookup-callers | commands/ | COMPLETE | all 2 acceptance criteria ticked; merged to main 19f98d6 (direct ff push) | 2026-10-18 |
| [feature-branch-plans](./feature-branch-plans.md) | retire-guard | scripts/pre-guard.mjs | COMPLETE | all 2 acceptance criteria ticked; merged to main 11d1b16 (direct push) | 2026-10-18 |
| [feature-branch-plans](./feature-branch-plans.md) | size-policy | scripts/doc-size-policy.mjs | COMPLETE | all 2 acceptance criteria ticked; merged to main 0bfdd4e (direct push) | 2026-10-18 |
| [feature-branch-plans](./feature-branch-plans.md) | source-lint | scripts/arch-check.mjs | COMPLETE | all 1 acceptance criteria ticked; merged to main b628d6530cf42b7b455b802ea8116b… | 2026-10-18 |
| [feature-branch-plans](./feature-branch-plans.md) | stats-latency | scripts/stats.mjs | COMPLETE | all 3 acceptance criteria ticked; merged to main 08bb97a (direct ff push); resu… | 2026-10-18 |
| [feature-branch-plans](./feature-branch-plans.md) | sync-docs-modes | commands/sync-docs.md | COMPLETE | all 2 acceptance criteria ticked; wiring+arch-check+descriptions 30/30, size po… | 2026-10-18 |
| [feature-branch-plans](./feature-branch-plans.md) | tracker-lookup | scripts/tracker.mjs | COMPLETE | all 2 acceptance criteria ticked; merged to main 2f36f44 (direct ff) | 2026-10-18 |
| [feature-branch-plans](./feature-branch-plans.md) | trim-at-cap | commands/ | COMPLETE | all 2 acceptance criteria ticked; merged to main 6f72cb1 (direct ff push); size… | 2026-10-18 |
| [plan-hierarchy](./plan-hierarchy.md) | arch-lint | scripts/arch-check.mjs | COMPLETE | all 1 acceptance criteria ticked; merged to main (direct) | 2026-10-18 |
| [plan-hierarchy](./plan-hierarchy.md) | claim-feature | scripts/claim.mjs | COMPLETE | all 1 acceptance criteria ticked; merged to main eb0c140 | 2026-10-18 |
| [plan-hierarchy](./plan-hierarchy.md) | command-docs | commands/ | COMPLETE | all 2 acceptance criteria ticked; merged to main 58e9536 (direct) | 2026-10-18 |
| [plan-hierarchy](./plan-hierarchy.md) | config-keys | craftsman.config.json | COMPLETE | all 2 acceptance criteria ticked; merged to main (direct) | 2026-10-18 |
| [plan-hierarchy](./plan-hierarchy.md) | core-features | scripts/lib/core.mjs | COMPLETE | all 3 acceptance criteria ticked; merged direct to main 9d0f577 | 2026-10-18 |
| [plan-hierarchy](./plan-hierarchy.md) | engine-run | workflows/run.js | COMPLETE | all 2 acceptance criteria ticked; merged to main (direct) | 2026-10-18 |
| [plan-hierarchy](./plan-hierarchy.md) | graph-features | scripts/plan-graph.mjs | COMPLETE | all 2 acceptance criteria ticked; merged to main (direct) | 2026-10-18 |
| [plan-hierarchy](./plan-hierarchy.md) | guard-session | scripts/orchestrate-scope-guard.mjs | COMPLETE | all 2 acceptance criteria ticked; merged to main 134ce05 (direct ff push) | 2026-10-18 |
| [plan-hierarchy](./plan-hierarchy.md) | init-stamp | scripts/init.mjs | COMPLETE | all 1 acceptance criteria ticked; merged to main bfbbe88 (direct ff) | 2026-10-18 |
| [plan-hierarchy](./plan-hierarchy.md) | land-feature | scripts/repo-exec.mjs | COMPLETE | all 2 acceptance criteria ticked; merged direct to main, 741347a; repo-exec.tes… | 2026-10-18 |
| [plan-hierarchy](./plan-hierarchy.md) | land-unit | scripts/repo-exec.mjs | COMPLETE | all 2 acceptance criteria ticked; merged to main e76fecf, pushed | 2026-10-18 |
| [plan-hierarchy](./plan-hierarchy.md) | ledger-feature | scripts/tracker.mjs | COMPLETE | all 2 acceptance criteria ticked; merged to main a0a0fe8 (direct push) | 2026-10-18 |
| [plan-hierarchy](./plan-hierarchy.md) | plan-index | scripts/lib/plan-index.mjs | COMPLETE | all 3 acceptance criteria ticked; merged to main 896ba13 (direct ff push); 11 t… | 2026-10-18 |
| [plan-hierarchy](./plan-hierarchy.md) | pr-submodule | scripts/repo-exec.mjs | COMPLETE | all 2 acceptance criteria ticked; merged to main (direct) | 2026-10-18 |
| [plan-hierarchy](./plan-hierarchy.md) | publish | scripts/tracker-publish.mjs | COMPLETE | all 3 acceptance criteria ticked; direct merge to main c479e6e | 2026-10-18 |
| [plan-hierarchy](./plan-hierarchy.md) | release-docs | CHANGELOG.md | COMPLETE | all 2 acceptance criteria ticked; merged to main (direct); 20.2 judged against … | 2026-10-18 |
| [plan-hierarchy](./plan-hierarchy.md) | repo-prepare | scripts/repo-exec.mjs | COMPLETE | all 3 acceptance criteria ticked; merged to main f563f6c (direct ff); 31 tests … | 2026-10-18 |
| [plan-hierarchy](./plan-hierarchy.md) | rollups | scripts/lib/tracker-rollup.mjs | COMPLETE | all 3 acceptance criteria ticked; merged to main (direct) | 2026-10-18 |
| [plan-hierarchy](./plan-hierarchy.md) | shared-scope | scripts/scope.mjs | COMPLETE | all 1 acceptance criteria ticked; direct merge to main 7b4451b | 2026-10-18 |
| [plan-hierarchy](./plan-hierarchy.md) | stop-feature | scripts/stop-gate.mjs | COMPLETE | all 1 acceptance criteria ticked; merged to main 2d00eaa direct ff | 2026-10-18 |
| [scrutinise-feature-branch-plans](./scrutinise-feature-branch-plans.md) | ci-size-delta | scripts/script-size-delta.mjs | COMPLETE | all 3 acceptance criteria ticked; merged to main 0816ee8 | 2026-10-18 |
| [scrutinise-feature-branch-plans](./scrutinise-feature-branch-plans.md) | guard-bypass | scripts/pre-guard.mjs | COMPLETE | all 2 acceptance criteria ticked; direct merge e56a6be on main | 2026-10-18 |
| [scrutinise-feature-branch-plans](./scrutinise-feature-branch-plans.md) | guard-env | scripts/pre-guard.mjs | COMPLETE | all 2 acceptance criteria ticked; direct merge to main ca26733 | 2026-10-18 |
| [scrutinise-feature-branch-plans](./scrutinise-feature-branch-plans.md) | guard-failclosed | scripts/pre-guard.mjs | COMPLETE | all 3 acceptance criteria ticked; merged to main 0dfec17 (direct push) | 2026-10-18 |
| [scrutinise-feature-branch-plans](./scrutinise-feature-branch-plans.md) | guard-failclosed-2 | scripts/pre-guard.mjs | IN_PROGRESS | unit-runner | 2026-10-18 |
| [scrutinise-feature-branch-plans](./scrutinise-feature-branch-plans.md) | guard-failclosed-fix | scripts/pre-guard.mjs | COMPLETE | all 6 acceptance criteria ticked; merged to main 3c9a10b (direct ff push) | 2026-10-18 |
| [scrutinise-feature-branch-plans](./scrutinise-feature-branch-plans.md) | guard-find-icase | scripts/pre-guard.mjs | COMPLETE | all 2 acceptance criteria ticked; merged to main e17c43b | 2026-10-18 |
| [scrutinise-feature-branch-plans](./scrutinise-feature-branch-plans.md) | guard-git-env | scripts/pre-guard.mjs | COMPLETE | all 2 acceptance criteria ticked; merged to main 8ad7d0b (direct ff push) | 2026-10-18 |
| [scrutinise-feature-branch-plans](./scrutinise-feature-branch-plans.md) | guard-icase-env | scripts/pre-guard.mjs | COMPLETE | all 2 acceptance criteria ticked; landed by hand after classifier denial: full … | 2026-10-18 |
| [scrutinise-feature-branch-plans](./scrutinise-feature-branch-plans.md) | guard-overblock | scripts/pre-guard.mjs | COMPLETE | all 2 acceptance criteria ticked; merged to main 035b946 (direct ff push) | 2026-10-18 |
| [scrutinise-feature-branch-plans](./scrutinise-feature-branch-plans.md) | guard-pathspec | scripts/pre-guard.mjs | COMPLETE | all 2 acceptance criteria ticked; merged to main c122a11 (direct ff push) | 2026-10-18 |
| [scrutinise-feature-branch-plans](./scrutinise-feature-branch-plans.md) | guard-quotes | scripts/pre-guard.mjs | COMPLETE | all 3 acceptance criteria ticked; merged to main b0a7c45 | 2026-10-18 |
| [scrutinise-feature-branch-plans](./scrutinise-feature-branch-plans.md) | guard-regress | scripts/pre-guard.mjs | COMPLETE | all 3 acceptance criteria ticked; landed by hand after classifier denial: pre-g… | 2026-10-18 |
| [scrutinise-feature-branch-plans](./scrutinise-feature-branch-plans.md) | guard-subshell | scripts/pre-guard.mjs | COMPLETE | all 2 acceptance criteria ticked; landed by hand after classifier denial: full … | 2026-10-18 |
| [scrutinise-feature-branch-plans](./scrutinise-feature-branch-plans.md) | guard-vars | scripts/pre-guard.mjs | COMPLETE | all 2 acceptance criteria ticked; landed by hand after classifier denial: full … | 2026-10-18 |
| [scrutinise-feature-branch-plans](./scrutinise-feature-branch-plans.md) | guard-xargs-git | scripts/pre-guard.mjs | CANCELLED | superseded by user decision (b): fail-closed pre-guard redesign; nothing was bu… | 2026-10-18 |
| [scrutinise-feature-branch-plans](./scrutinise-feature-branch-plans.md) | lint-sentinels | scripts/arch-check.mjs | COMPLETE | all 1 acceptance criteria ticked; merged to main 1b20920 (direct) | 2026-10-18 |
| [scrutinise-feature-branch-plans](./scrutinise-feature-branch-plans.md) | preguard-event | scripts/stats.mjs | COMPLETE | all 1 acceptance criteria ticked; merged to main c9c6fc5 (direct ff) | 2026-10-18 |
| [scrutinise-feature-branch-plans](./scrutinise-feature-branch-plans.md) | prune-archive-input | commands/_sync-docs-prune.md | COMPLETE | all 1 acceptance criteria ticked; merged to main 52593f6 (direct push) | 2026-10-18 |
| [scrutinise-feature-branch-plans](./scrutinise-feature-branch-plans.md) | retire-epic | scripts/doc-retire.mjs | COMPLETE | all 2 acceptance criteria ticked; merged to main c4d686d (direct ff) | 2026-10-18 |
| [scrutinise-feature-branch-plans](./scrutinise-feature-branch-plans.md) | retire-goalless | scripts/doc-retire.mjs | COMPLETE | all 1 acceptance criteria ticked; doc-retire+tracker tests 46/46; direct merge … | 2026-10-18 |
| [scrutinise-feature-branch-plans](./scrutinise-feature-branch-plans.md) | retire-hardening | scripts/doc-retire.mjs | COMPLETE | all 4 acceptance criteria ticked; merged to main 7fc96bb | 2026-10-18 |
| [scrutinise-feature-branch-plans](./scrutinise-feature-branch-plans.md) | retire-index-heal | scripts/doc-retire.mjs | COMPLETE | all 2 acceptance criteria ticked; merged to main 2863364 (direct push) | 2026-10-18 |
| [scrutinise-feature-branch-plans](./scrutinise-feature-branch-plans.md) | retire-rollback-index | scripts/doc-retire.mjs | COMPLETE | all 3 acceptance criteria ticked; merged to main ce993dd | 2026-10-18 |
| [scrutinise-feature-branch-plans](./scrutinise-feature-branch-plans.md) | retire-rollup-parent | scripts/doc-retire.mjs | COMPLETE | all 3 acceptance criteria ticked; direct merge 5debc60 on main | 2026-10-18 |
| [scrutinise-feature-branch-plans](./scrutinise-feature-branch-plans.md) | retire-single-parser | scripts/doc-retire.mjs | COMPLETE | all 2 acceptance criteria ticked; merged direct to main 9ad8d40 | 2026-10-18 |
| [scrutinise-feature-branch-plans](./scrutinise-feature-branch-plans.md) | rm-guard | scripts/pre-guard.mjs | COMPLETE | all 2 acceptance criteria ticked; direct merge to main 7099a2947257c8e97d72a019… | 2026-10-18 |
| [scrutinise-plan-hierarchy](./scrutinise-plan-hierarchy.md) | feature-criteria | scripts/repo-exec.mjs | COMPLETE | all 1 acceptance criteria ticked; repo-exec.test 38/38; direct merge | 2026-10-18 |
| [scrutinise-plan-hierarchy](./scrutinise-plan-hierarchy.md) | feature-fields | commands/_features.md | COMPLETE | all 2 acceptance criteria ticked; engine+wiring 23/23; doc-size PASS; direct me… | 2026-10-18 |
| [scrutinise-plan-hierarchy](./scrutinise-plan-hierarchy.md) | gate-chain | scripts/repo-exec.mjs | COMPLETE | all 1 acceptance criteria ticked; merged to main 4d69b45 (direct) | 2026-10-18 |
| [scrutinise-plan-hierarchy](./scrutinise-plan-hierarchy.md) | gate-fail-closed | scripts/repo-exec.mjs | COMPLETE | all 1 acceptance criteria ticked; merged to main 8e583e7 (direct) | 2026-10-18 |
| [scrutinise-plan-hierarchy](./scrutinise-plan-hierarchy.md) | gate-parser | scripts/repo-exec.mjs | COMPLETE | all 1 acceptance criteria ticked; direct merge a6d0a07 on main | 2026-10-18 |
| [scrutinise-plan-hierarchy](./scrutinise-plan-hierarchy.md) | gate-rollups | scripts/repo-exec.mjs | COMPLETE | all 1 acceptance criteria ticked; repo-exec.test 36/36; direct ff merge b08a152… | 2026-10-18 |
| [scrutinise-plan-hierarchy](./scrutinise-plan-hierarchy.md) | guard-level-flags | scripts/orchestrate-scope-guard.mjs | COMPLETE | all 1 acceptance criteria ticked; merged to main 193c240 (direct ff push) | 2026-10-18 |
| [scrutinise-plan-hierarchy](./scrutinise-plan-hierarchy.md) | historic-budget | docs/plans/autonomous-e2e-loop.md | COMPLETE | all 1 acceptance criteria ticked; merged to main cc2b6b0 (direct) | 2026-10-18 |
| [scrutinise-plan-hierarchy](./scrutinise-plan-hierarchy.md) | index-hardening | scripts/lib/plan-index.mjs | COMPLETE | all 2 acceptance criteria ticked; merged direct to main dde1fa1 | 2026-10-18 |
| [scrutinise-plan-hierarchy](./scrutinise-plan-hierarchy.md) | land-linked | scripts/repo-exec.mjs | COMPLETE | all 1 acceptance criteria ticked; merged to main af4a642 | 2026-10-18 |
| [scrutinise-plan-hierarchy](./scrutinise-plan-hierarchy.md) | plan-graph-cap | scripts/plan-graph.mjs | COMPLETE | all 2 acceptance criteria ticked; merged to main (direct) | 2026-10-18 |
| [scrutinise-plan-hierarchy](./scrutinise-plan-hierarchy.md) | publish-archive-window | scripts/tracker-publish.mjs | COMPLETE | all 1 acceptance criteria ticked; merged to main 01aecf7 (direct ff push) | 2026-10-18 |
| [scrutinise-plan-hierarchy](./scrutinise-plan-hierarchy.md) | publish-hardening | scripts/tracker-publish.mjs | COMPLETE | all 2 acceptance criteria ticked; tracker-publish.test 8/8; direct merge 694ab3… | 2026-10-18 |
| [scrutinise-plan-hierarchy](./scrutinise-plan-hierarchy.md) | repo-hardening | scripts/repo-exec.mjs | COMPLETE | all 2 acceptance criteria ticked; merged to main 843c7b6 (pushed) | 2026-10-18 |
| [scrutinise-plan-hierarchy](./scrutinise-plan-hierarchy.md) | status-consumers | scripts/digest.mjs | COMPLETE | all 1 acceptance criteria ticked; merged to main b08a152 (direct push) | 2026-10-18 |
| [scrutinise-plan-hierarchy](./scrutinise-plan-hierarchy.md) | tracker-park | scripts/tracker.mjs | COMPLETE | all 2 acceptance criteria ticked; merged to main 468d719 (direct ff) | 2026-10-18 |

<!-- craftsman:ledger:end -->
