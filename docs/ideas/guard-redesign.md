---
slug: guard-redesign
status: pursue-with-changes
verdict: pursue-with-changes
confidence: medium
depth: standard
isolation: isolated
created: 2026-11-03
updated: 2026-11-03
related: [docs/plans/scrutinise-investigate-cross-repo-worktree-git-guard.md, docs/architecture/safety.rules.md]
touches: [agents/scrutineer.md, commands/scrutinise.md, commands/instruction.md, docs/architecture/safety.rules.md, docs/architecture/safety.md]
---

# Idea: the enforcement design of the worktree git guard and the git clean doc guard

## Proposal (neutral restatement)
**Problem.** Two guards in `scripts/pre-guard.mjs` (a PreToolUse hook on every Bash call) enforce git invariants by reading command text: (1) under a worktree binding a git mutation must provably run in the bound worktree; (2) a `git clean` that could delete guarded docs is refused without doc-write authority. From 2026-10-27 to 2026-11-02, 19 isolated scrutinise rounds each found new bypass spellings, and the file grew from 96,310 bytes (0a9f48d) to 161,662 bytes over 51 commits. The owner accepted a growing list of stated limits (ARCH-SAFETY-15).
**Claimed benefit.** Change the enforcement design so the patching stops: (a) judge git after shell expansion (a `reference-transaction` hook or shim), (b) treat the sandbox as the boundary and shrink the guards, or (c) a hybrid.
**Who benefits.** The maintainer (review and fix cost) and users who rely on the two protections.
**Done.** A decision that ends spelling-by-spelling patches while keeping both protections at an explicitly agreed strength.

## Verdict
**PURSUE-WITH-CHANGES** (medium) — as the smallest slice, not a new enforcement mechanism. The patching was driven by the review loop: the scrutineer reports any bypass spelling as a Warning and knows nothing of stated limits, and the goal demanded 0 Warning. The sandbox is not a boundary for either invariant, because it lets commands write the whole project and unit worktrees live inside it. Owner decision 2026-11-03: the agreed strength is accident prevention. So fix the loop and correct the strength statement; build no git hook now. Most likely to flip it: a real (non-review) incident where a model's ordinary spelling slips past the guard, or F3 showing a working boundary.

| criterion | score 1–5 | evidence |
|---|---|---|
| value | 3 | 51 commits in 7 days, but driven by the loop: `agents/scrutineer.md:16`; 0 mentions of stated limits in `agents/scrutineer.md`, `commands/scrutinise.md` |
| system fit | 4 (slice) / 2 (hook or sandbox) | slice edits prompts and docs only; worktrees under the main checkout (`scripts/repo-exec.mjs:266`, `:660`); no hook for `git clean` |
| cost — 5 = cheap | 4 (slice) / 2 (hook) | slice: two prompt edits plus a rules amendment; hook: script, installer, session scoping, shared hooks dir |
| risk — 5 = low | 4 (slice) / 2 (hook) | a repo-wide hook also runs on the user's own git and blocks every ref update when buggy |
| reversibility | 5 | prompt and doc edits revert cleanly |
| evidence strength | 3 | primary docs for git hooks and the sandbox; no ordinary-work incident found; F3 unrun |

## Overlap & prior work
- Extends follow-up F1 `followup-guard-redesign` (`docs/plans/scrutinise-investigate-cross-repo-worktree-git-guard.md:358`); depends on F3 `followup-sandbox-verify` (`:360`).
- ARCH-SAFETY-01 (`docs/architecture/safety.rules.md:11`): outside-root writes, deletes and credential reads go to the sandbox.
- ARCH-SAFETY-15 (`docs/architecture/safety.rules.md:25`): text guards are accident prevention with the sandbox as boundary; new spellings become stated limits. This idea **conflicts** with its sandbox premise for in-project invariants (see Critique) and needs an `/architect` amendment.
- No `docs/ideas/*.md` covers it (searched: sandbox, pre-guard, text scan, shell expansion, git wrapper, reference-transaction).

## System fit (whole project)
- **Contract ripple:** the scrutineer severity contract (`agents/scrutineer.md:16`) and `/scrutinise`'s loop exit; `/instruction`'s goal text that demands 0 Warning.
- **Data:** N/A (no state format change).
- **Config & flags:** N/A for the slice; the hook option would need an installer that respects a user's `core.hooksPath`.
- **Security:** the agreed strength stays accident prevention; a reviewer may still report an ordinary-work spelling, a false positive or a regressed pinned refusal at Warning.
- **Tests:** the existing refusal pins stay (`scripts/pre-guard-docclean.test.mjs`, `scripts/pre-guard-worktree.test.mjs`); no test weakened.
- **Observability:** N/A.
- **UI:** N/A.
- **Docs:** ARCH-SAFETY-15 wording and the human `safety.md` limits sections.
- **Second order:** fewer review rounds; the residual exotic-spelling gap is stated, not hidden. Latency is not a driver: `git status` through the guard 52.5 ms now against 46.0 ms at 0a9f48d (node start about 30 ms).

## Research
- git `reference-transaction` hook: runs for any command that updates refs; a non-zero exit in `preparing`/`prepared` aborts (https://git-scm.com/docs/githooks). `--no-verify` is documented for pre-commit, pre-merge-commit, commit-msg and pre-push only. No hook exists for `git clean`; `git add`, `restore` and `checkout -- path` update no ref.
- Claude Code sandbox: off by default; bubblewrap on Linux; sandboxed commands may write the whole working directory, but not `.git/hooks`, `.git/config` or `.claude` settings; Read/Edit/Write tools and hooks run outside it; unsandboxed retries are allowed unless `allowUnsandboxedCommands: false`; it falls back to unsandboxed unless `failIfUnavailable: true` (https://code.claude.com/docs/en/sandboxing).
- Bash commands carry `CLAUDE_CODE_SESSION_ID` (`scripts/lib/core.mjs:75`), so a hook could scope itself to a session; `env -i` or `env -u` would then pass, and hook skipping (`-c core.hooksPath=`, `--config-env=`) is only caught by text (`scripts/pre-guard.mjs:1543`, `:1596`).

## Critique
- **Steelman:** the text scan stopped converging (51 commits, +68% size in a week); judging what git does would end the spelling list for ref updates.
- **Strongest case against:** both candidate boundaries miss most of what is protected. The ref hook sees no `git clean` and no index or working-tree change; the sandbox does not separate a bound worktree from the main checkout. A hook can itself be switched off by spelling, so a text guard remains anyway.
- **Hidden assumptions:** "the sandbox is the boundary" (false in-project; test: F3); "patching was caused by guard design" (test: count pre-guard spelling commits per week after the scrutineer change); "anyone writes these spellings in ordinary work" (no incident found).
- **Failure modes:** a repo-wide hook blocking the user's own git; installer drift under husky or `core.hooksPath`; a stale binding failing closed on the user; the sandbox silently off.
- **Kill criteria:** abandon the hook if it cannot fail closed without blocking the user's terminal git; abandon the slice if a real ordinary-work bypass appears.
- **Cheaper alternatives:** do nothing (the loop keeps finding spellings); the slice below (chosen); real isolation by moving worktrees outside the main checkout (large `repo-exec.mjs` change, only after F3).

## Disputed
- Critic: "11 more fix(safety) commits on 2026-11-03 show ARCH-SAFETY-15 alone did not stop the churn." Softened: those commits (998dbf8, 96d26f4, 75d64f4, …) are another plan's scheduled units on the self-protection scan (bash-writer-gaps, heredoc-limits, submodule queue), not spelling patches to the two guards here; this run's patching ended 2026-11-02 by owner decision. They are still text-scan growth in the same file, so the point stands in weaker form.

## Recommendations
1. Teach `agents/scrutineer.md` and `commands/scrutinise.md` that a bypass spelling in a class ARCH-SAFETY-15 records as a stated limit is a Suggestion; it is a Warning only for an ordinary-work spelling, a false positive on ordinary commands, or a regressed pinned refusal.
2. Make `/instruction`'s 0-Warning exit skip stated-limit Suggestions, so a goal can end on an owner decision.
3. Amend ARCH-SAFETY-15 via `/architect`: for in-project invariants (bound worktree against main checkout, `git clean` of guarded docs) the sandbox is not a boundary; the agreed strength is accident prevention (ordinary spellings, fail closed on unparsed text).
4. Run F3 before any further design work; revisit a ref hook or real isolation only if the owner raises the strength.

## Open questions
- What strength should the two protections have? **Answered 2026-11-03: accident prevention.**

## Next step
`/architect guard-redesign` — the ARCH-SAFETY-15 amendment, then `/plan` for recommendations 1–2.
