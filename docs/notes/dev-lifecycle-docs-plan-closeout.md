# dev-lifecycle-docs-plan — closeout notes

Status as of 2026-10-26, `origin/main` 5ddf5f0 (this note lands on top of it). The owner stopped the
`/scrutinise` fix loop after round 23. The goal was **not** fully met; this note records what is done, what is open
and what to do next.

## State at 5ddf5f0

- `node --test scripts/*.test.mjs scripts/lib/*.test.mjs`: 1188/1188 pass (run with `TMPDIR` on a volume with free inodes, see Environment).
- `node scripts/arch-check.mjs lint`: PASS (14 rules docs, 197 rules). `gitleaks dir . --no-banner --redact`: no leaks.
- Every ledger row for the plan and for `scrutinise-dev-lifecycle-docs-plan` units 1-25 is COMPLETE. `.craftsman/acceptance.md` has no unticked line for this plan's units (other sessions' units keep theirs).
- The unit worktrees and bindings from this work are released.

## What was done after PR #1 landed

- `/architect --update`: DOCS-15 → DOCS-16 (budget ratchet also reads `craftsman.project.json`, with code fix), APPROVAL-09 → APPROVAL-10 and ENGINE-15 → ENGINE-23 (the rules claimed a diagram slot and a plan `## Decisions` section that were never built; amended to match the code), LAND-31 (the history-rewrite ban now has its `/auto` instruction in `commands/auto.md`), about 60 stale cites re-pointed.
- Review rounds 16 to 23, one fix unit each (plan `docs/plans/scrutinise-dev-lifecycle-docs-plan.md`, steps 16-25): fallback answer lands through `check`; `.craftsman/approvals/**` is in `SELF_NEVER`; A/R/S helpers carry no project-dir assignment; the secrets scan always runs the built-in floor; claim locks and `ownedClaims` anchor at the main checkout; the `S` helper runs from the project root; the merge action is gated (see below).

## Decision taken on the owner's "auto resolve" (round 21)

ARCH-LAND-28 exempts landing the plan docs answered in Phase A. With the approval gate on, the `merge` action now
refuses any `feature_branch` and lands directly only a docs-only change: raw no-rename diff against `origin/<base>`,
`.md` files under `docs/plans/` or `docs/ideas/`, no symlink or gitlink, HEAD sha pinned. Feature work lands through
`land-unit` / `land-feature`. The alternative (an owner-answered flag set by `/craftsman:merge`) was not chosen because it is agent-asserted.

## Open items (all PENDING ledger rows in `scrutinise-dev-lifecycle-docs-plan`, none driven)

The approval gate only runs when `planning.featureBranches` and `repoExec.approval.required` are **both** on. Both
default to off, so default installs are unaffected. With the gate on, round 23 (static trace, not run) found:

| Row | Severity | Gap |
|---|---|---|
| `land-unit-base-gate` | Critical | `land-unit` never calls the gate; a base-named `feature_branch` or the main checkout as `worktree_path` merges and pushes base (`scripts/repo-exec.mjs:482-537`). The merge refusal text points at `land-unit`. |
| `merge-local-base-unpushed` | Warning | The docs-only check covers the branch only; the direct path pushes the whole local base, so unpushed local-base commits land unchecked. Also when `origin/<base>` is missing. |
| `merge-pin-sha-source` | Warning | The pin compares the worktree HEAD sha, but merge and push use the branch name and the last pin precedes the fetch/pull. Merge/push the pinned sha and compare `refs/heads/<branch>`. |
| `merge-diff-ignore-submodules` | Warning | The diff honours `diff.ignoreSubmodules`; pass `--ignore-submodules=none`. |
| `merge-md-base-commit-path` | Warning | `commands/merge.md` "already on base" bullet commits and pushes base with no gate. |
| `merge-md-nonplan-docs` | Warning | Under the gate `/craftsman:merge` cannot land `docs/architecture`, `CHANGELOG.md` or `TRACKER.jsonl`; the documented remedy (`land-feature`) does not apply to leftover docs. |
| `merge-gate-test-gaps` | Warning | Red tests missing for the cases above. |

Earlier follow-ups still PENDING: `approval-owner-trust`, `force-block-wordlevel`, `lease-glob-anchoring`,
`budget-key-removal`, `approval-prepare-derive-diff`, `approval-lock-break-race`, `approval-json-quoting`,
`approval-loadrecord-dedupe`, `ledger-parse-dedupe2`, `onpath-dedupe`, `events-jsonl-protect`, `approval-cli-refusal`,
`publish-manual-owner`, `readme-safety-keys`, `approval-floor-vs-stopgate-note`, `mainroot-missing-fallback`,
`unit-runner-claim-project`, `merge-gate-callers-test`, plus the older rows listed in that plan.

## Not done

- A clean final `/scrutinise` (round 23: 1 Critical, 6 Warnings, above).
- A full verification pass of the docs: the final `/sync-docs --all` was bounded (no verifier fan-out, no new fix rounds). It re-mapped the `repo-exec.mjs` and `approval-gate.mjs` cites in `landing.rules.md` and `tracker.rules.md` by line shift (+2 to +3; a straddling range is approximate) and fixed the README protected-keys list. The approval cites were already current; `verified_at` was not bumped. The plan doc's `units:` header is not resynced for rounds 18-25, and the CHANGELOG `[Unreleased]` was not extended (8175 of 8192 bytes).
- Acceptance 22.1 and 24.1 ("a merge with a feature_branch is allowed") are ticked but superseded by 25.2; the ledger was not edited to avoid rewriting criteria.

## Recommendation

The review loop did not converge because each per-action patch added new surface. Close it with one design pass:
a single `approvalGate` check shared by `merge`, `land-unit` and `land-feature` that (1) refuses any push or merge whose
target resolves to base, (2) works on a pinned sha end to end, (3) diffs against the fetched remote base. Then
re-run `/scrutinise`, `/architect --update` and `/sync-docs --all`.

## Environment notes

- The host `/tmp` tmpfs ran out of inodes (about 40,000 leftover test temp dirs from this repo's suites: `export-notes`, `approval`, `craftsman-init`, `dashboard`, `tsync`, `craftsman-archive-*`). Tests then fail on `mkdtemp`. Run with `TMPDIR` on a volume with free inodes, or clear those dirs.
- Unit runners cannot `git commit`; root commits from inside the unit worktree (a separate `cd` call first), and the scope manifest must load every rules doc that governs a written file or activation is refused.
- The guard refuses commands that assign `CLAUDE_PROJECT_DIR`, `CLAUDE_CODE_SESSION_ID` or `CRAFTSMAN_SAFETY`; the helper docs no longer do.
