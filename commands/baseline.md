---
description: Snapshot pre-existing lint/type findings so the quality gate reports only NEW issues. Run once per repo before first use, and after any large intentional cleanup.
allowed-tools: Bash
---

Run the baseline snapshot:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/baseline.mjs"
```

Report the summary line it prints. After this, the PostToolUse quality gate
excludes pre-existing findings and surfaces only issues introduced from now on.
