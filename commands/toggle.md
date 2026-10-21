---
description: Turn the craftsman quality gates on or off for this repo.
allowed-tools: Bash
argument-hint: "[on|off]"
---

Run:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/toggle.mjs" $ARGUMENTS
```

No argument flips the state. Only the quality, doc and tracker gates change; safety stays on until `CRAFTSMAN_SAFETY=off` is set in your environment.
