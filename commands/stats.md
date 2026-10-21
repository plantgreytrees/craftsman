---
description: Cost/benefit report for the quality gates: block rate against latency per layer.
allowed-tools: Bash
---

Run the stats report:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/stats.mjs"
```

Show the output verbatim, then note any layer with a ~0% block rate but
non-trivial latency as a candidate to disable in `craftsman.config.json`.
