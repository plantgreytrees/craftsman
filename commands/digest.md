---
description: ADHD-friendly progress digest — what shipped, what needs a decision, what's next, and % complete per plan. Read-only.
allowed-tools: Bash
---

Run the digest:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/digest.mjs"
```

Show the output verbatim, then end with one line naming the single next
action (the first row under "Next", or — if "Decisions needed" is non-empty —
the decision to resolve first, since a BLOCKED row usually gates everything
behind it).

No preamble, no recap of what the digest already shows. This command only
reads the tracker ledger (`scripts/tracker.mjs`); it never writes to it or to
`docs/`.
