#!/usr/bin/env node
// PreToolUse (broad matcher — everything a command can call): the mechanical
// half of compact-nudge.mjs. Once that hook writes this session's
// "compact-required" marker (right after handoff.mjs runs), every other tool
// call is hard-blocked until either a real /compact or /clear happens
// (which fires SessionStart — session-context.mjs clears the marker there)
// or the model is actively invoking /compact/clear itself via SlashCommand
// (allowed through so it can actually execute). Fails open (exits 0) if the
// marker can't be read, or if craftsman is disabled — never bricks a session.
import fs from "node:fs";
import { loadConfig, enabled, projectContext, readStdin, compactRequiredFile, sidOf } from "./lib/core.mjs";

let input = {};
try { input = JSON.parse(await readStdin() || "{}"); } catch { process.exit(0); }
const context = projectContext(input.project || ".");
const cfg = loadConfig(context);
if (!enabled(cfg, context)) process.exit(0);

const marker = compactRequiredFile(sidOf(input), context);
if (!fs.existsSync(marker)) process.exit(0);

const tool = input.tool_name || "";
if (tool === "SlashCommand") {
  const cmd = typeof input?.tool_input?.command === "string" ? input.tool_input.command : "";
  if (/^\/(compact|clear)\b/.test(cmd.trim())) process.exit(0);
}

process.stderr.write(
  "craftsman: BLOCKED — a hand-off was written and /compact (or /clear) is required before any " +
  "other tool use continues. Run /compact now; every other tool call stays blocked until you do.\n"
);
process.exit(2);
