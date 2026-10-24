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
| follow-up-3 | [scrutinise-engine-hardening](./scrutinise-engine-hardening.md) | missing secrets scanner signal | JS | normal | COMPLETE | shipped — `secrets-scan.mjs`'s `scanTree` is the built-in fallback when the configured scanner is absent, opt-out via `security.builtinFallback: false` (`stop-gate.mjs:199-216`); covered by three `stop-gate.test.mjs` cases: fallback-disabled blocks visibly without marking the session scanned, fallback passes a clean tree, fallback blocks on a real finding | 2026-09-14 |

## Live ledger

<!-- craftsman:ledger:begin -->
<!-- Generated from the tracker ledger (.craftsman/tracker/events.jsonl) after every transition. Do not edit by hand: change a row with scripts/tracker.mjs. -->

| plan | unit | module | status | evidence | updated |
|---|---|---|---|---|---|
| [dev-lifecycle-docs-plan](./dev-lifecycle-docs-plan.md) | approval-page | scripts/lib/approval-page.mjs | COMPLETE | all 3 acceptance criteria ticked; d077cb4 on main; approval-page tests 8/8; pag… | 2026-10-23 |
| [dev-lifecycle-docs-plan](./dev-lifecycle-docs-plan.md) | approval-protocol | commands/_approval.md | COMPLETE | all 4 acceptance criteria ticked; 4e075d5 on main; _approval.md 2130 B; auto.md… | 2026-10-23 |
| [dev-lifecycle-docs-plan](./dev-lifecycle-docs-plan.md) | approval-record | scripts/approval.mjs | COMPLETE | all 3 acceptance criteria ticked; 038049b on main; approval tests 6/6; check re… | 2026-10-23 |
| [dev-lifecycle-docs-plan](./dev-lifecycle-docs-plan.md) | baseline-metric | scripts/telemetry.mjs | COMPLETE | all 3 acceptance criteria ticked; 6d43dce on main; baseline event once per sid;… | 2026-10-23 |
| [dev-lifecycle-docs-plan](./dev-lifecycle-docs-plan.md) | closing-changelog | CHANGELOG.md | COMPLETE | all 2 acceptance criteria ticked; d04dc32 on main; one [Unreleased] entry under… | 2026-10-23 |
| [dev-lifecycle-docs-plan](./dev-lifecycle-docs-plan.md) | docs-budgets | scripts/arch-check.mjs | COMPLETE | all criteria ticked | 2026-10-24 |
| [dev-lifecycle-docs-plan](./dev-lifecycle-docs-plan.md) | fix-bypass-allowlist | scripts/pre-guard.mjs | COMPLETE | all 3 acceptance criteria ticked; landed to main; suite 974 pass 0 fail | 2026-10-23 |
| [dev-lifecycle-docs-plan](./dev-lifecycle-docs-plan.md) | fix-evidence-flow | workflows/run.js | COMPLETE | all 2 acceptance criteria ticked; landed; suite green; caps held | 2026-10-23 |
| [dev-lifecycle-docs-plan](./dev-lifecycle-docs-plan.md) | fix-force-config-xargs | scripts/lib/force-block.mjs | COMPLETE | all 3 acceptance criteria ticked; landed; suite green | 2026-10-24 |
| [dev-lifecycle-docs-plan](./dev-lifecycle-docs-plan.md) | fix-heredoc-strict | scripts/lib/heredoc-allow.mjs | COMPLETE | all 3 acceptance criteria ticked; landed to main; suite 981 pass 0 fail | 2026-10-23 |
| [dev-lifecycle-docs-plan](./dev-lifecycle-docs-plan.md) | fix-lease-expansion | scripts/lib/force-block.mjs | COMPLETE | all 4 acceptance criteria ticked; landed; suite green; lease refuses expansions | 2026-10-23 |
| [dev-lifecycle-docs-plan](./dev-lifecycle-docs-plan.md) | fix-lease-qualified | scripts/lib/force-block.mjs | COMPLETE | all 3 acceptance criteria ticked; landed; suite green | 2026-10-24 |
| [dev-lifecycle-docs-plan](./dev-lifecycle-docs-plan.md) | fix-lease-toplevel | scripts/lib/force-block.mjs | COMPLETE | all 3 acceptance criteria ticked; landed; suite green | 2026-10-24 |
| [dev-lifecycle-docs-plan](./dev-lifecycle-docs-plan.md) | fix-red-run-evidence | agents/code-reviewer.md | COMPLETE | all 3 acceptance criteria ticked; landed to main; suite 981 pass 0 fail | 2026-10-23 |
| [dev-lifecycle-docs-plan](./dev-lifecycle-docs-plan.md) | fix-reviewer-red | agents/code-reviewer.md | COMPLETE | all 2 acceptance criteria ticked; landed to main; suite 974 pass 0 fail | 2026-10-23 |
| [dev-lifecycle-docs-plan](./dev-lifecycle-docs-plan.md) | force-lease | scripts/lib/force-block.mjs | COMPLETE | all 2 acceptance criteria ticked; 0e0428f on main; force-block tests 3/3; no ca… | 2026-10-23 |
| [dev-lifecycle-docs-plan](./dev-lifecycle-docs-plan.md) | guard-narrowing | scripts/pre-guard.mjs | COMPLETE | all 4 acceptance criteria ticked; landed to main; suite 973 pass 0 fail | 2026-10-23 |
| [dev-lifecycle-docs-plan](./dev-lifecycle-docs-plan.md) | guard-stats | scripts/stats.mjs | COMPLETE | all 2 acceptance criteria ticked; 267514e on main; stats tests 6/6; also ranks … | 2026-10-23 |
| [dev-lifecycle-docs-plan](./dev-lifecycle-docs-plan.md) | land-gate | scripts/repo-exec.mjs | COMPLETE | all 5 acceptance criteria ticked; 461422a on main; 9 gate tests; suite 621/622 … | 2026-10-23 |
| [dev-lifecycle-docs-plan](./dev-lifecycle-docs-plan.md) | ledger-guard | scripts/tracker-publish.mjs | COMPLETE | all 3 acceptance criteria ticked; b6e6c00 on main; tracker-publish tests 15/15;… | 2026-10-22 |
| [dev-lifecycle-docs-plan](./dev-lifecycle-docs-plan.md) | ledger-repair | scripts/tracker.mjs | COMPLETE | all 3 acceptance criteria ticked; e2cec01 on main; tracker tests 43/43; helpers… | 2026-10-23 |
| [dev-lifecycle-docs-plan](./dev-lifecycle-docs-plan.md) | profile-and-release | .claude-plugin/plugin.json | COMPLETE | all criteria ticked | 2026-10-24 |
| [dev-lifecycle-docs-plan](./dev-lifecycle-docs-plan.md) | profile-knobs | scripts/lib/user-config.mjs | COMPLETE | landed; criteria ticked; config keys set | 2026-10-24 |
| [dev-lifecycle-docs-plan](./dev-lifecycle-docs-plan.md) | retire-check | scripts/doc-retire.mjs | COMPLETE | all 2 acceptance criteria ticked; 340cbf2 on main; doc-retire tests 40/40 | 2026-10-23 |
| [dev-lifecycle-docs-plan](./dev-lifecycle-docs-plan.md) | revert-heredoc-prose | scripts/pre-guard.mjs | COMPLETE | all 3 acceptance criteria ticked; landed; pre-guard equals PR 1 except the leas… | 2026-10-23 |
| [dev-lifecycle-docs-plan](./dev-lifecycle-docs-plan.md) | rolling-scrutinise | commands/scrutinise.md | COMPLETE | all 2 acceptance criteria ticked; 6177f44 on main; scrutinise.md 8307 bytes und… | 2026-10-23 |
| [dev-lifecycle-docs-plan](./dev-lifecycle-docs-plan.md) | surface-trim | agents/*, commands/* | COMPLETE | all 4 acceptance criteria ticked; 3c62097 on main; 12 reviewers maxTurns, toggl… | 2026-10-23 |
| [dev-lifecycle-docs-plan](./dev-lifecycle-docs-plan.md) | tdd-step | agents/unit-runner.md | COMPLETE | all 3 acceptance criteria ticked; landed to main; suite 973 pass 0 fail | 2026-10-23 |
| [dev-lifecycle-docs-plan](./dev-lifecycle-docs-plan.md) | tool-slots | craftsman.config.json | COMPLETE | all 4 acceptance criteria ticked; 67a9d35 on main; doc-checks/tool-slots tests … | 2026-10-23 |
| [dev-lifecycle-docs-plan](./dev-lifecycle-docs-plan.md) | vendored-skills | skills/* | COMPLETE | all 4 acceptance criteria ticked; f70741b on main; 3 skills attributed; descrip… | 2026-10-23 |
| [external-project-board](./external-project-board.md) | archive-commands | commands/sync-docs.md | COMPLETE | all 1 acceptance criteria ticked; direct merge to main; tests pass | 2026-10-23 |
| [external-project-board](./external-project-board.md) | archive-lib | scripts/lib/archive.mjs | COMPLETE | all 1 acceptance criteria ticked; direct merge 0561cd8 (feat/archive-lib b2e099… | 2026-10-23 |
| [external-project-board](./external-project-board.md) | auto-archive | scripts/repo-exec.mjs | COMPLETE | all 1 acceptance criteria ticked; merged locally f7e636f (feat/auto-archive 5c8… | 2026-10-23 |
| [external-project-board](./external-project-board.md) | changelog | CHANGELOG.md | COMPLETE | all 2 acceptance criteria ticked; merged 2d2a67f (feat/changelog eeb9167) | 2026-10-23 |
| [external-project-board](./external-project-board.md) | dashboard-archive-tab | scripts/lib/dashboard.mjs | COMPLETE | all 1 acceptance criteria ticked; merged direct b7c15b23046ad212d0683a8b1fb98fb… | 2026-10-23 |
| [external-project-board](./external-project-board.md) | dashboard-core | scripts/lib/dashboard.mjs | COMPLETE | all 1 acceptance criteria ticked; direct merge 408991fac85b79318655c255d7af6f1b… | 2026-10-23 |
| [external-project-board](./external-project-board.md) | digest-html | scripts/digest.mjs | COMPLETE | all 1 acceptance criteria ticked; direct merge | 2026-10-23 |
| [external-project-board](./external-project-board.md) | export-notes | scripts/lib/export-notes.mjs | COMPLETE | all 1 acceptance criteria ticked; direct merge e82314f (feat/export-notes); acc… | 2026-10-23 |
| [external-project-board](./external-project-board.md) | next-queue | scripts/lib/next-queue.mjs | COMPLETE | all 1 acceptance criteria ticked; direct merge d52e615946df0cb639df4dfbd8c680df… | 2026-10-23 |
| [external-project-board](./external-project-board.md) | retire-copy | scripts/doc-retire.mjs | COMPLETE | all 2 acceptance criteria ticked; merged direct to main | 2026-10-23 |
| [external-project-board](./external-project-board.md) | retire-rewrite | scripts/doc-retire.mjs | COMPLETE | all 1 acceptance criteria ticked; direct merge to main at 94918d4 (feat/retire-… | 2026-10-23 |
| [external-project-board](./external-project-board.md) | stop-refresh | scripts/tracker-sync.mjs | COMPLETE | all 1 acceptance criteria ticked; direct merge 3da7a9e775658e98284497ccdfa10707… | 2026-10-23 |
| [external-project-board](./external-project-board.md) | tracker-heading | scripts/tracker.mjs | COMPLETE | all 1 acceptance criteria ticked; merged 2b7c678 direct to main; 75 tests green | 2026-10-23 |
| [external-project-board](./external-project-board.md) | view-commands | commands/digest.md | COMPLETE | all 1 acceptance criteria ticked; direct merge to main | 2026-10-23 |
| [p](./p.md) | u1 | — | MERGED | abc | 2026-10-22 |
| [safety-followups-backlog](./safety-followups-backlog.md) | approval-keys-protected | — | COMPLETE | 113e1d5/858a68a: both approval keys in SAFETY_CONFIG_KEYS; scrutinise r2 criter… | 2026-10-24 |
| [safety-followups-backlog](./safety-followups-backlog.md) | goal-file-main-checkout | — | COMPLETE | e7dea5e/095bd2a + 7247c03: goal file resolves via main checkout and worktree; c… | 2026-10-24 |
| [safety-followups-backlog](./safety-followups-backlog.md) | ismain-helper | — | COMPLETE | 51871b0/984f169 helper + 22 scripts switched (f845825..c889d44); doc-size-polic… | 2026-10-24 |
| [safety-followups-backlog](./safety-followups-backlog.md) | ledger-housekeeping | docs/plans/TRACKER.md | COMPLETE | 4 ledger rows closed via tracker.mjs (config-keys-protected, followup-md-dirty-… | 2026-10-24 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | approval-lock-stale-race | scripts/approval.mjs | PENDING | — | 2026-10-23 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | approval-owner-trust | scripts/pre-guard.mjs | PENDING | — | 2026-10-23 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | approval-scan-config-source | scripts/approval.mjs | PENDING | — | 2026-10-23 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | budget-ratchet-keys | scripts/arch-check.mjs | PENDING | — | 2026-10-23 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | fix-approval-hardening | scripts/approval.mjs | COMPLETE | all 4 acceptance criteria ticked; landed to main | 2026-10-23 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | fix-approval-record | scripts/approval.mjs | COMPLETE | all 7 acceptance criteria ticked; landed to main; suite green except known base… | 2026-10-23 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | fix-approval-reprepare | scripts/approval.mjs | COMPLETE | all 3 acceptance criteria ticked; landed to main | 2026-10-23 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | fix-approval-scan | scripts/approval.mjs | COMPLETE | all 3 acceptance criteria ticked; landed to main | 2026-10-23 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | fix-budget-growth | scripts/arch-check.mjs | COMPLETE | all 2 acceptance criteria ticked; landed to main; suite green except known base… | 2026-10-23 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | fix-cli-contract | scripts/tracker.mjs | COMPLETE | all 4 acceptance criteria ticked; landed to main | 2026-10-23 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | fix-gate-lookup | scripts/lib/gate-command.mjs | COMPLETE | all 5 acceptance criteria ticked; landed to main; suite green except known base… | 2026-10-23 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | fix-land-race | scripts/repo-exec.mjs | COMPLETE | all 4 acceptance criteria ticked; landed to main | 2026-10-23 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | fix-merge-retire | scripts/repo-exec.mjs | COMPLETE | all 3 acceptance criteria ticked; landed to main | 2026-10-23 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | fix-publish-atomic | scripts/tracker-publish.mjs | COMPLETE | all 3 acceptance criteria ticked; landed to main | 2026-10-23 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | fix-publish-cli | scripts/tracker.mjs | COMPLETE | all 2 acceptance criteria ticked; landed to main | 2026-10-23 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | fix-publish-single-use | scripts/tracker-publish.mjs | COMPLETE | all 5 acceptance criteria ticked; landed to main | 2026-10-23 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | fix-publish-trust | scripts/tracker-publish.mjs | COMPLETE | all 5 acceptance criteria ticked; landed to main; suite green except known base… | 2026-10-23 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | fix-stats-and-prose | scripts/stats.mjs | COMPLETE | all 2 acceptance criteria ticked; landed to main; suite green except known base… | 2026-10-23 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | fix-sync-guard | scripts/tracker.mjs | COMPLETE | all 3 acceptance criteria ticked; landed to main; suite green except known base… | 2026-10-23 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | force-block-wordlevel | scripts/lib/force-block.mjs | PENDING | — | 2026-10-24 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | lease-doc-claim | commands/auto.md | PENDING | — | 2026-10-23 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | lease-glob-anchoring | scripts/lib/force-block.mjs | PENDING | — | 2026-10-23 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | ledger-parser-dedupe | scripts/lib/ledger-keys.mjs | PENDING | — | 2026-10-23 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | offline-landed-record | scripts/lib/approval-gate.mjs | PENDING | — | 2026-10-23 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | profile-knobs | .claude-plugin/plugin.json | CANCELLED | moved to dev-lifecycle-docs-plan as unit profile-knobs (PR 1 landed) | 2026-10-23 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | publish-observability-tests | scripts/tracker-publish-cli.test.mjs | PENDING | round 5 suggestions: assert the second publish is a refusal not an unchanged no… | 2026-10-23 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | telemetry-baseline-marker | scripts/telemetry.mjs | PENDING | — | 2026-10-23 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | workspace-key-collision | scripts/lib/ledger-keys.mjs | PENDING | — | 2026-10-23 |
| [scrutinise-external-project-board](./scrutinise-external-project-board.md) | amend-rules-token-and-views | docs/architecture | PENDING | — | 2026-10-24 |
| [scrutinise-external-project-board](./scrutinise-external-project-board.md) | decide-auto-archive-authority | docs/architecture/docs.rules.md | COMPLETE | decision applied | 2026-10-24 |
| [scrutinise-external-project-board](./scrutinise-external-project-board.md) | decide-rule-mismatches | docs/architecture | COMPLETE | decision applied | 2026-10-24 |
| [scrutinise-external-project-board](./scrutinise-external-project-board.md) | fix-clear-notes-and-auto-event | scripts/lib/export-notes.mjs | COMPLETE | all 1 acceptance criteria ticked; merged direct to main; suite 1102/1102, arch … | 2026-10-24 |
| [scrutinise-external-project-board](./scrutinise-external-project-board.md) | fix-cycle-and-classifier-leftovers | scripts/tracker.mjs | COMPLETE | all 1 acceptance criteria ticked; direct merge 600c063d7f0af9c00a52ff50c6cef23c… | 2026-10-24 |
| [scrutinise-external-project-board](./scrutinise-external-project-board.md) | fix-dashboard-queue | scripts/lib/dashboard.mjs | COMPLETE | all 1 acceptance criteria ticked; direct merge to main 4c828fb; criterion ticked | 2026-10-24 |
| [scrutinise-external-project-board](./scrutinise-external-project-board.md) | fix-export-write-safety | scripts/lib/export-notes.mjs | COMPLETE | all 1 acceptance criteria ticked; direct merge to main | 2026-10-24 |
| [scrutinise-external-project-board](./scrutinise-external-project-board.md) | fix-landing-side-effects | scripts/lib/archive.mjs | COMPLETE | all 1 acceptance criteria ticked; direct merge to main c874e7b4d10214110560bc49… | 2026-10-24 |
| [scrutinise-external-project-board](./scrutinise-external-project-board.md) | fix-one-classifier | scripts/lib/archive.mjs | COMPLETE | all 1 acceptance criteria ticked; landed direct on main 76b06ac; 1077 tests gre… | 2026-10-24 |
| [scrutinise-external-project-board](./scrutinise-external-project-board.md) | fix-pointer-rewrite-and-ff | scripts/doc-retire.mjs | COMPLETE | all 1 acceptance criteria ticked; merged direct to main; full suite 1095 pass, … | 2026-10-24 |
| [scrutinise-external-project-board](./scrutinise-external-project-board.md) | fix-retire-next-and-restore | scripts/doc-retire.mjs | COMPLETE | all 1 acceptance criteria ticked; direct merge to main; criteria ticked | 2026-10-24 |
| [scrutinise-external-project-board](./scrutinise-external-project-board.md) | fix-suggestions | scripts/lib/dashboard.mjs | COMPLETE | all 1 acceptance criteria ticked; merged direct to main; gates green (1082 test… | 2026-10-24 |
| [scrutinise-external-project-board](./scrutinise-external-project-board.md) | impl-landing-token | scripts/doc-retire.mjs | PENDING | — | 2026-10-24 |
| [scrutinise-safety-followups-backlog](./scrutinise-safety-followups-backlog.md) | goal-token-worktree | scripts/goal-token.mjs | COMPLETE | merged on main; /scrutinise round 2: 0 Critical, 0 Warning, all criteria MET; s… | 2026-10-24 |
| [scrutinise-safety-followups-backlog](./scrutinise-safety-followups-backlog.md) | ismain-switch-1 | scripts | COMPLETE | merged on main; /scrutinise round 2: 0 Critical, 0 Warning, all criteria MET; s… | 2026-10-24 |
| [scrutinise-safety-followups-backlog](./scrutinise-safety-followups-backlog.md) | ismain-switch-2 | scripts | COMPLETE | merged on main; /scrutinise round 2: 0 Critical, 0 Warning, all criteria MET; s… | 2026-10-24 |
| [scrutinise-safety-followups-backlog](./scrutinise-safety-followups-backlog.md) | ismain-switch-3 | scripts | COMPLETE | merged on main; /scrutinise round 2: 0 Critical, 0 Warning, all criteria MET; s… | 2026-10-24 |
| [scrutinise-safety-followups-backlog](./scrutinise-safety-followups-backlog.md) | ismain-switch-4 | scripts | COMPLETE | merged on main; /scrutinise round 2: 0 Critical, 0 Warning, all criteria MET; s… | 2026-10-24 |
| [scrutinise-safety-followups-backlog](./scrutinise-safety-followups-backlog.md) | ismain-switch-5 | scripts | COMPLETE | merged on main; /scrutinise round 2: 0 Critical, 0 Warning, all criteria MET; s… | 2026-10-24 |
| [scrutinise-safety-followups-backlog](./scrutinise-safety-followups-backlog.md) | scrutinise-housekeeping | scripts/lib/core.test.mjs | COMPLETE | merged on main; /scrutinise round 2: 0 Critical, 0 Warning, all criteria MET; s… | 2026-10-24 |
| [fixes-and-safety](../../fixes-and-safety) | ask-via-prompt | ask-via-prompt | MERGED | commit b862187 on feat/fixes-and-safety; CI set green | 2026-10-21 |
| [fixes-and-safety](../../fixes-and-safety) | bypass-flags | bypass-flags | MERGED | commit 62864b6 on feat/fixes-and-safety; CI set green | 2026-10-21 |
| [fixes-and-safety](../../fixes-and-safety) | ci-home-test | ci-home-test | MERGED | commit 64b4718 on feat/fixes-and-safety; CI set green | 2026-10-21 |
| [fixes-and-safety](../../fixes-and-safety) | descriptions | descriptions | MERGED | commit dcc8869 on feat/fixes-and-safety; CI set green | 2026-10-21 |
| [fixes-and-safety](../../fixes-and-safety) | docs-final | docs-final | MERGED | commit c27533d on feat/fixes-and-safety; CI set green | 2026-10-21 |
| [fixes-and-safety](../../fixes-and-safety) | eslint-json | eslint-json | MERGED | commit 020e0d9 on feat/fixes-and-safety; CI set green | 2026-10-21 |
| [fixes-and-safety](../../fixes-and-safety) | failclosed-guards | failclosed-guards | MERGED | commit 3c892cc on feat/fixes-and-safety; CI set green | 2026-10-21 |
| [fixes-and-safety](../../fixes-and-safety) | goal-token | goal-token | MERGED | commit dc35b09 on feat/fixes-and-safety; CI set green | 2026-10-21 |
| [fixes-and-safety](../../fixes-and-safety) | guard-filter | guard-filter | MERGED | commit 2029061 on feat/fixes-and-safety; CI set green | 2026-10-21 |
| [fixes-and-safety](../../fixes-and-safety) | instruction-consistency | instruction-consistency | MERGED | commit 728634c on feat/fixes-and-safety; CI set green | 2026-10-21 |
| [fixes-and-safety](../../fixes-and-safety) | invocable-partials | invocable-partials | MERGED | commit 91d51c8 on feat/fixes-and-safety; CI set green | 2026-10-21 |
| [fixes-and-safety](../../fixes-and-safety) | launcher | launcher | MERGED | commit 13ebb57 on feat/fixes-and-safety; CI set green | 2026-10-21 |
| [fixes-and-safety](../../fixes-and-safety) | loud-advisory | loud-advisory | MERGED | commit dc467ab on feat/fixes-and-safety; CI set green | 2026-10-21 |
| [fixes-and-safety](../../fixes-and-safety) | outside-git | outside-git | MERGED | commit 7f78bd0 on feat/fixes-and-safety; CI set green | 2026-10-21 |
| [fixes-and-safety](../../fixes-and-safety) | platform | platform | MERGED | commit 3471575 on feat/fixes-and-safety; CI set green | 2026-10-21 |
| [fixes-and-safety](../../fixes-and-safety) | pr | pr | MERGED | pr:https://github.com/plantgreytrees/craftsman/pull/1 (branch feat/fixes-and-sa… | 2026-10-21 |
| [fixes-and-safety](../../fixes-and-safety) | reconcile-24-26 | reconcile-24-26 | MERGED | commit 96a029c on feat/fixes-and-safety; CI set green | 2026-10-21 |
| [fixes-and-safety](../../fixes-and-safety) | release-identity | release-identity | MERGED | commit 3c814c1 on feat/fixes-and-safety; CI set green | 2026-10-21 |
| [fixes-and-safety](../../fixes-and-safety) | self-disable | self-disable | MERGED | commit cbbed66 on feat/fixes-and-safety; CI set green | 2026-10-21 |
| [fixes-and-safety](../../fixes-and-safety) | stop-gate-gated | stop-gate-gated | MERGED | commit 9bca6c5 on feat/fixes-and-safety; CI set green | 2026-10-21 |
| [fixes-and-safety](../../fixes-and-safety) | sweep-safety | sweep-safety | MERGED | commit 4b5648a on feat/fixes-and-safety; CI set green | 2026-10-21 |
| [fixes-and-safety](../../fixes-and-safety) | tool-names | tool-names | MERGED | commit 44cd3ed on feat/fixes-and-safety; CI set green | 2026-10-21 |
| [fixes-and-safety](../../fixes-and-safety) | unpushed-report | unpushed-report | MERGED | commit 2408b0e on feat/fixes-and-safety; CI set green | 2026-10-21 |
| [scrutinise-engine-hardening](../../scrutinise-engine-hardening) | follow-up-1 | scripts/stop-gate.mjs | COMPLETE | acceptance.ref ownership covered by stop-gate.test.mjs:577-625 (ownership survi… | 2026-10-24 |
| [scrutinise-engine-hardening](../../scrutinise-engine-hardening) | follow-up-2 | scripts/stop-gate.mjs | COMPLETE | own-timeout classified at scripts/stop-gate.mjs:255-280: a kill under the share… | 2026-10-24 |
| [scrutinise-fixes-and-safety](../../scrutinise-fixes-and-safety) | bypass-flags-2 | scripts/pre-guard.mjs | COMPLETE | all 1 acceptance criteria ticked; commit 295ba6c on feat/scrutinise-fixes-and-s… | 2026-10-21 |
| [scrutinise-fixes-and-safety](../../scrutinise-fixes-and-safety) | bypass-flags-3 | scripts/pre-guard.mjs | PENDING | planned from /scrutinise --deep round 2 | 2026-10-21 |
| [scrutinise-fixes-and-safety](../../scrutinise-fixes-and-safety) | config-keys-protected | scripts/pre-guard.mjs | COMPLETE | SAFETY_CONFIG_KEYS in scripts/lib/self-protect.mjs:43-48; approval keys added i… | 2026-10-24 |
| [scrutinise-fixes-and-safety](../../scrutinise-fixes-and-safety) | core-isfile | scripts/lib/core.mjs | COMPLETE | all 1 acceptance criteria ticked; commit ce003c9 on feat/scrutinise-fixes-and-s… | 2026-10-21 |
| [scrutinise-fixes-and-safety](../../scrutinise-fixes-and-safety) | core-small-correctness | scripts/lib/core.mjs | COMPLETE | all 1 acceptance criteria ticked; commit 1e78c9d on feat/scrutinise-fixes-and-s… | 2026-10-21 |
| [scrutinise-fixes-and-safety](../../scrutinise-fixes-and-safety) | doc-drift-and-stop-report | scripts/lib/doc-snapshot.mjs | COMPLETE | all 1 acceptance criteria ticked; commit 07cf953 on feat/scrutinise-fixes-and-s… | 2026-10-21 |
| [scrutinise-fixes-and-safety](../../scrutinise-fixes-and-safety) | followup-md-dirty-marker | scripts/quality-gate.mjs | COMPLETE | scripts/quality-gate.mjs:46-61 (stopGate.markdownTests); suite 891/891 | 2026-10-24 |
| [scrutinise-fixes-and-safety](../../scrutinise-fixes-and-safety) | followup-skill-record | scripts/lib/core.mjs | COMPLETE | scripts/lib/core.mjs:641 recordCommand with via; typed command outranks a Skill… | 2026-10-24 |
| [scrutinise-fixes-and-safety](../../scrutinise-fixes-and-safety) | launcher-promptsubmit | hooks/run.sh | COMPLETE | all 1 acceptance criteria ticked; commit 86ad5ef on feat/scrutinise-fixes-and-s… | 2026-10-21 |
| [scrutinise-fixes-and-safety](../../scrutinise-fixes-and-safety) | prompt-failclosed | hooks/run.sh | COMPLETE | ARCH-SAFETY-02 (failed UserPromptSubmit exits 0) and launcher.test.mjs; suite 8… | 2026-10-24 |
| [scrutinise-fixes-and-safety](../../scrutinise-fixes-and-safety) | quality-dirty-marker | scripts/quality-gate.mjs | COMPLETE | all 1 acceptance criteria ticked; commit 89c8b9e on feat/scrutinise-fixes-and-s… | 2026-10-21 |
| [scrutinise-fixes-and-safety](../../scrutinise-fixes-and-safety) | script-authority-in-scripts | scripts/doc-write.mjs | PENDING | planned from /scrutinise --deep round 2 | 2026-10-21 |
| [scrutinise-fixes-and-safety](../../scrutinise-fixes-and-safety) | self-scoped-shared | scripts/scope.mjs | PENDING | planned from /scrutinise --deep round 2 | 2026-10-21 |
| [scrutinise-fixes-and-safety](../../scrutinise-fixes-and-safety) | selfprotect-markers | scripts/pre-guard.mjs | COMPLETE | all 1 acceptance criteria ticked; commit 8c5064e on feat/scrutinise-fixes-and-s… | 2026-10-21 |
| [scrutinise-fixes-and-safety](../../scrutinise-fixes-and-safety) | selfprotect-scripts | scripts/pre-guard.mjs | COMPLETE | all 1 acceptance criteria ticked; commit 5d447ba on feat/scrutinise-fixes-and-s… | 2026-10-21 |
| [scrutinise-fixes-and-safety](../../scrutinise-fixes-and-safety) | selfprotect-settings-notebook | scripts/pre-guard.mjs | COMPLETE | all 1 acceptance criteria ticked; commit 5b70e57 on feat/scrutinise-fixes-and-s… | 2026-10-21 |
| [scrutinise-fixes-and-safety](../../scrutinise-fixes-and-safety) | selfprotect-shell-words | scripts/pre-guard.mjs | PENDING | planned from /scrutinise --deep round 2 | 2026-10-21 |
| [scrutinise-fixes-and-safety](../../scrutinise-fixes-and-safety) | state-filter-dedupe | scripts/lib/unpushed.mjs | COMPLETE | all 1 acceptance criteria ticked; commit 5ef1ef9 on feat/scrutinise-fixes-and-s… | 2026-10-21 |
| [scrutinise-fixes-and-safety](../../scrutinise-fixes-and-safety) | stop-loopguard-reports | scripts/stop-gate.mjs | PENDING | planned from /scrutinise --deep round 2 | 2026-10-21 |
| [scrutinise-safety-followups-backlog](../../scrutinise-safety-followups-backlog) | followup-dsp-entry-check | scripts/doc-size-policy.mjs | PENDING | from /scrutinise round 2 (Suggestion), not driven | 2026-10-24 |
| [scrutinise-safety-followups-backlog](../../scrutinise-safety-followups-backlog) | followup-goal-token-test-stderr | scripts/goal-token.test.mjs | PENDING | from /scrutinise round 2 (Suggestion), not driven | 2026-10-24 |
| [scrutinise-safety-followups-backlog](../../scrutinise-safety-followups-backlog) | followup-isMain-notes | scripts/doc-checks.mjs | PENDING | from /scrutinise round 2 (Suggestion), not driven | 2026-10-24 |

<!-- craftsman:ledger:end -->
