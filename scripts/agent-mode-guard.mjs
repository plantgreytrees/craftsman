#!/usr/bin/env node
// PreToolUse (Task|Agent): mechanically enforces root-only agent mode instead
// of trusting the model to follow the AGENT MODE prose (session-context.mjs /
// _shared-machinery.md / _shared-analysis.md). Under execution.agentMode !==
// "subagents" (default: root-only), only the two named exceptions pass:
//   1. /plan's Phase 0 step 0 delegating to plan-strategist;
//   2. /scrutinise's ONE isolated reviewer (scrutineer) — and only against a
//      grant that invoking /scrutinise wrote for this session, spent on use,
//      so each /scrutinise run gets exactly one fresh-context reviewer.
// Every other Task call is hard-blocked, regardless of what any command's
// prose says to "delegate" or "dispatch".
import { loadConfig, enabled, projectContext, readStdin, logEvent, sidOf, spendScrutineerGrant } from "./lib/core.mjs";

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

const sid = sidOf(input);
if (subagentType === "craftsman:scrutineer" || subagentType === "scrutineer") {
  if (spendScrutineerGrant(sid, context)) {
    logEvent({ ev: "scrutineer_dispatched", sid }, context);
    process.exit(0);
  }
  logEvent({ ev: "agent_mode_blocked", sid, subagent_type: subagentType }, context);
  process.stderr.write(
    `craftsman: scrutineer dispatch BLOCKED — no unspent grant for this session. ` +
    `Each /scrutinise invocation grants exactly ONE isolated scrutineer; it was either already ` +
    `used or /scrutinise was never invoked. Re-invoke /scrutinise for a fresh reviewer — do not ` +
    `dispatch a second one in parallel.\n`
  );
  process.exit(2);
}

logEvent({ ev: "agent_mode_blocked", sid, subagent_type: subagentType || null }, context);
process.stderr.write(
  `craftsman: Task/Agent delegation BLOCKED — execution.agentMode is "${agentMode}". ` +
  `Perform this work yourself, in this session, sequentially — do not delegate implementer, ` +
  `specialist, or reviewer roles via Task/Agent, and never run them in parallel. The only standing ` +
  `exceptions are /plan's decomposition step (subagent_type: "craftsman:plan-strategist") and ` +
  `/scrutinise's one isolated reviewer (subagent_type: "craftsman:scrutineer"). If you genuinely need ` +
  `parallel subagent delegation, set execution.agentMode to "subagents" in craftsman.config.json first.\n`
);
process.exit(2);
