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

Not run yet. See the plan's step 6.
