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
| [a](./a.md) | unit-1 | — | COMPLETE | shipped | 2026-10-25 |
| [a](./a.md) | unit-2 | — | BLOCKED | needs a call on auth provider | 2026-10-25 |
| [a](./a.md) | unit-3 | — | PENDING | — | 2026-10-25 |
| [artist-ui-gate](./artist-ui-gate.md) | ui-gate-script | scripts/ui-gate.mjs | COMPLETE | all 4 acceptance criteria ticked; c60bc4b on origin/main (feat/ui-gate-script f… | 2026-10-25 |
| [artist-ui-gate](./artist-ui-gate.md) | ui-surface | agents/ui-ux-reviewer.md | COMPLETE | all 4 acceptance criteria ticked; merged direct to main | 2026-10-25 |
| [big](./big.md) | u0 | m0 | PENDING | rehydrated from TRACKER.md block | 2026-10-25 |
| [big](./big.md) | u1 | m1 | COMPLETE | rehydrated from TRACKER.md block | 2026-10-25 |
| [big](./big.md) | u10 | m10 | PENDING | rehydrated from TRACKER.md block | 2026-10-25 |
| [big](./big.md) | u11 | m11 | COMPLETE | rehydrated from TRACKER.md block | 2026-10-25 |
| [big](./big.md) | u12 | m12 | PENDING | rehydrated from TRACKER.md block | 2026-10-25 |
| [big](./big.md) | u13 | m13 | COMPLETE | rehydrated from TRACKER.md block | 2026-10-25 |
| [big](./big.md) | u14 | m14 | PENDING | rehydrated from TRACKER.md block | 2026-10-25 |
| [big](./big.md) | u15 | m15 | COMPLETE | rehydrated from TRACKER.md block | 2026-10-25 |
| [big](./big.md) | u16 | m16 | PENDING | rehydrated from TRACKER.md block | 2026-10-25 |
| [big](./big.md) | u17 | m17 | COMPLETE | rehydrated from TRACKER.md block | 2026-10-25 |
| [big](./big.md) | u18 | m18 | PENDING | rehydrated from TRACKER.md block | 2026-10-25 |
| [big](./big.md) | u19 | m19 | COMPLETE | rehydrated from TRACKER.md block | 2026-10-25 |
| [big](./big.md) | u2 | m2 | PENDING | rehydrated from TRACKER.md block | 2026-10-25 |
| [big](./big.md) | u20 | m20 | PENDING | rehydrated from TRACKER.md block | 2026-10-25 |
| [big](./big.md) | u21 | m21 | COMPLETE | rehydrated from TRACKER.md block | 2026-10-25 |
| [big](./big.md) | u22 | m22 | PENDING | rehydrated from TRACKER.md block | 2026-10-25 |
| [big](./big.md) | u23 | m23 | COMPLETE | rehydrated from TRACKER.md block | 2026-10-25 |
| [big](./big.md) | u24 | m24 | PENDING | rehydrated from TRACKER.md block | 2026-10-25 |
| [big](./big.md) | u25 | m25 | COMPLETE | rehydrated from TRACKER.md block | 2026-10-25 |
| [big](./big.md) | u26 | m26 | PENDING | rehydrated from TRACKER.md block | 2026-10-25 |
| [big](./big.md) | u27 | m27 | COMPLETE | rehydrated from TRACKER.md block | 2026-10-25 |
| [big](./big.md) | u28 | m28 | PENDING | rehydrated from TRACKER.md block | 2026-10-25 |
| [big](./big.md) | u29 | m29 | COMPLETE | rehydrated from TRACKER.md block | 2026-10-25 |
| [big](./big.md) | u3 | m3 | COMPLETE | rehydrated from TRACKER.md block | 2026-10-25 |
| [big](./big.md) | u30 | m30 | PENDING | rehydrated from TRACKER.md block | 2026-10-25 |
| [big](./big.md) | u31 | m31 | COMPLETE | rehydrated from TRACKER.md block | 2026-10-25 |
| [big](./big.md) | u32 | m32 | PENDING | rehydrated from TRACKER.md block | 2026-10-25 |
| [big](./big.md) | u33 | m33 | COMPLETE | rehydrated from TRACKER.md block | 2026-10-25 |
| [big](./big.md) | u34 | m34 | PENDING | rehydrated from TRACKER.md block | 2026-10-25 |
| [big](./big.md) | u35 | m35 | COMPLETE | rehydrated from TRACKER.md block | 2026-10-25 |
| [big](./big.md) | u36 | m36 | PENDING | rehydrated from TRACKER.md block | 2026-10-25 |
| [big](./big.md) | u37 | m37 | COMPLETE | rehydrated from TRACKER.md block | 2026-10-25 |
| [big](./big.md) | u38 | m38 | PENDING | rehydrated from TRACKER.md block | 2026-10-25 |
| [big](./big.md) | u39 | m39 | COMPLETE | rehydrated from TRACKER.md block | 2026-10-25 |
| [big](./big.md) | u4 | m4 | PENDING | rehydrated from TRACKER.md block | 2026-10-25 |
| [big](./big.md) | u40 | m40 | PENDING | rehydrated from TRACKER.md block | 2026-10-25 |
| [big](./big.md) | u41 | m41 | COMPLETE | rehydrated from TRACKER.md block | 2026-10-25 |
| [big](./big.md) | u42 | m42 | PENDING | rehydrated from TRACKER.md block | 2026-10-25 |
| [big](./big.md) | u43 | m43 | COMPLETE | rehydrated from TRACKER.md block | 2026-10-25 |
| [big](./big.md) | u44 | m44 | PENDING | rehydrated from TRACKER.md block | 2026-10-25 |
| [big](./big.md) | u45 | m45 | COMPLETE | rehydrated from TRACKER.md block | 2026-10-25 |
| [big](./big.md) | u46 | m46 | PENDING | rehydrated from TRACKER.md block | 2026-10-25 |
| [big](./big.md) | u47 | m47 | COMPLETE | rehydrated from TRACKER.md block | 2026-10-25 |
| [big](./big.md) | u48 | m48 | PENDING | rehydrated from TRACKER.md block | 2026-10-25 |
| [big](./big.md) | u49 | m49 | COMPLETE | rehydrated from TRACKER.md block | 2026-10-25 |
| [big](./big.md) | u5 | m5 | COMPLETE | rehydrated from TRACKER.md block | 2026-10-25 |
| [big](./big.md) | u6 | m6 | PENDING | rehydrated from TRACKER.md block | 2026-10-25 |
| [big](./big.md) | u7 | m7 | COMPLETE | rehydrated from TRACKER.md block | 2026-10-25 |
| [big](./big.md) | u8 | m8 | PENDING | rehydrated from TRACKER.md block | 2026-10-25 |
| [big](./big.md) | u9 | m9 | COMPLETE | rehydrated from TRACKER.md block | 2026-10-25 |
| [demo](./demo.md) | alpha | — | PENDING | alpha PENDING | 2026-10-25 |
| [demo](./demo.md) | beta | — | IN_PROGRESS | beta IN_PROGRESS | 2026-10-25 |
| [demo](./demo.md) | solo | — | PENDING | solo PENDING | 2026-10-25 |
| [example](./example.md) | m0 | — | PENDING | — | 2026-10-25 |
| [example](./example.md) | m1 | — | PENDING | — | 2026-10-25 |
| [example](./example.md) | m2 | — | PENDING | — | 2026-10-25 |
| [example](./example.md) | m3 | — | PENDING | — | 2026-10-25 |
| [example](./example.md) | m4 | — | PENDING | — | 2026-10-25 |
| [example](./example.md) | u1 | — | FEATURE_MERGED | abc | 2026-10-25 |
| [example](./example.md) | unit-1 | — | IN_PROGRESS | claimed | 2026-10-25 |
| [example](./example.md) | unit-2 | — | IN_PROGRESS | claimed | 2026-10-25 |
| [example](./example.md) | unit-3 | — | IN_PROGRESS | claimed | 2026-10-25 |
| [example](./example.md) | unit-9 (S9) | — | COMPLETE | all 1 acceptance criteria ticked; def456 | 2026-10-25 |
| [f](./f.md) | u | — | PENDING | — | 2026-10-25 |
| [investigate-auto-flow-friction](./investigate-auto-flow-friction.md) | c1-goal-template | commands/instruction.md | COMPLETE | all 1 acceptance criteria ticked; merged direct e3739592e74b2f8dc65cbe64ad79f89… | 2026-11-24 |
| [investigate-auto-flow-friction](./investigate-auto-flow-friction.md) | c2-docguard-text | scripts/pre-guard.mjs | COMPLETE | all 1 acceptance criteria ticked; landed direct to main at 37a28fc7a65c2d69c1a1… | 2026-11-24 |
| [investigate-auto-flow-friction](./investigate-auto-flow-friction.md) | r1a-stale-binding | scripts/stop-gate.mjs+agents/unit-runner.md | COMPLETE | all 2 acceptance criteria ticked; merged direct bdd9f48418ad0f156fcfc081e7c5674… | 2026-11-24 |
| [investigate-auto-flow-friction](./investigate-auto-flow-friction.md) | r1b-parked-acceptance | scripts/stop-gate.mjs+lib/core.mjs | COMPLETE | all 2 acceptance criteria ticked; landed direct on main 69810de8482c0595fc3f0b0… | 2026-11-24 |
| [investigate-auto-flow-friction](./investigate-auto-flow-friction.md) | r2-criteria-owner | commands/plan.md+agents | COMPLETE | all 1 acceptance criteria ticked; merged direct to main 4cea2db (unit 08e0365);… | 2026-11-24 |
| [investigate-auto-flow-friction](./investigate-auto-flow-friction.md) | r3a-emitted-prefix | scripts/*.mjs-strings | COMPLETE | all 1 acceptance criteria ticked; merged direct to main at 8be26f9ba7e10a680b62… | 2026-11-24 |
| [investigate-auto-flow-friction](./investigate-auto-flow-friction.md) | r3b-doc-prefix | commands/*.md-loop | COMPLETE | all 1 acceptance criteria ticked; merged direct f3e0d29ae1124d083cf27baa76915c4… | 2026-11-24 |
| [investigate-auto-flow-friction](./investigate-auto-flow-friction.md) | r3c-doc-prefix | commands/*.md-auto | COMPLETE | all 1 acceptance criteria ticked; landed 795ed2379674ae0d93a59fae759efec1df5642… | 2026-11-24 |
| [investigate-auto-flow-friction](./investigate-auto-flow-friction.md) | r3d-userdocs-prefix | README/EXTENDING/INSTALL | COMPLETE | all 1 acceptance criteria ticked; merged direct 6dbd6d81c6abb30afc63e7cc6dbe29f… | 2026-11-24 |
| [investigate-stop-gate-foreign-acceptance](./investigate-stop-gate-foreign-acceptance.md) | acc-consumers | scripts/tracker.mjs reconcile + scripts/repo-exec.mjs land-feature per-plan | COMPLETE | all 1 acceptance criteria ticked; landed direct, merge cb8dfcc | 2026-10-27 |
| [investigate-stop-gate-foreign-acceptance](./investigate-stop-gate-foreign-acceptance.md) | acc-core | scripts/lib/core.mjs acceptance parser: [plan:] tag, bindingAcceptance | COMPLETE | all 3 acceptance criteria ticked; direct merge to main; acc-core tests 123 pass | 2026-10-27 |
| [investigate-stop-gate-foreign-acceptance](./investigate-stop-gate-foreign-acceptance.md) | acc-docs | commands/plan\|instruction\|merge.md: [plan:<slug>] wording; CHANGELOG | COMPLETE | all 2 acceptance criteria ticked; both acceptance criteria ticked (verified by … | 2026-10-28 |
| [investigate-stop-gate-foreign-acceptance](./investigate-stop-gate-foreign-acceptance.md) | acc-stop-gate | scripts/stop-gate.mjs: bind only touched units/plans; reason names plan | COMPLETE | all 2 acceptance criteria ticked; merged direct to main f6b4573674dbbfdbb14ca12… | 2026-10-27 |
| [investigate-stop-gate-foreign-acceptance](./investigate-stop-gate-foreign-acceptance.md) | auto-scope-flip | scripts/orchestrate-scope-guard.mjs: /auto no longer sets scope-required (ARCH-AUTO-10) | COMPLETE | all 2 acceptance criteria ticked; merged direct to main 933d92111c9c64c6522413e… | 2026-10-27 |
| [investigate-stop-gate-foreign-acceptance](./investigate-stop-gate-foreign-acceptance.md) | force-block-quoted | scripts/lib/force-block.mjs: destructive-git match only in git command words | COMPLETE | all 2 acceptance criteria ticked; direct merge to main | 2026-10-27 |
| [investigate-stop-gate-foreign-acceptance](./investigate-stop-gate-foreign-acceptance.md) | preguard-quoted-literals | scripts/pre-guard.mjs: variable-assignment and removal-word checks read words, not quoted literals | COMPLETE | all 2 acceptance criteria ticked; merged direct 7964f68a9b2b47bfaf94af2716fca4d… | 2026-10-27 |
| [investigate-stop-gate-foreign-acceptance](./investigate-stop-gate-foreign-acceptance.md) | preguard-sed | scripts/pre-guard.mjs: sed/perl writers only with -i, from command words | COMPLETE | all 2 acceptance criteria ticked; merged direct bc51891bec2bb42a5516203b2fe4fbb… | 2026-10-27 |
| [investigate-stop-gate-foreign-acceptance](./investigate-stop-gate-foreign-acceptance.md) | sandbox-ask-policy | scripts/lib/settings-merge.mjs: sandbox block without the recursive-delete asks (ARCH-SAFETY-12) | COMPLETE | all 1 acceptance criteria ticked; merged to main 2da7e48; acceptance node --tes… | 2026-10-27 |
| [investigate-stop-gate-foreign-acceptance](./investigate-stop-gate-foreign-acceptance.md) | scope-shell-sid | follow-up: scope.mjs run from a shell command without a session id writes sessions/shared, not the caller's session | PENDING | — | 2026-10-27 |
| [live](./live.md) | a | — | PENDING | — | 2026-10-25 |
| [other](./other.md) | zeta | — | PENDING | — | 2026-10-25 |
| [plugin-behaviour-evals](./plugin-behaviour-evals.md) | eval-run | CHANGELOG (one suite run) | COMPLETE | all 2 acceptance criteria ticked; merged (ce83768). One suite run, exit 1 (case… | 2026-11-24 |
| [plugin-behaviour-evals](./plugin-behaviour-evals.md) | eval-spike | evals/hook-guards-line, .gitignore | COMPLETE | all 3 acceptance criteria ticked; merged c3182ba (a26ba57). Spike PROVEN: probe… | 2026-11-24 |
| [plugin-behaviour-evals](./plugin-behaviour-evals.md) | eval-suite | scripts/evals.test.mjs, evals/skill-fires-*, README | COMPLETE | all 4 acceptance criteria ticked; merged into main (7fd4a48). evals.test.mjs re… | 2026-11-24 |
| [release](./release.md) | unit-1 | — | COMPLETE | verified | 2026-10-25 |
| [release](./release.md) | unit-2 | — | BLOCKED | needs approval | 2026-10-25 |
| [sandbox-auto-flow-phase-2](./sandbox-auto-flow-phase-2.md) | command-records | scripts/lib/core.mjs | COMPLETE | every acceptance line ticked and judged MET by the isolated scrutineer (round 1… | 2026-11-03 |
| [sandbox-auto-flow-phase-2](./sandbox-auto-flow-phase-2.md) | guard-heredoc | scripts/pre-guard.mjs | COMPLETE | every acceptance line ticked and judged MET by the isolated scrutineer (round 1… | 2026-11-03 |
| [sandbox-auto-flow-phase-2](./sandbox-auto-flow-phase-2.md) | guard-paths | scripts/lib/self-protect.mjs, scripts/pre-guard.mjs | COMPLETE | every acceptance line ticked and judged MET by the isolated scrutineer (round 3… | 2026-11-03 |
| [sandbox-auto-flow-phase-2](./sandbox-auto-flow-phase-2.md) | init-settings | scripts/lib/settings-merge.mjs, scripts/init.mjs, commands/init.md | COMPLETE | every acceptance line ticked and judged MET by the isolated scrutineer (round 1… | 2026-11-03 |
| [sandbox-auto-flow-phase-2](./sandbox-auto-flow-phase-2.md) | marker-lifecycle | scripts/orchestrate-scope-guard.mjs, scripts/session-context.mjs | COMPLETE | every acceptance line ticked and judged MET by the isolated scrutineer (round 1… | 2026-11-03 |
| [sandbox-auto-flow-phase-2](./sandbox-auto-flow-phase-2.md) | network-drain | scripts/lib/network.mjs, scripts/repo-exec.mjs, commands/_network.md | COMPLETE | every acceptance line ticked and judged MET by the isolated scrutineer (round 1… | 2026-11-03 |
| [sandbox-auto-flow-phase-2](./sandbox-auto-flow-phase-2.md) | phase2-changelog | CHANGELOG.md | COMPLETE | every acceptance line ticked and judged MET by the isolated scrutineer (round 1… | 2026-11-03 |
| [sandbox-auto-flow-phase-2](./sandbox-auto-flow-phase-2.md) | prettier-ignore | .prettierignore | COMPLETE | every acceptance line ticked and judged MET by the isolated scrutineer (round 1… | 2026-11-03 |
| [sandbox-auto-flow](./sandbox-auto-flow.md) | followup-common-dir-test-row | scripts/pre-guard.test.mjs | PENDING | — | 2026-11-03 |
| [sandbox-auto-flow](./sandbox-auto-flow.md) | followup-dynamic-link-source | scripts/pre-guard.mjs | CANCELLED | owner decision 2026-11-03 (AskUserQuestion): recorded as a stated limit in ARCH… | 2026-11-03 |
| [sandbox-auto-flow](./sandbox-auto-flow.md) | followup-find-delete-stale-consumer | scripts/pre-guard.mjs | CANCELLED | owner decision 2026-11-03 (AskUserQuestion): recorded as a stated limit in ARCH… | 2026-11-03 |
| [sandbox-auto-flow](./sandbox-auto-flow.md) | followup-gitfile-outside-session | scripts/pre-guard.mjs | PENDING | — | 2026-11-03 |
| [sandbox-auto-flow](./sandbox-auto-flow.md) | followup-gitfile-spellings | scripts/pre-guard.mjs | CANCELLED | owner decision 2026-11-03 (AskUserQuestion): recorded as a stated limit in ARCH… | 2026-11-03 |
| [sandbox-auto-flow](./sandbox-auto-flow.md) | followup-heredoc-spellings | scripts/pre-guard.mjs | PENDING | — | 2026-11-03 |
| [sandbox-auto-flow](./sandbox-auto-flow.md) | followup-home-word-config-gate | scripts/pre-guard.mjs | PENDING | — | 2026-11-03 |
| [sandbox-auto-flow](./sandbox-auto-flow.md) | followup-last-segment-glob | scripts/pre-guard.mjs | CANCELLED | owner decision 2026-11-03 (AskUserQuestion): recorded as a stated limit in ARCH… | 2026-11-03 |
| [sandbox-auto-flow](./sandbox-auto-flow.md) | followup-multi-target-latency | scripts/pre-guard.mjs | CANCELLED | owner decision 2026-11-03 (AskUserQuestion): recorded as a stated limit in ARCH… | 2026-11-03 |
| [sandbox-auto-flow](./sandbox-auto-flow.md) | followup-phase2-code | scripts/lib/network.mjs, scripts/pre-guard.mjs, scripts/lib/core.mjs, scripts/lib/settings-merge.mjs, commands/init.md, commands/_network.md | CANCELLED | superseded by plan sandbox-auto-flow-phase-2 (8 units, owner answers 2026-11-02… | 2026-11-02 |
| [sandbox-auto-flow](./sandbox-auto-flow.md) | followup-quality-gate-prettier | scripts/quality-gate.mjs | CANCELLED | fixed by sandbox-auto-flow-phase-2 unit prettier-ignore, 728fef9: .prettierigno… | 2026-11-02 |
| [sandbox-auto-flow](./sandbox-auto-flow.md) | followup-set-upstream-writers | scripts/repo-exec.mjs | PENDING | found while running sandbox-auto-flow: repo-exec.mjs attachDetached (branch --s… | 2026-11-01 |
| [sandbox-auto-flow](./sandbox-auto-flow.md) | init-doc-drift | commands/init.md | COMPLETE | all 1 acceptance criteria ticked; merged e56442b (impl 788d878) direct to main,… | 2026-11-02 |
| [sandbox-auto-flow](./sandbox-auto-flow.md) | sandbox-bypass-stat | scripts/stats.mjs | COMPLETE | all acceptance criteria ticked; merged de259ba (impl ff3c58d) direct to main; c… | 2026-11-02 |
| [sandbox-auto-flow](./sandbox-auto-flow.md) | sandbox-gap-report | scripts/lib/settings-merge.mjs | COMPLETE | all 2 acceptance criteria ticked; merged 0cd8f95 (impl 52e4087) direct to main,… | 2026-11-02 |
| [sandbox-auto-flow](./sandbox-auto-flow.md) | scope-ambiguous-outside-read | scripts/pre-guard.mjs | COMPLETE | all 1 acceptance criteria ticked; merged 9e122b1 (impl 0a8c843, rule 27fcb2f) d… | 2026-11-02 |
| [sandbox-auto-flow](./sandbox-auto-flow.md) | segmentre-range | scripts/pre-guard.mjs segmentRe | COMPLETE | all 1 acceptance criteria ticked; merged 54d2905 (impl beaf80d) direct to main,… | 2026-11-02 |
| [sandbox-auto-flow](./sandbox-auto-flow.md) | worktree-no-track | scripts/repo-exec.mjs | COMPLETE | all 2 acceptance criteria ticked; merged 2ce8648 (impl 8c2636a) direct to main,… | 2026-11-02 |
| [scrutinise-artist-ui-gate](./scrutinise-artist-ui-gate.md) | fix-ui-gate-round2 | scripts/ui-gate.mjs | COMPLETE | all 5 acceptance criteria ticked; merged direct 8ba334bdc592ca21d8c8fdbad7d58aa… | 2026-10-25 |
| [scrutinise-artist-ui-gate](./scrutinise-artist-ui-gate.md) | fix-ui-gate-round3 | scripts/ui-gate.mjs | COMPLETE | all 4 acceptance criteria ticked; merged direct 4b4d2f6fbe30a6d5b6ca953d2ed897d… | 2026-10-25 |
| [scrutinise-artist-ui-gate](./scrutinise-artist-ui-gate.md) | fix-ui-gate-round4 | scripts/ui-gate.mjs | COMPLETE | all 2 acceptance criteria ticked; merged direct d2d81ecc87bd2b19afbadfa988107c6… | 2026-10-25 |
| [scrutinise-artist-ui-gate](./scrutinise-artist-ui-gate.md) | fix-ui-gate-round5 | scripts/ui-gate.mjs | COMPLETE | all 2 acceptance criteria ticked; merged direct 01d865d6ad9a2692042b2f6015310eb… | 2026-10-25 |
| [scrutinise-artist-ui-gate](./scrutinise-artist-ui-gate.md) | fix-ui-gate-script | scripts/ui-gate.mjs | COMPLETE | all 4 acceptance criteria ticked; landed direct c9efbfbd215f86e4db93c2983f5df0d… | 2026-10-25 |
| [scrutinise-artist-ui-gate](./scrutinise-artist-ui-gate.md) | fix-ui-gate-wiring | commands/_shared-execution.md | COMPLETE | all 2 acceptance criteria ticked; merged direct 5b0faf98b71ffab12613fa2e9b40c5c… | 2026-10-25 |
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
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | fix-merge-gate-harden | scripts/lib/approval-gate.mjs | COMPLETE | all 2 acceptance criteria ticked; root landed 5ddf5f0; suite 1188/1188, lint PA… | 2026-10-25 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | fix-merge-gate-target | scripts/lib/approval-gate.mjs | COMPLETE | all 2 acceptance criteria ticked; root landed 7b90bf9; suite 1176/1176 (TMPDIR … | 2026-10-25 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | fix-merge-retire | scripts/repo-exec.mjs | COMPLETE | all 3 acceptance criteria ticked; landed to main | 2026-10-23 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | fix-publish-atomic | scripts/tracker-publish.mjs | COMPLETE | all 3 acceptance criteria ticked; landed to main | 2026-10-23 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | fix-publish-cli | scripts/tracker.mjs | COMPLETE | all 2 acceptance criteria ticked; landed to main | 2026-10-23 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | fix-publish-single-use | scripts/tracker-publish.mjs | COMPLETE | all 5 acceptance criteria ticked; landed to main | 2026-10-23 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | fix-publish-trust | scripts/tracker-publish.mjs | COMPLETE | all 5 acceptance criteria ticked; landed to main; suite green except known base… | 2026-10-23 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | fix-scan-floor | scripts/approval.mjs | COMPLETE | all 2 acceptance criteria ticked; root landed b4c7892; suite 1118/1118, lint PA… | 2026-10-25 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | fix-stats-and-prose | scripts/stats.mjs | COMPLETE | all 2 acceptance criteria ticked; landed to main; suite green except known base… | 2026-10-23 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | fix-sync-guard | scripts/tracker.mjs | COMPLETE | all 3 acceptance criteria ticked; landed to main; suite green except known base… | 2026-10-23 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | force-block-wordlevel | scripts/lib/force-block.mjs | PENDING | — | 2026-10-24 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | land-unit-base-gate | scripts/repo-exec.mjs | PENDING | — | 2026-10-25 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | lease-doc-claim | commands/auto.md | PENDING | — | 2026-10-23 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | lease-glob-anchoring | scripts/lib/force-block.mjs | PENDING | — | 2026-10-23 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | ledger-parse-dedupe2 | scripts/lib/ledger-keys.mjs | PENDING | — | 2026-10-25 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | ledger-parser-dedupe | scripts/lib/ledger-keys.mjs | PENDING | — | 2026-10-23 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | mainroot-missing-fallback | scripts/lib/core.mjs | PENDING | — | 2026-10-25 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | merge-diff-ignore-submodules | scripts/lib/approval-gate.mjs | PENDING | — | 2026-10-25 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | merge-gate-callers-test | scripts/repo-exec-approval.test.mjs | PENDING | — | 2026-10-25 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | merge-gate-test-gaps | scripts/repo-exec-approval.test.mjs | PENDING | — | 2026-10-25 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | merge-local-base-unpushed | scripts/repo-exec.mjs | PENDING | — | 2026-10-25 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | merge-md-base-commit-path | commands/merge.md | PENDING | — | 2026-10-25 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | merge-md-nonplan-docs | commands/merge.md | PENDING | — | 2026-10-25 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | merge-pin-sha-source | scripts/lib/approval-gate.mjs | PENDING | — | 2026-10-25 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | offline-landed-record | scripts/lib/approval-gate.mjs | PENDING | — | 2026-10-23 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | onpath-dedupe | scripts/doc-checks.mjs | PENDING | — | 2026-10-25 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | profile-knobs | .claude-plugin/plugin.json | CANCELLED | moved to dev-lifecycle-docs-plan as unit profile-knobs (PR 1 landed) | 2026-10-23 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | publish-manual-owner | scripts/tracker-publish.mjs | PENDING | — | 2026-10-25 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | publish-observability-tests | scripts/tracker-publish-cli.test.mjs | PENDING | round 5 suggestions: assert the second publish is a refusal not an unchanged no… | 2026-10-23 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | readme-safety-keys | README.md | COMPLETE | README protected-keys list updated in fca230a (landed f3c2a7d) | 2026-10-26 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | telemetry-baseline-marker | scripts/telemetry.mjs | PENDING | — | 2026-10-23 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | unit-runner-claim-project | agents/unit-runner.md | PENDING | — | 2026-10-25 |
| [scrutinise-dev-lifecycle-docs-plan](./scrutinise-dev-lifecycle-docs-plan.md) | workspace-key-collision | scripts/lib/ledger-keys.mjs | PENDING | — | 2026-10-23 |
| [scrutinise-investigate-auto-flow-friction](./scrutinise-investigate-auto-flow-friction.md) | s1-stopgate-advice | scripts/stop-gate.mjs | COMPLETE | all acceptance criteria ticked; suite 2012/2012 and arch-check lint PASS at f87… | 2026-11-25 |
| [scrutinise-investigate-auto-flow-friction](./scrutinise-investigate-auto-flow-friction.md) | s2-core-bindings | scripts/lib/core.mjs | COMPLETE | all acceptance criteria ticked; suite 2012/2012 and arch-check lint PASS at f87… | 2026-11-25 |
| [scrutinise-investigate-auto-flow-friction](./scrutinise-investigate-auto-flow-friction.md) | s3-preguard-advice | scripts/pre-guard.mjs | COMPLETE | all acceptance criteria ticked; suite 2012/2012 and arch-check lint PASS at f87… | 2026-11-25 |
| [scrutinise-investigate-auto-flow-friction](./scrutinise-investigate-auto-flow-friction.md) | s4-goal-step2 | commands/instruction.md | COMPLETE | all acceptance criteria ticked; suite 2012/2012 and arch-check lint PASS at f87… | 2026-11-25 |
| [scrutinise-investigate-auto-flow-friction](./scrutinise-investigate-auto-flow-friction.md) | w2-binding-inflight | scripts/stop-gate.mjs-binding | COMPLETE | all acceptance criteria ticked; suite 2012/2012 and arch-check lint PASS at f87… | 2026-11-25 |
| [scrutinise-investigate-stop-gate-foreign-acceptance](./scrutinise-investigate-stop-gate-foreign-acceptance.md) | fb-prose-fail-closed | scripts/lib/force-block.mjs blankProse | COMPLETE | all 2 acceptance criteria ticked; landed direct 6283c8a404b32cbaa726c40ead1033f… | 2026-10-28 |
| [scrutinise-investigate-stop-gate-foreign-acceptance](./scrutinise-investigate-stop-gate-foreign-acceptance.md) | plan-slug-normaliser | scripts/lib/core.mjs planSlugOf | COMPLETE | all 1 acceptance criteria ticked; merged direct to main 37145ef509cd3fd379b7543… | 2026-10-28 |
| [scrutinise-investigate-stop-gate-foreign-acceptance](./scrutinise-investigate-stop-gate-foreign-acceptance.md) | preguard-bypass-records | pre-guard sed/quoted test files | COMPLETE | all 1 acceptance criteria ticked; merged direct 541a55b1f78205f76bee96ee4f8b47f… | 2026-10-28 |
| [scrutinise-investigate-stop-gate-foreign-acceptance](./scrutinise-investigate-stop-gate-foreign-acceptance.md) | preguard-inplace-spellings | scripts/pre-guard.mjs in-place writer detection | COMPLETE | all 2 acceptance criteria ticked; merged direct cee13b6f7abeb87cf47ef0aa5ba11fd… | 2026-10-28 |
| [scrutinise-investigate-stop-gate-foreign-acceptance](./scrutinise-investigate-stop-gate-foreign-acceptance.md) | r2-bypass-records | pre-guard bypass records | COMPLETE | all 1 acceptance criteria ticked; merged direct 56ff55581d71df1728846f5052155a2… | 2026-10-28 |
| [scrutinise-investigate-stop-gate-foreign-acceptance](./scrutinise-investigate-stop-gate-foreign-acceptance.md) | r2-plan-slug-strict | scripts/lib/core.mjs planSlugOf | COMPLETE | all 1 acceptance criteria ticked; direct merge b8f78c70808715d17bfe00e421498aae… | 2026-10-28 |
| [scrutinise-investigate-stop-gate-foreign-acceptance](./scrutinise-investigate-stop-gate-foreign-acceptance.md) | r2-preguard-writes | scripts/pre-guard.mjs writer detection | COMPLETE | all 1 acceptance criteria ticked; merged 8ab778b direct | 2026-10-28 |
| [scrutinise-investigate-stop-gate-foreign-acceptance](./scrutinise-investigate-stop-gate-foreign-acceptance.md) | r2-prose-shadow | scripts/lib/force-block.mjs blankProse | COMPLETE | all 1 acceptance criteria ticked; merged direct 7186e5c0cbe9693a6d7cc2e46081ebc… | 2026-10-28 |
| [scrutinise-investigate-stop-gate-foreign-acceptance](./scrutinise-investigate-stop-gate-foreign-acceptance.md) | r3-prose-readback | scripts/lib/force-block.mjs blankProse read-back | COMPLETE | all 1 acceptance criteria ticked; merged direct 5cf2677e77a3059d2dabdaf5c9e9fd8… | 2026-10-28 |
| [scrutinise-investigate-stop-gate-foreign-acceptance](./scrutinise-investigate-stop-gate-foreign-acceptance.md) | rules-text | docs/architecture safety/tracker/landing rules | COMPLETE | all 1 acceptance criteria ticked; direct merge to main; rules tests+lint pass | 2026-10-28 |
| [scrutinise-plugin-behaviour-evals](./scrutinise-plugin-behaviour-evals.md) | fix-evals-suggestions | scripts/evals.test.mjs, README.md, CHANGELOG.md | COMPLETE | all 4 acceptance criteria ticked; merged (3995173). 3 new fixtures red-first th… | 2026-11-24 |
| [scrutinise-sandbox-auto-flow-phase-2](./scrutinise-sandbox-auto-flow-phase-2.md) | bash-writer-gaps | scripts/pre-guard.mjs | COMPLETE | every acceptance line ticked and judged MET by the isolated scrutineer (round 6… | 2026-11-03 |
| [scrutinise-sandbox-auto-flow-phase-2](./scrutinise-sandbox-auto-flow-phase-2.md) | cp-link-sources | scripts/pre-guard.mjs | COMPLETE | every acceptance line ticked and judged MET by the isolated scrutineer (round 3… | 2026-11-03 |
| [scrutinise-sandbox-auto-flow-phase-2](./scrutinise-sandbox-auto-flow-phase-2.md) | drain-rejected | scripts/lib/network.mjs, scripts/repo-exec.mjs | COMPLETE | every acceptance line ticked and judged MET by the isolated scrutineer (round 2… | 2026-11-03 |
| [scrutinise-sandbox-auto-flow-phase-2](./scrutinise-sandbox-auto-flow-phase-2.md) | handoff-arming | scripts/handoff.mjs, scripts/session-context.mjs, scripts/account-switch.mjs, scripts/lib/core.mjs, commands/_shared-execution.md | COMPLETE | every acceptance line ticked and judged MET by the isolated scrutineer (round 2… | 2026-11-03 |
| [scrutinise-sandbox-auto-flow-phase-2](./scrutinise-sandbox-auto-flow-phase-2.md) | heredoc-limits | scripts/pre-guard.mjs | COMPLETE | every acceptance line ticked and judged MET by the isolated scrutineer (round 2… | 2026-11-03 |
| [scrutinise-sandbox-auto-flow-phase-2](./scrutinise-sandbox-auto-flow-phase-2.md) | ln-check-safe-exemption | scripts/pre-guard.mjs | COMPLETE | every acceptance line ticked and judged MET by the isolated scrutineer (round 4… | 2026-11-03 |
| [scrutinise-sandbox-auto-flow-phase-2](./scrutinise-sandbox-auto-flow-phase-2.md) | network-consumer-doc | commands/_network.md, scripts/network.test.mjs | COMPLETE | every acceptance line ticked and judged MET by the isolated scrutineer (round 3… | 2026-11-03 |
| [scrutinise-sandbox-auto-flow-phase-2](./scrutinise-sandbox-auto-flow-phase-2.md) | prettier-test-copy | scripts/prettier-ignore.test.mjs | COMPLETE | every acceptance line ticked and judged MET by the isolated scrutineer (round 2… | 2026-11-03 |
| [scrutinise-sandbox-auto-flow-phase-2](./scrutinise-sandbox-auto-flow-phase-2.md) | queue-protection | scripts/lib/self-protect.mjs, scripts/pre-guard.mjs | COMPLETE | every acceptance line ticked and judged MET by the isolated scrutineer (round 2… | 2026-11-03 |
| [scrutinise-sandbox-auto-flow-phase-2](./scrutinise-sandbox-auto-flow-phase-2.md) | scratch-write-hardening | scripts/pre-guard.mjs, scripts/lib/self-protect.mjs | COMPLETE | every acceptance line ticked and judged MET by the isolated scrutineer (round 2… | 2026-11-03 |
| [scrutinise-sandbox-auto-flow-phase-2](./scrutinise-sandbox-auto-flow-phase-2.md) | submodule-git-surface | scripts/lib/self-protect.mjs, scripts/pre-guard.mjs | COMPLETE | every acceptance line ticked and judged MET by the isolated scrutineer (round 4… | 2026-11-03 |
| [scrutinise-sandbox-auto-flow-phase-2](./scrutinise-sandbox-auto-flow-phase-2.md) | submodule-worktree-queue | scripts/pre-guard.mjs, scripts/lib/self-protect.mjs | COMPLETE | every acceptance line ticked and judged MET by the isolated scrutineer (round 3… | 2026-11-03 |
| [scrutinise-sandbox-auto-flow-phase-2](./scrutinise-sandbox-auto-flow-phase-2.md) | worktree-surface-fixes | scripts/lib/self-protect.mjs | COMPLETE | every acceptance line ticked and judged MET by the isolated scrutineer (round 5… | 2026-11-03 |
| [scrutinise-sandbox-auto-flow](./scrutinise-sandbox-auto-flow.md) | bracket-literal-fallback | scripts/pre-guard.mjs bracketClass | COMPLETE | all 1 acceptance criteria ticked; merged da1d703 (fix a92a43d, red test e28b7f7… | 2026-11-02 |
| [scrutinise-sandbox-auto-flow](./scrutinise-sandbox-auto-flow.md) | bypass-head-assignment | scripts/pre-guard.mjs commandHead | COMPLETE | all 1 acceptance criteria ticked; merged 042cfa1 (fix 0ab50de, red test 8187ef3… | 2026-11-02 |
| [scrutinise-sandbox-auto-flow](./scrutinise-sandbox-auto-flow.md) | fixtures-no-upstream | scripts/auto-archive.test.mjs, scripts/repo-exec-approval.test.mjs | COMPLETE | all 1 acceptance criteria ticked; merged 46b7569 (test 2f094cb) direct to main,… | 2026-11-02 |
| [scrutinise-sandbox-auto-flow](./scrutinise-sandbox-auto-flow.md) | followup-bash-guard-linear-cost | scripts/pre-guard.mjs, scripts/lib/self-protect.mjs, scripts/lib/force-block.mjs, scripts/lib/core.mjs | PENDING | found by ln-check-safe-exemption 10.3 (smoke of 3744 four-KB inputs, serial re-… | 2026-11-03 |
| [scrutinise-sandbox-auto-flow](./scrutinise-sandbox-auto-flow.md) | followup-bracket-posix-classes | scripts/pre-guard.mjs bracketClass | PENDING | found by scrutinise round 2 S3: rm of docs/plans/[[:alpha:]]lan.md, [ ]p]lan.md… | 2026-11-02 |
| [scrutinise-sandbox-auto-flow](./scrutinise-sandbox-auto-flow.md) | followup-e2e-loop-budget-trim | docs/plans/autonomous-e2e-loop.md | COMPLETE | done in b399da9; the budget test no longer fails when scope.mjs, README or CHAN… | 2026-11-02 |
| [scrutinise-sandbox-auto-flow](./scrutinise-sandbox-auto-flow.md) | followup-pre-guard-helper-layout | scripts/pre-guard.mjs, scripts/scope.mjs | PENDING | found by scrutinise-sandbox-auto-flow S5: refactor that moves every pre-guard c… | 2026-11-01 |
| [scrutinise-sandbox-auto-flow](./scrutinise-sandbox-auto-flow.md) | followup-round3-suggestions | scripts/lib/settings-merge.mjs, scripts/pre-guard.test.mjs | PENDING | found by scrutinise round 3 (state 953ad19, 0 Critical 0 Warning): R3-S1 origin… | 2026-11-02 |
| [scrutinise-sandbox-auto-flow](./scrutinise-sandbox-auto-flow.md) | followup-scratch-root-cache-names | scripts/pre-guard.mjs | PENDING | found by scrutinise-sandbox-auto-flow S4: scratch root is os.tmpdir(), all of /… | 2026-11-01 |
| [scrutinise-sandbox-auto-flow](./scrutinise-sandbox-auto-flow.md) | init-gap-text | scripts/lib/settings-merge.mjs, commands/init.md | COMPLETE | all 2 acceptance criteria ticked; merged 0923480 (settings-merge 2b75cdc, init.… | 2026-11-02 |
| [scrutinise-sandbox-auto-flow](./scrutinise-sandbox-auto-flow.md) | origin-host-forms | scripts/lib/settings-merge.mjs originHostOf | COMPLETE | all 1 acceptance criteria ticked; merged 953ad19 (fix 8779a65, red tests b59ee9… | 2026-11-02 |
| [scrutinise-sandbox-auto-flow](./scrutinise-sandbox-auto-flow.md) | scratch-governed-coverage | scripts/pre-guard.mjs insideScratchRoots | COMPLETE | all 1 acceptance criteria ticked; merged 4751dbb (fix a54046b, tests a8d7f02) d… | 2026-11-02 |
| [scrutinise-sandbox-auto-flow](./scrutinise-sandbox-auto-flow.md) | scratch-read-all-scopes | scripts/pre-guard.mjs, scripts/scope.mjs | COMPLETE | all 3 acceptance criteria ticked; merged 47125f7 (fix c283e48, activeScopes 9e9… | 2026-11-02 |
| [scrutinise-service-scoped-gates](./scrutinise-service-scoped-gates.md) | fix-baseline-owner | scripts/stop-gate.mjs | COMPLETE | all 2 acceptance criteria ticked; landed direct on main as merge 8de1728 (772c4… | 2026-11-04 |
| [scrutinise-service-scoped-gates](./scrutinise-service-scoped-gates.md) | fix-baseline-resilient | scripts/stop-gate.mjs | COMPLETE | all 2 acceptance criteria ticked; merged to main as 76af88c (direct land, branc… | 2026-11-04 |
| [scrutinise-service-scoped-gates](./scrutinise-service-scoped-gates.md) | fix-baseline-session | scripts/snapshot.mjs, scripts/session-context.mjs, scripts/stop-gate.mjs | COMPLETE | all 3 acceptance criteria ticked; landed direct on main as f7062bca (merge of f… | 2026-11-04 |
| [scrutinise-service-scoped-gates](./scrutinise-service-scoped-gates.md) | fix-config-robustness | scripts/lib/core.mjs, scripts/quality-gate.mjs | COMPLETE | all 2 acceptance criteria ticked; landed direct onto main as 7a6323fc9e939027c1… | 2026-11-04 |
| [scrutinise-service-scoped-gates](./scrutinise-service-scoped-gates.md) | fix-extending-docs | EXTENDING.md | COMPLETE | all 1 acceptance criteria ticked; merged direct to main as 79c7693 (unit commit… | 2026-11-04 |
| [scrutinise-service-scoped-gates](./scrutinise-service-scoped-gates.md) | fix-gate-usable | scripts/lib/gate-command.mjs, scripts/repo-exec.mjs | COMPLETE | all 2 acceptance criteria ticked; landed direct on main as 9a92eb7 (merge of fe… | 2026-11-04 |
| [scrutinise-service-scoped-gates](./scrutinise-service-scoped-gates.md) | fix-merge-gate | scripts/repo-exec.mjs | COMPLETE | all 2 acceptance criteria ticked; land: merged d0b31d5 direct to main (pushed);… | 2026-11-04 |
| [scrutinise-service-scoped-gates](./scrutinise-service-scoped-gates.md) | fix-skip-reason | scripts/stop-gate.mjs, scripts/lib/core.mjs | COMPLETE | all 3 acceptance criteria ticked; landed direct as db007cf4f06245644cb68fb2c267… | 2026-11-04 |
| [scrutinise-service-scoped-gates](./scrutinise-service-scoped-gates.md) | fix-snapshot-fact | scripts/stop-gate.mjs, scripts/session-context.mjs, scripts/quality-gate.mjs | COMPLETE | all 3 acceptance criteria ticked; landed direct on main as eb6c31b (feat/fix-sn… | 2026-11-04 |
| [scrutinise-service-scoped-gates](./scrutinise-service-scoped-gates.md) | fix-stop-snapshot | scripts/stop-gate.mjs, scripts/snapshot.mjs, scripts/lib/changed.mjs | COMPLETE | all 2 acceptance criteria ticked; landed direct on main as 206c911 (unit commit… | 2026-11-04 |
| [scrutinise-service-scoped-gates](./scrutinise-service-scoped-gates.md) | fix-workspaceroot-callers | scripts/repo-exec.mjs, scripts/stop-gate.mjs | COMPLETE | all 2 acceptance criteria ticked; merged direct to main at 63fa4a208db5b9be4794… | 2026-11-20 |
| [scrutinise-service-scoped-gates](./scrutinise-service-scoped-gates.md) | fix-workspaceroot-helper | scripts/lib/core.mjs, scripts/lib/changed.mjs, scripts/lib/gate-command.mjs, scripts/snapshot.mjs | COMPLETE | all 2 acceptance criteria ticked; landed direct on main f2e2c1fadf974f4c2d28aaf… | 2026-11-20 |
| [scrutinise-service-scoped-gates](./scrutinise-service-scoped-gates.md) | followup-approval-workspaceroot | scripts/approval.mjs, scripts/doc-checks.mjs | PENDING | — | 2026-11-20 |
| [scrutinise-service-scoped-gates](./scrutinise-service-scoped-gates.md) | followup-arch-check-root-layering | scripts/arch-check.mjs | PENDING | — | 2026-11-04 |
| [scrutinise-service-scoped-gates](./scrutinise-service-scoped-gates.md) | followup-changed-argv-cap | scripts/lib/changed.mjs, scripts/repo-exec.mjs | PENDING | — | 2026-11-05 |
| [scrutinise-service-scoped-gates](./scrutinise-service-scoped-gates.md) | followup-changelist-inside-root | scripts/stop-gate.mjs | PENDING | — | 2026-11-04 |
| [scrutinise-service-scoped-gates](./scrutinise-service-scoped-gates.md) | followup-changelist-symlink-root | scripts/quality-gate.mjs | PENDING | — | 2026-11-04 |
| [scrutinise-service-scoped-gates](./scrutinise-service-scoped-gates.md) | followup-gate-spawn-error-message | scripts/repo-exec.mjs | PENDING | — | 2026-11-04 |
| [scrutinise-service-scoped-gates](./scrutinise-service-scoped-gates.md) | followup-gate-usable-path-probe | scripts/lib/gate-command.mjs, scripts/repo-exec.mjs | CANCELLED | fixed by fix-gate-usable 8.1 (merge 9a92eb7): a path-named program is probed re… | 2026-11-04 |
| [scrutinise-service-scoped-gates](./scrutinise-service-scoped-gates.md) | followup-instruction-scoped-command | commands/instruction.md | PENDING | — | 2026-11-05 |
| [scrutinise-service-scoped-gates](./scrutinise-service-scoped-gates.md) | followup-land-feature-workspaceroot-test | scripts/repo-exec-scoped.test.mjs | PENDING | — | 2026-11-20 |
| [scrutinise-service-scoped-gates](./scrutinise-service-scoped-gates.md) | followup-land-unit-empty-diff | scripts/repo-exec.mjs | PENDING | — | 2026-11-04 |
| [scrutinise-service-scoped-gates](./scrutinise-service-scoped-gates.md) | followup-own-marker-regressions | scripts/session-context.mjs, docs/architecture, EXTENDING.md | CANCELLED | fixed by fix-baseline-session 7.3 (merge f7062bc): stale snapshot-started unlin… | 2026-11-04 |
| [scrutinise-service-scoped-gates](./scrutinise-service-scoped-gates.md) | followup-premerge-marker-lookup | scripts/repo-exec.mjs, scripts/lib/gate-command.mjs | PENDING | — | 2026-11-04 |
| [scrutinise-service-scoped-gates](./scrutinise-service-scoped-gates.md) | followup-program-probe-helper | scripts/lib/gate-command.mjs, scripts/lib/core.mjs | PENDING | — | 2026-11-05 |
| [scrutinise-service-scoped-gates](./scrutinise-service-scoped-gates.md) | followup-same-repository-helper | scripts/stop-gate.mjs, scripts/scope.mjs | PENDING | — | 2026-11-05 |
| [scrutinise-service-scoped-gates](./scrutinise-service-scoped-gates.md) | followup-scoped-gate-tests | scripts/repo-exec-scoped.test.mjs, scripts/stop-gate-scoped.test.mjs | PENDING | — | 2026-11-04 |
| [scrutinise-service-scoped-gates](./scrutinise-service-scoped-gates.md) | followup-snapshot-dropped-reason | scripts/snapshot.mjs, scripts/stop-gate.mjs | PENDING | — | 2026-11-05 |
| [scrutinise-service-scoped-gates](./scrutinise-service-scoped-gates.md) | followup-snapshot-enoent-red | scripts/snapshot.mjs | CANCELLED | fixed by fix-baseline-session 7.4 (merge f7062bc): a missing program leaves no … | 2026-11-04 |
| [scrutinise-service-scoped-gates](./scrutinise-service-scoped-gates.md) | followup-snapshot-tree-hash-craftsman-state | scripts/snapshot.mjs, scripts/session-context.mjs | CANCELLED | fixed by fix-baseline-session 7.1 (merge f7062bc): both tree hashes drop crafts… | 2026-11-04 |
| [scrutinise-service-scoped-gates](./scrutinise-service-scoped-gates.md) | followup-state04-comment-cites | scripts/lib/craftsman-state.mjs, scripts/session-context.mjs, scripts/snapshot.mjs | PENDING | — | 2026-11-04 |
| [scrutinise-service-scoped-gates](./scrutinise-service-scoped-gates.md) | followup-tokenize-leading-dash | scripts/lib/core.mjs, scripts/lib/tool-cwd.test.mjs | PENDING | — | 2026-11-04 |
| [scrutinise-service-scoped-gates](./scrutinise-service-scoped-gates.md) | followup-unit-scope-session-start | scripts/stop-gate.mjs, scripts/snapshot.mjs | CANCELLED | fixed by fix-baseline-session 7.2 (merge f7062bc): Stop reads the baseline and … | 2026-11-04 |
| [scrutinise-service-scoped-gates](./scrutinise-service-scoped-gates.md) | followup-workspaceroot-submodule-test | scripts/lib/config-layering.test.mjs, scripts/snapshot.test.mjs | PENDING | — | 2026-11-20 |
| [scrutinise-service-scoped-gates](./scrutinise-service-scoped-gates.md) | followup-workspaceroot-trust-note | EXTENDING.md | PENDING | — | 2026-11-20 |
| [scrutinise-service-scoped-gates](./scrutinise-service-scoped-gates.md) | followup-workspaceroot-worktree | scripts/lib/core.mjs | PENDING | — | 2026-11-05 |
| [scrutinise-skill-description-rewrites](./scrutinise-skill-description-rewrites.md) | fix-arch-cites | rules cites via /architect --update | COMPLETE | all 1 acceptance criteria ticked; pushed 421f0d0: /architect --update evals (al… | 2026-11-25 |
| [scrutinise-skill-description-rewrites](./scrutinise-skill-description-rewrites.md) | fix-evals-cites | evals rules cites via /architect --update | COMPLETE | all 1 acceptance criteria ticked; pushed 95c7c43: ARCH-EVALS-01 -> evals.test.m… | 2026-11-25 |
| [scrutinise-skill-description-rewrites](./scrutinise-skill-description-rewrites.md) | fix-evals01-cite | ARCH-EVALS-01 cite | COMPLETE | all 1 acceptance criteria ticked; pushed acff448: ARCH-EVALS-01 cite -> scripts… | 2026-11-25 |
| [scrutinise-skill-description-rewrites](./scrutinise-skill-description-rewrites.md) | fix-vendored-assert | skills-vendored.test redundant assert | COMPLETE | all 1 acceptance criteria ticked; merged 365bca1: redundant assert.match(ATTRIB… | 2026-11-25 |
| [scrutinise-skill-description-rewrites](./scrutinise-skill-description-rewrites.md) | fix-vendored-check | skills-vendored.test + README cost | COMPLETE | all 2 acceptance criteria ticked; merged 865345b (c4768b3): vendoredSkills(root… | 2026-11-25 |
| [skill-description-rewrites](./skill-description-rewrites.md) | sdr-ceiling | ceiling run (+case design fix if 0/3) | COMPLETE | all 2 acceptance criteria ticked; ceiling 2026-11-25: systematic-debugging desc… | 2026-11-25 |
| [skill-description-rewrites](./skill-description-rewrites.md) | sdr-outcome | remove failures, README, CHANGELOG | COMPLETE | all 3 acceptance criteria ticked; merged a61c2e8 (ef7925b): removed skills/{sys… | 2026-11-25 |
| [skill-description-rewrites](./skill-description-rewrites.md) | sdr-rewrite | one rewrite + after + held-out runs | COMPLETE | all 3 acceptance criteria ticked; merged f9451e1 (rewrite 8d58caa: sd 102, tdd … | 2026-11-25 |
| [skill-description-rewrites](./skill-description-rewrites.md) | sdr-test-derive | evals.test derives skills from skills/ | COMPLETE | all 2 acceptance criteria ticked; merged a9113f4 (commit 60459b6): evals.test d… | 2026-11-25 |
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
