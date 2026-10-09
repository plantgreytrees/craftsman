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
| [autonomous-e2e-loop](./autonomous-e2e-loop.md) | auto-command | /auto command, git authority, force blocks | COMPLETE | all 5 acceptance criteria ticked; e41c23c on origin/main; node --test 261/261; … | 2026-10-09 |
| [autonomous-e2e-loop](./autonomous-e2e-loop.md) | baseline-run | baseline evidence (live) | COMPLETE | all 1 acceptance criteria ticked; b8b2f8d on origin/main; suite 267/267 | 2026-10-09 |
| [autonomous-e2e-loop](./autonomous-e2e-loop.md) | description-diet | description diet | COMPLETE | all 1 acceptance criteria ticked; 06129e4 + 43d14c7 on main: 19 descriptions <=… | 2026-10-09 |
| [autonomous-e2e-loop](./autonomous-e2e-loop.md) | engine | workflows/run.js, unit-runner, config | COMPLETE | all 4 acceptance criteria ticked; ed511b8 on origin/main; suite 279/279 | 2026-10-09 |
| [autonomous-e2e-loop](./autonomous-e2e-loop.md) | engine-guards | Workflow guard, stop-gate bg tasks | COMPLETE | all 3 acceptance criteria ticked; 21ca2d6 on origin/main; suite 271/271 | 2026-10-09 |
| [autonomous-e2e-loop](./autonomous-e2e-loop.md) | engine-guards-stop | stop-gate background tasks | COMPLETE | split step of engine-guards (COMPLETE, all [unit:engine-guards] criteria ticked… | 2026-10-09 |
| [autonomous-e2e-loop](./autonomous-e2e-loop.md) | mod-launcher | mod launcher + manifest | COMPLETE | all 3 acceptance criteria ticked; 3096bc3 on origin/main; node --test 267/267; … | 2026-10-09 |
| [autonomous-e2e-loop](./autonomous-e2e-loop.md) | plan-fit-and-measure | unit size check + workflow measure | COMPLETE | all 2 acceptance criteria ticked; a7a62f0 + 00cc289 on origin/main; suite 293/2… | 2026-10-09 |
| [autonomous-e2e-loop](./autonomous-e2e-loop.md) | release-notes | README, EXTENDING, CHANGELOG | COMPLETE | all 1 acceptance criteria ticked; 01e12a7 on main: README /craftsman:auto row +… | 2026-10-09 |
| [autonomous-e2e-loop](./autonomous-e2e-loop.md) | run-manifest-land | landing parks | COMPLETE | split step of run-manifest-parked (COMPLETE, all [unit:run-manifest-parked] cri… | 2026-10-09 |
| [autonomous-e2e-loop](./autonomous-e2e-loop.md) | run-manifest-parked | PARKED decision, run manifest | COMPLETE | all 3 acceptance criteria ticked; e125c60 on origin/main via the workflow engin… | 2026-10-09 |
| [autonomous-e2e-loop](./autonomous-e2e-loop.md) | state-root-pin | core root pin, grants, scope keys | COMPLETE | all 6 acceptance criteria ticked; 1e4601b on origin/main; node --test 236/236; … | 2026-10-09 |
| [autonomous-e2e-loop](./autonomous-e2e-loop.md) | state-root-pin-grants | grant paths, no SubagentStop | COMPLETE | split step of state-root-pin (COMPLETE, all [unit:state-root-pin] criteria tick… | 2026-10-09 |
| [autonomous-e2e-loop](./autonomous-e2e-loop.md) | telemetry | telemetry.mjs, stats root context | COMPLETE | all 3 acceptance criteria ticked; 6b0e0ba on origin/main; node --test 245/245; … | 2026-10-09 |
| [autonomous-e2e-loop](./autonomous-e2e-loop.md) | workflow-spike | 1-unit workflow spike (live) | COMPLETE | all 2 acceptance criteria ticked; 10ec6b9 on origin/main; ENGINE-02 GO; suite 2… | 2026-10-09 |
| [scrutinise-autonomous-e2e-loop](./scrutinise-autonomous-e2e-loop.md) | auto-marker | /auto marker, grants, force block | COMPLETE | all 1 acceptance criteria ticked; 46daed6 on main: autoActive marker liveness g… | 2026-10-09 |
| [scrutinise-autonomous-e2e-loop](./scrutinise-autonomous-e2e-loop.md) | core-hardening | root pin lstat, spend retry | COMPLETE | all 1 acceptance criteria ticked; 1779c2f on main; core.test 53/53 (2 new cases… | 2026-10-09 |
| [scrutinise-autonomous-e2e-loop](./scrutinise-autonomous-e2e-loop.md) | engine-close | workflow close(), block role | COMPLETE | all 1 acceptance criteria ticked; 618b949 on main: close() parks landing parks … | 2026-10-09 |
| [scrutinise-autonomous-e2e-loop](./scrutinise-autonomous-e2e-loop.md) | force-block-bounded | force block bounded in time and memory | COMPLETE | all 1 acceptance criteria ticked; 6245e57 on origin/main; full suite 330/330; R… | 2026-10-09 |
| [scrutinise-autonomous-e2e-loop](./scrutinise-autonomous-e2e-loop.md) | force-block-closed | force block fails closed, &> redirects, bounded braces | COMPLETE | all 1 acceptance criteria ticked; 2d43fbc on origin/main; full suite 328/328; R… | 2026-10-09 |
| [scrutinise-autonomous-e2e-loop](./scrutinise-autonomous-e2e-loop.md) | force-block-escape | force block escaped quotes and comments | COMPLETE | all 1 acceptance criteria ticked; 18c3f3e on origin/main; suite 311/311; all fi… | 2026-10-09 |
| [scrutinise-autonomous-e2e-loop](./scrutinise-autonomous-e2e-loop.md) | force-block-forms | force block module, redirections, prefixes, git-<sub> | COMPLETE | all 1 acceptance criteria ticked; 0098065 on origin/main; suite 324/324; all 16… | 2026-10-09 |
| [scrutinise-autonomous-e2e-loop](./scrutinise-autonomous-e2e-loop.md) | force-block-live | force block alias + Phase C liveness | COMPLETE | all 1 acceptance criteria ticked; e702858 on origin/main; suite 309/309 | 2026-10-09 |
| [scrutinise-autonomous-e2e-loop](./scrutinise-autonomous-e2e-loop.md) | force-block-quoted | force block quoted strings, &, alias chains | COMPLETE | all 1 acceptance criteria ticked; 9363e6e on origin/main; suite 309/309; 6 new … | 2026-10-09 |
| [scrutinise-autonomous-e2e-loop](./scrutinise-autonomous-e2e-loop.md) | force-block-shell-words | force block bash word splitting | COMPLETE | all 1 acceptance criteria ticked; fcd89fb on origin/main; suite 320/320; five R… | 2026-10-09 |
| [scrutinise-autonomous-e2e-loop](./scrutinise-autonomous-e2e-loop.md) | force-block-substitution | force block message substitutions, quoted separators | COMPLETE | all 1 acceptance criteria ticked; 171d16a on origin/main; suite 311/311; 5 new … | 2026-10-09 |
| [scrutinise-autonomous-e2e-loop](./scrutinise-autonomous-e2e-loop.md) | land-holder | repo-exec lands in the base holder | COMPLETE | all 1 acceptance criteria ticked; f6e724f on main; repo-exec.test 20/20 (2 new … | 2026-10-09 |
| [scrutinise-autonomous-e2e-loop](./scrutinise-autonomous-e2e-loop.md) | land-holder-untracked | holder landing refusals + tests | COMPLETE | all 1 acceptance criteria ticked; d1cc8fd on origin/main; suite 311/311; untrac… | 2026-10-09 |
| [scrutinise-autonomous-e2e-loop](./scrutinise-autonomous-e2e-loop.md) | land-linked-worktree | repo-exec linked-worktree land | COMPLETE | all 1 acceptance criteria ticked; 04d9dfe on main; repo-exec.test 19/19 (4 chan… | 2026-10-09 |
| [scrutinise-autonomous-e2e-loop](./scrutinise-autonomous-e2e-loop.md) | land-locale | repo-exec under LC_ALL=C | COMPLETE | all 1 acceptance criteria ticked; a8394d1 on origin/main; suite 311/311; locale… | 2026-10-09 |
| [scrutinise-autonomous-e2e-loop](./scrutinise-autonomous-e2e-loop.md) | land-submodule-bump | plan-graph enforces the submodule bump unit | COMPLETE | all 1 acceptance criteria ticked; 83a5391 on origin/main; plan-graph.mjs refuse… | 2026-10-09 |
| [scrutinise-autonomous-e2e-loop](./scrutinise-autonomous-e2e-loop.md) | land-submodule-bump-changelog | CHANGELOG clause for the submodule bump check | COMPLETE | split step of land-submodule-bump (COMPLETE, all [unit:land-submodule-bump] cri… | 2026-10-09 |
| [scrutinise-autonomous-e2e-loop](./scrutinise-autonomous-e2e-loop.md) | mod-goal-since | mod goal launch window | COMPLETE | all 1 acceptance criteria ticked; bb83fb1 on main; claude plugin test 7/7, suit… | 2026-10-09 |
| [scrutinise-autonomous-e2e-loop](./scrutinise-autonomous-e2e-loop.md) | runner-block-trigger | unit-runner block trigger | COMPLETE | all 1 acceptance criteria ticked; ad2ce10 on origin/main; suite 309/309 | 2026-10-09 |
| [scrutinise-autonomous-e2e-loop](./scrutinise-autonomous-e2e-loop.md) | scope-release | scope release lifecycle | COMPLETE | all 1 acceptance criteria ticked; d28b399 on main: release unlinks unit scope f… | 2026-10-09 |
| [scrutinise-autonomous-e2e-loop](./scrutinise-autonomous-e2e-loop.md) | verify-bypass-bounded | verify-bypass check bounded; force-block test seams | COMPLETE | all 1 acceptance criteria ticked; a8ced0d on origin/main; full suite 331/331; 3… | 2026-10-09 |

<!-- craftsman:ledger:end -->
