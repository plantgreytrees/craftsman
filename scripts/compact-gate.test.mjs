// The hand-off → /compact gate, end to end.
//
// The marker used to be written by a PostToolUse(Bash) hook that regex-matched
// the *text* of the command, so `cat handoff.mjs` or `grep -n tracker.mjs`
// armed the gate and hard-locked a session that had closed nothing out —
// including, three times over, the sessions trying to fix it. The marker is
// now written by the scripts that own the event. The last test here is the
// regression guard: merely naming those scripts must never arm anything.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { sidOf } from "./lib/core.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const GATE = path.join(ROOT, "compact-gate.mjs");
const HANDOFF = path.join(ROOT, "handoff.mjs");
const TRACKER = path.join(ROOT, "tracker.mjs");

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
// process, so they can't track a spawned script's own CLAUDE_PROJECT_DIR —
// mirror the marker path (<project>/.craftsman/sessions/<sid>/compact-required)
// by hand instead of importing compactRequiredFile().
function compactRequiredFile(dir, input) {
  return path.join(dir, ".craftsman", "sessions", sidOf(input), "compact-required");
}

function withProject(fn) {
  const dir = tmpProject();
  try { fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test("handoff + gate: writing a hand-off requires /compact before any other tool runs", () => {
  withProject((dir) => {
    const sid = "s1";
    const handoff = run(HANDOFF, dir, {
      session_id: sid, plan: "docs/plan.md", unit: "u1", next_action: "start u2",
    });
    assert.equal(handoff.status, 0, handoff.stderr);
    assert.match(handoff.stdout, /compact \(or \/clear\) is now REQUIRED/);
    assert.equal(fs.existsSync(compactRequiredFile(dir, { session_id: sid })), true);

    const blocked = run(GATE, dir, { session_id: sid, tool_name: "Read", tool_input: { file_path: "x.ts" } });
    assert.equal(blocked.status, 2);
    assert.match(blocked.stderr, /BLOCKED/);

    // The model has to be able to actually run the command the gate demands.
    const allowed = run(GATE, dir, { session_id: sid, tool_name: "SlashCommand", tool_input: { command: "/compact" } });
    assert.equal(allowed.status, 0);
  });
});

test("handoff: the gate is armed for the session that wrote the hand-off, not another one", () => {
  withProject((dir) => {
    const handoff = run(HANDOFF, dir, {
      session_id: "mine", plan: "docs/plan.md", next_action: "next",
    });
    assert.equal(handoff.status, 0, handoff.stderr);

    const other = run(GATE, dir, { session_id: "someone-else", tool_name: "Read", tool_input: { file_path: "x.ts" } });
    assert.equal(other.status, 0);
  });
});

test("handoff: a payload with no session_id says so, rather than silently arming nothing", () => {
  withProject((dir) => {
    const handoff = run(HANDOFF, dir, { plan: "docs/plan.md", next_action: "next" });
    assert.equal(handoff.status, 0, handoff.stderr);
    assert.match(handoff.stdout, /WARNING — no session_id/);
  });
});

test("tracker: a terminal transition (PARKED) requires /compact even without an explicit hand-off", () => {
  withProject((dir) => {
    const sid = "s2";
    const parked = run(TRACKER, dir, {
      action: "transition", session_id: sid,
      plan: "docs/plan.md", unit: "u1", status: "PARKED", evidence: "max retries",
    });
    assert.equal(parked.status, 0, parked.stderr);
    assert.match(parked.stdout, /compact \(or \/clear\) is now REQUIRED/);
    assert.equal(fs.existsSync(compactRequiredFile(dir, { session_id: sid })), true);

    const blocked = run(GATE, dir, { session_id: sid, tool_name: "Bash", tool_input: { command: "ls" } });
    assert.equal(blocked.status, 2);
  });
});

test("tracker: a non-terminal transition closes nothing out and leaves the gate disarmed", () => {
  withProject((dir) => {
    const sid = "s3";
    const started = run(TRACKER, dir, {
      action: "transition", session_id: sid, plan: "docs/plan.md", unit: "u1", status: "IN_PROGRESS",
    });
    assert.equal(started.status, 0, started.stderr);
    assert.doesNotMatch(started.stdout, /REQUIRED/);
    assert.equal(fs.existsSync(compactRequiredFile(dir, { session_id: sid })), false);

    const allowed = run(GATE, dir, { session_id: sid, tool_name: "Read", tool_input: { file_path: "x.ts" } });
    assert.equal(allowed.status, 0);
  });
});

// The regression guard for the bug this file exists because of.
test("gate: merely naming the close-out scripts in a command never arms the gate", () => {
  withProject((dir) => {
    const sid = "s4";
    for (const command of [
      `cat ${ROOT}/handoff.mjs`,
      `grep -n "status" ${ROOT}/tracker.mjs`,
      `node --test ${ROOT}/tracker.test.mjs`,
      `echo '{"status":"PARKED"}' # tracker.mjs sample payload`,
    ]) {
      const gate = run(GATE, dir, { session_id: sid, tool_name: "Bash", tool_input: { command } });
      assert.equal(gate.status, 0, `naming a close-out script armed the gate: ${command}`);
      assert.equal(fs.existsSync(compactRequiredFile(dir, { session_id: sid })), false);
    }
  });
});
