#!/usr/bin/env node
// Logs a specialist reviewer's dispatch + finding count, so /craftsman:stats
// can show whether the new gate-select-triggered agents (ui-ux-reviewer,
// migration-reviewer, api-reviewer, dependency-auditor, performance-reviewer,
// observability-reviewer — or any other specialist) actually earn their
// tokens, the same way log-router.mjs does for the router itself.
// Usage: node log-specialist.mjs <agent-name> <finding-count>
import { logEvent } from "./lib/core.mjs";

const agent = process.argv[2];
const count = Number(process.argv[3]);

if (!agent || !/^[a-z][a-z0-9-]*$/.test(agent)) {
  process.stderr.write(`[craftsman] log-specialist: expected a lowercase agent name, got ${JSON.stringify(agent)}\n`);
  process.exit(1);
}
if (!Number.isInteger(count) || count < 0) {
  process.stderr.write(`[craftsman] log-specialist: expected a non-negative integer finding count, got ${JSON.stringify(process.argv[3])}\n`);
  process.exit(1);
}

logEvent({ ev: "specialist", agent, count });
