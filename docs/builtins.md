# Built-ins ledger

The Claude Code built-ins craftsman wraps, what each wrapper assumes about them,
and the Claude Code version those assumptions were last verified against.
Maintained by `/craftsman:builtin-check`; run it after every `claude update`.

**Last verified:** Claude Code `2.1.289` on 2026-10-05 (first run; changelog
reviewed 2.1.280 → 2.1.289).

## Wrapped built-ins

| Built-in | Used by | Craftsman assumes | Verdict | Evidence |
|---|---|---|---|---|
| `code-review` skill | `_shared-execution.md` step 8 (ESCALATE) | Exists under that name; accepts `high`; with no target reviews the branch's commits beyond `main` plus uncommitted changes; runs as a **forked background** skill, so step 8 waits for its result | OK (one CHANGED note) | Live run 2026-10-05: launched forked, reported "no commits beyond `main`, no uncommitted changes". 2.1.288 added `--max-findings`, and that choice persists across runs, so a user's earlier `--max-findings` setting carries into step 8. Harmless: `code-reviewer` filters anyway |
| `simplify` skill | step 6 | Exists; edits in place; quality cleanups only | OK | In this session's skill list; description unchanged ("…then apply the fixes") |
| `security-review` skill | `builtin-skill-context.mjs` only (no loop step yet) | Exists | OK | In this session's skill list |
| `Explore` agent | `agent-mode-guard.mjs` via `execution.builtinAgents` | Read-only, so allowing it can't hand off implementer/reviewer work | OK, wording corrected | Its tools are all except Agent/Edit/Write/NotebookEdit/Artifact*, so it **has Bash**. It is read-only by design, not by tool set. Its Bash calls still pass craftsman's `PreToolUse` guards. The "no write tools" wording in the guard and docs was corrected. Live dispatch 2026-10-05 was allowed under root-only and returned a correct answer |
| `PreToolUse` on `Skill` → `additionalContext` | `builtin-skill-context.mjs` | Payload carries `tool_input.skill`; `additionalContext` is honoured | OK | Live 2026-10-05: context appeared in the calling session when `/code-review` launched. Because the skill is forked, the context reaches the **caller**, which is where the verdict is made. The fork itself doesn't see it |
| Agent/Task payload | `agent-mode-guard.mjs` | Carries `tool_input.subagent_type` | OK | Guard matched `Explore` live; 2.1.288 only added agent fields to the InstructionsLoaded hook, no rename |
| Hook matchers | `hooks/hooks.json` | Every matcher names a real tool | OK | `Read, Glob, Grep, Write, Edit, NotebookEdit, Bash, Agent, Skill` are in this session's tool list. `Task`, `MultiEdit`, `TodoWrite` and `SlashCommand` are not, but are kept for older Claude Code versions; a matcher naming an absent tool never fires, so this is harmless. 2.1.288: a `PreToolUse` hook whose matching fails now **blocks** the call (fail-closed) |

## Opportunities (proposed, not adopted)

| Built-in | Overlaps | Recommendation | Why |
|---|---|---|---|
| `security-review` skill | `security-auditor` (step 5) | WRAP: seed `security-auditor` with its findings as candidates, as step 8 does for `code-review` | Context hook already supports it; zero new plumbing. Deferred: step 5 has no doc budget left in `_shared-execution.md` |
| `run` skill | `/orchestrate` close-out "user-visible outcomes" check | WRAP: drive the real app once per feature at close-out | Catches "tests pass, app broken". Deferred: needs per-project launch config first |
| Project `verify` skill (2.1.286) | stop gate | WRAP: `/craftsman:init` could scaffold a project `verify` skill that runs the gate commands, so Claude runs it before each commit | Cheap, earlier signal than the stop gate. Deferred: needs a design decision on overlap with the stop gate |
| `Plan` agent | `plan-strategist` | KEEP craftsman's | `plan-strategist` holds craftsman's decomposition rules |
| Claude Mods (2.1.287) | hooks | IGNORE for now | Deeper hooks than craftsman needs today |
| `/code-review ultra` | — | Not wrappable | User-triggered and billed separately |
