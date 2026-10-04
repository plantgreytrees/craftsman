// Integration regression test for scripts/stop-gate.mjs's budget-truncation
// fix (1.1): spawns the real script as a subprocess against an isolated temp
// git repo fixture, since nothing exercised stop-gate.mjs end-to-end before —
// exactly the gap that let the original bug survive three review rounds.
// Uses Node's built-in test runner (no external dependencies).
import { after, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
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

test("stop-gate: blocks completion while this session owns an active worktree binding", async () => {
  const dir = makeFixture({ security: { enabled: false }, stopGate: { requireAcceptanceCriteria: false } });
  try {
    const sid = "active-worktree-session";
    const bindingDir = path.join(dir, ".git", ".craftsman", "sessions", sid);
    fs.mkdirSync(bindingDir, { recursive: true });
    fs.writeFileSync(path.join(bindingDir, "worktree-hash-worktree-binding.json"), JSON.stringify({
      session_id: sid,
      unit: "unit-1",
      worktree_path: path.join(dir, ".worktrees", "unit-1"),
      branch: "feat/unit-1",
    }));
    const result = await runStopGate(dir, sid);
    assert.match(result.stdout, /"decision":"block"/);
    assert.match(result.stdout, /WORKTREE BINDING ACTIVE/);
  } finally {
    cleanup(dir);
  }
});

// The worktree sweep is deliberately session-local: it exists to catch a
// cleanup step THIS session skipped, not to police the repository. A worktree
// another session (or a human) created must pass through untouched even when
// its branch is fully merged — the session that owns it is the only one that
// can safely remove it.
function addMergedWorktree(dir, slug) {
  const worktree = path.join(dir, ".worktrees", slug);
  const branch = `feat/${slug}`;
  const r = spawnSync("git", ["worktree", "add", "-q", "-b", branch, worktree], { cwd: dir, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git worktree add failed: ${r.stderr}`);
  return { worktree, branch };
}

// Removal is mechanical: every Stop sweeps every merged, clean, unlocked
// worktree in the repository, whoever made it, so nothing relies on the model
// remembering a cleanup step.
test("stop-gate: a merged, clean worktree another session left is removed automatically without blocking", async () => {
  const dir = makeFixture({ security: { enabled: false }, stopGate: { requireAcceptanceCriteria: false } });
  try {
    const theirs = addMergedWorktree(dir, "other-session-unit");
    const result = await runStopGate(dir, "no-ledger-session");
    assert.doesNotMatch(result.stdout, /"decision":"block"/);
    assert.equal(fs.existsSync(theirs.worktree), false, "merged clean worktree must be removed");
    assert.equal(spawnSync("git", ["rev-parse", "--verify", "--quiet", theirs.branch], { cwd: dir }).status, 1, "merged branch must be deleted");
  } finally {
    cleanup(dir);
  }
});

test("stop-gate: a merged, clean worktree in this session's ledger is removed and forgotten, not blocked on", async () => {
  const dir = makeFixture({ security: { enabled: false }, stopGate: { requireAcceptanceCriteria: false } });
  try {
    const sid = "owning-session";
    const mine = addMergedWorktree(dir, "my-unit");
    const sessionDir = path.join(dir, ".git", ".craftsman", "sessions", sid);
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(path.join(sessionDir, "worktrees.json"), JSON.stringify([mine.worktree]));
    const result = await runStopGate(dir, sid);
    assert.doesNotMatch(result.stdout, /"decision":"block"/);
    assert.equal(fs.existsSync(mine.worktree), false);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(sessionDir, "worktrees.json"), "utf8")), []);
  } finally {
    cleanup(dir);
  }
});

test("stop-gate: a merged ledger worktree with uncommitted changes survives the sweep and blocks as NOT SWEPT", async () => {
  const dir = makeFixture({ security: { enabled: false }, stopGate: { requireAcceptanceCriteria: false } });
  try {
    const sid = "owning-session";
    const mine = addMergedWorktree(dir, "my-unit");
    const theirs = addMergedWorktree(dir, "their-unit"); // another session's — swept, never mentioned
    fs.writeFileSync(path.join(mine.worktree, "scratch.txt"), "unsaved\n");
    const sessionDir = path.join(dir, ".git", ".craftsman", "sessions", sid);
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(path.join(sessionDir, "worktrees.json"), JSON.stringify([mine.worktree]));
    const result = await runStopGate(dir, sid);
    assert.match(result.stdout, /"decision":"block"/);
    assert.match(result.stdout, /WORKTREE NOT SWEPT/);
    assert.match(result.stdout, /my-unit/);
    assert.match(result.stdout, /uncommitted change/);
    assert.doesNotMatch(result.stdout, /their-unit/);
    assert.equal(fs.existsSync(mine.worktree), true, "dirty worktree must never be force-removed");
    assert.equal(fs.existsSync(theirs.worktree), false);
  } finally {
    cleanup(dir);
  }
});

test("stop-gate: a SECRETS scan killed by the shared budget blocks with SECRETS SCAN INCOMPLETE, unlike test/extra", async () => {
  const dir = makeFixture({
    security: { enabled: true, check: ['node -e "setTimeout(()=>{},5000)"'] },
    stopGate: {
      totalBudgetMs: 3000,
      testTimeoutMs: 250000,
      requireAcceptanceCriteria: false,
    },
  });
  try {
    const { stdout, events } = await runStopGate(dir, "scenario-a-secret");
    assert.ok(
      !events.some((e) => e.ev === "stop-budget-exceeded"),
      "a budget-truncated secrets scan must not be logged as a silent stop-budget-exceeded skip"
    );
    assert.match(stdout, /"decision":"block"/, "an incomplete secrets scan must block Stop");
    assert.match(stdout, /SECRETS SCAN INCOMPLETE/, "the block reason must use the distinct incomplete-scan wording");
    assert.doesNotMatch(stdout, /flagged content/, "must not be confused with an actual SECRETS finding");
  } finally {
    cleanup(dir);
  }
});

test("stop-gate: CRITICAL regression — a budget-truncated secrets scan never marks itself scanned, so the next Stop re-attempts it instead of silently passing", async () => {
  const dir = makeFixture({
    security: { enabled: true, check: ['node -e "setTimeout(()=>{},5000)"'] },
    stopGate: {
      totalBudgetMs: 3000,
      testTimeoutMs: 250000,
      requireAcceptanceCriteria: false,
    },
  });
  const sid = "scenario-critical-marker";
  const markerPath = path.join(dir, ".craftsman", "sessions", sid, "secrets-scanned");
  try {
    const first = await runStopGate(dir, sid);
    assert.match(first.stdout, /SECRETS SCAN INCOMPLETE/, "first Stop must block on the incomplete scan");
    assert.ok(
      !fs.existsSync(markerPath),
      "a killed (incomplete) scan must never write the scanned marker — this was the reproduced Critical finding"
    );

    // The working tree never changed (the fixture never wrote anything), so
    // if the marker had wrongly been written by the first, killed attempt,
    // this second same-session Stop would read scannedThisSession=true and
    // silently SKIP the secrets task entirely — passing Stop having never
    // once completed a real scan. Re-running proves that gap is closed: the
    // scan is dispatched again and blocks again, exactly as the first time.
    const second = await runStopGate(dir, sid);
    assert.match(
      second.stdout,
      /SECRETS SCAN INCOMPLETE/,
      "the scan must be re-attempted (and still block) on the next Stop in the same session, not silently skipped"
    );
    assert.ok(!fs.existsSync(markerPath), "still no marker after a second incomplete attempt");
  } finally {
    cleanup(dir);
  }
});

test("stop-gate: CRITICAL regression (multi-command) — a completed sibling secret command must not mark the whole batch scanned while another was killed", async () => {
  const dir = makeFixture({
    security: {
      enabled: true,
      check: [
        'node -e "process.exit(0)"',         // fast, completes successfully
        'node -e "setTimeout(()=>{},5000)"', // killed by the shared budget
      ],
    },
    stopGate: {
      totalBudgetMs: 3000,
      testTimeoutMs: 250000,
      requireAcceptanceCriteria: false,
    },
  });
  // Commit the config so the tree is genuinely clean (see the note in the
  // "marks the session scanned" test below) — otherwise the fixture's
  // always-dirty tree would re-attempt the scan on the second Stop
  // regardless of whether the marker was (buggily) written, masking the
  // exact regression this test exists to catch.
  spawnSync("git", ["add", "-A"], { cwd: dir });
  spawnSync("git", ["commit", "-q", "-m", "config"], { cwd: dir });
  const sid = "scenario-multi-command-marker";
  const markerPath = path.join(dir, ".craftsman", "sessions", sid, "secrets-scanned");
  try {
    const first = await runStopGate(dir, sid);
    assert.match(first.stdout, /"decision":"block"/, "the killed sibling must block Stop");
    assert.match(first.stdout, /SECRETS SCAN INCOMPLETE/, "the killed command's incompleteness must be reported");
    assert.ok(
      !fs.existsSync(markerPath),
      "a completed sibling command must NOT let the whole batch be marked scanned while another command was killed"
    );

    const second = await runStopGate(dir, sid);
    assert.match(
      second.stdout,
      /SECRETS SCAN INCOMPLETE/,
      "on an unchanged clean tree, the incomplete command must be re-attempted, not silently passed because a sibling finished"
    );
  } finally {
    cleanup(dir);
  }
});

// NOTE on the "own timeoutMs" kill path (cap === t.timeoutMs, as opposed to
// cap < t.timeoutMs for a shared-budget kill): a "secret" task's timeoutMs is
// hardcoded to 60000ms in stop-gate.mjs (`tasks.push({ kind: "secret", cmd,
// timeoutMs: 60000 })`) and is not configurable, so reaching cap ===
// t.timeoutMs requires a generous totalBudgetMs (the common case — see the
// comment above `budgetDeadline`) AND a scan that genuinely runs the better
// part of 60 real seconds before being killed. Exercising that exact branch
// end-to-end would require a ~60s wait in this suite, which isn't a
// reasonable trade for an automated repro. Verified instead by direct code
// inspection of runTask's catch block: `problems.push(cap < t.timeoutMs ? ...
// "cut short by the Stop-gate time budget" ... : ... "did not finish within
// its own configured limit" ...)` — when `cap` resolves to the full
// `t.timeoutMs` (the generous-budget case), `cap < t.timeoutMs` is false, so
// the second (own-timeout) wording is selected, and the function `return`s
// immediately after — it can never fall through to the old `SECRETS: ...
// flagged content` branch below, so a slow-but-genuine tool timeout can never
// be misreported as an actual finding.

test("stop-gate: a secrets task with the shared budget already exhausted before dispatch (cap <= 0) blocks with SECRETS SCAN INCOMPLETE, not a silent skip", async () => {
  const dir = makeFixture({
    security: { enabled: true, check: ['node -e "process.exit(0)"'] },
    stopGate: {
      totalBudgetMs: 0,
      testTimeoutMs: 250000,
      requireAcceptanceCriteria: false,
    },
  });
  try {
    const { stdout, events } = await runStopGate(dir, "scenario-predispatch-secret");
    assert.ok(
      !events.some((e) => e.ev === "stop-budget-exceeded"),
      "a pre-dispatch-exhausted secrets task must not be logged as a silent stop-budget-exceeded skip"
    );
    assert.match(stdout, /"decision":"block"/, "a secrets scan that never got to start must block Stop");
    assert.match(
      stdout,
      /SECRETS SCAN INCOMPLETE:.*budget was already exhausted before the scan could even start/,
      "the block reason must explain the scan never started"
    );
  } finally {
    cleanup(dir);
  }
});

test("stop-gate: a secrets scan that runs to completion (clean) marks the session scanned, so a subsequent clean-tree Stop skips re-scanning", async () => {
  const dir = makeFixture({
    security: { enabled: true, check: ['node -e "process.exit(0)"'] },
    stopGate: { requireAcceptanceCriteria: false },
  });
  // makeFixture leaves craftsman.config.json uncommitted (untracked), which
  // would read as a permanently dirty tree and make `shouldScan` true
  // unconditionally — masking the marker-driven skip this test exists to
  // prove. Commit it so the tree is genuinely clean (`.craftsman/` itself is
  // filtered out of dirtiness separately, by isCraftsmanStateLine).
  spawnSync("git", ["add", "-A"], { cwd: dir });
  spawnSync("git", ["commit", "-q", "-m", "config"], { cwd: dir });
  const sid = "scenario-scan-completes";
  const markerPath = path.join(dir, ".craftsman", "sessions", sid, "secrets-scanned");
  try {
    const first = await runStopGate(dir, sid);
    assert.doesNotMatch(first.stdout, /"decision":"block"/, "a clean, completed scan must not block");
    assert.ok(fs.existsSync(markerPath), "a scan that ran to completion must write the scanned marker");

    const second = await runStopGate(dir, sid);
    assert.ok(
      second.events.some((e) => e.ev === "stop-secrets-skipped"),
      "a second same-session Stop on an unchanged clean tree must skip re-scanning, using the marker written above"
    );
    assert.doesNotMatch(second.stdout, /"decision":"block"/);
  } finally {
    cleanup(dir);
  }
});

test("stop-gate: ordinary ignored trees do not force a repeated secrets scan", async () => {
  const dir = makeFixture({
    security: { enabled: true, check: ['node -e "process.exit(0)"'] },
    stopGate: { requireAcceptanceCriteria: false },
  });
  fs.writeFileSync(path.join(dir, ".gitignore"), "node_modules/\n");
  fs.mkdirSync(path.join(dir, "node_modules", "fixture"), { recursive: true });
  spawnSync("git", ["add", "-A"], { cwd: dir });
  spawnSync("git", ["commit", "-q", "-m", "config"], { cwd: dir });
  const sid = "scenario-ignored-tree";
  try {
    const first = await runStopGate(dir, sid);
    assert.doesNotMatch(first.stdout, /"decision":"block"/);
    const second = await runStopGate(dir, sid);
    assert.ok(second.events.some((e) => e.ev === "stop-secrets-skipped"));
    assert.doesNotMatch(second.stdout, /"decision":"block"/);
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
    assert.match(stdout, /GUARD INCOMPLETE/, "an own-timeout should not be reported as a guard failure");
  } finally {
    cleanup(dir);
  }
});

test("stop-gate: a missing secrets scanner with the built-in fallback disabled blocks visibly and does not mark the session scanned", async () => {
  const dir = makeFixture({
    security: { enabled: true, builtinFallback: false, check: ["craftsman-test-scanner-does-not-exist"] },
    stopGate: { requireAcceptanceCriteria: false },
  });
  const sid = "scenario-missing-secret-scanner";
  const markerPath = path.join(dir, ".craftsman", "sessions", sid, "secrets-scanned");
  try {
    const first = await runStopGate(dir, sid);
    assert.match(first.stdout, /"decision":"block"/);
    assert.match(first.stdout, /SECRETS SCAN UNAVAILABLE/);
    assert.ok(!fs.existsSync(markerPath), "an unavailable scanner must not write the scanned marker");

    const second = await runStopGate(dir, sid);
    assert.match(second.stdout, /SECRETS SCAN UNAVAILABLE/, "the unavailable scan must be retried");
  } finally {
    cleanup(dir);
  }
});

test("stop-gate: a missing secrets scanner falls back to the built-in scan and passes a clean tree", async () => {
  const dir = makeFixture({
    security: { enabled: true, check: ["craftsman-test-scanner-does-not-exist"] },
    stopGate: { requireAcceptanceCriteria: false },
  });
  const sid = "scenario-fallback-clean";
  try {
    const first = await runStopGate(dir, sid);
    assert.doesNotMatch(first.stdout, /"decision":"block"/, "a clean tree via the built-in fallback must not block");
    assert.doesNotMatch(first.stdout, /SECRETS SCAN UNAVAILABLE/);
  } finally {
    cleanup(dir);
  }
});

test("stop-gate: a missing secrets scanner falls back to the built-in scan and blocks on a real finding", async () => {
  const dir = makeFixture({
    security: { enabled: true, check: ["craftsman-test-scanner-does-not-exist"] },
    stopGate: { requireAcceptanceCriteria: false },
  });
  fs.writeFileSync(path.join(dir, ".env.local"), `aws_secret_access_key="${"A".repeat(40)}"\n`);
  const sid = "scenario-fallback-dirty";
  const markerPath = path.join(dir, ".craftsman", "sessions", sid, "secrets-scanned");
  try {
    const first = await runStopGate(dir, sid);
    assert.match(first.stdout, /"decision":"block"/);
    assert.match(first.stdout, /SECRETS \(built-in fallback/);
    assert.ok(!fs.existsSync(markerPath), "a fallback finding must not write the scanned marker");

    fs.rmSync(path.join(dir, ".env.local"));
    const second = await runStopGate(dir, sid);
    assert.doesNotMatch(second.events.map((event) => event.ev).join("\n"), /stop-secrets-skipped/, "a finding must force a later clean scan");
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

// merge() restores whatever branch the primary checkout was on, so "merged"
// judged against HEAD missed every unit merged while the checkout sat on
// another branch — the sweep went silent on exactly the leftovers it exists for.
test("stop-gate: a ledger worktree merged into the base while the checkout sits on another branch still blocks", async () => {
  const dir = makeFixture({ security: { enabled: false }, stopGate: { requireAcceptanceCriteria: false } });
  const g = (...args) => {
    const r = spawnSync("git", args, { cwd: dir, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
    return r.stdout.trim();
  };
  try {
    const sid = "off-base-session";
    const base = g("branch", "--show-current");
    const mine = addMergedWorktree(dir, "off-base-unit");
    fs.writeFileSync(path.join(mine.worktree, "unit.txt"), "unit\n");
    spawnSync("git", ["add", "unit.txt"], { cwd: mine.worktree });
    spawnSync("git", ["commit", "-q", "-m", "feat: unit"], { cwd: mine.worktree });
    g("checkout", "-q", "-b", "scratch");
    g("checkout", "-q", base);
    g("merge", "-q", "--no-ff", "-m", "merge unit", mine.branch);
    g("checkout", "-q", "scratch");
    fs.writeFileSync(path.join(mine.worktree, "wip.txt"), "wip\n"); // dirty, so the sweep must leave it for the gate
    const sessionDir = path.join(dir, ".git", ".craftsman", "sessions", sid);
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(path.join(sessionDir, "worktrees.json"), JSON.stringify([mine.worktree]));
    const result = await runStopGate(dir, sid);
    assert.match(result.stdout, /WORKTREE NOT SWEPT/);
    assert.match(result.stdout, new RegExp(`merged into ${base}`));
  } finally {
    cleanup(dir);
  }
});

function writeAcceptance(dir, sid, text, { tracker = [] } = {}) {
  const state = path.join(dir, ".craftsman");
  fs.mkdirSync(path.join(state, "sessions", sid), { recursive: true });
  fs.writeFileSync(path.join(state, "acceptance.md"), text);
  // Same identity core.mjs's recordAcceptanceOwnership() writes: criteria with
  // tick state normalised away.
  const identity = crypto.createHash("sha1").update(
    text.split("\n").map((l) => l.replace(/^(\s*[-*]\s*)\[[ xX]\]/, "$1[ ]").trimEnd()).join("\n").trim()
  ).digest("hex");
  fs.writeFileSync(path.join(state, "sessions", sid, "acceptance.ref"), JSON.stringify({ identity, ts: Date.now() }));
  if (tracker.length) {
    fs.mkdirSync(path.join(state, "tracker"), { recursive: true });
    fs.writeFileSync(path.join(state, "tracker", "events.jsonl"), tracker.map((e) => JSON.stringify(e)).join("\n") + "\n");
  }
}

// Ownership used to be a hash of the raw file, so ticking a box by any path the
// PostToolUse hook never sees (sed, a script) silently disowned the file and the
// gate stopped enforcing the criteria that were still open.
test("stop-gate: ticking a criterion outside Edit/Write keeps ownership, so the rest still block", async () => {
  const dir = makeFixture({ security: { enabled: false }, stopGate: { requireAcceptanceCriteria: true } });
  try {
    const sid = "ac-owner";
    writeAcceptance(dir, sid, "- [ ] first criterion\n- [ ] second criterion\n");
    const acPath = path.join(dir, ".craftsman", "acceptance.md");
    fs.writeFileSync(acPath, fs.readFileSync(acPath, "utf8").replace("- [ ] first", "- [x] first"));
    const result = await runStopGate(dir, sid);
    assert.match(result.stdout, /ACCEPTANCE CRITERIA/);
    assert.match(result.stdout, /second criterion/);
    assert.doesNotMatch(result.stdout, /first criterion/);
  } finally {
    cleanup(dir);
  }
});

test("stop-gate: a [unit:<id>] criterion binds only the session that worked that unit", async () => {
  const dir = makeFixture({ security: { enabled: false }, stopGate: { requireAcceptanceCriteria: true } });
  try {
    const sid = "step-session";
    writeAcceptance(dir, sid, "- [x] [unit:u1] mine, done\n- [ ] [unit:u2] someone else's unit\n", {
      tracker: [{ key: ".::p::u1", plan: "p", unit: "u1", status: "IN_PROGRESS", evidence: "claimed", session_id: sid }],
    });
    const quiet = await runStopGate(dir, sid);
    assert.doesNotMatch(quiet.stdout, /ACCEPTANCE CRITERIA/, "u2 was never worked here");

    fs.appendFileSync(path.join(dir, ".craftsman", "acceptance.md"), "- [ ] [unit:u1] mine, still open\n");
    writeAcceptance(dir, sid, fs.readFileSync(path.join(dir, ".craftsman", "acceptance.md"), "utf8"));
    const blocked = await runStopGate(dir, sid);
    assert.match(blocked.stdout, /mine, still open/);
    assert.doesNotMatch(blocked.stdout, /someone else's unit/);
  } finally {
    cleanup(dir);
  }
});

after("stop-gate: no stray temp directories are left behind after the suite runs", () => {
  const stray = fs.readdirSync(SCRATCH_ROOT).filter((n) => n.startsWith("stop-gate-test-"));
  assert.deepEqual(stray, [], "every fixture temp dir must be cleaned up in its own test's finally block");
});
