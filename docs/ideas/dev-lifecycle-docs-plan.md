---
slug: dev-lifecycle-docs-plan
status: pursue-with-changes
verdict: pursue-with-changes
confidence: medium
depth: standard
isolation: isolated
created: 2026-10-22
updated: 2026-10-22
related: [docs/ideas/feature-branch-plans.md, docs/ideas/plan-hierarchy.md, docs/ideas/plugin-overhaul.md, docs/ideas/plugin-optimisation-recheck.md (branch worktree-idea-reinspect-oct18), docs/plans/fixes-and-safety.md (branch feat/fixes-and-safety), docs/architecture/docs.rules.md, docs/architecture/tracker.rules.md, docs/architecture/landing.rules.md, docs/architecture/slim.rules.md, docs/architecture/safety.rules.md (branch feat/fixes-and-safety)]
touches: [scripts/doc-retire.mjs, scripts/repo-exec.mjs, scripts/tracker-publish.mjs, scripts/tracker.mjs, scripts/arch-check.mjs, scripts/doc-size-policy.mjs, scripts/pre-guard.mjs, commands/sync-docs.md, commands/merge.md, commands/scrutinise.md, craftsman.config.json, docs/architecture/docs.rules.md, docs/architecture/tracker.rules.md, docs/architecture/landing.rules.md, docs/architecture/slim.rules.md, CHANGELOG.md, .gitignore in Loost]
---

# Idea: A docs-curation and protection programme across the maintainer's repos

Source: the claude.ai doc "Dev Lifecycle & Docs Plan" (rev 13, 2026-10-20). Its full text was read; it was checked against this repo, `feat/fixes-and-safety`, the local Gleam and Loost clones, and the live sessions on 2026-10-22.

## Proposal (neutral restatement)
**Problem.** Docs outgrow curation across about nine repos. Gleam `docs/` is about 29 MB with 125 top-level plans and 610 archived files. Loost `CLAUDE.md` is 5,515 lines and `.claude/transcripts` holds 32 MB. Craftsman retires plan docs only by hand. Drift checks run inside Claude, not in CI. Unpushed work was lost on 18 Oct.
**Proposal.** Seven phases over 7–9 evenings-weeks: protect work (btrfs snapshots, restic, transcript purge); release Craftsman with a `version` and a tag; add behind a flag auto-retire at land, ratcheting per-project budgets, rewritten scrutinise docs, generated views and `/init` scaffolds for `just`/pre-commit/CI; pilot on Podling; migrate Gleam, then Loost and Gallery; a portfolio view and a Podman spike. Eleven new tools.
**Beneficiary.** One maintainer running several concurrent sessions.
**Done.** Per-phase exit gates and a per-repo metrics table (one ledger, docs/ under 8 MB, CLAUDE.md under 400 lines, CI running one check).

## Verdict
**PURSUE-WITH-CHANGES** (medium). Do the reduced slice below, not the seven-phase programme. The diagnosis is right: nothing calls `doc-retire` automatically, so docs regrow. But two headline premises are stale, Phase 1 repeats work already in PR #1, and the ledger-only migration lacks a guard it needs. **Deciding fact:** no land path retires a plan, so auto-retire is the one real mechanism gap (`doc-retire` appears only in `scripts/tracker.mjs:471` and its own files). **Most likely to flip it:** a `doc-retire` dry run on Gleam's finished plans. If ARCH-DOCS-02 refuses most of them, auto-retire only produces PARKED noise and this becomes DEFER.

| criterion | score 1–5 | evidence |
|---|---|---|
| value | 4 | Loost 5,515-line CLAUDE.md and 32 MB transcripts, Gleam 29 MB docs (local clones); no automatic retirement exists |
| system fit | 2 | `version` contradicts `CHANGELOG.md:56` and PR #1 step 19; `/init` scaffolds strain `README.md:286`; Phase 1 duplicates PR #1 |
| cost (5 = cheap) | 2 | 7–9 weeks, 11 tools, three sessions already blocked on the owner |
| risk (5 = low) | 2 | Loost force-push purge; ledger shrink guard covers only empty (`scripts/tracker-publish.mjs:57-60`) |
| reversibility | 3 | Flag and tags help; history purge and archive removal are not reversible |
| evidence strength | 2 | Written from shallow clones at `ffba86b`; two premises false; several metrics UNPROVEN |

## Overlap & prior work
Searched: `docs/ideas/*`, `docs/plans/TRACKER.md`, `docs/architecture/*.rules.md` (including `feat/fixes-and-safety`), `CHANGELOG.md`, `craftsman.config.json`, the Gleam and Loost clones, `~/.claude/jobs/*/state.json`.
- **Extends** feature-branch-plans part B. Doc retirement exists as manual `doc-retire.mjs` and `/sync-docs --archive|--prune` (ARCH-DOCS-04/09, `docs/architecture/docs.rules.md:11-19`). Nothing calls it at land; auto-retire is novel.
- **Extends** ARCH-TRACKER-11/12 and ARCH-LAND-17. `tracker.mjs publish` exists and `tracker.publish` already defaults to `push` (`craftsman.config.json:97`).
- **Already in flight.** PR #1 (`feat/fixes-and-safety`, open, conflicting) holds the safety hardening, `scripts/lib/unpushed.mjs` (local-only unpushed report), sweep safety, and step 19 "release-identity": `metadata.release` follows the changelog, no `version` field. Main still says `2.1.0` (`.claude-plugin/plugin.json:17`).
- **Conflicts.** Adding `version` contradicts `CHANGELOG.md:56` ("Installs track commits instead of a pinned version") and PR #1 step 19. Sibling idea `plugin-optimisation-recheck` reached the same conclusion.
- **Premise false.** The doc says Gleam has no `TRACKER.jsonl`. `Gleam/docs/plans/TRACKER.jsonl` exists, 1,357 lines, tracked, rehydrated by commit `e728e29b`.
- **Live sessions** (22 Oct): `e99eadd6` is running scrutinise round 6 on PR #1; `28b3ae5a` is blocked on whether PR #1's direction stands and whether the ledger fix goes first; `d493c67d` (Gleam) waits for approval to remove 16 worktrees.
- **Verified true:** Loost `CLAUDE.md` 5,515 lines; Loost transcripts 32 MB in 20 files with no `transcripts` entry in Loost `.gitignore`; workstation is btrfs with `just` and `restic` already installed.

## System fit (whole project)
- **contract ripple:** `repo-exec.mjs` land-feature gains a retire call; `doc-retire` result shape must not fail the land (`scripts/repo-exec.mjs:278-310`). `/init` scaffolds touch `scripts/init.mjs`.
- **data:** the ledger becomes the only status source, so a partial local ledger must not publish. Loost shows 5 local rows against 57 committed (sibling recheck); the guard refuses only shrink to empty (`scripts/tracker-publish.mjs:57-60`).
- **config & flags:** `docs.standard` flag is reasonable; budgets need a key per cap.
- **security:** history purge needs secret rotation regardless; a pre-guard block on generated files can trap legitimate repairs; `scripts/pre-guard.mjs` is a file PR #1 conflicts on.
- **tests:** new rules need red-then-green tests in the `*.test.mjs` style; a 5-versus-57 ledger case is missing.
- **observability:** ARCH-DOCS-08 already logs `doc_retired` and `doc_prune_refused`; refusal rate is the metric that decides the programme.
- **UI:** N/A(no user-facing surface).
- **docs:** ARCH-SLIM-02 caps are ratchets and doc budgets are full (`docs/architecture/slim.rules.md:12`); new command prose needs room.
- **Second-order:** work on the same files as PR #1 before it lands builds on a moving base; `/init` scaffolding `just`/CI cuts against "Keep it stack-agnostic" (`README.md:286`).

## Research
- Marketplace plugin entries take `ref` and `sha` on git sources; `sha` is reported to win, so installs can be pinned without a plugin `version` (https://code.claude.com/docs/en/plugin-marketplaces; precedence seen only in non-English copies, UNPROVEN). Omitting `version` makes each commit a version, which is the current design.
- ADR practice keeps accepted decisions and marks them superseded rather than deleting (https://backstage.io/docs/architecture-decisions). Stale docs mislead, which supports retiring plans but not ARCH rules.
- Bluefin/Aurora keep home in `/var/home`; community advice favours a home backup over snapshotting reproducible data (https://universal-blue.discourse.group/t/btrfs-and-snapshots/3899). Snapper keeps snapshots in-subvolume; btrbk needs manual config. This machine is btrfs.
- `lychee --offline` is local-files-only; behaviour on relative Markdown links UNPROVEN. No source found that docs size drives per-session tokens; Gleam's always-loaded context is about 22 KB by the plan's own correction.

## Critique
- **Steelman.** Every Craftsman step writes docs and none retires them; auto-retire plus ratcheting caps is the mechanism change that stops regrowth, and both fit existing rules. Protect-first ordering is sound after 18 Oct.
- **Strongest case against.** It was written from stale clones, repeats PR #1, adds a decision the owner reversed last week, and asks a solo maintainer with three blocked sessions for 7–9 weeks and eleven tools.
- **Hidden assumptions.** Auto-retire mostly succeeds (test: dry run on Gleam's finished plans, count ARCH-DOCS-02 refusals). Ledger migration preserves rows (test: compare local and committed row counts per repo). Smaller docs cut tokens (UNPROVEN; test: `stats.mjs` baseline). Transcripts hold secrets (test: `gitleaks detect` on Loost).
- **Failure modes.** A retire step inside land-feature must never fail the merge. Retiring while another worktree holds a claim (ARCH-DOCS-04 skips claims only in prune). Tag pinning with no release cadence leaves repos behind main's fixes. A force-push does not remove secrets from other clones.
- **Kill criteria.** More than half of finished plans refused by ARCH-DOCS-02; the Podling pilot shows no token or conflict gain; PR #1 unmerged after two weeks (defer all Craftsman phases); the three blocked sessions stay blocked (capacity, not docs, is the constraint).
- **Cheaper alternatives.** Do nothing: regrowth continues and transcripts keep being committable. CI-only: wire `arch-check lint` into each repo's CI. Smallest slice: see Recommendations 1–5.

## Disputed
- Critic's PR #1 size (+8599/-1664, 135 files) differs from mine (+8444/-471, 121 files); the branch moved between reads. Neither changes the verdict.
- Critic point 6 says Phase 0 sequences the purge before gitignoring transcripts. The doc does not mention gitignore either way; I kept the recommendation (gitignore first, purge optional) and drop the sequencing claim.
- Critic says transcripts are not gitignored. Confirmed (no entry), but whether they are git-tracked in Loost is UNPROVEN here; the doc claims committed.

## Recommendations
1. **Rebase the plan on live state.** Drop "add `version`"; pin via marketplace `ref`/`sha` if pinning is wanted. Drop the "Gleam has no TRACKER.jsonl" premise. Replace Phase 1 safety work with "land PR #1".
2. **Fix the partial-ledger shrink guard first** (`scripts/tracker-publish.mjs:57-60`) and test 5-versus-57, before any ledger-only migration. This matches the sibling recheck.
3. **Protect now, cheaply:** restic plus hourly btrfs snapshots; add `.claude/transcripts` to Loost `.gitignore` today; make the history purge a separate, opt-in decision after `gitleaks detect`.
4. **Spike auto-retire:** run `doc-retire` dry run on Gleam's finished plans and count refusals. If under half refuse, add a best-effort, non-failing retire call after land-feature behind a flag, with a PARKED record on refusal.
5. **Wire existing `arch-check lint` into each repo's CI** instead of scaffolding `just`/pre-commit/Azure from `/init`; keep those in the maintainer's own workbench repo.
6. **Cut or defer:** Phase 6, Renovate/OSV/git-cliff rollout, per-plan `acceptance.md`, single tracker-id format, and the Loost `CLAUDE.md` diet until the slice proves the mechanism.

## Open questions
- Does PR #1's fail-closed direction stand, and does the ledger fix go on main ahead of it? (Both live sessions are waiting on this.)
- Are Loost transcripts actually tracked in git, and do they hold secrets? Run `git ls-files .claude/transcripts` and `gitleaks detect` in Loost.
- Is the 18 Oct loss attributable to missing snapshots or to worktree sweeps? PR #1's sweep-safety suggests at least part sweeps.

## Next step
`/architect dev-lifecycle-docs-plan` for the reduced slice (partial-shrink guard amendment to ARCH-TRACKER-12, a best-effort retire rule at land, a CI-lint wiring rule). Do the Gleam dry run first. Reopen the full programme if the dry run shows most finished plans retire cleanly and PR #1 has landed.
