---
description: Snapshot existing lint/type findings so the quality gate reports only NEW issues, recorded in docs/errors/ to stay visible. Run once per repo, and after any large intentional cleanup.
allowed-tools: Bash
---

Run the baseline snapshot:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/baseline.mjs"
```

Report both summary lines it prints. After this, the PostToolUse quality gate
excludes pre-existing findings and surfaces only issues introduced from now
on — but they aren't just discarded: this run also writes (or updates)
`docs/errors/KNOWN_ISSUES.md`, a plain table of every file with pre-existing
findings, worst-first, so the debt stays visible and addressable later instead
of living only in the gitignored `.craftsman/baseline/` snapshot. That file is
regenerated wholesale on every baseline run — don't hand-edit it; if a project
doesn't want this doc at all, set `baseline.errorsDoc` to `false` in
`craftsman.config.json`.
