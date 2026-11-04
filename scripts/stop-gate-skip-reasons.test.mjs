// ARCH-STATE-22: a dirty Stop that queues no test says why (`stop-tests-skipped` with a reason), the clean path
// still says `clean`, and the `stop` / `stop-tests-skipped` events name the project they ran for.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const STOP_GATE_PATH = fileURLToPath(new URL("./stop-gate.mjs", import.meta.url));

function makeFixture(stopGate = {}, files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stop-gate-skip-"));
  for (const a of [["init", "-q"], ["config", "user.email", "t@e.com"], ["config", "user.name", "t"], ["config", "commit.gpgsign", "false"]])
    spawnSync("git", a, { cwd: dir });
  fs.writeFileSync(path.join(dir, "README.md"), "fixture\n");
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  }
  spawnSync("git", ["add", "-A"], { cwd: dir });
  spawnSync("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  fs.writeFileSync(path.join(dir, "craftsman.config.json"), JSON.stringify({
    security: { enabled: false },
    stopGate: { requireAcceptanceCriteria: false, ...stopGate },
  }));
  return dir;
}

// A session's state at `root`: an optional dirty marker and an optional seeded session-start.json.
function seed(root, sid, { dirty = false, start } = {}) {
  const sessions = path.join(root, ".craftsman", "sessions", sid);
  fs.mkdirSync(sessions, { recursive: true });
  if (dirty) fs.writeFileSync(path.join(sessions, "dirty"), String(Date.now()));
  if (start !== undefined) fs.writeFileSync(path.join(sessions, "session-start.json"), JSON.stringify(start));
}

// Runs the real hook from `cwd`; the events come back from the root's log, whichever project the Stop was scoped to.
function runStop(cwd, sid) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [STOP_GATE_PATH], { cwd });
    let stdout = "";
    child.stdout.on("data", (c) => (stdout += c));
    child.on("error", reject);
    child.on("close", () => {
      let events = [];
      try {
        events = fs.readFileSync(path.join(cwd, ".craftsman", "events.jsonl"), "utf8").split("\n").filter(Boolean)
          .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter((e) => e && e.sid === sid);
      } catch { /* no event log */ }
      resolve({ stdout, events });
    });
    child.stdin.end(JSON.stringify({ session_id: sid }));
  });
}

const skipped = (events) => events.filter((e) => e.ev === "stop-tests-skipped");

// The reason table: what the session's state is -> the one reason the Stop logs.
const REASONS = [
  ["no-command", { dirty: true, start: { results: [] } }, "the snapshot ran and found no test command"],
  ["red-at-start", { dirty: true, start: { results: [{ cmd: "node -e 0", green: false }, { cmd: "node -e 1", green: false }] } }, "every command was already red"],
  ["red-at-start", { dirty: true, start: { cmd: "node -e 0", testsGreenAtStart: false } }, "the legacy single-command snapshot was red"],
  ["clean", { start: { results: [{ cmd: "node -e 0", green: true }] } }, "nothing was edited since the snapshot"],
  ["clean", {}, "nothing was edited and there is no snapshot"],
];

for (const [reason, state, why] of REASONS) {
  test(`stop-gate: ${why} -> exactly one stop-tests-skipped with reason ${reason} (ARCH-STATE-22)`, async () => {
    const dir = makeFixture();
    try {
      seed(dir, "skip", state);
      const { events } = await runStop(dir, "skip");
      const logged = skipped(events);
      assert.equal(logged.length, 1, "one skip event per Stop");
      assert.equal(logged[0].reason, reason);
      assert.equal(logged[0].project, ".");
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
}

// No session-start.json: Stop reads whether SessionStart started a snapshot (the snapshot-started marker session-context.mjs
// writes where it spawns snapshot.mjs), never config (ARCH-STATE-22). Marker present: the snapshot has not produced a result
// (still running, or dropped because files changed while it ran) -> snapshot-pending. Marker absent: none was started -> no-command.
const PKG = { "package.json": "{}\n" };
const SESSION_CONTEXT_PATH = fileURLToPath(new URL("./session-context.mjs", import.meta.url));

// SessionStart for real. Every case that uses it spawns no snapshot, so no detached process races the Stop that follows.
function sessionStart(dir, sid) {
  const r = spawnSync(process.execPath, [SESSION_CONTEXT_PATH], {
    cwd: dir, input: JSON.stringify({ session_id: sid }), encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
  });
  assert.equal(r.status, 0, r.stderr);
}

// The marker file as session-context.mjs writes it where it spawns the snapshot.
function markStarted(dir, sid) {
  const sessions = path.join(dir, ".craftsman", "sessions", sid);
  fs.mkdirSync(sessions, { recursive: true });
  fs.writeFileSync(path.join(sessions, "snapshot-started"), String(Date.now()));
}

const addPackageJson = (dir) => {
  fs.writeFileSync(path.join(dir, "package.json"), "{}\n");
  spawnSync("git", ["add", "-A"], { cwd: dir });
  spawnSync("git", ["commit", "-q", "-m", "package.json"], { cwd: dir });
};

const NODE_0 = { "package.json": "node -e 0" };
// A `just` command no machine can run, whether or not `just` is installed (not on PATH, or the target is not in its summary).
const UNUSABLE_JUST = `just nosuchtarget-${process.pid}-${Date.now()}`;
const UNSEEDED = [
  ["no-command", {}, {}, sessionStart, "a markerless repo: SessionStart started no snapshot"],
  ["no-command", { snapshotAtStart: false, commands: NODE_0 }, PKG, sessionStart, "snapshotAtStart is false with a marker and a command: SessionStart started no snapshot"],
  ["no-command", { commands: NODE_0 }, {}, (dir, sid) => { sessionStart(dir, sid); addPackageJson(dir); }, "a package.json created after SessionStart: no snapshot was started"],
  ["no-command", { commands: { "package.json": null } }, PKG, sessionStart, "the marker is present but its command is dropped (null): SessionStart started no snapshot"],
  ["no-command", { commands: { justfile: UNUSABLE_JUST } }, { justfile: "default:\n\t@echo hi\n" }, sessionStart, "the only present marker maps to an unusable command (a justfile whose `just` target does not exist): SessionStart started no snapshot"],
  ["snapshot-pending", { commands: NODE_0 }, PKG, markStarted, "a snapshot was started and left no result file (still running, or dropped because files changed)"],
  ["snapshot-pending", {}, PKG, markStarted, "a snapshot was started with the default command and left no result file"],
  ["snapshot-pending", { commands: NODE_0 }, { "services/api/package.json": "{}\n" }, markStarted, "a snapshot was started for a marker under a sub-directory and left no result file"],
  ["snapshot-pending", {}, {}, markStarted, "a snapshot was started and the marker file is gone from today's tree: the fact is recorded, not recomputed"],
];

for (const [reason, stopGate, files, before, why] of UNSEEDED) {
  test(`stop-gate: no session-start.json and ${why} -> exactly one stop-tests-skipped with reason ${reason} (ARCH-STATE-22)`, async () => {
    const dir = makeFixture(stopGate, files);
    try {
      before(dir, "unseeded");
      seed(dir, "unseeded", { dirty: true });
      assert.equal(fs.existsSync(path.join(dir, ".craftsman", "sessions", "unseeded", "session-start.json")), false, "no snapshot seeded");
      const { events } = await runStop(dir, "unseeded");
      const logged = skipped(events);
      assert.equal(logged.length, 1, "one skip event per Stop");
      assert.equal(logged[0].reason, reason);
      assert.equal(logged[0].project, ".");
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
}

test("stop-gate: a markerless repo logs no-command on every dirty Stop of the session, never snapshot-pending (ARCH-STATE-22)", async () => {
  const dir = makeFixture();
  try {
    seed(dir, "twice", { dirty: true });
    await runStop(dir, "twice");
    const { events } = await runStop(dir, "twice");
    assert.deepEqual(skipped(events).map((e) => e.reason), ["no-command", "no-command"]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("stop-gate: a dirty Stop that runs a test logs no stop-tests-skipped, even beside a red command (ARCH-STATE-22)", async () => {
  const dir = makeFixture();
  try {
    seed(dir, "ran", { dirty: true, start: { results: [{ cmd: "node -e 1", green: false }, { cmd: "node -e 0", green: true }] } });
    const { events } = await runStop(dir, "ran");
    assert.deepEqual(skipped(events), []);
    assert.ok(events.some((e) => e.ev === "stop" && e.result === "pass"), "the green command passed");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("stop-gate: the stop event carries project \".\" on both the pass and the block path (ARCH-STATE-22)", async () => {
  const pass = makeFixture();
  const block = makeFixture({ extraChecks: ['node -e "process.exit(1)"'] });
  try {
    seed(pass, "pass");
    const passed = await runStop(pass, "pass");
    const ok = passed.events.find((e) => e.ev === "stop");
    assert.equal(ok.result, "pass");
    assert.equal(ok.project, ".");
    seed(block, "block");
    const blocked = await runStop(block, "block");
    const bad = blocked.events.find((e) => e.ev === "stop");
    assert.equal(bad.result, "block");
    assert.equal(bad.project, ".");
  } finally {
    fs.rmSync(pass, { recursive: true, force: true });
    fs.rmSync(block, { recursive: true, force: true });
  }
});

test("stop-gate: inside a unit scope the stop and skip events carry the scope's project id (ARCH-STATE-22)", async () => {
  const dir = makeFixture();
  const unitRoot = makeFixture();
  try {
    const sid = "scoped";
    const sessions = path.join(dir, ".craftsman", "sessions", sid);
    fs.mkdirSync(sessions, { recursive: true });
    fs.writeFileSync(path.join(sessions, "scope.json"), JSON.stringify({
      plan: "docs/plans/p.md", unit: "u", project: "svc-a", project_root: unitRoot, scope: { read: [], docs: [], write: [] }, arch: [],
    }));
    seed(unitRoot, sid, { dirty: true, start: { results: [] } });
    const { events } = await runStop(dir, sid);
    const [skip] = skipped(events);
    assert.equal(skip.reason, "no-command");
    assert.equal(skip.project, "svc-a");
    const stop = events.find((e) => e.ev === "stop");
    assert.equal(stop.project, "svc-a");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(unitRoot, { recursive: true, force: true });
  }
});
