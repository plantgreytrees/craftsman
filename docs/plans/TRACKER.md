# Execution tracker

Shared across sessions. Only touch rows you created; never prune or reformat foreign rows.

| id | slug | module | language | security | status | ts |
|----|------|--------|----------|----------|--------|-----|
| 1 | engine-self-improvements | craftsman.config.json (language tooling) | JSON/JS | normal | MERGED | 2026-08-27T00:00:00Z |
| 2 | engine-self-improvements | scripts/stats.mjs, scripts/log-router.mjs, commands/scrutinise.md | JS (Node ESM) | normal | MERGED | 2026-08-27T00:00:00Z |
| 3 | engine-self-improvements | scripts/lib/core.test.mjs | JS (node:test) | normal | MERGED | 2026-08-27T00:00:00Z |
| 4 | engine-self-improvements | scripts/snapshot.mjs, scripts/stop-gate.mjs | JS (Node ESM) | normal | MERGED | 2026-08-27T00:00:00Z |
| 5 | token-efficiency | commands/orchestrate.md | Markdown | normal | MERGED | 2026-08-27T00:00:00Z |
| 6 | token-efficiency | commands/scrutinise.md, commands/_scrutinise-deep.md, scripts/diff-triviality.mjs | Markdown/JS | normal | MERGED | 2026-08-27T00:00:00Z |
| 7 | token-efficiency | craftsman.config.json, commands/plan.md, EXTENDING.md | JSON/Markdown | normal | MERGED | 2026-08-27T00:00:00Z |
| 8 | token-efficiency | CHANGELOG.md | Markdown | normal | MERGED | 2026-08-27T00:00:00Z |
| 9 | audit-fixes | scripts/lib/core.mjs, scripts/quality-gate.mjs, scripts/stop-gate.mjs, scripts/session-context.mjs, scripts/snapshot.mjs, scripts/pre-guard.mjs, scripts/baseline.mjs | JS (Node ESM) | normal | MERGED | 2026-08-27T23:40:00Z |
| 10 | audit-fixes | craftsman.config.json | JSON | normal | MERGED | 2026-08-27T23:40:00Z |
| 11 | audit-fixes | agents/plan-reviewer.md, agents/standards-keeper.md, agents/code-reviewer.md, agents/idiom-reviewer.md | Markdown | normal | MERGED | 2026-08-27T23:40:00Z |
| 12 | audit-fixes | commands/_shared-machinery.md, commands/_shared-execution.md | Markdown | normal | MERGED | 2026-08-27T23:40:00Z |
| 13 | audit-fixes | commands/orchestrate.md | Markdown | normal | MERGED | 2026-08-27T23:40:00Z |
| 14 | audit-fixes | commands/plan.md | Markdown | normal | MERGED | 2026-08-27T23:40:00Z |
| 15 | audit-fixes | commands/scrutinise.md, commands/_scrutinise-deep.md | Markdown | normal | MERGED | 2026-08-27T23:40:00Z |
| 16 | audit-fixes | commands/understand.md, commands/investigate.md, commands/fix-tests.md, commands/sync-docs.md | Markdown | normal | MERGED | 2026-08-27T23:40:00Z |
| 17 | audit-fixes | .claude-plugin/plugin.json, .claude-plugin/marketplace.json | JSON | normal | MERGED | 2026-08-27T23:40:00Z |
| 18 | audit-fixes | README.md, EXTENDING.md, CONTRIBUTING.md, CHANGELOG.md | Markdown | normal | MERGED | 2026-08-27T23:40:00Z |
| 19 | audit-fixes | scripts/lib/core.test.mjs, .github/workflows/ci.yml | JS/YAML | normal | MERGED | 2026-08-27T23:40:00Z |
| 20 | known-issues-doc | scripts/lib/core.mjs, scripts/baseline.mjs, scripts/lib/core.test.mjs | JS (Node ESM, node:test) | normal | MERGED | 2026-08-28T00:00:00Z |
| 21 | known-issues-doc | craftsman.config.json, commands/baseline.md, commands/sync-docs.md, EXTENDING.md, INSTALL.md, README.md, CHANGELOG.md | JSON/Markdown | normal | MERGED | 2026-08-28T00:00:00Z |
| 22 | engine-hardening | scripts/stop-gate.mjs, scripts/snapshot.mjs, scripts/lib/core.mjs (splitCmd), craftsman.config.json, EXTENDING.md | JS (Node ESM)/JSON/Markdown | normal | MERGED (0b5557a, +a72da89, +06a2636 — 3 post-merge security-review addenda: 1.9 per-session scan-once-minimum marker, 1.10 .craftsman/ self-dirtying fix, 1.11 config-signature-aware marker; each reject-then-approve or approve on review) | 2026-08-28T00:00:00Z |
| 23 | engine-hardening | scripts/lib/core.mjs, scripts/session-context.mjs, scripts/baseline.mjs | JS (Node ESM) | normal | MERGED (94bfbc7) — reviewed: approve, 3 non-blocking suggestions | 2026-08-28T00:00:00Z |
| 24 | engine-hardening | commands/understand.md, commands/investigate.md, commands/sync-docs.md | Markdown | normal | MERGED (0e860db) — router: SKIP | 2026-08-28T00:00:00Z |
| 25 | engine-hardening | CHANGELOG.md | Markdown | normal | MERGED (42f9265) | 2026-08-28T00:00:00Z |
| 26 | scrutinise-engine-hardening | scripts/stop-gate.mjs (runTask budget-truncation fix) | JS (Node ESM) | normal | MERGED (eda9173/main) — reviewed: reject once (flawed tolerance heuristic), approve after simplifying | 2026-08-28T00:00:00Z |
| 27 | scrutinise-engine-hardening | scripts/lib/core.mjs, scripts/session-context.mjs, scripts/lib/core.test.mjs | JS (Node ESM) | normal | MERGED (6ceb8a4/main) — reviewed: approve | 2026-08-28T00:00:00Z |
| 28 | scrutinise-engine-hardening | scripts/stop-gate.mjs (comment compression) | JS (Node ESM) | normal | MERGED (586a78a/main) — router: SKIP, comment-only, density 42.6%->25.4% | 2026-08-28T00:00:00Z |
| follow-up-1 | scrutinise-engine-hardening | scripts/stop-gate.mjs (no automated test harness for the dirty-gate/marker-signature runtime logic beyond the one budget-truncation regression test added in TRACKER#26 — needs process/hook fixtures, larger effort, not driven here; see scrutinise-engine-hardening.md Out of scope) | JS (Node ESM) | normal | PENDING (no plan doc yet) | 2026-08-28T00:00:00Z |
| follow-up-2 | scrutinise-engine-hardening | scripts/stop-gate.mjs (a "test"/"extra" command hitting its own full configured timeoutMs, not budget-related, still misreports as a genuine REGRESSION/GUARD FAILED — pre-existing, separate design question re: whether B7's "timeout is never a finding" principle extends to test-regression detection; NOTE: the "secret" kind's own-timeout case was fixed alongside the marker-completion work, TRACKER#26 — this row now covers test/extra only; see scrutinise-engine-hardening.md Out of scope) | JS (Node ESM) | normal | PENDING (no plan doc yet) | 2026-08-28T00:00:00Z |
| follow-up-3 | scrutinise-engine-hardening | scripts/stop-gate.mjs (a "secret" task hitting ENOENT — misconfigured/missing scanner binary — sets allSecretsCompleted=false but pushes no problem, so Stop passes silently every time with zero visible signal the scan never ran at all; pre-existing, found during code review of TRACKER#26's marker-completion fix, not a regression from it) | JS (Node ESM) | normal | PENDING (no plan doc yet) | 2026-08-28T00:00:00Z |
