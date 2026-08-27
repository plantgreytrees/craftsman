#!/usr/bin/env node
// Logs a review-router (ESCALATE/SKIP) decision to the shared event log, so
// /craftsman:stats can report on router accuracy over time.
// Usage: node log-router.mjs <ESCALATE|SKIP> [reason words...]
import { logEvent } from "./lib/core.mjs";

const result = process.argv[2];
const reason = process.argv.slice(3).join(" ");

if (result !== "ESCALATE" && result !== "SKIP") {
  process.stderr.write(`[craftsman] log-router: expected ESCALATE or SKIP, got ${JSON.stringify(result)}\n`);
  process.exit(1);
}

logEvent({ ev: "router", result, reason });
