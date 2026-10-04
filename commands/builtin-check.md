---
description: Built-in drift check — after a `claude update`, verify every Claude Code built-in craftsman wraps still matches what its wrapper assumes, surface new built-ins worth wrapping, and (on approval) update through the loop. Writes only docs/builtins.md itself.
argument-hint: "[--report-only]"
allowed-tools: Bash, Read, Glob, Grep, WebFetch, Task, Agent, AskUserQuestion, SlashCommand, Edit, Write
model: sonnet
---

# Built-in check — keep the wrappers honest

> Doc-write policy: this command writes ONLY `docs/builtins.md` (the ledger). Every other change goes through `/plan` → `/orchestrate` → `/scrutinise` → `/sync-docs`.

Craftsman wraps some of Claude Code's own built-ins — they do the generic, Anthropic-maintained work; craftsman's rules decide. A Claude Code release can rename, re-argue, or re-tool one of them, and the wrapper then fails **silently** (a renamed tool disables a hook matcher; a built-in agent that gains write tools breaks root-only mode). This command catches that, and spots new built-ins worth wrapping. **Report first; change nothing until the user approves.** `--report-only` stops after Phase 4's report.

## What craftsman wraps (the contract)

- Built-in skills `simplify` (`_shared-execution.md` step 6) and `code-review` (step 8, args `high`).
- `scripts/builtin-skill-context.mjs` — `PreToolUse` on `Skill` (`hooks/hooks.json`): reads `tool_input.skill`, returns `hookSpecificOutput.additionalContext` for `code-review`, `simplify`, `security-review`.
- `scripts/agent-mode-guard.mjs` — passes read-only built-in agents in `execution.builtinAgents` (default `["Explore"]`) under root-only, matching `tool_input.subagent_type`.
- The ledger `docs/builtins.md`: one row per wrapped built-in — name, where craftsman uses it, the assumptions below, verdict, and the Claude Code version + date it was last verified. **Missing → this is the first run:** build it from this list, every row `unverified`.

## Phase 1 — What changed (read-only)

1. `claude --version` → current. Ledger → last verified version.
2. Fetch the Claude Code changelog (`https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md`). Extract every entry in the range touching skills, slash commands, built-in agents, the Agent/Task or Skill tools, hook events, hook input/output fields, or plugin loading. First run → the last ~10 releases.
3. Inventory built-in skills and agent types from **what this session actually exposes to you** — never from memory or old notes; that listing is the only truth for the installed version. Record each built-in agent's tool set.

## Phase 2 — Verify each wrapper's assumptions

Per ledger row, a verdict **OK / CHANGED / BROKEN / GONE**, each with evidence (changelog line, docs line, or session observation):

- The skill/agent still exists under that exact name; the args craftsman passes (`high`) are still accepted.
- `simplify` still edits in place; `code-review` with no target still reviews the current directory's uncommitted diff.
- Every `builtinAgents` entry is still read-only (no Edit/Write/NotebookEdit, no unrestricted Bash writes). One that gained write tools is **BROKEN** — it now breaches root-only.
- `PreToolUse` on `Skill` still carries `tool_input.skill` and still honours `additionalContext`; Agent/Task calls still carry `tool_input.subagent_type`.
- Every matcher in `hooks/hooks.json` still names a real tool — a renamed tool silently switches a gate off.

Verify empirically where cheap and safe, not only from docs:
- `node --test scripts/*.test.mjs scripts/lib/*.test.mjs`
- pipe a sample payload into each wrapper script and check its output/exit code
- one trivial `Explore` dispatch — the guard must let it through

## Phase 3 — Opportunities

For each built-in skill/agent that is new or materially changed in the range: the built-in, the craftsman command/agent it overlaps, a recommendation — **WRAP** (into a named loop step) / **REPLACE** (the craftsman piece) / **KEEP** (craftsman's) / **IGNORE** — and why.

Hard rules:
- Built-ins do generic work; craftsman's rules decide the verdict.
- Never recommend replacing a rule-holder: `standards-keeper`, `consumer-tracer`, `scrutineer`, `plan-reviewer`, `plan-strategist`, the ARCH-rule and acceptance-criteria gates, or any hook gate.
- Never recommend allowlisting a built-in agent that can write.
- Flag anything user-triggered or separately billed (e.g. `/code-review ultra`) as not wrappable.

## Phase 4 — Report and decide

Show: the version range; the Phase 2 verdict table; the Phase 3 table; the proposed change list, BROKEN/GONE fixes first.

- `--report-only` → stop here.
- Nothing to change → run `node "${CLAUDE_PLUGIN_ROOT}/scripts/doc-write.mjs" on`, update only the ledger's verified version + date, stop.
- Otherwise ask which changes to make — **one** `AskUserQuestion`, multi-select.

## Phase 5 — Apply what was approved

Run the approved changes through the loop: `/plan` → `/orchestrate` → `/scrutinise` → `/sync-docs`. The plan must require:

- every changed wrapper script keeps or gains tests: a positive case, a pass-through case, and a cannot-be-bypassed case for guards;
- each wrapper still degrades safely when its built-in is absent — a skill gets no context, a guard keeps blocking;
- `docs/builtins.md` updated: verified version, date, each row's assumptions and verdict;
- the README "Built-in skills, craftsman's rules" bullet, the agent-mode wording (`session-context.mjs`, `_shared-machinery.md`, `_shared-analysis.md`) and `CHANGELOG.md` updated if the wrapped set changes;
- `commands/_shared-execution.md` stays within its doc-size budget — trim prose, never raise the budget without asking;
- the full test suite, `node scripts/model-policy.mjs` and `node scripts/doc-size-policy.mjs` all pass before done;
- work on a branch, never push to main. Changes reach the plugin cache only via merge to main, then `/craftsman:upgrade`, then `/reload-plugins` — never hand-copy into the cache.

## Finish

Report: version range, each verdict, what changed (files + branch), what was deferred, and the exact next step (merge, then `/craftsman:upgrade`, then `/reload-plugins`).
