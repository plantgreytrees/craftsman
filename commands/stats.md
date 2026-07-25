---
description: Cost/benefit report for the quality gates — block rate vs p50/p95 latency per layer, so you can delete the gates that don't earn their tokens.
allowed-tools: Bash
---

Run the stats report:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/stats.mjs"
```

Show the output verbatim, then note any layer with a ~0% block rate but
non-trivial latency as a candidate to disable in `craftsman.config.json`.
