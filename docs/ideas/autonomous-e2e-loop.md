---
slug: autonomous-e2e-loop
status: architected
verdict: pursue-with-changes
confidence: medium
depth: standard
isolation: NOT ISOLATED
created: 2026-10-09
updated: 2026-10-09
related: [docs/plans/token-efficiency.md, commands/instruction.md, CHANGELOG.md, docs/architecture/state.rules.md, docs/architecture/engine.rules.md, docs/architecture/auto.rules.md, docs/architecture/mod.rules.md, docs/architecture/tracker.rules.md, docs/architecture/landing.rules.md]
touches: [commands/instruction.md, commands/orchestrate.md, commands/_shared-execution.md, commands/_shared-machinery.md, commands/plan.md, commands/idea.md, commands/architect.md, commands/auto.md (new), workflows/*.js (new), hooks/register.js (new mod module), hooks/hooks.json, scripts/agent-mode-guard.mjs, scripts/lib/core.mjs, scripts/orchestrate-scope-guard.mjs, scripts/stop-gate.mjs, scripts/session-context.mjs, craftsman.config.json, .claude-plugin/plugin.json, scripts/*.test.mjs, README.md, EXTENDING.md, CHANGELOG.md, commands/workspace-init.md, scripts/workspace-init.mjs, scripts/repo-exec.mjs, commands/merge.md]
---

# Idea: One-entry autonomous loop with a light root context

## Proposal (neutral restatement)
**Problem.** Taking a change from idea to landed merge today needs a person
to drive 4 steps: `/idea` → `/architect` → `/instruction` → paste the
`/goal` prompt in auto mode (`commands/instruction.md:65`). Questions can be
asked at several of those steps. During execution every implementer and
reviewer step runs in the root session (`craftsman.config.json:4`,
`agentMode: root-only`), so the root context grows with every unit. The
command prose an idea-to-merge chain loads is about 98 KB, roughly 25k tokens,
before any repo is read (measured with `wc -c commands/*.md`).
**Claimed benefit:** one entry point; questions only before implementation
and after completion; unattended execution between them; a smaller root
context. **Who benefits:** the solo maintainer running craftsman on their own
repos. **Done:** one command → one pre-implementation question phase → an
unattended run → either landed work with every tracker row COMPLETE, or a
single consolidated list of what needs the user. Root-context tokens per
run are measured and lower than today.

## Verdict
**PURSUE-WITH-CHANGES** (medium). Most of the autonomy already exists:
`/instruction` + `/goal` + auto mode already run plan → merge unattended,
with a `BLOCKED ON USER` exit (`commands/instruction.md:55`). The real gaps
are three:
- the manual hop count, including the paste;
- root-context growth under root-only mode;
- no token telemetry to prove any gain.

The user chose a plugin workflow engine for unit execution. Its
no-mid-run-input rule matches the user's "ask before implementation and
after completion" model. But it is unproven that craftsman's per-session
guards bind correctly inside workflow agents. **The fact most likely to flip
this:** if a spike shows `scope.mjs`/`quality-gate`/`stop-gate` and the
agent grants misbehave inside workflow agents, fall back to one sub-agent per
unit.

| criterion | score 1–5 | evidence |
|---|---|---|
| value (problem is real and frequent) | 4 | 4 manual steps + paste (`commands/instruction.md:65`); root-only puts all unit work in root (`craftsman.config.json:4`); no baseline measurement exists, so the size of the gain is unproven |
| system fit (aligns with architecture + direction) | 3 | Conflicts with the root-only default, which was chosen for total-token cost (`CHANGELOG.md:453-457`); the `Workflow` tool is not matched by `agent-mode-guard` (`hooks/hooks.json:10`, `Task\|Agent`), so a workflow is an unguarded path |
| cost (build + maintain) — 5 = cheap | 2 | Two execution engines (workflow + root-only fallback, since workflows can be disabled: https://code.claude.com/docs/en/workflows#turn-workflows-off), plus a mod and its non-UI fallback |
| risk (blast radius, failure modes) — 5 = low | 3 | Unattended merge to main; guard state already splits across directories (see Research, R6) |
| reversibility — 5 = trivially undone | 4 | Can ship behind `execution.engine` config with today's path as the default |
| evidence strength (research + repo proof) | 3 | Primary docs for `/goal`, workflows, mods and sub-agents; hook behaviour inside workflow agents is UNPROVEN |

## Overlap & prior work
- **Extends** `/instruction` (`commands/instruction.md:2,36,55,65`): one
  `/goal` prompt for the whole loop, with turn caps and `BLOCKED ON USER`.
- **Extends** `docs/plans/token-efficiency.md` (TRACKER rows 5–8, MERGED).
- **Conflicts with** the root-only default (`CHANGELOG.md:453-457`,
  `scripts/agent-mode-guard.mjs`).
- Earlier failure in this area: `/goal` looped at the Stop hook until the
  `BLOCKED ON USER` exit was added (`CHANGELOG.md:266-272`).
- **Searched with no hits:**
  - `docs/ideas/` and `docs/architecture/` (neither exists);
  - the TRACKER goals (2 open rows, both unrelated);
  - the README command table.
- **Not searched:** plan memory, which needs a plan key
  (`scripts/plan-memory.mjs:326-333`).

## System fit (whole project)
- **contract ripple:** `/instruction`'s goal format and the tracker/acceptance evidence clause (`commands/instruction.md:55`) become the workflow's input and output contract; `/orchestrate` → `_shared-execution.md` unit steps move into a script.
- **data:** N/A (no persistence beyond `.craftsman/` state files).
- **config & flags:** new `execution.engine` (`root` | `workflow`) and a mod toggle in `craftsman.config.json`; `agentMode` semantics must cover `Workflow`.
- **security:** a workflow bypasses `agent-mode-guard` (`hooks/hooks.json:10`); auto-merge to main stays gated by `/craftsman:merge`; mods are unsandboxed and can approve tool calls (https://code.claude.com/docs/en/plugins/mods/overview#what-a-mod-can-reach).
- **tests:** `scripts/wiring.test.mjs` and `scripts/workflow.test.mjs` need cases for the new engine; the mods docs describe sessionless mod tests (https://code.claude.com/docs/en/plugins/mods/test).
- **observability:** no per-stage token telemetry exists today (`/craftsman:stats` covers gates only); a mod can read per-request usage.
- **UI:** the mod adds a band/pane showing loop progress and context use; terminal and Desktop only.
- **docs:** README command table, EXTENDING, CHANGELOG.

**Second-order effects.**
- Total tokens rise: workflow agents each re-read their brief, and the docs
  say runs use "meaningfully more tokens"
  (https://code.claude.com/docs/en/workflows#cost).
- There are two engines to keep in sync.
- Workflows can't ask mid-run, so a unit that hits an open decision must
  park, and the decision is collected for the end-of-run round.
- The workflow default size guideline is `medium` (<10 agents), or `small`
  on Pro. A many-unit plan exceeds it unless it is batched.

## Research
- **R1 `/goal`** (https://code.claude.com/docs/en/goal):
  - It is a session-scoped prompt-based Stop hook. A Haiku evaluator reads
    only the transcript.
  - The condition is capped at 4,000 chars.
  - It needs auto mode to run unattended.
  - It survives resume and works with `-p`.
  - Background work defers evaluation.
- **R2 Workflows** (https://code.claude.com/docs/en/workflows):
  - The script holds intermediate results, so "Claude's context holds only
    the final answer".
  - A plugin ships them in `workflows/` as `/<plugin>:<name>`, with `args`.
  - Runs are resumable within the same session.
  - **There is no mid-run user input** ("for sign-off between stages, run
    each stage as its own workflow").
  - They can be disabled, and Pro needs an opt-in.
- **R3 Mods** (https://code.claude.com/docs/en/plugins/mods/overview, v2.1.287+; installed here: 2.1.295):
  - They run in-process and can draw bands and panes.
  - A mod can add a `/command` that runs with no Claude turn and can submit
    a prompt as if typed, which removes the `/goal` paste.
  - A mod can read per-request token usage.
  - Mods don't draw in `-p`, VS Code or cloud sessions, and are stopped by
    `disableAllHooks`.
- **R4 Sub-agents are not deprecated** (https://code.claude.com/docs/en/sub-agents):
  - Task was renamed Agent in v2.1.63; the `Task(...)` alias still works.
  - Plugin `hooks.json` hooks fire inside sub-agents (PreToolUse,
    PostToolUse, SubagentStop).
  - v2.1.215 only made spawning opt-in
    (https://techdevnotes.com/releases/claude-code/2.1.215).
  - Workflows run on sub-agents.
- **R5 Total token cost of sub-agents** (third-party, UNPROVEN figures):
  each costs a 10–20k bootstrap and is "not automatically cheaper"
  (https://aicrossroads.substack.com/p/claude-code-subagents,
  https://kdnuggets.com/7-practical-ways-to-reduce-claude-code-token-usage).
- **R6 Guard-state split, observed this session.**
  - `resolveProjectRoot` falls back to `CLAUDE_PROJECT_DIR` when the
    working directory isn't a git repo (`scripts/lib/core.mjs:32-46`).
  - This session opened one level above the repo, so the `/idea` grant was
    written to `../.craftsman/sessions/<sid>/idea-critic-grant`.
  - The Agent hook, by then running inside the repo, read
    `craftsman/.craftsman/` and blocked (`events.jsonl`,
    `agent_mode_blocked`).
  - This contradicts the guarantee at `scripts/lib/core.mjs:19-20`.
  - Unattended runs depend on these grants, so this must be fixed first.

### Ecosystem: what demonstrably works
- **The common pattern.** The leading workflow plugins and Anthropic's own
  guidance converge on the same loop:
  1. An up-front interview that captures decisions.
  2. A plan sized to fit one fresh context.
  3. **Execution in a fresh-context sub-agent per task**, with a review after
     each task.
  4. State kept on disk.
  5. Verification backed by evidence.

  Craftsman already has steps 1, 2, 4 and 5. Root-only mode is the outlier
  on step 3.
- **E1 Superpowers** (https://github.com/obra/superpowers; ~1M installs per
  https://composio.dev/content/top-claude-code-plugins, a third-party count):
  - Brainstorm by questions, then a design doc, a worktree, and a plan of
    2–5 minute tasks.
  - It offers two execution modes. *Subagent-driven*: a fresh sub-agent per
    task plus a two-stage review (spec compliance, then quality); "the most
    thorough". *Executing-plans*: everything inline; "cheapest".
  - It claims "autonomously for a couple hours at a time".
  - This mirrors craftsman's `agentMode` choice, but defaults to sub-agents.
- **E2 GSD Core** (https://github.com/open-gsd/gsd-core):
  - It names the problem "context rot" and runs "all heavy research,
    planning, and execution work in fresh-context subagents while keeping
    your main session lean".
  - Its loop is Discuss (decisions captured) → Plan (checked to fit a fresh
    context) → Execute (parallel waves, "a clean 200k-token context" each)
    → Verify (the user walks through what was built) → Ship.
  - State lives in `STATE.md` and `CONTEXT.md`.
- **E3 Spec Kit** (github/spec-kit, from secondary sources only:
  https://visualstudiomagazine.com/articles/2025/09/03/github-open-sources-kit-for-spec-driven-ai-development.aspx):
  constitution → specify → **clarify** → plan → tasks → **analyze**
  (cross-artifact consistency) → implement, with gated phases.
- **E4 Anthropic, long-running harness**
  (https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents):
  - An initializer expands the request into a **JSON feature list, all
    failing**. Agents may only flip each feature's status; JSON resists
    being overwritten better than Markdown.
  - Each session works on one feature in a fresh context, guided by a
    progress file plus git history, and starts with a smoke test.
  - Failures seen: one-shotting the whole app, declaring done too early,
    and marking features done without end-to-end testing.
- **E5 Anthropic, context engineering**
  (https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents):
  - Sub-agents return "a condensed, distilled summary (often 1,000-2,000
    tokens)".
  - Prefer just-in-time retrieval of paths over inlined content.
  - Tool-result clearing is "the safest lightest touch" form of compaction.
  - Aim for "the smallest set of high-signal tokens".
- **E6 Claude Code best practices** (https://code.claude.com/docs/en/best-practices):
  - Context is "the most important resource to manage"; track it with a
    status line.
  - Interview with AskUserQuestion, write a spec, then implement in a fresh
    session.
  - Use `/goal` or a Stop hook for unattended verification.
  - The adversarial reviewer runs in a fresh sub-agent and must "flag only
    gaps that affect correctness or the stated requirements", or chasing
    findings leads to over-engineering.
  - "Use hooks for actions that must happen every time"; skills load on
    demand.
- **E7 Skill description budget** (third-party, UNPROVEN:
  https://claudecodeguides.com/progressive-disclosure-pattern-claude-code-skills/):
  - Descriptions are the always-loaded cost. Reported limits: about 15k
    chars combined with silent filtering, 1,024 per description.
  - Craftsman alone uses about 9.2k of that across 43 descriptions, so
    alongside other plugins, its skills could silently stop triggering.

## Critique
(Run in root after the isolated dispatch was blocked by R6 — NOT ISOLATED.)
- **Steelman.**
  - Every piece needed already exists and is documented: `/instruction`'s
    evidence-bound goal, `/goal`'s evaluator, workflows that keep unit
    output out of root, and a mod that can launch and display the run.
  - Assembling them turns 4 hops into 1.
  - It bounds root context by the plan, not by the number of units.
  - Workflows' no-mid-run-input rule enforces the user's preferred shape:
    ask before, run, ask after.
- **Strongest case against.**
  - The marginal gain over today is small in hops: 3 commands and a paste.
  - The cost is a second execution engine on a preview feature, plus a mod.
  - Total tokens go up, which reverses the reason root-only exists.
  - Without a baseline, "lighter" is a claim, not a result.
- **Hidden assumptions, each with its test:**
  - (a) Craftsman's PreToolUse/PostToolUse hooks, `scope.mjs` activation
    and the doc-write grants work inside workflow agents. Test with a
    1-unit spike that edits a governed path.
  - (b) Every open decision can be discovered before implementation. Test
    by replaying 2 shipped plans and counting decisions first raised during
    `/orchestrate`.
  - (c) A mod can submit `/goal` as typed input. Test with a minimal mod
    command.
  - (d) A per-unit worktree/merge sequence works when driven from a script.
    Test inside the same spike.
- **Failure modes:**
  - Guard state splitting across directories (R6), so a guard silently
    blocks or allows the wrong action.
  - A workflow agent stalling and restarting after partial edits; the docs
    say files changed by a stalled attempt stay changed.
  - A unit that hits an open decision mid-run: it must park cleanly, not
    guess.
  - The two engines drift apart.
  - `/goal`'s evaluator wrongly reading a parked run as "impossible".
- **Kill criteria:**
  - The spike can't make the scope and quality guards fire in workflow
    agents.
  - Measured root-context savings are under about 30% versus root-only
    with per-unit compaction.
  - Workflows remain a research preview or plan-gated for the user.
- **Cheaper alternatives:**
  - (1) **Do nothing.** `/instruction` + `/goal` already works.
  - (2) **Smallest slice.** Fix R6. Add an `/auto` front door that runs
    the question phases and writes the goal. Add a mod that submits
    `/goal` and shows progress. Keep root-only but compact after each unit.
    This delivers about 70% of the value with one engine.
  - (3) **One sub-agent per unit.** This isolates the root context like a
    workflow does and keeps mid-run escalation possible, but adds no new
    engine.

## Disputed
- The user chose the workflow engine over the critique's preferred
  sub-agent-per-unit option. That choice stands. It is gated behind a spike,
  and the sub-agent option is kept as its fallback (Recommendations 3–4).

## Recommendations
1. **Fix the guard-state split first** (R6, `scripts/lib/core.mjs:32-46`).
   - Pin the project root once per session (for example, at SessionStart)
     and reuse it everywhere.
   - Grants and scope state must not depend on the working directory.
2. **Measure before optimising.**
   - Add per-stage token and context telemetry via the mod, at zero model
     tokens, or through `events.jsonl`.
   - Record a baseline idea-to-merge run under today's root-only mode.
3. **Spike the workflow engine on 1 unit** before building on it. Prove:
   - hooks fire inside workflow agents;
   - `scope.mjs` activates;
   - the quality gate runs;
   - worktree create/merge works;
   - the stop-gate and acceptance criteria hold.

   Add `Workflow` to the agent-mode-guard matcher (`hooks/hooks.json:10`)
   with an explicit allow rule for craftsman's own workflows.
4. **`/craftsman:auto <request>` as the single entry.**
   - **Phase A, before implementation:** a merged idea → architect → plan
     question phase. Ask every open decision, in as many rounds as needed;
     defaults only for conventional choices, never for open decisions.
   - **Phase B:** launch the run (workflow engine, or root-only fallback),
     wrapped in `/goal`.
   - **Phase C, after completion:** one consolidated round covering each
     parked decision, each scrutinise finding that needs judgement, and the
     remaining tracker rows.
   - Re-enter Phase B until every tracker row is COMPLETE. Always end by
     listing what remains and prompting the user to continue.
   - **Git authority:** `/auto` lands each finished unit and the run via
     `/craftsman:merge` without asking (see Open questions). Merge never
     needs a Phase C approval; only real conflicts and rejected pushes
     escalate. This covers registered workspace sub-repos and submodules
     too, landed in dependency order.
5. **Mod with fallback.**
   - The mod launches the `/goal` itself, removing the paste.
   - It shows a band with plan, unit, tracker % and context %.
   - Where mods don't draw (`-p`, VS Code, cloud), fall back to printing
     the goal as `/instruction` does today.
6. **Cut root prose.**
   - Lazy-load `_shared-execution.md` (13 KB) per step instead of whole.
   - Shorten the 43 always-loaded descriptions (about 9.2k chars).
   - Have the workflow pass file paths, not doc contents.
7. **Adopt what the ecosystem proved (E1–E6):**
   - **Fresh context per unit is the default** for autonomous runs (E1, E2,
     E5). Root keeps only the tracker, the plan path, and each unit's
     summary, capped at about 1–2k tokens.
   - **The tracker becomes the feature list (E4):**
     - Machine-readable JSON state that units may only flip status on.
     - A startup smoke test before each unit.
     - A "no row may be deleted" rule, so the run can't declare done
       early.
   - **A plan-fits-context check (E2):** `/plan` rejects a unit whose brief
     plus files would not fit one fresh agent's context.
   - **A cross-artifact `analyze` gate (E3)** before execution: idea, rules,
     plan and acceptance criteria must agree.
   - **The reviewer flags correctness and requirement gaps only (E6).**
     Apply this to `scrutineer` and `code-reviewer` to stop over-engineering
     loops.
   - **Pass paths, not inlined docs (E5).** Clear spent tool results by
     ending each stage in its own agent.
8. **Audit the description budget (E7).** Run `/context` with all plugins
   on, and cut craftsman's 43 descriptions toward ≤ 200 chars each. Mark
   rarely used commands `disable-model-invocation: true`.
9. **Sequence:**
   1. Fix R6.
   2. Add telemetry and record the baseline.
   3. `/auto` front door + mod (still root-only).
   4. Workflow spike.
   5. Workflow engine behind `execution.engine`, with fresh context per
      unit.
   6. Feature-list tracker + analyze gate.
   7. Description diet.

## Open questions
- **What does "light" mean?** → **Root context**, accepting more total
  tokens. *(answered)*
- **How should units run?** → **Plugin workflow engine.** *(answered;
  spike-gated, with sub-agent fallback)*
- **Ship a mod?** → **Yes, with a non-UI fallback.** *(answered)*
- **When to ask?** → *(answered)*
  - Answer every open decision before implementation and again after
    completion; never leave a decision open or silently assumed.
  - Complete all tracker items in one go.
  - When work remains, always prompt to continue.
- **May `/auto` merge and manage git unattended?** → **Yes, full
  permission.** *(answered 2026-10-09)*
  - Invoking `/auto` is standing pre-approval to commit, branch, rebase or
    merge `origin/main` in, push, land on main, and clean up worktrees and
    local and remote branches.
  - It needs no approval round.
  - This stays bound by the `/craftsman:merge` and CLAUDE.md safety rules:
    no `--force` push or worktree removal, and stop only on a real conflict
    or a rejected push.
- **Does that authority extend to sub-repos?** → **Yes.** *(answered
  2026-10-09)*
  - The same authority covers every project registered in
    `craftsman.workspace.json` (see `/craftsman:workspace-init`), and the
    target repo's git submodules and nested repos.
  - Each repo lands by its own `repoExec.land` (direct or pr).
  - Dependencies land before the repos that consume them. A parent repo's
    submodule pointer is bumped and committed only after the sub-repo's
    change is pushed.
  - Unregistered repos are never touched or discovered by scanning,
    keeping craftsman's explicit-workspace rule.
  - Each sub-repo is a separate grant (doc-write, agent, scope), keyed to
    that repo's own pinned root (see R6).

## Next step
`/architect autonomous-e2e-loop --deep` (cross-cutting: it touches execution
engine, guards, config and a new mod).
