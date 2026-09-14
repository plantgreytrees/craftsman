// session-context.mjs does a lot at SessionStart, but ONE of its jobs is
// load-bearing in a way nothing else can compensate for: clearing the
// compact-required marker. compact-gate.mjs blocks every tool call while that
// marker exists and nothing inside a session can lift it, so SessionStart is
// the only release path in the whole plugin. If this ever silently stops
// clearing, every session after a hand-off is bricked with no escape — which
// is exactly the failure this suite exists to prevent recurring.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { sidOf } from "./lib/core.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SESSION_CONTEXT = path.join(ROOT, "session-context.mjs");
const GATE = path.join(ROOT, "compact-gate.mjs");
const HANDOFF = path.join(ROOT, "handoff.mjs");

function run(script, dir, input) {
  return spawnSync(process.execPath, [script], {
    cwd: dir,
    input: JSON.stringify(input),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
  });
}

function markerFor(dir, sid) {
  return path.join(dir, ".craftsman", "sessions", sidOf({ session_id: sid }), "compact-required");
}

function withProject(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-session-context-"));
  try { fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test("session-context: SessionStart clears the compact-required marker, releasing the gate", () => {
  withProject((dir) => {
    const sid = "s1";
    const handoff = run(HANDOFF, dir, { session_id: sid, plan: "docs/plan.md", next_action: "next" });
    assert.equal(handoff.status, 0, handoff.stderr);
    assert.equal(fs.existsSync(markerFor(dir, sid)), true, "precondition: gate armed");

    run(SESSION_CONTEXT, dir, { session_id: sid });
    assert.equal(fs.existsSync(markerFor(dir, sid)), false, "SessionStart must clear the marker");

    const after = run(GATE, dir, { session_id: sid, tool_name: "Read", tool_input: { file_path: "x.ts" } });
    assert.equal(after.status, 0, "the gate must be released once SessionStart has run");
  });
});

test("session-context: clearing one session's marker leaves a concurrent session's alone", () => {
  withProject((dir) => {
    for (const sid of ["mine", "theirs"]) {
      run(HANDOFF, dir, { session_id: sid, plan: "docs/plan.md", next_action: "next" });
    }
    run(SESSION_CONTEXT, dir, { session_id: "mine" });

    assert.equal(fs.existsSync(markerFor(dir, "mine")), false);
    assert.equal(fs.existsSync(markerFor(dir, "theirs")), true);
  });
});

test("session-context: a session that never armed the gate starts clean and unblocked", () => {
  withProject((dir) => {
    const result = run(SESSION_CONTEXT, dir, { session_id: "fresh" });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.existsSync(markerFor(dir, "fresh")), false);
  });
});
