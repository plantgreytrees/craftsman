#!/usr/bin/env node
// PostToolUse (SlashCommand) and UserPromptSubmit: the moment /orchestrate (or
// /craftsman:orchestrate) is invoked — by the model as a tool call, or typed
// straight into the prompt by the user, which never reaches SlashCommand at all
// — mechanically flip this session to scope-required, instead of
// depending on the model remembering to call scope.mjs {action:"require"}
// itself (_shared-execution.md Phase B.7). Once required, pre-guard.mjs
// hard-blocks Read/Write/Edit/etc. until a real, validated Git worktree scope
// is activated (scope.mjs's normalizeScope checks the worktree actually
// exists, is a real Git root, and is on a named branch) — so "no worktree,
// no edits" no longer depends on the model remembering to ask for one.
import fs from "node:fs";
import path from "node:path";
import { loadConfig, enabled, projectContext, readStdin } from "./lib/core.mjs";
import { requiredFile } from "./scope.mjs";

let input = {};
try { input = JSON.parse(await readStdin() || "{}"); } catch { process.exit(0); }
// Two payload shapes, one meaning: PostToolUse carries tool_input.command,
// UserPromptSubmit carries the raw prompt. Both are idempotent writes of the
// same marker, so a user-typed /orchestrate that also produces a tool call
// simply arms it twice.
const command = typeof input?.tool_input?.command === "string" ? input.tool_input.command
  : typeof input?.prompt === "string" ? input.prompt
  : "";
// Anchored deliberately: this must match an *invocation*, never a mention.
// compact-nudge.mjs matched /orchestrate-style names anywhere in a command's
// text and hard-locked sessions that had merely talked about the script.
if (!/^\/(craftsman:)?orchestrate\b/.test(command.trim())) process.exit(0);

const context = projectContext(input.project || ".");
const cfg = loadConfig(context);
if (!enabled(cfg, context)) process.exit(0);

// Use scope.mjs's own path function directly — this must land at EXACTLY
// the path pre-guard.mjs's requiredFile(input) reads, and duplicating that
// path computation by hand would risk drifting apart from it silently.
const file = requiredFile(input);
try {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, new Date().toISOString() + "\n");
} catch { /* best-effort — falls back to /orchestrate's own prose-driven require call */ }
process.exit(0);
