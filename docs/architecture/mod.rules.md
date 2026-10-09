---
area: mod
governs: ["hooks/register.js", "hooks/*.test.ts", "scripts/telemetry.mjs", "scripts/stats.mjs", ".claude-plugin/plugin.json", "docs/mod-manifest.txt"]
human: docs/architecture/mod.md
source: docs/ideas/autonomous-e2e-loop.md
verified_at: 655e17e28b036ec540800c641ef14b28fcea146a
updated: 2026-10-09
---
# ARCH mod — enforced rules

- **ARCH-MOD-01** [decided] The mod only launches, observes and draws: it MUST NOT register tool.call, tool.check or agent.spawn handlers, nor read env/settings beyond the workflow flags — check: committed docs/mod-manifest.txt from claude plugin validate, asserted by a test — cite: hooks/hooks.json:1-5
- **ARCH-MOD-02** [decided] Launch order: on turn end a new .craftsman/instructions/<slug>.goal.txt triggers command.run("goal"), else prompt.submit as the user, else a one-key /auto-go command, else /auto prints the paste — check: mod test per path — cite: commands/instruction.md:58
- **ARCH-MOD-03** [decided] Root-context telemetry MUST be appended to .craftsman/events.jsonl through scripts/telemetry.mjs as {ev:"context", sid, phase, unit, tokens, percent, cost}; stats.mjs reports root context per run — check: stats output test — cite: scripts/lib/core.mjs:680-686
- **ARCH-MOD-04** [decided] Workflow and mod support MUST be feature-detected at runtime, never by version string — check: grep for version comparisons — cite: .claude-plugin/plugin.json:1-19
- **ARCH-MOD-05** [decided] Mod tests run with claude plugin test; CI skips them with a notice when claude < 2.1.287 is present — check: CI step — cite: scripts/wiring.test.mjs:1-96
