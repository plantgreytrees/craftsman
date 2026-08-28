// Integration regression test for scripts/stop-gate.mjs's budget-truncation
// fix (1.1): spawns the real script as a subprocess against an isolated temp
// git repo fixture, since nothing exercised stop-gate.mjs end-to-end before —
// exactly the gap that let the original bug survive three review rounds.
// Uses Node's built-in test runner (no external dependencies).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const STOP_GATE_PATH = fileURLToPath(new URL("./stop-gate.mjs", import.meta.url));
const SCRATCH_ROOT = os.tmpdir();

// Fresh temp dir with its own `.git` (so `git status --porcelain` reads
// cleanly and PROJECT_ROOT resolves to it via `git rev-parse
// --show-toplevel` run with cwd=this dir), plus a scratch
// craftsman.config.json override merged on top of the plugin's real
// defaults (PLUGIN_ROOT resolves relative to core.mjs's own file location,
// independent of cwd, so the real default config is always the base).
function makeFixture(configOverride) {
  const dir = fs.mkdtempSync(path.join(SCRATCH_ROOT, "stop-gate-test-"));
  const run = (cmd, args) => {
    const r = spawnSync(cmd, args, { cwd: dir, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed: ${r.stderr}`);
  };
  run("git", ["init", "-q"]);
  run("git", ["config", "user.email", "test@example.com"]);
  run("git", ["config", "user.name", "test"]);
  run("git", ["config", "commit.gpgsign", "false"]);
  fs.writeFileSync(path.join(dir, "README.md"), "fixture\n");
  run("git", ["add", "-A"]);
  run("git", ["commit", "-q", "-m", "init"]);
  fs.writeFileSync(path.join(dir, "craftsman.config.json"), JSON.stringify(configOverride, null, 2));
  return dir;
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

// Spawns `node scripts/stop-gate.mjs` with cwd=dir and the given session_id
// on stdin, matching real invocation shape. Returns stdout/stderr/exit code
// plus the parsed `.craftsman/events.jsonl` lines for this session.
function runStopGate(dir, sid) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [STOP_GATE_PATH], { cwd: dir });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => (stdout += c));
    child.stderr.on("data", (c) => (stderr += c));
    child.on("error", reject);
    child.on("close", (code) => {
      const eventsPath = path.join(dir, ".craftsman", "events.jsonl");
      let events = [];
      try {
        events = fs.readFileSync(eventsPath, "utf8").split("\n").filter(Boolean)
          .map((l) => { try { return JSON.parse(l); } catch { return null; } })
          .filter((e) => e && e.sid === sid);
      } catch { /* no events file — fine, some scenarios log nothing */ }
      resolve({ code, stdout, stderr, events });
    });
    child.stdin.end(JSON.stringify({ session_id: sid }));
  });
}

test("stop-gate: a command killed by the shared budget (cap < timeoutMs) logs stop-budget-exceeded, no block", async () => {
  const dir = makeFixture({
    security: { enabled: false },
    stopGate: {
      totalBudgetMs: 3000,
      testTimeoutMs: 250000,
      requireAcceptanceCriteria: false,
      extraChecks: ['node -e "setTimeout(()=>{},5000)"'],
    },
  });
  try {
    const { stdout, events } = await runStopGate(dir, "scenario-a");
    assert.ok(
      events.some((e) => e.ev === "stop-budget-exceeded"),
      "expected a stop-budget-exceeded event"
    );
    assert.doesNotMatch(stdout, /"decision":"block"/, "a budget-skipped command must not block");
  } finally {
    cleanup(dir);
  }
});

test("stop-gate: a command killed after its own full timeoutMs (budget not binding) still blocks, unchanged", async () => {
  const dir = makeFixture({
    security: { enabled: false },
    stopGate: {
      totalBudgetMs: 300000,
      testTimeoutMs: 1000,
      requireAcceptanceCriteria: false,
      extraChecks: ['node -e "setTimeout(()=>{},3000)"'],
    },
  });
  try {
    const { stdout, events } = await runStopGate(dir, "scenario-b");
    assert.ok(
      !events.some((e) => e.ev === "stop-budget-exceeded"),
      "cap === timeoutMs is not a budget skip"
    );
    assert.match(stdout, /"decision":"block"/, "a command killed by its own full timeoutMs must still block");
    assert.match(stdout, /GUARD FAILED/, "the finding should be reported as a normal guard failure");
  } finally {
    cleanup(dir);
  }
});

test("stop-gate: a maxBuffer overflow near-instantly (cap < timeoutMs, elapsed far below cap) still blocks, not stop-budget-exceeded", async () => {
  const dir = makeFixture({
    security: { enabled: false },
    stopGate: {
      totalBudgetMs: 50000,
      testTimeoutMs: 250000,
      requireAcceptanceCriteria: false,
      extraChecks: ['node -e "process.stdout.write(\'x\'.repeat(9000000))"'],
    },
  });
  try {
    const { stdout, events } = await runStopGate(dir, "scenario-c");
    assert.ok(
      !events.some((e) => e.ev === "stop-budget-exceeded"),
      "a maxBuffer kill must not be misreported as a budget skip"
    );
    assert.match(stdout, /"decision":"block"/, "a maxBuffer overflow is a real finding and must block");
    assert.match(stdout, /GUARD FAILED/);
  } finally {
    cleanup(dir);
  }
});

test("stop-gate: default totalBudgetMs with a fast successful command logs nothing, no block", async () => {
  const dir = makeFixture({
    security: { enabled: false },
    stopGate: {
      requireAcceptanceCriteria: false,
      extraChecks: ['node -e "process.exit(0)"'],
    },
  });
  try {
    const { stdout, events } = await runStopGate(dir, "scenario-d");
    assert.ok(
      !events.some((e) => e.ev === "stop-budget-exceeded"),
      "a fast, successful command under the default budget must not log stop-budget-exceeded"
    );
    assert.doesNotMatch(stdout, /"decision":"block"/);
  } finally {
    cleanup(dir);
  }
});

test("stop-gate: a genuinely failing (non-killed, non-zero exit) command still blocks", async () => {
  const dir = makeFixture({
    security: { enabled: false },
    stopGate: {
      requireAcceptanceCriteria: false,
      extraChecks: ['node -e "process.exit(1)"'],
    },
  });
  try {
    const { stdout, events } = await runStopGate(dir, "scenario-e");
    assert.ok(
      !events.some((e) => e.ev === "stop-budget-exceeded"),
      "a genuine non-killed failure is not a budget skip"
    );
    assert.match(stdout, /"decision":"block"/);
    assert.match(stdout, /GUARD FAILED/);
  } finally {
    cleanup(dir);
  }
});

test("stop-gate: no stray temp directories are left behind after the suite runs", () => {
  const stray = fs.readdirSync(SCRATCH_ROOT).filter((n) => n.startsWith("stop-gate-test-"));
  assert.deepEqual(stray, [], "every fixture temp dir must be cleaned up in its own test's finally block");
});
