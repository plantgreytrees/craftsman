import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const GUARD = path.join(ROOT, "agent-mode-guard.mjs");

function run(dir, input) {
  return spawnSync(process.execPath, [GUARD], {
    cwd: dir,
    input: JSON.stringify(input),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
  });
}

function tmpProject() {
  // A git root: a non-git CLAUDE_PROJECT_DIR is "above a repo" and leaves craftsman off.
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-agent-mode-")));
  spawnSync("git", ["init", "-q"], { cwd: dir });
  return dir;
}

test("agent-mode-guard: blocks Task delegation under default root-only mode", () => {
  const dir = tmpProject();
  try {
    const result = run(dir, { session_id: "s1", tool_name: "Task", tool_input: { subagent_type: "code-reviewer" } });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /root-only/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("agent-mode-guard: the plan-strategist decomposition exception passes even under root-only", () => {
  const dir = tmpProject();
  try {
    const result = run(dir, { session_id: "s1", tool_name: "Task", tool_input: { subagent_type: "plan-strategist" } });
    assert.equal(result.status, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("agent-mode-guard: the namespaced craftsman:plan-strategist type (as registered by the plugin) passes under root-only", () => {
  const dir = tmpProject();
  try {
    const result = run(dir, { session_id: "s1", tool_name: "Task", tool_input: { subagent_type: "craftsman:plan-strategist" } });
    assert.equal(result.status, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("agent-mode-guard: other namespaced craftsman agents are still blocked under root-only", () => {
  const dir = tmpProject();
  try {
    const result = run(dir, { session_id: "s1", tool_name: "Task", tool_input: { subagent_type: "craftsman:code-reviewer" } });
    assert.equal(result.status, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("agent-mode-guard: execution.agentMode:'subagents' restores real delegation", () => {
  const dir = tmpProject();
  try {
    fs.writeFileSync(
      path.join(dir, "craftsman.config.json"),
      JSON.stringify({ execution: { agentMode: "subagents" } }) + "\n"
    );
    const result = run(dir, { session_id: "s1", tool_name: "Task", tool_input: { subagent_type: "code-reviewer" } });
    assert.equal(result.status, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function invokeScrutinise(dir, sid, payload = { tool_name: "Skill", tool_input: { skill: "craftsman:scrutinise" } }) {
  return spawnSync(process.execPath, [path.join(ROOT, "orchestrate-scope-guard.mjs")], {
    cwd: dir,
    input: JSON.stringify({ session_id: sid, ...payload }),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
  });
}

test("agent-mode-guard: scrutineer is blocked under root-only when /scrutinise was never invoked", () => {
  const dir = tmpProject();
  try {
    const result = run(dir, { session_id: "s1", tool_name: "Agent", tool_input: { subagent_type: "craftsman:scrutineer" } });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /no unspent grant/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("agent-mode-guard: one /scrutinise invocation grants exactly one scrutineer dispatch", () => {
  const dir = tmpProject();
  try {
    assert.equal(invokeScrutinise(dir, "s1").status, 0);
    const first = run(dir, { session_id: "s1", tool_name: "Agent", tool_input: { subagent_type: "craftsman:scrutineer" } });
    assert.equal(first.status, 0);
    const second = run(dir, { session_id: "s1", tool_name: "Agent", tool_input: { subagent_type: "scrutineer" } });
    assert.equal(second.status, 2);
    // A fresh invocation re-arms it — one reviewer per run, not one per session.
    assert.equal(invokeScrutinise(dir, "s1", { prompt: "/scrutinise src/ --deep run-1" }).status, 0);
    const third = run(dir, { session_id: "s1", tool_name: "Agent", tool_input: { subagent_type: "craftsman:scrutineer" } });
    assert.equal(third.status, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("agent-mode-guard: a scrutineer grant is per-session and never unlocks other agents", () => {
  const dir = tmpProject();
  try {
    invokeScrutinise(dir, "s1");
    const otherSession = run(dir, { session_id: "s2", tool_name: "Agent", tool_input: { subagent_type: "craftsman:scrutineer" } });
    assert.equal(otherSession.status, 2);
    const otherAgent = run(dir, { session_id: "s1", tool_name: "Agent", tool_input: { subagent_type: "craftsman:code-reviewer" } });
    assert.equal(otherAgent.status, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("agent-mode-guard: /orchestrate does not grant a scrutineer", () => {
  const dir = tmpProject();
  try {
    invokeScrutinise(dir, "s1", { prompt: "/orchestrate my-plan" });
    const result = run(dir, { session_id: "s1", tool_name: "Agent", tool_input: { subagent_type: "craftsman:scrutineer" } });
    assert.equal(result.status, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("agent-mode-guard: one /idea invocation grants exactly one idea-critic, and nothing else", () => {
  const dir = tmpProject();
  try {
    const dispatch = (subagent_type) => run(dir, { session_id: "s1", tool_name: "Agent", tool_input: { subagent_type } });
    assert.equal(dispatch("craftsman:idea-critic").status, 2, "no grant before /idea is invoked");
    assert.equal(invokeScrutinise(dir, "s1", { prompt: "/idea cache the tracker in sqlite" }).status, 0);
    assert.equal(dispatch("craftsman:scrutineer").status, 2, "an idea grant never unlocks the scrutineer");
    assert.equal(dispatch("craftsman:idea-critic").status, 0);
    const second = dispatch("idea-critic");
    assert.equal(second.status, 2);
    assert.match(second.stderr, /Each \/idea invocation grants exactly ONE isolated idea-critic/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("agent-mode-guard: /architect grants its analyst only under --deep, by prompt or by Skill args", () => {
  const dir = tmpProject();
  try {
    const dispatch = () => run(dir, { session_id: "s1", tool_name: "Agent", tool_input: { subagent_type: "craftsman:architect-analyst" } });
    invokeScrutinise(dir, "s1", { prompt: "/architect sqlite-tracker" });
    assert.equal(dispatch().status, 2, "plain /architect runs root-only");
    invokeScrutinise(dir, "s1", { prompt: "/architect --deep-dive is not the flag" });
    assert.equal(dispatch().status, 2);
    invokeScrutinise(dir, "s1", { prompt: "/craftsman:architect sqlite-tracker --deep" });
    assert.equal(dispatch().status, 0);
    assert.equal(dispatch().status, 2, "spent on use");
    invokeScrutinise(dir, "s1", { tool_name: "Skill", tool_input: { skill: "craftsman:architect", args: "--deep sqlite-tracker" } });
    assert.equal(dispatch().status, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("agent-mode-guard: a prompt that merely mentions /idea grants nothing", () => {
  const dir = tmpProject();
  try {
    invokeScrutinise(dir, "s1", { prompt: "what does /idea do?" });
    const result = run(dir, { session_id: "s1", tool_name: "Agent", tool_input: { subagent_type: "craftsman:idea-critic" } });
    assert.equal(result.status, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("agent-mode-guard: the read-only built-in Explore agent passes under root-only by default", () => {
  const dir = tmpProject();
  try {
    const result = run(dir, { session_id: "s1", tool_name: "Agent", tool_input: { subagent_type: "Explore" } });
    assert.equal(result.status, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("agent-mode-guard: built-ins outside execution.builtinAgents, or namespaced as craftsman's, stay blocked", () => {
  const dir = tmpProject();
  try {
    const dispatch = (subagent_type) => run(dir, { session_id: "s1", tool_name: "Agent", tool_input: { subagent_type } });
    assert.equal(dispatch("general-purpose").status, 2, "general-purpose can write — not read-only");
    assert.equal(dispatch("craftsman:Explore").status, 2, "namespacing is not a way past the guard");
    assert.match(dispatch("general-purpose").stderr, /execution\.builtinAgents \(Explore\)/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("agent-mode-guard: execution.builtinAgents: [] turns the built-in allowance off", () => {
  const dir = tmpProject();
  try {
    fs.writeFileSync(
      path.join(dir, "craftsman.config.json"),
      JSON.stringify({ execution: { builtinAgents: [] } }) + "\n"
    );
    const result = run(dir, { session_id: "s1", tool_name: "Agent", tool_input: { subagent_type: "Explore" } });
    assert.equal(result.status, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ARCH-STATE-02: the writer (orchestrate-scope-guard) and the spender
// (agent-mode-guard) find one grant whatever cwd each hook runs in.
function hook(script, cwd, dir, input, extraEnv = {}) {
  return spawnSync(process.execPath, [path.join(ROOT, script)], {
    cwd, input: JSON.stringify(input), encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir, ...extraEnv },
  });
}

test("agent-mode-guard: a grant written from one cwd is spent from another, exactly once", () => {
  const dir = tmpProject();
  const elsewhere = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-elsewhere-")));
  try {
    fs.mkdirSync(path.join(dir, "src", "deep"), { recursive: true });
    spawnSync("git", ["init", "-q"], { cwd: elsewhere });
    assert.equal(hook("orchestrate-scope-guard.mjs", path.join(dir, "src", "deep"), dir, { session_id: "s1", prompt: "/idea new thing" }).status, 0);
    const spend = { session_id: "s1", tool_name: "Agent", tool_input: { subagent_type: "craftsman:idea-critic" } };
    assert.equal(hook("agent-mode-guard.mjs", elsewhere, dir, spend).status, 0);
    assert.equal(hook("agent-mode-guard.mjs", dir, dir, spend).status, 2, "a grant is spent once");
    assert.equal(fs.existsSync(path.join(elsewhere, ".craftsman")), false, "no state lands in the cwd's repo");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(elsewhere, { recursive: true, force: true });
  }
});

test("agent-mode-guard: a sub-project grant lives in the root session dir, keyed by project id", () => {
  const dir = tmpProject();
  try {
    const sub = path.join(dir, "services", "payments");
    fs.mkdirSync(sub, { recursive: true });
    spawnSync("git", ["init", "-q"], { cwd: sub });
    const manifest = path.join(dir, "craftsman.workspace.json");
    fs.writeFileSync(manifest, JSON.stringify({ version: 1, projects: { payments: { root: "services/payments" } } }));
    const env = { CRAFTSMAN_WORKSPACE_MANIFEST: manifest };
    assert.equal(hook("orchestrate-scope-guard.mjs", sub, dir, { session_id: "s1", project: "payments", prompt: "/idea x" }, env).status, 0);
    assert.equal(fs.existsSync(path.join(dir, ".craftsman", "sessions", "s1", "idea-critic-grant@payments")), true);
    assert.equal(fs.existsSync(path.join(sub, ".craftsman", "sessions")), false);
    const spend = { session_id: "s1", project: "payments", tool_name: "Agent", tool_input: { subagent_type: "idea-critic" } };
    assert.equal(hook("agent-mode-guard.mjs", sub, dir, { ...spend, project: undefined }, env).status, 2, "the root project's grant is a different one");
    assert.equal(hook("agent-mode-guard.mjs", dir, dir, spend, env).status, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ARCH-STATE-05: Workflow runs only the plugin's own workflows/ scripts, and
// only while execution.engine is "workflow". A fixture plugin root stands in
// for ${CLAUDE_PLUGIN_ROOT} so the allowed script exists before it ships.
function fixturePlugin() {
  const plugin = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-plugin-")));
  fs.mkdirSync(path.join(plugin, "workflows"));
  fs.copyFileSync(path.join(ROOT, "..", "craftsman.config.json"), path.join(plugin, "craftsman.config.json"));
  fs.writeFileSync(path.join(plugin, "workflows", "run.js"), "export const meta = { name: 'run', description: 'x' }\n");
  fs.writeFileSync(path.join(plugin, "elsewhere.js"), "export const meta = { name: 'x', description: 'x' }\n");
  return plugin;
}

test("agent-mode-guard: hooks.json routes Task|Agent|Workflow to the guard and registers no SubagentStop (ARCH-STATE-05/07)", () => {
  const hooks = JSON.parse(fs.readFileSync(path.join(ROOT, "..", "hooks", "hooks.json"), "utf8")).hooks;
  const entry = hooks.PreToolUse.find((h) => h.hooks.some((c) => c.command.includes("agent-mode-guard.mjs")));
  assert.equal(entry.matcher, "Task|Agent|Workflow");
  assert.equal("SubagentStop" in hooks, false);
});

test("agent-mode-guard: Workflow blocks an inline script and allows workflows/run.js only under engine=workflow", () => {
  const dir = tmpProject();
  const plugin = fixturePlugin();
  try {
    const env = { CLAUDE_PLUGIN_ROOT: plugin };
    const call = (tool_input) => hook("agent-mode-guard.mjs", dir, dir, { session_id: "s1", tool_name: "Workflow", tool_input }, env);
    const runJs = { scriptPath: path.join(plugin, "workflows", "run.js") };

    assert.equal(call(runJs).status, 0, "the plugin default engine is workflow (ARCH-ENGINE-01)");
    for (const engine of ["subagent", "root"]) {
      fs.writeFileSync(path.join(dir, "craftsman.config.json"), JSON.stringify({ execution: { engine } }));
      assert.equal(call(runJs).status, 2, `engine=${engine} blocks even the plugin's workflow`);
    }

    fs.writeFileSync(path.join(dir, "craftsman.config.json"), JSON.stringify({ execution: { engine: "workflow", agentMode: "subagents" } }));
    assert.equal(call(runJs).status, 0);
    assert.equal(call({ name: "craftsman:run" }).status, 0, "the plugin's named workflow");
    assert.equal(call({ ...runJs, resumeFromRunId: "wf_abc123" }).status, 0);
    const inline = call({ script: "export const meta = { name: 'x', description: 'x' }\nawait agent('do anything')" });
    assert.equal(inline.status, 2, "an inline script is blocked even under agentMode=subagents");
    assert.match(inline.stderr, /inline or ad-hoc/);
    assert.equal(call({ ...runJs, script: "await agent('x')" }).status, 2, "a script alongside a plugin path is still ad-hoc");
    assert.equal(call({ scriptPath: path.join(plugin, "elsewhere.js") }).status, 2, "outside workflows/");
    assert.equal(call({ scriptPath: path.join(plugin, "workflows", "..", "elsewhere.js") }).status, 2, "../ out of workflows/");
    assert.equal(call({ name: "../elsewhere" }).status, 2);
    assert.equal(call({ name: "missing" }).status, 2, "a name with no such workflow");
    fs.symlinkSync(path.join(plugin, "elsewhere.js"), path.join(plugin, "workflows", "link.js"));
    assert.equal(call({ name: "link" }).status, 2, "a symlink out of workflows/");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(plugin, { recursive: true, force: true });
  }
});

// ARCH-AUTO-06: /auto grants its per-unit runner dispatches, one per grant,
// spent on use; a session that never ran /auto gets none.
test("agent-mode-guard: an /auto session gets one runner dispatch per grant; a non-/auto session is blocked", () => {
  const dir = tmpProject();
  try {
    fs.mkdirSync(path.join(dir, "docs", "plans"), { recursive: true });
    // The body list is not a unit: only the front matter's `- id:` steps count.
    fs.writeFileSync(path.join(dir, "docs", "plans", "two-units.md"), "---\nsteps:\n  - id: a\n    project: .\n  - id: b\n    project: .\n---\n\n## Notes\n  - id: not-a-unit\n");
    const dispatch = (sid, subagent_type) => run(dir, { session_id: sid, tool_name: "Agent", tool_input: { subagent_type } });

    for (const type of ["craftsman:unit-runner", "craftsman:implementer", "code-reviewer"]) {
      assert.equal(dispatch("plain", type).status, 2, `${type} without /auto`);
    }
    assert.equal(hook("orchestrate-scope-guard.mjs", dir, dir, { session_id: "plain", prompt: "/orchestrate two-units" }).status, 0);
    assert.equal(dispatch("plain", "craftsman:unit-runner").status, 2, "/orchestrate outside an /auto run grants nothing");

    assert.equal(hook("orchestrate-scope-guard.mjs", dir, dir, { session_id: "auto", prompt: "/craftsman:auto two-units" }).status, 0);
    const grant = path.join(dir, ".craftsman", "sessions", "auto", "runner-grant");
    assert.equal(fs.readFileSync(grant, "utf8").trim(), "14", "2 units × 7 dispatches");
    fs.writeFileSync(grant, "1\n");
    assert.equal(dispatch("auto", "craftsman:unit-runner").status, 0, "one grant, one dispatch");
    assert.equal(dispatch("auto", "craftsman:implementer").status, 2, "spent on use");
    assert.equal(dispatch("auto", "craftsman:scrutineer").status, 2, "runner grants never unlock other agents");

    // The /goal's /orchestrate inside the /auto run re-arms it, sized afresh.
    assert.equal(hook("orchestrate-scope-guard.mjs", dir, dir, { session_id: "auto", tool_name: "Skill", tool_input: { skill: "craftsman:orchestrate", args: "two-units" } }).status, 0);
    assert.equal(fs.readFileSync(grant, "utf8").trim(), "14");
    assert.equal(dispatch("plain", "craftsman:unit-runner").status, 2, "another session's grant is not this one's");

    // Once every row of the plan has landed the run is over: a later
    // /orchestrate re-grants nothing and a leftover grant is never spent.
    fs.mkdirSync(path.join(dir, ".craftsman", "tracker"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".craftsman", "tracker", "events.jsonl"), ["a", "b"].flatMap((u) => [
      { key: `.::docs/plans/two-units.md::${u}`, plan: "docs/plans/two-units.md", unit: u, status: "PENDING" },
      { key: `.::docs/plans/two-units.md::${u}`, plan: "docs/plans/two-units.md", unit: u, status: "MERGED", evidence: "x" },
    ]).map((e) => JSON.stringify(e)).join("\n") + "\n");
    fs.writeFileSync(grant, "5\n");
    assert.equal(hook("orchestrate-scope-guard.mjs", dir, dir, { session_id: "auto", prompt: "/orchestrate two-units" }).status, 0);
    assert.equal(fs.readFileSync(grant, "utf8").trim(), "5", "no re-grant after the run");
    assert.equal(dispatch("auto", "craftsman:unit-runner").status, 2, "a leftover grant lapses with its run");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
