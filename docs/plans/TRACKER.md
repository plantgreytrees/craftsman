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
| [scrutinise-fixes-and-safety](../../scrutinise-fixes-and-safety) | bypass-flags-2 | scripts/pre-guard.mjs | COMPLETE | all 1 acceptance criteria ticked; commit 295ba6c on feat/scrutinise-fixes-and-s… | 2026-10-21 |
| [scrutinise-fixes-and-safety](../../scrutinise-fixes-and-safety) | bypass-flags-3 | scripts/pre-guard.mjs | PENDING | planned from /scrutinise --deep round 2 | 2026-10-21 |
| [scrutinise-fixes-and-safety](../../scrutinise-fixes-and-safety) | config-keys-protected | scripts/pre-guard.mjs | PENDING | planned from /scrutinise --deep round 2 | 2026-10-21 |
| [scrutinise-fixes-and-safety](../../scrutinise-fixes-and-safety) | core-isfile | scripts/lib/core.mjs | COMPLETE | all 1 acceptance criteria ticked; commit ce003c9 on feat/scrutinise-fixes-and-s… | 2026-10-21 |
| [scrutinise-fixes-and-safety](../../scrutinise-fixes-and-safety) | core-small-correctness | scripts/lib/core.mjs | COMPLETE | all 1 acceptance criteria ticked; commit 1e78c9d on feat/scrutinise-fixes-and-s… | 2026-10-21 |
| [scrutinise-fixes-and-safety](../../scrutinise-fixes-and-safety) | doc-drift-and-stop-report | scripts/lib/doc-snapshot.mjs | COMPLETE | all 1 acceptance criteria ticked; commit 07cf953 on feat/scrutinise-fixes-and-s… | 2026-10-21 |
| [scrutinise-fixes-and-safety](../../scrutinise-fixes-and-safety) | followup-md-dirty-marker | scripts/quality-gate.mjs | PENDING | planned from /scrutinise --deep round 2 | 2026-10-21 |
| [scrutinise-fixes-and-safety](../../scrutinise-fixes-and-safety) | followup-skill-record | scripts/lib/core.mjs | PENDING | planned from /scrutinise --deep round 2 | 2026-10-21 |
| [scrutinise-fixes-and-safety](../../scrutinise-fixes-and-safety) | launcher-promptsubmit | hooks/run.sh | COMPLETE | all 1 acceptance criteria ticked; commit 86ad5ef on feat/scrutinise-fixes-and-s… | 2026-10-21 |
| [scrutinise-fixes-and-safety](../../scrutinise-fixes-and-safety) | prompt-failclosed | hooks/run.sh | PENDING | planned from /scrutinise --deep round 2 | 2026-10-21 |
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
