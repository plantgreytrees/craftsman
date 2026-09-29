#!/usr/bin/env node
// PreToolUse (Task): mechanically enforces root-only agent mode instead of
// trusting the model to follow the AGENT MODE prose (session-context.mjs /
// _shared-machinery.md / _shared-analysis.md). Under execution.agentMode !==
// "subagents" (default: root-only), the ONLY Task/Agent call allowed anywhere
// in the plugin is the one named exception — /plan's Phase 0 step 0 delegating
// to plan-strategist. Every other Task call is hard-blocked, regardless of
// what any command's prose says to "delegate" or "dispatch".
import { loadConfig, enabled, projectContext, readStdin, logEvent, sidOf } from "./lib/core.mjs";

let input = {};
try { input = JSON.parse(await readStdin() || "{}"); } catch { process.exit(0); }
const context = projectContext(input.project || ".");
const cfg = loadConfig(context);
if (!enabled(cfg, context)) process.exit(0);

const agentMode = cfg.execution?.agentMode || "root-only";
if (agentMode === "subagents") process.exit(0);

const subagentType = input?.tool_input?.subagent_type || "";
// Plugin agents register namespaced ("craftsman:plan-strategist"); the bare name
// is accepted too so a stale prompt can't turn the exception into a block.
if (subagentType === "craftsman:plan-strategist" || subagentType === "plan-strategist") process.exit(0);

logEvent({ ev: "agent_mode_blocked", sid: sidOf(input), subagent_type: subagentType || null }, context);
process.stderr.write(
  `craftsman: Task/Agent delegation BLOCKED — execution.agentMode is "${agentMode}". ` +
  `Perform this work yourself, in this session, sequentially — do not delegate implementer, ` +
  `specialist, or reviewer roles via Task/Agent, and never run them in parallel. The only standing ` +
  `exception is /plan's decomposition step (subagent_type: "craftsman:plan-strategist"). If you genuinely need ` +
  `parallel subagent delegation, set execution.agentMode to "subagents" in craftsman.config.json first.\n`
);
process.exit(2);
