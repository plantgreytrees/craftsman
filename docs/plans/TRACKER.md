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
| [artist-ui-gate](./artist-ui-gate.md) | ui-gate-script | scripts/ui-gate.mjs | COMPLETE | all 4 acceptance criteria ticked; c60bc4b on origin/main (feat/ui-gate-script f… | 2026-10-25 |
| [artist-ui-gate](./artist-ui-gate.md) | ui-surface | agents/ui-ux-reviewer.md | COMPLETE | all 4 acceptance criteria ticked; merged direct to main | 2026-10-25 |
| [scrutinise-artist-ui-gate](./scrutinise-artist-ui-gate.md) | fix-ui-gate-script | scripts/ui-gate.mjs | PENDING | — | 2026-10-25 |
| [scrutinise-artist-ui-gate](./scrutinise-artist-ui-gate.md) | fix-ui-gate-wiring | commands/_shared-execution.md | PENDING | — | 2026-10-25 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | approval-cli-refusal | scripts/approval.mjs | PENDING | — | 2026-10-25 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | approval-floor-vs-stopgate-note | docs/architecture/safety.rules.md | PENDING | — | 2026-10-25 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | approval-json-quoting | commands/_approval.md | PENDING | — | 2026-10-25 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | approval-loadrecord-dedupe | scripts/approval.mjs | PENDING | — | 2026-10-25 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | approval-lock-break-race | scripts/approval.mjs | PENDING | — | 2026-10-25 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | approval-lock-stale-race | scripts/approval.mjs | PENDING | — | 2026-10-23 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | approval-owner-trust | scripts/pre-guard.mjs | PENDING | — | 2026-10-23 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | approval-prepare-derive-diff | scripts/approval.mjs | PENDING | — | 2026-10-25 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | approval-scan-config-source | scripts/approval.mjs | PENDING | — | 2026-10-23 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | budget-key-removal | scripts/arch-check.mjs | PENDING | — | 2026-10-25 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | budget-ratchet-keys | scripts/arch-check.mjs | PENDING | — | 2026-10-23 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | events-jsonl-protect | scripts/lib/ledger-keys.mjs | PENDING | — | 2026-10-25 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | fix-approval-fallback | scripts/approval.mjs | COMPLETE | all 3 acceptance criteria ticked; root landed a50fc30; suite 1115/1115, lint PA… | 2026-10-25 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | fix-approval-hardening | scripts/approval.mjs | COMPLETE | all 4 acceptance criteria ticked; landed to main | 2026-10-23 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | fix-approval-record | scripts/approval.mjs | COMPLETE | all 7 acceptance criteria ticked; landed to main; suite green except known base… | 2026-10-23 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | fix-approval-record-protect | scripts/lib/self-protect.mjs | COMPLETE | all 2 acceptance criteria ticked; root landed bafa7a5; suite 1115/1115, lint PA… | 2026-10-25 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | fix-approval-reprepare | scripts/approval.mjs | COMPLETE | all 3 acceptance criteria ticked; landed to main | 2026-10-23 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | fix-approval-scan | scripts/approval.mjs | COMPLETE | all 3 acceptance criteria ticked; landed to main | 2026-10-23 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | fix-budget-growth | scripts/arch-check.mjs | COMPLETE | all 2 acceptance criteria ticked; landed to main; suite green except known base… | 2026-10-23 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | fix-claim-anchor | scripts/claim.mjs | COMPLETE | all 2 acceptance criteria ticked; root landed 7853ef3; suite 1132/1132, lint PA… | 2026-10-25 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | fix-claims-dir | scripts/claim.mjs | COMPLETE | all 2 acceptance criteria ticked; root landed 2cb2db5; suite 1140/1140, lint PA… | 2026-10-25 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | fix-cli-contract | scripts/tracker.mjs | COMPLETE | all 4 acceptance criteria ticked; landed to main | 2026-10-23 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | fix-gate-lookup | scripts/lib/gate-command.mjs | COMPLETE | all 5 acceptance criteria ticked; landed to main; suite green except known base… | 2026-10-23 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | fix-helper-form | commands/_approval.md | COMPLETE | all 2 acceptance criteria ticked; root landed 59684fd; suite 1118/1118, lint PA… | 2026-10-25 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | fix-helper-root | agents/unit-runner.md | COMPLETE | all 2 acceptance criteria ticked; root landed a875848; suite 1140/1140, lint PA… | 2026-10-25 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | fix-land-race | scripts/repo-exec.mjs | COMPLETE | all 4 acceptance criteria ticked; landed to main | 2026-10-23 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | fix-merge-approval | scripts/repo-exec.mjs | COMPLETE | all 2 acceptance criteria ticked; root landed 42f50d7; suite 1140/1140, lint PA… | 2026-10-25 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | fix-merge-retire | scripts/repo-exec.mjs | COMPLETE | all 3 acceptance criteria ticked; landed to main | 2026-10-23 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | fix-publish-atomic | scripts/tracker-publish.mjs | COMPLETE | all 3 acceptance criteria ticked; landed to main | 2026-10-23 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | fix-publish-cli | scripts/tracker.mjs | COMPLETE | all 2 acceptance criteria ticked; landed to main | 2026-10-23 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | fix-publish-single-use | scripts/tracker-publish.mjs | COMPLETE | all 5 acceptance criteria ticked; landed to main | 2026-10-23 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | fix-publish-trust | scripts/tracker-publish.mjs | COMPLETE | all 5 acceptance criteria ticked; landed to main; suite green except known base… | 2026-10-23 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | fix-scan-floor | scripts/approval.mjs | COMPLETE | all 2 acceptance criteria ticked; root landed b4c7892; suite 1118/1118, lint PA… | 2026-10-25 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | fix-stats-and-prose | scripts/stats.mjs | COMPLETE | all 2 acceptance criteria ticked; landed to main; suite green except known base… | 2026-10-23 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | fix-sync-guard | scripts/tracker.mjs | COMPLETE | all 3 acceptance criteria ticked; landed to main; suite green except known base… | 2026-10-23 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | force-block-wordlevel | scripts/lib/force-block.mjs | PENDING | — | 2026-10-24 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | lease-doc-claim | commands/auto.md | PENDING | — | 2026-10-23 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | lease-glob-anchoring | scripts/lib/force-block.mjs | PENDING | — | 2026-10-23 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | ledger-parse-dedupe2 | scripts/lib/ledger-keys.mjs | PENDING | — | 2026-10-25 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | ledger-parser-dedupe | scripts/lib/ledger-keys.mjs | PENDING | — | 2026-10-23 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | mainroot-missing-fallback | scripts/lib/core.mjs | PENDING | — | 2026-10-25 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | offline-landed-record | scripts/lib/approval-gate.mjs | PENDING | — | 2026-10-23 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | onpath-dedupe | scripts/doc-checks.mjs | PENDING | — | 2026-10-25 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | profile-knobs | .claude-plugin/plugin.json | CANCELLED | moved to dev-lifecycle-docs-plan as unit profile-knobs (PR 1 landed) | 2026-10-23 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | publish-manual-owner | scripts/tracker-publish.mjs | PENDING | — | 2026-10-25 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | publish-observability-tests | scripts/tracker-publish-cli.test.mjs | PENDING | round 5 suggestions: assert the second publish is a refusal not an unchanged no… | 2026-10-23 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | readme-safety-keys | README.md | PENDING | — | 2026-10-25 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | telemetry-baseline-marker | scripts/telemetry.mjs | PENDING | — | 2026-10-23 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | workspace-key-collision | scripts/lib/ledger-keys.mjs | PENDING | — | 2026-10-23 |
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

<!-- craftsman:ledger:end -->
