// End-to-end: the "all acceptance criteria met → update the tracker" trigger,
// driven through the real hooks as the harness spawns them.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPTS = path.dirname(fileURLToPath(import.meta.url));

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-ac-trigger-"));
  const git = (...args) => spawnSync("git", args, { cwd: dir, encoding: "utf8" });
  git("init", "-q");
  git("-c", "user.email=t@e", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "init");
  fs.writeFileSync(path.join(dir, "craftsman.config.json"), JSON.stringify({ security: { enabled: false } }));
  const state = path.join(dir, ".craftsman");
  fs.mkdirSync(path.join(state, "tracker"), { recursive: true });
  const key = ".::docs/plans/p.md::unit-1";
  const base = { key, project: ".", plan: "docs/plans/p.md", unit: "unit-1", session_id: "exec" };
  fs.writeFileSync(path.join(state, "tracker", "events.jsonl"), [
    { ...base, status: "PENDING" },
    { ...base, status: "IN_PROGRESS", evidence: "claimed" },
    { ...base, status: "MERGED", evidence: "abc123" },
  ].map((e) => JSON.stringify(e)).join("\n") + "\n");
  fs.writeFileSync(path.join(state, "acceptance.md"), "- [x] [unit:unit-1] works\n- [ ] whole-plan check\n");
  return dir;
}

function runHook(dir, script, input) {
  return spawnSync(process.execPath, [path.join(SCRIPTS, script)], {
    cwd: dir, input: JSON.stringify(input), encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
  });
}

function latestStatus(dir) {
  const events = fs.readFileSync(path.join(dir, ".craftsman", "tracker", "events.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  return events.at(-1).status;
}

function tickAll(dir) {
  const acPath = path.join(dir, ".craftsman", "acceptance.md");
  fs.writeFileSync(acPath, fs.readFileSync(acPath, "utf8").replaceAll("- [ ]", "- [x]"));
  return acPath;
}

test("acceptance trigger: an Edit that ticks the last criterion moves the tracker and tells the model", () => {
  const dir = fixture();
  try {
    const acPath = tickAll(dir);
    const result = runHook(dir, "quality-gate.mjs", { session_id: "scrutiniser", tool_name: "Edit", tool_input: { file_path: acPath } });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(latestStatus(dir), "COMPLETE");
    const context = JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
    assert.match(context, /docs\/plans\/p\.md#unit-1 MERGED → COMPLETE/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("acceptance trigger: criteria ticked outside Edit/Write are picked up at Stop", () => {
  const dir = fixture();
  try {
    tickAll(dir);
    const result = runHook(dir, "stop-gate.mjs", { session_id: "exec" });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(latestStatus(dir), "COMPLETE");
    assert.doesNotMatch(result.stdout, /"decision":"block"/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("acceptance trigger: nothing moves while a whole-plan criterion is still open", () => {
  const dir = fixture();
  try {
    const result = runHook(dir, "quality-gate.mjs", { session_id: "exec", tool_name: "Edit", tool_input: { file_path: path.join(dir, ".craftsman", "acceptance.md") } });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(latestStatus(dir), "MERGED");
    assert.equal(result.stdout, "");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
