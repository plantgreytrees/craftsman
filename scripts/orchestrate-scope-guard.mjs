#!/usr/bin/env node
// PostToolUse (SlashCommand|Skill) and UserPromptSubmit: the moment
// /orchestrate, /auto or /scrutinise (bare or craftsman:-namespaced) is invoked — by
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
// /idea: grant exactly one isolated `craftsman:idea-critic` dispatch.
// /architect --deep: grant exactly one isolated `craftsman:architect-analyst`.
//
// /orchestrate and /scrutinise: adopt the plan's acceptance criteria (see the
// bottom of this file).
import fs from "node:fs";
import path from "node:path";
import { loadConfig, enabled, projectContext, readStdin, sidOf, sessionDir, acceptancePath, recordAcceptanceOwnership, grantAgent, grantRunnerDispatches, RUNNER_DISPATCHES_PER_UNIT } from "./lib/core.mjs";
import { requiredFile } from "./scope.mjs";

// Units in the invoked plan (its header's `- id:` steps); 1 when the slug
// names no plan yet — /auto's Phase A may still be writing it.
function planUnitCount(args, context) {
  const slug = (args.trim().split(/\s+/).find((a) => !a.startsWith("-")) || "")
    .replace(/^docs\/plans\//, "").replace(/\.md$/, "");
  if (!/^[A-Za-z0-9._-]+$/.test(slug)) return 1;
  try {
    const plan = fs.readFileSync(path.join(context.root, "docs", "plans", `${slug}.md`), "utf8");
    return Math.max(1, (plan.match(/^\s+- id: /gm) || []).length);
  } catch { return 1; }
}

let input = {};
try { input = JSON.parse(await readStdin() || "{}"); } catch { process.exit(0); }
// Three payload shapes, one meaning: SlashCommand carries tool_input.command,
// Skill carries tool_input.skill (the model's usual route to a plugin
// command), UserPromptSubmit carries the raw prompt. Every write below is
// idempotent, so a user-typed command that also produces a tool call simply
// arms it twice.
const toolInput = input?.tool_input || {};
const command = typeof toolInput.command === "string" ? toolInput.command
  : typeof toolInput.skill === "string"
    ? `/${toolInput.skill.replace(/^\//, "")} ${typeof toolInput.args === "string" ? toolInput.args : ""}`
  : typeof input?.prompt === "string" ? input.prompt
  : "";
// Anchored deliberately: this must match an *invocation*, never a mention.
// compact-nudge.mjs matched /orchestrate-style names anywhere in a command's
// text and hard-locked sessions that had merely talked about the script.
const invocation = /^\/(?:craftsman:)?(orchestrate|auto|scrutinise|idea|architect)(?=\s|$)(.*)/s.exec(command.trim());
const invoked = invocation?.[1];
if (!invoked) process.exit(0);
const args = invocation[2] || "";

const context = projectContext(input.project || ".");
const cfg = loadConfig(context);
if (!enabled(cfg, context)) process.exit(0);

// /auto executes a plan exactly as /orchestrate does (ARCH-AUTO-06).
if (invoked === "orchestrate" || invoked === "auto") {
  // Use scope.mjs's own path function directly — this must land at EXACTLY
  // the path pre-guard.mjs's requiredFile(input) reads, and duplicating that
  // path computation by hand would risk drifting apart from it silently.
  const file = requiredFile(input);
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, new Date().toISOString() + "\n");
  } catch { /* best-effort — falls back to /orchestrate's own prose-driven require call */ }
}

// /auto's marker: pre-guard.mjs blocks destructive git while it exists
// (ARCH-LAND-05). Root session dir, same (sid) input on both sides (STATE-02).
if (invoked === "auto") {
  try {
    const dir = sessionDir(sidOf(input));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "auto-active"), new Date().toISOString() + "\n");
  } catch { /* best-effort — the guard simply stays unarmed */ }
}

// /auto grants its per-unit runner dispatches (ARCH-AUTO-06): on /auto
// itself, and on the /orchestrate its unattended /goal starts with (the
// auto-active marker says this session belongs to an /auto run). Sized from
// the plan's units; a fresh invocation re-arms, never accumulates.
if (invoked === "auto" || (invoked === "orchestrate" && fs.existsSync(path.join(sessionDir(sidOf(input)), "auto-active")))) {
  grantRunnerDispatches(planUnitCount(args, context) * RUNNER_DISPATCHES_PER_UNIT, sidOf(input), context);
}

// /scrutinise: grant its one isolated reviewer dispatch (agent-mode-guard.mjs
// spends it). Re-arming on a repeat invocation is intended — each run of
// /scrutinise gets its own single fresh-context reviewer, never more.
if (invoked === "scrutinise") grantAgent("scrutineer", sidOf(input), context);

// /idea always gets its one adversarial critic; /architect only under --deep,
// where the decision analysis moves to a Fable-pinned fresh context. Neither
// takes acceptance ownership — they plan nothing and execute nothing.
if (invoked === "idea") grantAgent("idea-critic", sidOf(input), context);
if (invoked === "architect" && /(?:^|\s)--deep(?=\s|$)/.test(args)) grantAgent("architect-analyst", sidOf(input), context);
if (invoked === "idea" || invoked === "architect") process.exit(0);

// Adopt the plan's acceptance criteria. /plan writes acceptance.md, so only
// the PLANNING session ever owned it — the session that actually executes the
// plan (a later one, or after /clear) never did, and the Stop gate's
// acceptance check stayed silent for the whole run. /orchestrate ("I am
// executing this plan") and /scrutinise ("I am verifying it") are the two
// explicit signals (with /auto, which runs /orchestrate's loop), so ownership
// moves to whichever session runs them.
if (fs.existsSync(acceptancePath(context))) {
  try { recordAcceptanceOwnership(sidOf(input), context); } catch { /* best-effort */ }
}
process.exit(0);
