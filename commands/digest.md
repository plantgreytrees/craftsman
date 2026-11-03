---
description: Progress digest: what shipped, what needs a decision, what is next. Read-only.
allowed-tools: Bash
---

Run the digest (`--html` writes the dashboard):

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/digest.mjs"
```

Show the output verbatim, then one line with the next action: the first
"Decisions needed" item, else the first "Next" row.

Only on `--publish` (with `--html`): publish the file as a private claude.ai
Artifact, keeping its URL in `.craftsman/export/dashboard.url`, republish to it.
Never from a hook, `/auto` or `/goal`.

No preamble. Ledger-only; never writes `docs/`.
