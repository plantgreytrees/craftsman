---
slug: dev-lifecycle-docs-plan
status: architected
verdict: pursue-with-changes
confidence: high
depth: deep
isolation: isolated
created: 2026-10-22
updated: 2026-10-23
related: [docs/architecture/approval.rules.md, docs/architecture/landing.rules.md, docs/architecture/tracker.rules.md, docs/architecture/docs.rules.md, docs/architecture/state.rules.md, docs/architecture/slim.rules.md, docs/architecture/engine.rules.md, docs/architecture/mod.rules.md, docs/architecture/plan.rules.md, docs/ideas/feature-branch-plans.md, docs/ideas/plan-hierarchy.md, docs/ideas/plugin-overhaul.md, docs/ideas/plugin-optimisation-recheck.md (branch worktree-idea-reinspect-oct18), docs/plans/fixes-and-safety.md (branch feat/fixes-and-safety)]
touches: [scripts/tracker-publish.mjs, scripts/tracker.mjs, scripts/repo-exec.mjs, scripts/doc-retire.mjs, scripts/pre-guard.mjs, scripts/lib/force-block.mjs, scripts/arch-check.mjs, scripts/stats.mjs, scripts/telemetry.mjs, scripts/session-context.mjs, scripts/init.mjs, scripts/lib/core.mjs, scripts/approval.mjs (new), scripts/lib/approval-page.mjs (new), commands/_approval.md (new), commands/auto.md, commands/merge.md, commands/scrutinise.md, commands/sync-docs.md, commands/*.md (frontmatter), agents/unit-runner.md, agents/*reviewer*.md, skills/ (vendored tdd, debugging, verification), workflows/run.js, craftsman.config.json, .claude-plugin/plugin.json, .claude-plugin/marketplace.json, docs/architecture/*.rules.md, CHANGELOG.md]
---

# Idea: Slim Craftsman — a docs-curation, protection and run-to-approval workflow tool

Source: the claude.ai doc "Dev Lifecycle & Docs Plan" (rev 13, 2026-10-20), then widened by the owner on 2026-10-22. They want a tool that reuses the best existing tools and encodes their workflow. It must be easy to update, and secure while still running unattended across steps. Superpowers is the reference point. The ranked goals are token efficiency, simplicity, effectiveness, performance and adaptability.

## Proposal (neutral restatement)
**Problem.** Docs outgrow curation: Gleam `docs/` is about 29 MB, Loost `CLAUDE.md` is 5,515 lines, and Craftsman never retires plans on its own. Runs stop on false-positive guard blocks: 29 harmless docguard blocks in Gleam in 1.5 days. The ledger can silently lose rows: Loost has 5 local rows against 50 committed. Nobody can say what drives token cost: two Gleam sessions peaked near 960k tokens. Updates reach every install at once.
**Proposal.** Keep Craftsman as the engine but slim it:
- Ask once, run unattended to a verification point, and land only after an owner approval page.
- Never prompt mid-run. Block or park with a reason.
- Reuse repo tools through config slots.
- Borrow Superpowers' patterns without depending on it.
- Measure tokens before cutting.
- Cap docs.
- Fix the ledger guard first.
**Beneficiary.** One maintainer running Gleam, Loost, Loost-Gallery, Podling and Craftsman with several concurrent sessions.
**Done.** The rules in the `related:` docs are implemented in the order in [approval.md](../architecture/approval.md#order-of-work), and Gleam runs a feature end to end through the approval page.

## Verdict
**PURSUE-WITH-CHANGES** (high). The original seven-phase programme is replaced by the slim design. Confidence rose from medium to high for two reasons. Every premise was checked against code by an isolated analyst. And every open decision was answered by the owner, with the later answers checked against the earlier ones. **Deciding fact:** the idea's own kill test fired. A `doc-retire` dry run would refuse 22 of 23 finished Gleam plans and 12 of 15 here (ARCH-DOCS-02 referrers). So "auto-retire" became "log candidates", and the real gains are the approval-gated unattended run, the ledger guard and measured slimming. **Most likely to flip it:** PR #1 failing to land after rebase, which would delay every safety-dependent step.

| criterion | score 1–5 | evidence |
|---|---|---|
| value | 4 | Ledger loss is live (Loost 5 vs 50); 29 false blocks in 1.5 days; 960k-token sessions; docs bloat verified |
| system fit | 4 | Every new rule extends an existing area; amendments are explicit (LAND-01/05/17/18, TRACKER-12) and owner-approved |
| cost (5 = cheap) | 3 | About seven steps; the approval page is the only new subsystem; no scaffolding, no new dependency |
| risk (5 = low) | 3 | Guard narrowing reverses an owner decision (weekly review mitigates); the approval page publishes summaries to claude.ai |
| reversibility | 4 | Config defaults, the `stable` channel, superseded rules keep history; nothing deletes docs |
| evidence strength | 4 | Isolated deep analysis with file:line; dry run measured; telemetry thin (1.5 days), Superpowers benchmarks secondary |

## Overlap & prior work
- Extends feature-branch-plans B (retirement), plan-hierarchy (publish, rollups), autonomous-e2e-loop (/auto phases). It agrees with plugin-optimisation-recheck: ledger fix first, then PR #1, no `version` field, measure before trimming.
- Already done elsewhere: PR #1 (`feat/fixes-and-safety`) holds fail-closed guards, the unpushed report and release identity. It stands, and lands after the ledger fix (owner, 2026-10-22).
- Premises corrected: Gleam already has a committed `TRACKER.jsonl` (1,357 lines). Loost's transcripts are exported on purpose by `scripts/sync-claude-sessions.sh`.

## System fit (whole project)
- **contract ripple:** `repo-exec` land-feature gains an approval check and retire log (`scripts/repo-exec.mjs:568-670`); publish gains a key-level guard (`scripts/tracker-publish.mjs:52-60`).
- **data:** new `.craftsman/approvals/<run>.json`; Artifact db doc `approvals/<run>` (owner-write); ledger repair by `init --merge` / `--from-block`.
- **config & flags:** `tracker.publish` off|on-approve, `docs.budgets`, `docs.checks`, `repoExec.approval.prLines`; four userConfig knobs.
- **security:** three hard lines (ARCH-STATE-13); approval verified by owner and head SHA (ARCH-APPROVAL-04); force-with-lease on own branches only (ARCH-LAND-23).
- **tests:** red-green fixtures for each rule's `check:`; 50-vs-5 ledger; guard parity rows; approval mismatch refusals.
- **observability:** `approval_*`, `doc_retire_candidate`, `guard_unparsed`, `context{phase:"baseline"}`, `tracker_publish_refused`.
- **UI:** the approval page (private Artifact); the AskUserQuestion fallback.
- **docs:** nine rules docs amended or added; ARCH-SLIM-02 byte trades for new prose.
- **Second-order:** main's tracker updates only at land; the approval page needs a live session to land; any new command prose must trade bytes under the full budgets.

## Research
- Superpowers 7.0.1: pinned `version`, one SessionStart hook injecting a ~3.2 KB bootstrap, 15 on-demand skills (~141 KB), no guards (https://github.com/obra/superpowers; verified by the analyst). Third-party cost data is thin: one 12-run test showed ~14% fewer tokens on complex tasks and overhead on simple ones (https://mcp.directory/blog/superpowers-skill-worth-it-2026; secondary).
- Marketplace `ref`/`sha` pinning, with `sha` winning; commit-tracked versions when `version` is absent (https://code.claude.com/docs/en/plugins/marketplace-reference.md, https://code.claude.com/docs/en/plugins/loading.md).
- A blocking hook takes precedence over allow rules, so guards, not permissions, decide mid-run (https://code.claude.com/docs/en/permissions). Hook `if` is best-effort; enforce with permissions or hooks, not filters (https://code.claude.com/docs/en/hooks).
- Artifact runtime: db with an owner-only write rule, user identity, and a republish that notifies the watching session. This makes the two-button approval feasible without polling (artifact capabilities contract 0.2.89).

## Critique
- **Steelman.** It turns an assistant that stops often and loses state into one that runs to a single, evidence-rich decision point. It keeps the enforcement that Superpowers lacks and borrows Superpowers' leanness.
- **Strongest case against.** A new approval subsystem and a guard relaxation in one programme, built on a 78-commit PR that has not yet landed.
- **Hidden assumptions.** Start-up context is a meaningful share of cost (test: ARCH-SLIM-10 baseline for a week). The narrowed guard does not miss doc writes through variables (test: weekly `guard_unparsed` review). The owner reviews pages promptly (test: time-to-approve in stats).
- **Failure modes.** Approval forged or stale (mitigated by owner-only db plus head SHA). Ledger guard refuses a legitimate shrink from another machine (mitigated by `archived:true` input and `init --merge`). Budgets fail a run mid-flight (caps start at today's size; ticks do not grow files).
- **Kill criteria.** PR #1 cannot land within two weeks: pause steps 3–7. The weekly review finds a real doc write slipping through: revert ARCH-STATE-12. Median time-to-approve exceeds a day: reconsider "Merge now" defaults.
- **Cheaper alternatives.** Steps 1–2 alone fix the live defect and land safety. The approval page could be the markdown fallback only, but the owner asked for a page with buttons.

## Disputed
- Analyst: ARCH-LAND-08/18 cite stale. Accepted and corrected in ARCH-LAND-25. Also found ARCH-LAND-05's cite (`pre-guard.mjs:178-194`) is stale; ARCH-LAND-23 cites `scripts/lib/force-block.mjs`.
- Analyst: `stop-tests-skipped` and `stop-acceptance-deferred` interrupt runs → wrong, they only log (`scripts/stop-gate.mjs:152,299`). Accepted; the design targets real blocks.
- Analyst: D2 sub-question offered git-history replay for Loost. The owner chose the lossy block rebuild (ARCH-TRACKER-14).
- Analyst: D4 recommended advisory budgets. The owner chose enforced from day one; caps at today's sizes keep that safe.
- Analyst: D8 recommended staying on main. The owner chose a `stable` branch for Gleam, which the analyst listed as option (c).
- Analyst: dry-run counts may include slug over-matches. Kept, because `doc-retire.mjs` over-matches identically, so the count is what it would refuse.
- Earlier critic (2026-10-22): "pilot on Podling". The owner chose Gleam directly, with `stable` as the rollback boundary.

## Recommendations
1. Land ARCH-TRACKER-13/14 on main now and repair Loost; it unblocks a live session and touches no PR #1 conflict file.
2. Rebase and land PR #1; then build steps 3–7 in the order in [approval.md](../architecture/approval.md#order-of-work).
3. Before step 2, set up hourly btrfs snapshots and restic (workstation, outside the plugin).
4. Run the secrets scan over Loost `.claude/transcripts` before deciding their future.
5. Re-measure guard blocks after `/craftsman:upgrade` everywhere; installs are on `792b8e4abf1b`.

## Open questions
All architecture questions were answered on 2026-10-22/23:
- **Scope:** slim Craftsman.
- **Autonomy:** run to an approval page with Merge now / Open PR.
- **Hard stops:** secrets, outside-worktree deletes, base/PR/external publish. Feature-branch pushes stay automatic.
- **Force:** `--force-with-lease` on own branches only.
- **PR #1:** stands, and lands after the ledger fix.
- **Guard:** narrowed, with a weekly review.
- **Retirement:** measure first. **Budgets:** enforced. **Scrutinise:** rolling summary. **Loost ledger:** rebuilt from the tracker block.
- **Tokens:** measure, plus safe cuts. **Updates:** `stable` branch for Gleam. **Profile:** three homes plus four knobs.
- **Tool slots:** just, gitleaks, markdownlint, lychee, pre-commit once.
- **Superpowers:** borrow four patterns, no dependency.
- **Base moved:** auto-rebase, land if green. **Late approval:** the next session lands it. **Plan docs:** the Phase A answers authorise them.
- **Slim level:** ten entry points. **Rollout:** Gleam first. **Transcripts:** scan, then decide.

Still the owner's, outside this design: the Loost transcripts decision after the scan, and the future of `claude-context`.

## Next step
`/craftsman:instruction dev-lifecycle-docs-plan`, or `/craftsman:plan` the first step (ARCH-TRACKER-13/14) on its own.
