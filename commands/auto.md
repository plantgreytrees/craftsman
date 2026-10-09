---
description: One entry for the whole loop — ask every open decision up front, run the units unattended under /goal, ask once more about what came back, and land everything; repeat until every row is COMPLETE.
argument-hint: "<idea-slug | plan-slug | request>"
model: sonnet
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, AskUserQuestion, SlashCommand, Skill
---

# Auto — ask, run, ask again, land

Target: `$ARGUMENTS`. The questions all come first and last; the middle runs unattended (ARCH-AUTO-01).

**Git authority.** Invoking `/craftsman:auto` is standing approval to commit, branch, merge base in, push, land and clean up worktrees and branches across every registered workspace project (ARCH-LAND-01; `commands/merge.md` §5a). **Limits:** never `--force`/`-f`/`+refspec` on push, `reset --hard` or `worktree remove --force`, and never `push --mirror`. `pre-guard.mjs` blocks them while `/auto` is active, and also blocks any command it cannot read in time, including any over 16 KB (ARCH-LAND-05). A conflict, rejected push or failed auto-merge PARKs the unit with a decision for Phase C (ARCH-LAND-06).

## Phase A — Ask

Run whichever stages have not run yet, in order, each to completion: `/idea <request>` (no `docs/ideas/<slug>.md`) → `/architect <slug>` (idea not `architected` while it touches a governed area) → `/plan <slug>` (no `docs/plans/<slug>.md`). Collect every open decision they surface — the idea's open questions, each architecture decision with real options, any plan scope or product ambiguity — and ask them all now with `AskUserQuestion`, before Phase B starts.

**Never default an open decision** (ARCH-AUTO-02). A default is allowed only for a conventional choice the repo already settles (naming, file layout, test placement); say which you took. Record each answer where its stage keeps it (idea doc, rules doc via `/architect`, plan doc), so the unattended run reads decisions, not guesses.

## Phase B — Run

1. Compose the `/goal` exactly as `commands/instruction.md` Phase 2 does for this slug (plan exists → it starts at `/orchestrate`), keeping its evidence, BLOCKED ON USER and parked-rows clauses and its ≤ 4,000-character limit by `wc -c` (ARCH-AUTO-04).
   **Engine** (`execution.engine`, ARCH-ENGINE-12): units run in fresh contexts, never in this one. `workflow` (default) → the plugin workflow `craftsman:run` (`workflows/run.js`); Workflow unavailable → `subagent`, one `unit-runner` per unit via Agent, granted by this invocation (ARCH-AUTO-06), never silently `root`; `root` only when the config says so. Both follow `agents/unit-runner.md` (ARCH-ENGINE-04).
2. **Turn cap per pass:** size it from the rows still open for the slug with instruction.md's bands — ≤ 1 row QUICK 20 · 2–3 MEDIUM 50 · 4–7 LONG 100 · ≥ 8 EXTRA LONG 180 — fresh on every pass (ARCH-AUTO-05).
3. Save it to `.craftsman/instructions/<slug>.goal.txt` and end the turn. The craftsman mod (`hooks/register.js`) launches a goal file written this session at turn end: `/goal` via `command.run`, else the directive via `prompt.submit`, else its band asks the user to type `/craftsman:auto-go` (ARCH-MOD-02).
4. **Fallback:** where the mod cannot launch (`-p`, `disableAllHooks`, no mod support), print the paste-ready goal in one fenced block with its path and character count, as `/instruction` does, and stop for the user to paste it (ARCH-AUTO-07).

## Phase C — Ask again

When the goal ends, build the round from the ledger, not from memory: `tracker.mjs` `status` for the slug (its derived view is `.craftsman/runs/<slug>.json`, ARCH-TRACKER-01). Every PARKED row of an autonomous run carries `decision {question, options[], recommended?}` (ARCH-TRACKER-03) — a unit's open question or a landing park (conflict, ff-only, rejected push, auto-merge; ARCH-LAND-06). Gather, in one consolidated `AskUserQuestion` round: each PARKED row's decision, asked with its own question and options and its `recommended` marked; each `/scrutinise` finding that needs a judgement call; and the rows still open. A PARKED row without a decision → ask what it needs; never guess. Apply the answers (plan amendment, unpark through `tracker.mjs` with the answer as evidence, re-scope) before any next pass. Never default an open decision here either.

## Finish

End **every** run by listing the remaining rows for the slug (id, status, the decision or blocker) and prompting the user to continue — `/craftsman:auto <slug>` runs the next Phase B → C pass (ARCH-AUTO-03). Repeat B–C until every row for the slug is COMPLETE; then say so and list nothing.
