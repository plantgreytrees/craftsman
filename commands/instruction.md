---
description: Prompt generator — turn a vetted, architected idea (or a request) into ONE paste-ready `/goal` prompt that drives the full craftsman loop (/plan → /orchestrate → /scrutinise → /sync-docs --all, which ends in /architect --update → /craftsman:merge) to verified, landed completion under the architecture rules, plus an implementation-weight estimate (quick / medium / long / extra long) shown outside the prompt. Writes NO code and NO docs.
argument-hint: "<idea-slug | plan-slug | request>"
model: sonnet
allowed-tools: Bash, Read, Write, Glob, Grep
---

# Instruction — the prompt generator

> Doc-write policy: this command writes NOTHING under `docs/`. Its only file is the prompt it saves under `.craftsman/instructions/`.

You produce a single prompt that, pasted into a fresh session, takes the work from nothing to **verified-complete and landed on the base branch** through the craftsman loop without the user re-prompting each step — and tells the user, separately, how big the job is. You do not plan or implement; you compose.

Target: `$ARGUMENTS`. If `docs/architecture/*.rules.md` exists, read `${CLAUDE_PLUGIN_ROOT}/commands/_architecture.md` once.

## Phase 0 — Gather (slim — paths, not prose)

1. **Resolve the source.** `docs/ideas/<slug>.md` → read verdict, `touches`, recommendations, answered questions. Verdict `reject`/`defer` → stop and say so. Status not `architected` while `touches` hits a governed area or the idea makes design decisions → recommend `/architect <slug>` first and stop unless the user said to proceed. A plan slug (`docs/plans/<slug>.md` exists) → the prompt starts at `/orchestrate`, not `/plan`. A bare request → note that `/idea`/`/architect` were skipped.
2. **Governing rules.** `node "${CLAUDE_PLUGIN_ROOT}/scripts/arch-check.mjs" governs <touches…>` → the `.rules.md` paths, and the `decided` ids relevant to the change. **Never** read or reference the human `<area>.md` files.
3. **Proof commands.** The project's real test command (`craftsman.config.json` `stopGate.commands`, else repo markers), the tracker/acceptance locations, and the base branch + land mode (`repoExec.land`: `direct` merges and pushes base, `pr` opens an auto-merging PR) — the evidence `/goal`'s evaluator will need to see.

## Phase 1 — Implementation weight (shown to the user, never in the prompt)

Count the drivers from the idea doc, the architecture decisions, and the touched paths (estimate units as `/plan` would: one per coherent module/project boundary):

| weight | when ANY of these is true (take the highest band hit) |
|---|---|
| **QUICK** | ≤ 1 unit · one module · no contract, migration, security, or new architecture area |
| **MEDIUM** | 2–3 units · or one shared-contract change · or one security-sensitive surface — single project |
| **LONG** | 4–7 units · or any migration · or ≥ 2 contract changes · or a new architecture area |
| **EXTRA LONG** | ≥ 8 units · or more than one project · or migration + contract + security together · or the idea's verdict confidence is low |

Report it as `Implementation weight: <BAND> — <the drivers that set it>`, plus the main schedule risk (e.g. "migration needs a reversible two-step"). It is an effort band from countable facts, not a time promise — say so in one clause.

Turn budget for the `/goal` bound: QUICK 20 · MEDIUM 50 · LONG 100 · EXTRA LONG 180.

## Phase 2 — Compose the `/goal` prompt

`/goal`'s condition **is** the directive and is capped at **4,000 characters**; a Haiku evaluator decides "met" **only from what appears in the transcript** — so completion must be printed evidence, not a claim. Compose one block, in this order, keeping context as paths (never inline doc contents):

```
/goal Deliver <slug>: <one-sentence user-visible outcome>.
Context: idea docs/ideas/<slug>.md · rules <.rules.md paths> (load only these; never docs/architecture/<area>.md).
Loop, each step to completion before the next:
1. /plan <neutral request> — per docs/ideas/<slug>.md; each unit cites its ARCH ids in `arch:`.   [omit if the plan exists]
2. /orchestrate <slug> — every unit MERGED; no PARKED/BLOCKED left unresolved.
3. /scrutinise <slug> — while it reports any Critical or Warning: /orchestrate scrutinise-<slug>, then /scrutinise <slug> again.
4. /sync-docs --all <slug> (docs, tracker, then /architect --update) — doc-stale fixes are pre-approved; stop for me only on a decision change or a VIOLATED rule.
5. /craftsman:merge — this goal is my go-ahead to land: merge and push this session's branch/worktree (plan, tracker, doc edits) and any <slug> branch still unlanded, then clean up. Fix gate failures and conflicts yourself.
Constraints: obey <decided ARCH ids>; if a change would break one, stop and report — never work around it. No scope widening, no skipped or weakened tests, no --no-verify. Use /compact at phase boundaries, never /clear (it drops this goal).
Done when the final turn prints COMPLETION EVIDENCE: every docs/plans/TRACKER.md row for <slug> = COMPLETE (print them); no unticked `- [ ]` line in .craftsman/acceptance.md for <slug>'s units or untagged (print the grep); `<test command>` exit 0; last /scrutinise = 0 Critical, 0 Warning; /sync-docs --all applied or "no drift"; /craftsman:merge landed it: print `git log --oneline -1 origin/<base>` (pr mode: the PR URL) and `git worktree list` with no <slug> worktree left. Also done when the final turn prints BLOCKED ON USER: <the one thing only I can do — a decision, access, credentials, a rejected push or protected base, a live/manual check> + what was tried; that is a met stop, not a failure. Or stop after <N> turns and print what remains — also met.
```

Adapt, don't pad: drop steps that don't apply — but never step 5 or its evidence (unlanded work is not done; in `pr` mode its evidence is the PR URL) — add idea-specific acceptance outcomes (from the idea doc's "done" and recommendations) as extra evidence lines. **Measure it:** save to `.craftsman/instructions/<slug>.goal.txt` and run `wc -c` on it — over 4,000 → compress (shorter request text, fewer restated constraints, paths not prose) until it fits; never truncate the evidence clause or its BLOCKED ON USER / turn-cap exits — without them every "stop for me" above reads as unmet, and the goal's Stop hook re-blocks until Claude Code's consecutive-block cap overrides it.

## Phase 3 — Output

Print, in order:
1. **Implementation weight** line + drivers + main schedule risk (outside the prompt).
2. The prompt in one fenced block, ready to paste, and its saved path + character count.
3. **Before you paste** (≤ 4 bullets): run it in auto mode so turns run unattended; when the compact gate fires, run `/compact` yourself and send any message — the goal survives `/compact` but not `/clear`; `/goal` with no argument shows progress, `/goal clear` stops it; pasting it approves the final `/craftsman:merge` (merge + push to base, or a PR in `pr` mode) — drop step 5 first if you want to land by hand; any skipped prerequisite (`/idea`, `/architect`) and its risk.
