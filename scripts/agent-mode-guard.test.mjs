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
  return fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-agent-mode-"));
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
