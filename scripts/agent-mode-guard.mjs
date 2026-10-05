#!/usr/bin/env node
// PreToolUse (Task|Agent): mechanically enforces root-only agent mode instead
// of trusting the model to follow the AGENT MODE prose (session-context.mjs /
// _shared-machinery.md / _shared-analysis.md). Under execution.agentMode !==
// "subagents" (default: root-only), only the named exceptions pass:
//   1. /plan's Phase 0 step 0 delegating to plan-strategist;
//   2. one isolated fresh-context agent per invocation of the command that
//      owns it — /scrutinise → scrutineer, /idea → idea-critic,
//      /architect --deep → architect-analyst — and only against a grant that
//      invoking the command wrote for this session, spent on use, so each run
//      gets exactly one, never a second or a parallel one.
//   3. Claude Code's own read-only built-in agents named in
//      execution.builtinAgents (default ["Explore"]) — read-only by design
//      (no Edit/Write/NotebookEdit; Explore does have Bash, whose calls still
//      pass craftsman's PreToolUse guards), so they can't take over the
//      implementer/specialist/reviewer work root-only mode keeps here.
//      docs/builtins.md records the verified tool set per Claude Code version.
// Every other Task call is hard-blocked, regardless of what any command's
// prose says to "delegate" or "dispatch".
import { loadConfig, enabled, projectContext, readStdin, logEvent, sidOf, spendAgentGrant, GRANTED_AGENTS } from "./lib/core.mjs";

const GRANTING_COMMAND = {
  scrutineer: "/scrutinise",
  "idea-critic": "/idea",
  "architect-analyst": "/architect --deep",
};

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
const agent = subagentType.replace(/^craftsman:/, "");
if (agent === "plan-strategist") process.exit(0);

// Matched against the raw type: a built-in is never plugin-namespaced, so
// "craftsman:Explore" is not a way past the guard.
const builtinAgents = Array.isArray(cfg.execution?.builtinAgents) ? cfg.execution.builtinAgents : ["Explore"];
if (subagentType && builtinAgents.includes(subagentType)) process.exit(0);

const sid = sidOf(input);
if (GRANTED_AGENTS.includes(agent)) {
  if (spendAgentGrant(agent, sid, context)) {
    logEvent({ ev: `${agent}_dispatched`, sid }, context);
    process.exit(0);
  }
  const command = GRANTING_COMMAND[agent];
  logEvent({ ev: "agent_mode_blocked", sid, subagent_type: subagentType }, context);
  process.stderr.write(
    `craftsman: ${agent} dispatch BLOCKED — no unspent grant for this session. ` +
    `Each ${command} invocation grants exactly ONE isolated ${agent}; it was either already ` +
    `used or ${command} was never invoked. Re-invoke ${command} for a fresh one — do not ` +
    `dispatch a second one in parallel.\n`
  );
  process.exit(2);
}

logEvent({ ev: "agent_mode_blocked", sid, subagent_type: subagentType || null }, context);
process.stderr.write(
  `craftsman: Task/Agent delegation BLOCKED — execution.agentMode is "${agentMode}". ` +
  `Perform this work yourself, in this session, sequentially — do not delegate implementer, ` +
  `specialist, or reviewer roles via Task/Agent, and never run them in parallel. The only standing ` +
  `exceptions are /plan's decomposition step (subagent_type: "craftsman:plan-strategist") and the ` +
  `one isolated agent each of /scrutinise ("craftsman:scrutineer"), /idea ("craftsman:idea-critic") ` +
  `and /architect --deep ("craftsman:architect-analyst") is granted, plus the read-only built-in ` +
  `agents in execution.builtinAgents (${(builtinAgents.join(", ") || "none")}). If you genuinely need ` +
  `parallel subagent delegation, set execution.agentMode to "subagents" in craftsman.config.json first.\n`
);
process.exit(2);
