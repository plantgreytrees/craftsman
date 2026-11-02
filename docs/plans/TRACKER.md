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
| [investigate-cross-repo-worktree-git-guard](./investigate-cross-repo-worktree-git-guard.md) | account-switch-same-repo | commands/account-switch.md | COMPLETE | all 1 acceptance criteria ticked; landed direct on main 868d87fb7ccd9f11466066f… | 2026-10-27 |
| [investigate-cross-repo-worktree-git-guard](./investigate-cross-repo-worktree-git-guard.md) | guard-target-resolution | scripts/pre-guard.mjs | COMPLETE | all 6 acceptance criteria ticked; merged direct 0a9f48ded9b67dc6ad60052b8844faf… | 2026-10-27 |
| [investigate-cross-repo-worktree-git-guard](./investigate-cross-repo-worktree-git-guard.md) | scope-release-clean | scripts/scope.mjs | COMPLETE | all 4 acceptance criteria ticked; landed direct on main at 2a172cb7785527cd0f16… | 2026-10-27 |
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
| [release](./release.md) | unit-1 | — | COMPLETE | verified | 2026-10-25 |
| [release](./release.md) | unit-2 | — | BLOCKED | needs approval | 2026-10-25 |
| [sandbox-auto-flow-phase-2](./sandbox-auto-flow-phase-2.md) | command-records | scripts/lib/core.mjs | PENDING | — | 2026-11-02 |
| [sandbox-auto-flow-phase-2](./sandbox-auto-flow-phase-2.md) | guard-heredoc | scripts/pre-guard.mjs | PENDING | — | 2026-11-02 |
| [sandbox-auto-flow-phase-2](./sandbox-auto-flow-phase-2.md) | guard-paths | scripts/lib/self-protect.mjs, scripts/pre-guard.mjs | PENDING | — | 2026-11-02 |
| [sandbox-auto-flow-phase-2](./sandbox-auto-flow-phase-2.md) | init-settings | scripts/lib/settings-merge.mjs, scripts/init.mjs, commands/init.md | PENDING | — | 2026-11-02 |
| [sandbox-auto-flow-phase-2](./sandbox-auto-flow-phase-2.md) | marker-lifecycle | scripts/orchestrate-scope-guard.mjs, scripts/session-context.mjs | PENDING | — | 2026-11-02 |
| [sandbox-auto-flow-phase-2](./sandbox-auto-flow-phase-2.md) | network-drain | scripts/lib/network.mjs, scripts/repo-exec.mjs, commands/_network.md | PENDING | — | 2026-11-02 |
| [sandbox-auto-flow-phase-2](./sandbox-auto-flow-phase-2.md) | phase2-changelog | CHANGELOG.md | PENDING | — | 2026-11-02 |
| [sandbox-auto-flow-phase-2](./sandbox-auto-flow-phase-2.md) | prettier-ignore | .prettierignore | PENDING | — | 2026-11-02 |
| [sandbox-auto-flow](./sandbox-auto-flow.md) | followup-phase2-code | scripts/lib/network.mjs, scripts/pre-guard.mjs, scripts/lib/core.mjs, scripts/lib/settings-merge.mjs, commands/init.md, commands/_network.md | CANCELLED | superseded by plan sandbox-auto-flow-phase-2 (8 units, owner answers 2026-11-02… | 2026-11-02 |
| [sandbox-auto-flow](./sandbox-auto-flow.md) | followup-quality-gate-prettier | scripts/quality-gate.mjs | PENDING | found while running sandbox-auto-flow: an Edit or Write on a .mjs file runs pre… | 2026-11-01 |
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
| [scrutinise-investigate-cross-repo-worktree-git-guard](./scrutinise-investigate-cross-repo-worktree-git-guard.md) | doc-guard-any-glob | scripts/pre-guard.mjs | COMPLETE | all 2 acceptance criteria ticked; direct merge 72a9faff1407db4ee8793247d24613b0… | 2026-11-01 |
| [scrutinise-investigate-cross-repo-worktree-git-guard](./scrutinise-investigate-cross-repo-worktree-git-guard.md) | doc-guard-arith-context | scripts/pre-guard.mjs | COMPLETE | all 2 acceptance criteria ticked; origin/main dbfe758..1f2339c (2822f49 red tes… | 2026-11-02 |
| [scrutinise-investigate-cross-repo-worktree-git-guard](./scrutinise-investigate-cross-repo-worktree-git-guard.md) | doc-guard-arith-reach | scripts/pre-guard.mjs | COMPLETE | all 2 acceptance criteria ticked; origin/main 654fd72 (ff, no force): ef1185c r… | 2026-11-02 |
| [scrutinise-investigate-cross-repo-worktree-git-guard](./scrutinise-investigate-cross-repo-worktree-git-guard.md) | doc-guard-array-default | scripts/pre-guard.mjs | COMPLETE | all 2 acceptance criteria ticked; c313905 on origin/main (red tests, fix; no ci… | 2026-11-02 |
| [scrutinise-investigate-cross-repo-worktree-git-guard](./scrutinise-investigate-cross-repo-worktree-git-guard.md) | doc-guard-blank-reach | scripts/pre-guard.mjs | COMPLETE | all 2 acceptance criteria ticked; 2215ff1 on origin/main (f46e031 red tests, e5… | 2026-11-02 |
| [scrutinise-investigate-cross-repo-worktree-git-guard](./scrutinise-investigate-cross-repo-worktree-git-guard.md) | doc-guard-decode-flow | scripts/pre-guard.mjs | COMPLETE | all 2 acceptance criteria ticked; b9d8709 on origin/main (113508d red tests, fi… | 2026-11-02 |
| [scrutinise-investigate-cross-repo-worktree-git-guard](./scrutinise-investigate-cross-repo-worktree-git-guard.md) | doc-guard-env-abbrev | scripts/pre-guard.mjs | COMPLETE | all 2 acceptance criteria ticked; origin/main 03a1b5c (ff, no force; merged 88b… | 2026-11-02 |
| [scrutinise-investigate-cross-repo-worktree-git-guard](./scrutinise-investigate-cross-repo-worktree-git-guard.md) | doc-guard-glob-clean | scripts/pre-guard.mjs | COMPLETE | all 2 acceptance criteria ticked; merged direct 2112630becb06ef0f26809aa4581004… | 2026-10-28 |
| [scrutinise-investigate-cross-repo-worktree-git-guard](./scrutinise-investigate-cross-repo-worktree-git-guard.md) | doc-guard-join-flow | scripts/pre-guard.mjs | COMPLETE | all 2 acceptance criteria ticked; 17a58d1 on origin/main (6a19873 red tests, fi… | 2026-11-02 |
| [scrutinise-investigate-cross-repo-worktree-git-guard](./scrutinise-investigate-cross-repo-worktree-git-guard.md) | doc-guard-name-anywhere | scripts/pre-guard.mjs | COMPLETE | all 2 acceptance criteria ticked; origin/main e2548f4..c4a7988 (642c00b red tes… | 2026-11-02 |
| [scrutinise-investigate-cross-repo-worktree-git-guard](./scrutinise-investigate-cross-repo-worktree-git-guard.md) | doc-guard-name-forms | scripts/pre-guard.mjs | COMPLETE | all 2 acceptance criteria ticked; origin/main bb64c17..1824ffd (d4907f6 red tes… | 2026-11-02 |
| [scrutinise-investigate-cross-repo-worktree-git-guard](./scrutinise-investigate-cross-repo-worktree-git-guard.md) | doc-guard-nul-quote | scripts/pre-guard.mjs | COMPLETE | all 2 acceptance criteria ticked; origin/main 068b974..b6d932a (b63a29e red tes… | 2026-11-02 |
| [scrutinise-investigate-cross-repo-worktree-git-guard](./scrutinise-investigate-cross-repo-worktree-git-guard.md) | doc-guard-shell-quoting | scripts/pre-guard.mjs | COMPLETE | all 2 acceptance criteria ticked; merged c41ad91 (impl 65c8fa8), direct land; s… | 2026-11-01 |
| [scrutinise-investigate-cross-repo-worktree-git-guard](./scrutinise-investigate-cross-repo-worktree-git-guard.md) | doc-guard-structural | scripts/pre-guard.mjs | COMPLETE | all 2 acceptance criteria ticked; merged 1d795e1 direct to main; 1233 tests pas… | 2026-11-01 |
| [scrutinise-investigate-cross-repo-worktree-git-guard](./scrutinise-investigate-cross-repo-worktree-git-guard.md) | doc-guard-wrapper-config | scripts/pre-guard.mjs | COMPLETE | all 2 acceptance criteria ticked; 96c8740 on origin/main (fast-forward); doccle… | 2026-11-01 |
| [scrutinise-investigate-cross-repo-worktree-git-guard](./scrutinise-investigate-cross-repo-worktree-git-guard.md) | fix-guard-chain | scripts/pre-guard.mjs | COMPLETE | all 6 acceptance criteria ticked; merged direct 0d1e0a7ddcb859c04805d24e64cab41… | 2026-10-27 |
| [scrutinise-investigate-cross-repo-worktree-git-guard](./scrutinise-investigate-cross-repo-worktree-git-guard.md) | fix-guard-prove-all | scripts/pre-guard.mjs | COMPLETE | all 4 acceptance criteria ticked; merged db9bff5 direct; 6c5a127 | 2026-10-28 |
| [scrutinise-investigate-cross-repo-worktree-git-guard](./scrutinise-investigate-cross-repo-worktree-git-guard.md) | fix-release-message | scripts/scope.mjs | COMPLETE | all 1 acceptance criteria ticked; landed direct on main; scope.test.mjs 14/14 g… | 2026-10-27 |
| [scrutinise-investigate-cross-repo-worktree-git-guard](./scrutinise-investigate-cross-repo-worktree-git-guard.md) | fix-release-wording | scripts/scope.mjs | COMPLETE | all 1 acceptance criteria ticked; landed direct on main c50c0335468815ee078f2b8… | 2026-10-27 |
| [scrutinise-investigate-cross-repo-worktree-git-guard](./scrutinise-investigate-cross-repo-worktree-git-guard.md) | followup-guard-redesign | scripts/pre-guard.mjs | PENDING | — | 2026-10-28 |
| [scrutinise-investigate-cross-repo-worktree-git-guard](./scrutinise-investigate-cross-repo-worktree-git-guard.md) | followup-release-message | scripts/scope.mjs | PENDING | — | 2026-10-28 |
| [scrutinise-investigate-cross-repo-worktree-git-guard](./scrutinise-investigate-cross-repo-worktree-git-guard.md) | followup-sandbox-verify | sandbox | PENDING | — | 2026-10-28 |
| [scrutinise-investigate-cross-repo-worktree-git-guard](./scrutinise-investigate-cross-repo-worktree-git-guard.md) | guard-allowlist | scripts/pre-guard.mjs | COMPLETE | all 3 acceptance criteria ticked; direct merge d9e257a99f270436a8dc7f3543a77bb2… | 2026-10-28 |
| [scrutinise-investigate-cross-repo-worktree-git-guard](./scrutinise-investigate-cross-repo-worktree-git-guard.md) | release-wording-2 | scripts/scope.mjs | COMPLETE | all 1 acceptance criteria ticked; direct merge 4147f95c3505749d9d03c2f636f0cb60… | 2026-10-28 |
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
| [scrutinise-sandbox-auto-flow](./scrutinise-sandbox-auto-flow.md) | bracket-literal-fallback | scripts/pre-guard.mjs bracketClass | MERGED | merged da1d703 (fix a92a43d, red test e28b7f7) direct to main, pushed; rm of do… | 2026-11-02 |
| [scrutinise-sandbox-auto-flow](./scrutinise-sandbox-auto-flow.md) | bypass-head-assignment | scripts/pre-guard.mjs commandHead | MERGED | merged 042cfa1 (fix 0ab50de, red test 8187ef3) direct to main, pushed; a bare N… | 2026-11-02 |
| [scrutinise-sandbox-auto-flow](./scrutinise-sandbox-auto-flow.md) | fixtures-no-upstream | scripts/auto-archive.test.mjs, scripts/repo-exec-approval.test.mjs | MERGED | merged 46b7569 (test 2f094cb) direct to main, pushed; the feature/p-f1 fixture … | 2026-11-02 |
| [scrutinise-sandbox-auto-flow](./scrutinise-sandbox-auto-flow.md) | followup-bracket-posix-classes | scripts/pre-guard.mjs bracketClass | PENDING | found by scrutinise round 2 S3: rm of docs/plans/[[:alpha:]]lan.md, [ ]p]lan.md… | 2026-11-02 |
| [scrutinise-sandbox-auto-flow](./scrutinise-sandbox-auto-flow.md) | followup-e2e-loop-budget-trim | docs/plans/autonomous-e2e-loop.md | PENDING | found by scrutinise-sandbox-auto-flow unit scratch-read-all-scopes: workflow-sp… | 2026-11-02 |
| [scrutinise-sandbox-auto-flow](./scrutinise-sandbox-auto-flow.md) | followup-pre-guard-helper-layout | scripts/pre-guard.mjs, scripts/scope.mjs | PENDING | found by scrutinise-sandbox-auto-flow S5: refactor that moves every pre-guard c… | 2026-11-01 |
| [scrutinise-sandbox-auto-flow](./scrutinise-sandbox-auto-flow.md) | followup-round3-suggestions | scripts/lib/settings-merge.mjs, scripts/pre-guard.test.mjs | PENDING | found by scrutinise round 3 (state 953ad19, 0 Critical 0 Warning): R3-S1 origin… | 2026-11-02 |
| [scrutinise-sandbox-auto-flow](./scrutinise-sandbox-auto-flow.md) | followup-scratch-root-cache-names | scripts/pre-guard.mjs | PENDING | found by scrutinise-sandbox-auto-flow S4: scratch root is os.tmpdir(), all of /… | 2026-11-01 |
| [scrutinise-sandbox-auto-flow](./scrutinise-sandbox-auto-flow.md) | init-gap-text | scripts/lib/settings-merge.mjs, commands/init.md | MERGED | merged 0923480 (settings-merge 2b75cdc, init.md 9f2a719, red tests 528f1d0) dir… | 2026-11-02 |
| [scrutinise-sandbox-auto-flow](./scrutinise-sandbox-auto-flow.md) | origin-host-forms | scripts/lib/settings-merge.mjs originHostOf | MERGED | merged 953ad19 (fix 8779a65, red tests b59ee90) direct to main, pushed; a Windo… | 2026-11-02 |
| [scrutinise-sandbox-auto-flow](./scrutinise-sandbox-auto-flow.md) | scratch-governed-coverage | scripts/pre-guard.mjs insideScratchRoots | MERGED | merged 4751dbb (fix a54046b, tests a8d7f02) direct to main, pushed; three rows … | 2026-11-02 |
| [scrutinise-sandbox-auto-flow](./scrutinise-sandbox-auto-flow.md) | scratch-read-all-scopes | scripts/pre-guard.mjs, scripts/scope.mjs | MERGED | merged 47125f7 (fix c283e48, activeScopes 9e90254, red tests b8def5b c5ab881) d… | 2026-11-02 |
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
