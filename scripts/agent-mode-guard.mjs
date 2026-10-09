#!/usr/bin/env node
// PreToolUse (Task|Agent|Workflow): mechanically enforces root-only agent mode instead
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
//   4. /auto's per-unit runners (unit-runner, implementer, code-reviewer),
//      each spending one dispatch of the counted grant /auto wrote
//      (ARCH-AUTO-06).
// Every other Task call is hard-blocked, regardless of what any command's
// prose says to "delegate" or "dispatch".
//
// Workflow (ARCH-STATE-05): a workflow spawns agents the Task matcher never
// sees, so it is gated whatever agentMode says — allowed only for the
// plugin's own workflows/ scripts, and only while execution.engine is
// "workflow". An inline or ad-hoc script is always blocked.
import fs from "node:fs";
import path from "node:path";
import { loadConfig, enabled, projectContext, readStdin, logEvent, sidOf, spendAgentGrant, GRANTED_AGENTS, PLUGIN_ROOT, RUNNER_AGENTS, spendRunnerDispatch, autoActive } from "./lib/core.mjs";

// The plugin workflow a Workflow call runs (path relative to the plugin), or
// null for anything else: an inline script, a path outside workflows/, or a
// name with no such file. Real paths, so a symlink or ../ can't step outside.
function pluginWorkflow(toolInput) {
  if (typeof toolInput.script === "string" && toolInput.script.trim()) return null;
  let file = null;
  if (typeof toolInput.scriptPath === "string" && toolInput.scriptPath) file = toolInput.scriptPath;
  else if (typeof toolInput.name === "string" && /^(?:craftsman:)?[A-Za-z0-9_-]+$/.test(toolInput.name)) {
    file = path.join(PLUGIN_ROOT, "workflows", `${toolInput.name.replace(/^craftsman:/, "")}.js`);
  }
  if (!file) return null;
  try {
    const dir = fs.realpathSync(path.join(PLUGIN_ROOT, "workflows"));
    const real = fs.realpathSync(file);
    return path.dirname(real) === dir && real.endsWith(".js") ? path.relative(fs.realpathSync(PLUGIN_ROOT), real) : null;
  } catch { return null; }
}

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

if (input?.tool_name === "Workflow") {
  const workflow = pluginWorkflow(input.tool_input || {});
  const engine = cfg.execution?.engine;
  if (workflow && engine === "workflow") process.exit(0);
  logEvent({ ev: "workflow_blocked", sid: sidOf(input), engine: engine || null, workflow }, context);
  process.stderr.write(
    "craftsman: Workflow BLOCKED — " + (workflow
      ? `execution.engine is "${engine || "unset"}", not "workflow"; run units with the configured engine.\n`
      : `only the plugin's own workflows (${path.join(PLUGIN_ROOT, "workflows")}/*.js, by scriptPath or name) ` +
        "may run, never an inline or ad-hoc script.\n")
  );
  process.exit(2);
}

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
// A leftover runner grant lapses with its /auto run (ARCH-AUTO-06).
if (RUNNER_AGENTS.includes(agent) && autoActive(sid, context) && spendRunnerDispatch(sid, context)) {
  logEvent({ ev: "runner_dispatched", sid, subagent_type: subagentType }, context);
  process.exit(0);
}
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
