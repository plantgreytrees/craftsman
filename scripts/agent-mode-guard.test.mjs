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
