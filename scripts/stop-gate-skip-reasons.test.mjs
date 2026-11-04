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
  await underScope("scoped", async (dir, unitRoot) => {
    const sid = "scoped";
    seed(unitRoot, sid, { dirty: true });
    seed(dir, sid, { start: { results: [] } }); // the baseline sits in the root context's directory (ARCH-STATE-22)
    const { events } = await runStop(dir, sid);
    const [skip] = skipped(events);
    assert.equal(skip.reason, "no-command");
    assert.equal(skip.project, "svc-a");
    const stop = events.find((e) => e.ev === "stop");
    assert.equal(stop.project, "svc-a");
  });
});

// ARCH-STATE-22: SessionStart and snapshot.mjs write session-start.json and snapshot-started at the project ROOT's session directory.
// Stop reads those two from the root only when the scope's root belongs to the same repository (a unit's worktree does); a workspace
// sub-project is a separate repository, so it has no baseline and reads neither. `dirty`, the change list and the scoped-task state
// stay in the scope's own directory either way, where quality-gate.mjs writes them.
const FAILS = 'node -e "process.exit(1)"';
const RED_NOW = { results: [{ cmd: FAILS, green: true }] }; // green at session start, red now: a regression if it is run

// A linked worktree of `dir`, as a unit's worktree is. craftsman.config.json is untracked in the fixture, so the worktree is given a copy.
function addWorktree(dir) {
  const worktree = fs.mkdtempSync(path.join(os.tmpdir(), "stop-gate-wt-"));
  const r = spawnSync("git", ["worktree", "add", "-q", "--detach", worktree], { cwd: dir, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  fs.copyFileSync(path.join(dir, "craftsman.config.json"), path.join(worktree, "craftsman.config.json"));
  return worktree;
}

// A directory that is not a git repository, with the root's configuration.
function addPlainDir(dir) {
  const plain = fs.mkdtempSync(path.join(os.tmpdir(), "stop-gate-plain-"));
  fs.copyFileSync(path.join(dir, "craftsman.config.json"), path.join(plain, "craftsman.config.json"));
  return plain;
}

// The root the session started in, and the scope root (made by `makeScopeRoot(root)`) a scope for `sid` points Stop at.
async function withScope(sid, makeScopeRoot, run) {
  const dir = makeFixture();
  let scopeRoot;
  try {
    scopeRoot = makeScopeRoot(dir);
    const sessions = path.join(dir, ".craftsman", "sessions", sid);
    fs.mkdirSync(sessions, { recursive: true });
    fs.writeFileSync(path.join(sessions, "scope.json"), JSON.stringify({
      plan: "docs/plans/p.md", unit: "u", project: "svc-a", project_root: scopeRoot, scope: { read: [], docs: [], write: [] }, arch: [],
    }));
    await run(dir, scopeRoot);
  } finally {
    if (scopeRoot) fs.rmSync(scopeRoot, { recursive: true, force: true });
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// A unit scope: the scope root is a real worktree of the root's repository.
const underScope = (sid, run) => withScope(sid, addWorktree, run);
// A workspace sub-project scope: the scope root is a separate repository.
const subProjectScope = (sid, run) => withScope(sid, () => makeFixture(), run);
// A scope root that is not a git repository.
const plainDirScope = (sid, run) => withScope(sid, addPlainDir, run);

test("stop-gate: under a unit scope a green session-start.json in the root's directory queues the regression command and logs no skip (ARCH-STATE-22)", async () => {
  await underScope("base", async (dir, unitRoot) => {
    seed(dir, "base", { start: RED_NOW });
    seed(unitRoot, "base", { dirty: true });
    const { stdout, events } = await runStop(dir, "base");
    assert.deepEqual(skipped(events), [], "no skip: the command was queued");
    assert.match(stdout, /REGRESSION: tests passed at session start but fail now/);
    assert.equal(events.find((e) => e.ev === "stop").result, "block");
  });
});

test("stop-gate: under a unit scope a snapshot-started marker in the root's directory makes a baseline-less dirty Stop snapshot-pending (ARCH-STATE-22)", async () => {
  await underScope("pend", async (dir, unitRoot) => {
    markStarted(dir, "pend");
    seed(unitRoot, "pend", { dirty: true });
    const { events } = await runStop(dir, "pend");
    assert.deepEqual(skipped(events).map((e) => [e.reason, e.project]), [["snapshot-pending", "svc-a"]]);
  });
});

test("stop-gate: under a unit scope the baseline is the root's alone: one in the scope's own directory is not read (ARCH-STATE-22)", async () => {
  await underScope("own", async (dir, unitRoot) => {
    seed(unitRoot, "own", { dirty: true, start: RED_NOW });
    const { stdout, events } = await runStop(dir, "own");
    assert.deepEqual(skipped(events).map((e) => e.reason), ["no-command"]);
    assert.doesNotMatch(stdout, /REGRESSION/);
  });
});

test("stop-gate: under a unit scope `dirty` is the scope's: one in the root's directory does not make the Stop dirty (ARCH-STATE-22)", async () => {
  await underScope("flag", async (dir, unitRoot) => {
    seed(dir, "flag", { dirty: true, start: RED_NOW });
    seed(unitRoot, "flag", {});
    const { stdout, events } = await runStop(dir, "flag");
    assert.deepEqual(skipped(events).map((e) => e.reason), ["clean"]);
    assert.doesNotMatch(stdout, /REGRESSION/);
  });
});

test("stop-gate: without a scope the baseline and the dirty marker are read from the one session directory, as before (ARCH-STATE-22)", async () => {
  const dir = makeFixture();
  try {
    seed(dir, "flat", { dirty: true, start: RED_NOW });
    const { stdout, events } = await runStop(dir, "flat");
    assert.deepEqual(skipped(events), []);
    assert.match(stdout, /REGRESSION: tests passed at session start but fail now/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// A workspace sub-project (scope.mjs requires its root to be a Git root) is a separate repository: the root's session-start.json and
// snapshot-started marker describe the root's repository, so Stop reads neither for it and never runs the root's commands in it.
test("stop-gate: under a sub-project scope a green session-start.json in the root's directory queues nothing: no-command, no REGRESSION (ARCH-STATE-22)", async () => {
  await subProjectScope("subbase", async (dir, svc) => {
    seed(dir, "subbase", { start: RED_NOW });
    seed(svc, "subbase", { dirty: true });
    const { stdout, events } = await runStop(dir, "subbase");
    assert.deepEqual(skipped(events).map((e) => [e.reason, e.project]), [["no-command", "svc-a"]]);
    assert.doesNotMatch(stdout, /REGRESSION/);
    assert.equal(events.find((e) => e.ev === "stop").result, "pass");
  });
});

test("stop-gate: under a sub-project scope a snapshot-started marker in the root's directory does not make a baseline-less dirty Stop snapshot-pending (ARCH-STATE-22)", async () => {
  await subProjectScope("subpend", async (dir, svc) => {
    markStarted(dir, "subpend");
    seed(svc, "subpend", { dirty: true });
    const { events } = await runStop(dir, "subpend");
    assert.deepEqual(skipped(events).map((e) => [e.reason, e.project]), [["no-command", "svc-a"]]);
  });
});

test("stop-gate: a scope root that is not a git repository counts as a different repository: the root's baseline is not read (ARCH-STATE-22)", async () => {
  await plainDirScope("plain", async (dir, plain) => {
    seed(dir, "plain", { start: RED_NOW });
    markStarted(dir, "plain");
    seed(plain, "plain", { dirty: true });
    const { stdout, events } = await runStop(dir, "plain");
    assert.deepEqual(skipped(events).map((e) => [e.reason, e.project]), [["no-command", "svc-a"]]);
    assert.doesNotMatch(stdout, /REGRESSION/);
  });
});
