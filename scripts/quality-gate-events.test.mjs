// ARCH-STATE-22: every `gate` event the quality gate logs names the project it ran for ("." at the root, the scope's
// project id inside a unit scope), so a workspace's events say which service a gate result belongs to.
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const QUALITY_GATE_PATH = fileURLToPath(new URL("./quality-gate.mjs", import.meta.url));

// A language of our own: ".fx" files are checked by whatever `check` the case names, so no real linter is needed.
function makeRoot(check) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quality-gate-events-"));
  for (const a of [["init", "-q"], ["config", "user.email", "t@e.com"], ["config", "user.name", "t"], ["config", "commit.gpgsign", "false"]])
    spawnSync("git", a, { cwd: dir });
  fs.writeFileSync(path.join(dir, "README.md"), "fixture\n");
  spawnSync("git", ["add", "-A"], { cwd: dir });
  spawnSync("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  fs.writeFileSync(path.join(dir, "craftsman.config.json"), JSON.stringify({
    security: { enabled: false },
    stopGate: { requireAcceptanceCriteria: false },
    languages: { fixture: { extensions: [".fx"], check: [check] } },
  }));
  return dir;
}

const PASS = "node -e 0";
const FAIL = 'node -e "console.log(\'bad thing\');process.exit(1)"';
const CRASH = 'node -e "process.kill(process.pid,\'SIGKILL\')"';

// Edits `rel` under `dir`, with the hook run from `cwd` (the project root, which owns the session's scope files).
function edit(dir, sid, rel, content = "x\n", cwd = dir) {
  const file = path.join(dir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  const result = spawnSync(process.execPath, [QUALITY_GATE_PATH], {
    cwd, encoding: "utf8",
    input: JSON.stringify({ session_id: sid, tool_name: "Edit", tool_input: { file_path: file } }),
  });
  return { ...result, file };
}

function events(root) {
  try {
    return fs.readFileSync(path.join(root, ".craftsman", "events.jsonl"), "utf8").split("\n").filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter((e) => e && e.ev === "gate");
  } catch { return []; }
}

// Arm a unit scope for `sid`: edits under `unitRoot` are gated against that root and report `project`.
function scopeUnit(dir, sid, unitRoot, project) {
  const sessions = path.join(dir, ".craftsman", "sessions", sid);
  fs.mkdirSync(sessions, { recursive: true });
  fs.writeFileSync(path.join(sessions, "scope.json"), JSON.stringify({
    plan: "docs/plans/p.md", unit: "u", project, project_root: unitRoot, scope: { read: [], docs: [], write: [] }, arch: [],
  }));
}

test("quality-gate: a pass, then a cached hit, at the root log gate events with project \".\" (ARCH-STATE-22)", () => {
  const dir = makeRoot(PASS);
  try {
    assert.equal(edit(dir, "qg-root", "a.fx").status, 0);
    assert.equal(edit(dir, "qg-root", "a.fx").status, 0);
    const gate = events(dir);
    assert.deepEqual(gate.map((e) => e.result), ["pass", "cached"]);
    for (const e of gate) assert.equal(e.project, ".", `the ${e.result} gate event names the root project`);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("quality-gate: a fail at the root logs its gate event with project \".\" (ARCH-STATE-22)", () => {
  const dir = makeRoot(FAIL);
  try {
    const r = edit(dir, "qg-fail", "a.fx");
    assert.equal(r.status, 2, "a new finding blocks the edit");
    const [e] = events(dir);
    assert.equal(e.result, "fail");
    assert.equal(e.project, ".");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("quality-gate: a crashed tool logs its tool-unavailable gate event with project \".\" (ARCH-STATE-22)", () => {
  const dir = makeRoot(CRASH);
  try {
    edit(dir, "qg-crash", "a.fx");
    const gate = events(dir);
    assert.ok(gate.some((e) => e.result === "tool-unavailable"), "the crash is logged");
    for (const e of gate) assert.equal(e.project, ".", `the ${e.result} gate event names the root project`);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("quality-gate: a baselined finding logs its pass-baselined gate event with project \".\" (ARCH-STATE-22)", () => {
  const dir = makeRoot(FAIL);
  try {
    const file = path.join(dir, "a.fx");
    fs.writeFileSync(file, "x\n");
    const baseline = path.join(dir, ".craftsman", "baseline");
    fs.mkdirSync(baseline, { recursive: true });
    const key = crypto.createHash("md5").update(path.resolve(file)).digest("hex").slice(0, 12);
    fs.writeFileSync(path.join(baseline, `${key}.txt`), "bad thing");
    assert.equal(edit(dir, "qg-baselined", "a.fx").status, 0, "a pre-existing finding does not block");
    const [e] = events(dir);
    assert.equal(e.result, "pass-baselined");
    assert.equal(e.project, ".");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("quality-gate: inside a unit scope the gate event carries the scope's project id (ARCH-STATE-22)", () => {
  const dir = makeRoot(PASS);
  const unitRoot = makeRoot(PASS);
  try {
    scopeUnit(dir, "qg-scope", unitRoot, "svc-a");
    assert.equal(edit(unitRoot, "qg-scope", "a.fx", "x\n", dir).status, 0);
    const [e] = events(dir); // the event log is the root's, whichever project the edit was gated for
    assert.equal(e.result, "pass");
    assert.equal(e.project, "svc-a");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(unitRoot, { recursive: true, force: true });
  }
});
