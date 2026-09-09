#!/usr/bin/env node
// PostToolUse (Bash): _shared-execution.md step 12 and orchestrate.md Phase E
// both prescribe "write the hand-off, then invoke /compact" — prose alone
// never forced it. This is the mechanical half: the instant handoff.mjs runs
// (the unit/phase close-out signal), write a per-session "compact-required"
// marker. compact-gate.mjs (PreToolUse, broad matcher) then hard-blocks every
// other tool call for this session until a real /compact or /clear actually
// happens (which fires SessionStart — see session-context.mjs clearing this
// same marker) — so context can no longer silently keep growing unit over
// unit just because the model didn't get around to compacting.
//
// Second trigger, same marker: a tracker.mjs transition into a terminal
// per-unit status (MERGED/BLOCKED/PARKED/COMPLETE/CANCELLED). A normal merge
// already reaches handoff.mjs at step 12, but PARK/BLOCKED exits (max-retry
// or max-round outs — precisely the worst-case-context units) end the unit
// via step 7/8's PARK path, where nothing but prose says a hand-off follows.
// Catching the terminal transition itself closes that gap even if the model
// never gets around to calling handoff.mjs for a parked unit.
import fs from "node:fs";
import path from "node:path";
import { readStdin, projectContext, compactRequiredFile, sidOf } from "./lib/core.mjs";

const TERMINAL_STATUS = /"status"\s*:\s*"(MERGED|BLOCKED|PARKED|COMPLETE|CANCELLED)"/;

let input = {};
try { input = JSON.parse(await readStdin() || "{}"); } catch { process.exit(0); }
const command = typeof input?.tool_input?.command === "string" ? input.tool_input.command : "";
const isHandoff = /\bhandoff\.mjs\b/.test(command);
const isTerminalTransition = /\btracker\.mjs\b/.test(command) && TERMINAL_STATUS.test(command);
if (!isHandoff && !isTerminalTransition) process.exit(0);

const context = projectContext(input.project || ".");
const marker = compactRequiredFile(sidOf(input), context);
try {
  fs.mkdirSync(path.dirname(marker), { recursive: true });
  fs.writeFileSync(marker, new Date().toISOString() + "\n");
} catch { /* best-effort — compact-gate.mjs fails open if the marker never lands */ }

process.stderr.write(
  (isHandoff
    ? "craftsman: hand-off written."
    : "craftsman: unit closed out (terminal tracker status) without a hand-off yet.") +
  " /compact (or /clear) is now REQUIRED before any further tool use " +
  "this session — every other tool call will be blocked until you do.\n"
);
process.exit(2); // exit 2 => stderr becomes model-visible feedback
