---
area: mod
governs: ["hooks/register.js", "hooks/*.test.ts", "scripts/telemetry.mjs", "scripts/stats.mjs", ".claude-plugin/plugin.json", "docs/mod-manifest.txt"]
human: docs/architecture/mod.md
source: docs/ideas/autonomous-e2e-loop.md
verified_at: d7da89f424960b24ee235b043673a1e2a2a78849
updated: 2026-10-09
---
# ARCH mod — enforced rules

- **ARCH-MOD-01** [decided] The mod only launches, observes and draws: it MUST NOT register tool.call, tool.check or agent.spawn handlers, nor read env/settings beyond the workflow flags — check: committed docs/mod-manifest.txt from claude plugin validate, asserted by a test — cite: hooks/register.js:54-115
- **ARCH-MOD-02** [decided] Launch order: on turn end a new .craftsman/instructions/<slug>.goal.txt triggers command.run("goal"), else prompt.submit as the user, else a one-key /auto-go command, else /auto prints the paste — check: mod test per path — cite: hooks/register.js:91-110
- **ARCH-MOD-03** [decided] Root-context telemetry MUST be appended to .craftsman/events.jsonl through scripts/telemetry.mjs as {ev:"context", sid, phase, unit, tokens, percent, cost}; stats.mjs reports root context per run — check: stats output test — cite: scripts/telemetry.mjs:52-69
- **ARCH-MOD-04** [decided] Workflow and mod support MUST be feature-detected at runtime, never by version string — check: grep for version comparisons — cite: hooks/register.js:66-112
- **ARCH-MOD-05** [decided] Mod tests run with claude plugin test; CI skips them with a notice when claude < 2.1.287 is present — check: CI step — cite: .github/workflows/ci.yml:101-110
