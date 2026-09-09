import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { sidOf } from "./lib/core.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const NUDGE = path.join(ROOT, "compact-nudge.mjs");
const GATE = path.join(ROOT, "compact-gate.mjs");

function run(script, dir, input) {
  return spawnSync(process.execPath, [script], {
    cwd: dir,
    input: JSON.stringify(input),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
  });
}

function tmpProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-compact-"));
}

// core.mjs's PROJECT_ROOT/STATE_DIR resolve once at import time in *this*
// process, so they can't track a spawned hook's own CLAUDE_PROJECT_DIR —
// mirror the marker path (<project>/.craftsman/sessions/<sid>/compact-required)
// by hand instead of importing compactRequiredFile().
function compactRequiredFile(dir, input) {
  return path.join(dir, ".craftsman", "sessions", sidOf(input), "compact-required");
}

test("compact-nudge + compact-gate: a hand-off run requires /compact before any other tool runs", () => {
  const dir = tmpProject();
  try {
    const sid = "s1";
    const handoffInput = { session_id: sid, tool_name: "Bash", tool_input: { command: `node ${ROOT}/handoff.mjs` } };
    const nudge = run(NUDGE, dir, handoffInput);
    assert.equal(nudge.status, 2);
    assert.equal(fs.existsSync(compactRequiredFile(dir, handoffInput)), true);

    const blocked = run(GATE, dir, { session_id: sid, tool_name: "Read", tool_input: { file_path: "x.ts" } });
    assert.equal(blocked.status, 2);
    assert.match(blocked.stderr, /BLOCKED/);

    const allowedCompact = run(GATE, dir, { session_id: sid, tool_name: "SlashCommand", tool_input: { command: "/compact" } });
    assert.equal(allowedCompact.status, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("compact-nudge: a terminal tracker transition (PARK/BLOCKED) requires /compact even without an explicit hand-off", () => {
  const dir = tmpProject();
  try {
    const sid = "s2";
    const parkInput = {
      session_id: sid,
      tool_name: "Bash",
      tool_input: { command: `printf '%s' '{"action":"transition","status":"PARKED","evidence":"max retries"}' | node ${ROOT}/tracker.mjs` },
    };
    const nudge = run(NUDGE, dir, parkInput);
    assert.equal(nudge.status, 2);
    assert.equal(fs.existsSync(compactRequiredFile(dir, parkInput)), true);

    const blocked = run(GATE, dir, { session_id: sid, tool_name: "Bash", tool_input: { command: "ls" } });
    assert.equal(blocked.status, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("compact-nudge: an unrelated bash command never sets the compact-required marker", () => {
  const dir = tmpProject();
  try {
    const sid = "s3";
    const input = { session_id: sid, tool_name: "Bash", tool_input: { command: "npm test" } };
    const nudge = run(NUDGE, dir, input);
    assert.equal(nudge.status, 0);
    assert.equal(fs.existsSync(compactRequiredFile(dir, input)), false);

    const allowed = run(GATE, dir, { session_id: sid, tool_name: "Read", tool_input: { file_path: "x.ts" } });
    assert.equal(allowed.status, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
