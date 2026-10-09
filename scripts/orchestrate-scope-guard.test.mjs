import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { sidOf } from "./lib/core.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const GUARD = path.join(ROOT, "orchestrate-scope-guard.mjs");

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
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-scope-guard-")));
  spawnSync("git", ["init", "-q"], { cwd: dir });
  return dir;
}

// scope.mjs's requiredFile() resolves PROJECT_ROOT from core.mjs at import
// time in *this* process, so it can't track a spawned hook's own
// CLAUDE_PROJECT_DIR — mirror the marker path by hand instead.
function requiredFile(dir, input) {
  return path.join(dir, ".craftsman", "sessions", sidOf(input), "scope-required");
}

test("orchestrate-scope-guard: invoking /orchestrate marks scope required, even if the command forgets to", () => {
  const dir = tmpProject();
  const input = { session_id: "s1", tool_name: "SlashCommand", tool_input: { command: "/orchestrate docs/plans/example.md" } };
  try {
    const result = run(dir, input);
    assert.equal(result.status, 0);
    assert.equal(fs.existsSync(requiredFile(dir, input)), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("orchestrate-scope-guard: the craftsman: namespaced form also marks scope required", () => {
  const dir = tmpProject();
  const input = { session_id: "s1", tool_name: "SlashCommand", tool_input: { command: "/craftsman:orchestrate docs/plans/example.md" } };
  try {
    run(dir, input);
    assert.equal(fs.existsSync(requiredFile(dir, input)), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("orchestrate-scope-guard: a user-typed /orchestrate marks scope required (UserPromptSubmit, no tool call)", () => {
  const dir = tmpProject();
  const input = { session_id: "s1", hook_event_name: "UserPromptSubmit", prompt: "/orchestrate docs/plans/example.md" };
  try {
    const result = run(dir, input);
    assert.equal(result.status, 0);
    assert.equal(fs.existsSync(requiredFile(dir, input)), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("orchestrate-scope-guard: a prompt that merely mentions /orchestrate does not arm the guard", () => {
  const dir = tmpProject();
  const input = { session_id: "s1", hook_event_name: "UserPromptSubmit", prompt: "why did /orchestrate block my edit?" };
  try {
    const result = run(dir, input);
    assert.equal(result.status, 0);
    assert.equal(fs.existsSync(requiredFile(dir, input)), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("orchestrate-scope-guard: an unrelated slash command never touches the scope-required marker", () => {
  const dir = tmpProject();
  const input = { session_id: "s1", tool_name: "SlashCommand", tool_input: { command: "/plan add a feature" } };
  try {
    const result = run(dir, input);
    assert.equal(result.status, 0);
    assert.equal(fs.existsSync(requiredFile(dir, input)), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// /plan writes acceptance.md, so only the planning session ever owned it and
// the executing session's Stop gate never enforced a single criterion.
test("orchestrate-scope-guard: invoking /orchestrate adopts the plan's acceptance criteria for this session", () => {
  const dir = tmpProject();
  const input = { session_id: "executor", prompt: "/orchestrate docs/plans/example.md" };
  try {
    fs.mkdirSync(path.join(dir, ".craftsman"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".craftsman", "acceptance.md"), "- [ ] [unit:u1] it works\n");
    const result = run(dir, input);
    assert.equal(result.status, 0);
    const ref = JSON.parse(fs.readFileSync(path.join(dir, ".craftsman", "sessions", sidOf(input), "acceptance.ref"), "utf8"));
    assert.match(ref.identity, /^[0-9a-f]{40}$/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("orchestrate-scope-guard: /scrutinise adopts the acceptance criteria but never arms scope-required", () => {
  const dir = tmpProject();
  const input = { session_id: "verifier", tool_name: "Skill", tool_input: { skill: "craftsman:scrutinise", args: "docs/plans/example.md" } };
  try {
    fs.mkdirSync(path.join(dir, ".craftsman"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".craftsman", "acceptance.md"), "- [ ] whole-plan criterion\n");
    assert.equal(run(dir, input).status, 0);
    assert.equal(fs.existsSync(path.join(dir, ".craftsman", "sessions", sidOf(input), "acceptance.ref")), true);
    assert.equal(fs.existsSync(requiredFile(dir, input)), false, "scrutinise is review-only — no worktree scope requirement");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("orchestrate-scope-guard: a model invocation through the Skill tool arms /orchestrate too", () => {
  const dir = tmpProject();
  const input = { session_id: "s-skill", tool_name: "Skill", tool_input: { skill: "craftsman:orchestrate", args: "docs/plans/example.md" } };
  try {
    assert.equal(run(dir, input).status, 0);
    assert.equal(fs.existsSync(requiredFile(dir, input)), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("orchestrate-scope-guard: a different command that merely starts with the same name does not adopt", () => {
  const dir = tmpProject();
  const input = { session_id: "s-other", tool_name: "Skill", tool_input: { skill: "craftsman:scrutinise-deep" } };
  try {
    fs.mkdirSync(path.join(dir, ".craftsman"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".craftsman", "acceptance.md"), "- [ ] c\n");
    run(dir, input);
    assert.equal(fs.existsSync(path.join(dir, ".craftsman", "sessions", sidOf(input), "acceptance.ref")), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
