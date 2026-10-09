---
plan: docs/plans/autonomous-e2e-loop.md
updated: 2026-10-09
---
# autonomous-e2e-loop — live evidence

Measured numbers for the plan's live units. Each row is a `{ev:"context"}` event in `.craftsman/events.jsonl`, written by `scripts/telemetry.mjs` (ARCH-MOD-03). `node scripts/stats.mjs` reports them under "Root context per run".

## Baseline (root-only)

This is the root session that ran units 1–4 itself, with no subagents (`execution.agentMode: root-only`). Telemetry only landed with unit 2, so the earlier units have no samples. Each sample came from the telemetry CLI, run against the session transcript as a unit closed. The Stop hook runs the same `contextEvent` code, but this session's hooks are older than the install, so the hook did not fire here.

| sid | unit closed | root tokens | recorded % |
|---|---|---|---|
| 715e38a2-879c-41f3-ae62-966f7b42e33e | telemetry | 107,160 | 53.6 |
| 715e38a2-879c-41f3-ae62-966f7b42e33e | auto-command | 154,205 | 77.1 |
| 715e38a2-879c-41f3-ae62-966f7b42e33e | mod-launcher | 262,695 | 26.3 |
| 715e38a2-879c-41f3-ae62-966f7b42e33e | baseline-run (after one compaction) | 56,468 | 28.2 |

- **Peak root context:** 262,695 tokens, at the mod-launcher close. Most of the +108,490 from the previous sample went on probing the mod API live.
- **Growth per unit before compaction:** +47,045 (auto-command) and +108,490 (mod-launcher). Root-only execution keeps every unit's reads, diffs and test output in one context. That is the cost the workflow engine removes.
- **Compaction:** the session compacted once, between mod-launcher and baseline-run, and dropped to 56,468 tokens.

**Percent caveat.** The recorded percentages use whichever window the transcript's model id advertises. This session actually runs with a 1M window: it reached 262k before compacting. Its model id does not say so, so the 53.6, 77.1 and 28.2 figures were divided by 200k, and 26.3 by 1M. **Compare runs in tokens, not percent.** The mod's samples read the engine's own window (`session.usage().context`), so their percentages are exact.

## Spike

The spike ran three times, live, through `workflows/spike.js` → `agents/unit-runner.md`, against a throwaway workspace project `spike`. That project is a sandbox git repo with its own bare remote under the ignored `.craftsman/spike/`, so no merge touched the real `main`. There are two units:
- `spike-farewell`, to land;
- `spike-park`, an open product decision.

After the runs, `agents/unit-runner.md` was trimmed to the 3,800-char agent budget. The steps and rules are unchanged; only the wording is shorter. Run 3 (`wf_b9a69ae2-434`) used 5 agents (implement, review and land for one unit; implement and park for the other), 195,510 subagent tokens and 174 s.

| ENGINE-02 item | Result | Evidence |
|---|---|---|
| Hooks fire inside agents | **live ✅** | Run 1: the pre-guard blocked both agents' `Read agents/unit-runner.md` (`scope_blocked` events at ts 1791545592063 and 1791545601762). Both agents refused to work around it. |
| Agents carry the root session id | **live ✅** | That block named the root's own scope (`workflow-spike`). Claims and scopes from the agents were recorded under sid `715e38a2…`. |
| Worktree-keyed scope activation | **live ✅** | Under the root session dir: `scope@spike-a61fac18f9cce8b7.json`, `scope@spike-e7990106f4eaad4d.json` and `scope@spike-e674f28759e57504.json`, each with its own `scope-required@…`. That is one scope per unit worktree under one session id. |
| Smoke gate first (TRACKER-05) | **live ✅** | `npm test` was green before any edit, in every implement agent. |
| Implementer → separate fresh reviewer (ENGINE-05) | **live ✅** | `implement:spike-farewell` → `review:spike-farewell` (APPROVED) → `land:spike-farewell`. |
| repo-exec prepare / merge sha | **live ✅** | Prepare made `.craftsman/spike/sandbox/.worktrees/spike-farewell`. Merge pushed `1d2ba11..9d7f500` (`Merge branch 'feat/spike-farewell'`) with `cleaned:true`. |
| Tracker transitions | **live ✅** | `spike-farewell` went IN_PROGRESS → MERGED (evidence `9d7f500…`), and `spike-park` went IN_PROGRESS → PARKED. |
| Park path with a decision (ENGINE-07) | **live ✅** | `parked[0]` = {question: "greet(name) … What should the new greeting wording be?", options: 5}. No edit was made and no default chosen. |
| Quality-gate event inside an agent | **live ✅** | Probe `wf_6c851084-8ec`: one agent wrote `spike-gate-probe.mjs` in a throwaway craftsman worktree (`.worktrees/spike-gate2`). That worktree's `events.jsonl` then held `{"ev":"gate","file":"…/spike-gate-probe.mjs","lang":"javascript","result":"pass"}` at ts 1791546772634. Only the agent wrote that file. A root positive control (`spike-gate-root.mjs`, ts 1791546760321) logged the same way. So PostToolUse hooks fire inside workflow agents. |
| Installed pre-guard enforces the unit's scope inside agents | **replay only (not an ENGINE-02 item) ⚠️** | Live, the stale session hooks read only the root's plain `scope.json`. A probe agent was blocked reading its own in-scope file and refused to work around it. Replayed into the installed pre-guard under the root sid, the worktree-keyed scope `spike-replay` was applied: Read `greet.mjs` exited 0, Write `greet.mjs` exited 0, Read `package.json` exited 2. |
| Root tokens | 113,857 → 205,080 | Samples `spike-before` and `spike-after`. Most of the +91,223 went on the root debugging three runs, the probes and the replay, not on running units. A clean run is measured in step 9. |
| Earlier sandbox gate probe (`wf_efeacfa6-1ee`) | inconclusive, explained | No `gate` event appeared for a sandbox file. My own root Write to the same sandbox path was silent too, so the stale gate exits early for paths under `.craftsman/spike/`. This says nothing about whether hooks fire in agents; the craftsman-worktree probe above settles that. |

Findings to carry into `engine-guards` and `engine`:
1. The protocol must reach the agent as its system prompt (`agentType: craftsman:unit-runner`) or inline. An agent cannot read a file before its scope exists.
2. `CLAUDE_PROJECT_DIR` is unset in agent Bash. Every script call must pin it (`CLAUDE_PROJECT_DIR=<project_root>`). Without it, the cwd's git toplevel wins (ARCH-STATE-01).
3. With an in-flight workflow, the stop-gate blocks on acceptance and on bindings. ARCH-STATE-04 fixes this.
4. A run only gets the new hooks after `/reload-plugins` or a new session. `/auto` should check that the loaded hooks match the installed version before it launches.

**Verdict: GO.** Every ENGINE-02 item is recorded from live workflow runs: hooks fire inside agents (PreToolUse blocks, PostToolUse quality-gate events), worktree-keyed scope activation, the quality gate, repo-exec prepare and merge (`9d7f500`), tracker transitions, and the park path with a decision. Root tokens were sampled too. Enforcing the unit's scope with the *installed* hooks inside agents is verified by replay; it needs a session that loaded them, and `/auto` should check for that (finding 4). The workflow default may land in `engine` (ARCH-ENGINE-01/02).
