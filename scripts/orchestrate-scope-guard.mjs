#!/usr/bin/env node
// PostToolUse (SlashCommand|Skill) and UserPromptSubmit: the moment
// /orchestrate or /scrutinise (bare or craftsman:-namespaced) is invoked — by
// the model as a tool call, or typed straight into the prompt by the user,
// which never reaches a tool hook at all.
//
// /orchestrate: mechanically flip this session to scope-required, instead of
// depending on the model remembering to call scope.mjs {action:"require"}
// itself (_shared-execution.md Phase B.7). Once required, pre-guard.mjs
// hard-blocks Read/Write/Edit/etc. until a real, validated Git worktree scope
// is activated (scope.mjs's normalizeScope checks the worktree actually
// exists, is a real Git root, and is on a named branch) — so "no worktree,
// no edits" no longer depends on the model remembering to ask for one.
//
// /scrutinise: grant exactly one isolated `craftsman:scrutineer` dispatch.
//
// Both: adopt the plan's acceptance criteria (see the bottom of this file).
import fs from "node:fs";
import path from "node:path";
import { loadConfig, enabled, projectContext, readStdin, sidOf, acceptancePath, recordAcceptanceOwnership, grantScrutineer } from "./lib/core.mjs";
import { requiredFile } from "./scope.mjs";

let input = {};
try { input = JSON.parse(await readStdin() || "{}"); } catch { process.exit(0); }
// Three payload shapes, one meaning: SlashCommand carries tool_input.command,
// Skill carries tool_input.skill (the model's usual route to a plugin
// command), UserPromptSubmit carries the raw prompt. Every write below is
// idempotent, so a user-typed command that also produces a tool call simply
// arms it twice.
const toolInput = input?.tool_input || {};
const command = typeof toolInput.command === "string" ? toolInput.command
  : typeof toolInput.skill === "string" ? `/${toolInput.skill.replace(/^\//, "")}`
  : typeof input?.prompt === "string" ? input.prompt
  : "";
// Anchored deliberately: this must match an *invocation*, never a mention.
// compact-nudge.mjs matched /orchestrate-style names anywhere in a command's
// text and hard-locked sessions that had merely talked about the script.
const invoked = /^\/(?:craftsman:)?(orchestrate|scrutinise)(?=\s|$)/.exec(command.trim())?.[1];
if (!invoked) process.exit(0);

const context = projectContext(input.project || ".");
const cfg = loadConfig(context);
if (!enabled(cfg, context)) process.exit(0);

if (invoked === "orchestrate") {
  // Use scope.mjs's own path function directly — this must land at EXACTLY
  // the path pre-guard.mjs's requiredFile(input) reads, and duplicating that
  // path computation by hand would risk drifting apart from it silently.
  const file = requiredFile(input);
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, new Date().toISOString() + "\n");
  } catch { /* best-effort — falls back to /orchestrate's own prose-driven require call */ }
}

// /scrutinise: grant its one isolated reviewer dispatch (agent-mode-guard.mjs
// spends it). Re-arming on a repeat invocation is intended — each run of
// /scrutinise gets its own single fresh-context reviewer, never more.
if (invoked === "scrutinise") grantScrutineer(sidOf(input), context);

// Adopt the plan's acceptance criteria. /plan writes acceptance.md, so only
// the PLANNING session ever owned it — the session that actually executes the
// plan (a later one, or after /clear) never did, and the Stop gate's
// acceptance check stayed silent for the whole run. /orchestrate ("I am
// executing this plan") and /scrutinise ("I am verifying it") are the two
// explicit signals, so ownership moves to whichever session runs them.
if (fs.existsSync(acceptancePath(context))) {
  try { recordAcceptanceOwnership(sidOf(input), context); } catch { /* best-effort */ }
}
process.exit(0);
