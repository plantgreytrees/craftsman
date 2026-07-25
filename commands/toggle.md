---
description: Turn the craftsman quality gates on or off for this repo (a gate you cannot turn off gets uninstalled).
allowed-tools: Bash
argument-hint: "[on|off]"
---

Toggle the gates:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/toggle.mjs" $ARGUMENTS
```

With no argument it flips the current state. `CRAFTSMAN=off` in the environment
disables everything session-wide regardless of this flag.
