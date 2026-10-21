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
  fs.rmSync(`${dir}-remote.git`, { recursive: true, force: true });
}

// A worktree counts as merged only into a pushed remote-tracking base (ARCH-SAFETY-07), so the sweep
// tests give the fixture a bare origin with its current branch pushed.
function pushBase(dir) {
  const bare = `${dir}-remote.git`;
  spawnSync("git", ["init", "-q", "--bare", bare]);
  const git = (...args) => {
    const r = spawnSync("git", args, { cwd: dir, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
    return r.stdout.trim();
  };
  git("remote", "add", "origin", bare);
  git("push", "-q", "-u", "origin", git("branch", "--show-current"));
}

// Spawns `node scripts/stop-gate.mjs` with cwd=dir and the given session_id
// on stdin, matching real invocation shape. Returns stdout/stderr/exit code
// plus the parsed `.craftsman/events.jsonl` lines for this session.
function runStopGate(dir, sid, extra = {}) {
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
    child.stdin.end(JSON.stringify({ session_id: sid, ...extra }));
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
  pushBase(dir);
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
  pushBase(dir);
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
  pushBase(dir);
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
  pushBase(dir);
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
    g("push", "-q", "origin", base);
    g("checkout", "-q", "scratch");
    fs.writeFileSync(path.join(mine.worktree, "wip.txt"), "wip\n"); // dirty, so the sweep must leave it for the gate
    const sessionDir = path.join(dir, ".git", ".craftsman", "sessions", sid);
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(path.join(sessionDir, "worktrees.json"), JSON.stringify([mine.worktree]));
    const result = await runStopGate(dir, sid);
    assert.match(result.stdout, /WORKTREE NOT SWEPT/);
    assert.match(result.stdout, new RegExp(`merged into origin/${base}`));
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

// ARCH-STATE-04: a turn ending with its workflow still running defers only the
// acceptance block; the secrets scan and regression checks still fire.
test("stop-gate: in-flight background_tasks skip only the acceptance block; secrets and regressions still fire", async () => {
  const dir = makeFixture({
    security: { enabled: true, check: ["craftsman-test-scanner-does-not-exist"] },
    stopGate: { requireAcceptanceCriteria: true, extraChecks: ['node -e "process.exit(1)"'] },
  });
  try {
    const sid = "bg-session";
    writeAcceptance(dir, sid, "- [ ] still open criterion\n");
    fs.writeFileSync(path.join(dir, ".env.local"), `aws_secret_access_key="${"A".repeat(40)}"\n`);
    const running = await runStopGate(dir, sid, {
      background_tasks: [{ id: "w1", type: "local_workflow", status: "running" }, { id: "b1", type: "local_bash", status: "running" }],
    });
    assert.match(running.stdout, /"decision":"block"/);
    assert.match(running.stdout, /SECRETS \(built-in fallback/);
    assert.match(running.stdout, /GUARD FAILED/);
    assert.doesNotMatch(running.stdout, /ACCEPTANCE CRITERIA/);
    assert.ok(running.events.some((e) => e.ev === "stop-acceptance-deferred"));

    // Finished tasks, or only shell tasks, defer nothing.
    for (const background_tasks of [
      [{ id: "a1", type: "local_agent", status: "completed" }],
      [{ id: "b1", type: "local_bash", status: "running" }],
    ]) {
      const settled = await runStopGate(dir, sid, { background_tasks });
      assert.match(settled.stdout, /still open criterion/);
    }
  } finally {
    cleanup(dir);
  }
});

// ARCH-STATE-08: an owned feature whose units are all FEATURE_MERGED is unlanded.
function featureRows(sid, statuses, feature = "F1") {
  return statuses.map((status, i) => ({
    key: `.::p::u${i}`, project: ".", plan: "p", unit: `u${i}`, status, evidence: "x",
    session_id: sid, feature, feature_branch: "feat/f1",
  }));
}

test("stop-gate: an owned feature with every unit FEATURE_MERGED blocks as FEATURE NOT LANDED", async () => {
  const dir = makeFixture({ security: { enabled: false }, stopGate: { requireAcceptanceCriteria: false } });
  try {
    const sid = "feat-blocked";
    writeAcceptance(dir, sid, "- [x] done\n", { tracker: featureRows(sid, ["FEATURE_MERGED", "FEATURE_MERGED"]) });
    const result = await runStopGate(dir, sid);
    assert.match(result.stdout, /"decision":"block"/);
    assert.match(result.stdout, /FEATURE NOT LANDED/);
  } finally {
    cleanup(dir);
  }
});

test("stop-gate: a landed (COMPLETE), part-merged or foreign feature does not block", async () => {
  const dir = makeFixture({ security: { enabled: false }, stopGate: { requireAcceptanceCriteria: false } });
  try {
    const sid = "feat-landed";
    for (const rows of [
      featureRows(sid, ["COMPLETE", "COMPLETE"]),
      featureRows(sid, ["FEATURE_MERGED", "IN_PROGRESS"]),
      featureRows("someone-else", ["FEATURE_MERGED"]),
    ]) {
      writeAcceptance(dir, sid, "- [x] done\n", { tracker: rows });
      const result = await runStopGate(dir, sid);
      assert.doesNotMatch(result.stdout, /FEATURE NOT LANDED/);
    }
  } finally {
    cleanup(dir);
  }
});

test("stop-gate: in-flight background_tasks skip the unlanded-feature block", async () => {
  const dir = makeFixture({ security: { enabled: false }, stopGate: { requireAcceptanceCriteria: false } });
  try {
    const sid = "feat-bg";
    writeAcceptance(dir, sid, "- [x] done\n", { tracker: featureRows(sid, ["FEATURE_MERGED"]) });
    const running = await runStopGate(dir, sid, { background_tasks: [{ id: "w1", type: "local_workflow", status: "running" }] });
    assert.doesNotMatch(running.stdout, /FEATURE NOT LANDED/);
    const settled = await runStopGate(dir, sid, { background_tasks: [{ id: "w1", type: "local_workflow", status: "completed" }] });
    assert.match(settled.stdout, /FEATURE NOT LANDED/);
  } finally {
    cleanup(dir);
  }
});

after("stop-gate: no stray temp directories are left behind after the suite runs", () => {
  const stray = fs.readdirSync(SCRATCH_ROOT).filter((n) => n.startsWith("stop-gate-test-"));
  assert.deepEqual(stray, [], "every fixture temp dir must be cleaned up in its own test's finally block");
});

test("stop-gate: terminal pass and block events carry numeric ms", async () => {
  const dir = makeFixture({ security: { enabled: false }, stopGate: { requireAcceptanceCriteria: false } });
  try {
    const pass = await runStopGate(dir, "ms-pass");
    const passEv = pass.events.find((e) => e.ev === "stop" && e.result === "pass");
    assert.ok(passEv && Number.isFinite(passEv.ms) && passEv.ms >= 0, "pass event has ms");
    const sid = "ms-block";
    const bindingDir = path.join(dir, ".git", ".craftsman", "sessions", sid);
    fs.mkdirSync(bindingDir, { recursive: true });
    fs.writeFileSync(path.join(bindingDir, "worktree-hash-worktree-binding.json"), JSON.stringify({
      session_id: sid, unit: "unit-1", worktree_path: path.join(dir, ".worktrees", "unit-1"), branch: "feat/unit-1",
    }));
    const block = await runStopGate(dir, sid);
    const blockEv = block.events.find((e) => e.ev === "stop" && e.result === "block");
    assert.ok(blockEv && Number.isFinite(blockEv.ms) && blockEv.ms >= 0, "block event has ms");
  } finally {
    cleanup(dir);
  }
});

// 3.x: the Stop gate re-runs the suite only when a turn edited something a test could
// regress on. A docs-only turn leaves no `dirty` marker, so no test command runs.
const QUALITY_GATE_PATH = fileURLToPath(new URL("./quality-gate.mjs", import.meta.url));

function editThroughQualityGate(dir, sid, rel, content = "x\n") {
  const file = path.join(dir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return spawnSync(process.execPath, [QUALITY_GATE_PATH], {
    cwd: dir, encoding: "utf8",
    input: JSON.stringify({ session_id: sid, tool_name: "Edit", tool_input: { file_path: file } }),
  });
}

// A green-at-start suite whose "test command" records that it ran.
function seedGreenStart(dir, sid) {
  fs.writeFileSync(path.join(dir, "mark.js"), "require('node:fs').appendFileSync('tests-ran.log', 'ran\\n');\n");
  const sessionDir = path.join(dir, ".craftsman", "sessions", sid);
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(path.join(sessionDir, "session-start.json"), JSON.stringify({ results: [{ cmd: "node mark.js", green: true }] }));
  return { dirty: path.join(sessionDir, "dirty"), log: path.join(dir, "tests-ran.log") };
}

const quietFixture = () => makeFixture({ security: { enabled: false }, stopGate: { requireAcceptanceCriteria: false } });

test("stop-gate: a turn that edits only docs leaves no dirty marker and runs no test command", async () => {
  const dir = quietFixture();
  try {
    const sid = "docs-only";
    const { dirty, log } = seedGreenStart(dir, sid);
    editThroughQualityGate(dir, sid, "docs/x.md", "# notes\n");
    assert.equal(fs.existsSync(dirty), false, "docs/x.md is not source a test can regress on");
    const { events } = await runStopGate(dir, sid);
    assert.equal(fs.existsSync(log), false, "the suite was not re-run");
    assert.ok(events.some((e) => e.ev === "stop-tests-skipped"));
  } finally {
    cleanup(dir);
  }
});

test("stop-gate: a .mjs edit still sets the dirty marker and the suite re-runs", async () => {
  const dir = quietFixture();
  try {
    const sid = "mjs-edit";
    const { dirty, log } = seedGreenStart(dir, sid);
    editThroughQualityGate(dir, sid, "src/a.mjs", "export const a = 1;\n");
    assert.equal(fs.existsSync(dirty), true);
    await runStopGate(dir, sid);
    assert.equal(fs.readFileSync(log, "utf8"), "ran\n");
  } finally {
    cleanup(dir);
  }
});

test("stop-gate: a test-command marker file (package.json) edit sets dirty; an ignored tree does not", () => {
  const dir = quietFixture();
  try {
    const sid = "markers";
    const { dirty } = seedGreenStart(dir, sid);
    editThroughQualityGate(dir, sid, "node_modules/dep/index.js", "module.exports = 1;\n");
    assert.equal(fs.existsSync(dirty), false, "an ignored path never marks the session dirty");
    editThroughQualityGate(dir, sid, "package.json", "{}\n");
    assert.equal(fs.existsSync(dirty), true, "package.json is a stopGate.commands marker");
  } finally {
    cleanup(dir);
  }
});

test("stop-gate: an edit of the acceptance file still does not mark the session dirty", () => {
  const dir = quietFixture();
  try {
    const sid = "acceptance-only";
    const { dirty } = seedGreenStart(dir, sid);
    editThroughQualityGate(dir, sid, ".craftsman/acceptance.md", "- [ ] a criterion\n");
    assert.equal(fs.existsSync(dirty), false);
  } finally {
    cleanup(dir);
  }
});

// 9.2: Stop reports unpushed work as a systemMessage and blocks only when stopGate.blockOnUnpushed is true.
function unpushedFixture(extraStopGate = {}) {
  const dir = makeFixture({ security: { enabled: false }, stopGate: { requireAcceptanceCriteria: false, ...extraStopGate } });
  fs.writeFileSync(path.join(dir, "wip.txt"), "wip\n"); // uncommitted
  return dir;
}

test("stop-gate: unpushed work is reported as a systemMessage and does not block by default", async () => {
  const dir = unpushedFixture();
  try {
    const { code, stdout } = await runStopGate(dir, "unpushed-default");
    assert.equal(code, 0);
    const out = JSON.parse(stdout);
    assert.equal(out.decision, undefined, "advisory by default");
    assert.match(out.systemMessage, /craftsman: unpushed work \(local refs only\)/);
    assert.match(out.systemMessage, /uncommitted changes in the main checkout/);
  } finally { cleanup(dir); }
});

test("stop-gate: stopGate.blockOnUnpushed true turns the same report into a block", async () => {
  const dir = unpushedFixture({ blockOnUnpushed: true });
  try {
    const { stdout } = await runStopGate(dir, "unpushed-block");
    const out = JSON.parse(stdout);
    assert.equal(out.decision, "block");
    assert.match(out.reason, /UNPUSHED WORK/);
    assert.match(out.reason, /uncommitted changes in the main checkout/);
  } finally { cleanup(dir); }
});

test("stop-gate: the shipped default for stopGate.blockOnUnpushed is false", () => {
  const cfg = JSON.parse(fs.readFileSync(new URL("../craftsman.config.json", import.meta.url), "utf8"));
  assert.equal(cfg.stopGate.blockOnUnpushed, false);
});

// 13.3: Stop reports guarded docs that changed without passing the doc guard (informational).
function docSnapshotFor(dir, sid) {
  const lib = new URL("./lib/doc-snapshot.mjs", import.meta.url).href;
  const code = `import(${JSON.stringify(lib)}).then((m) => { const fs = require("node:fs"), path = require("node:path");
    const d = path.join(${JSON.stringify(dir)}, ".craftsman", "sessions", ${JSON.stringify(sid)}); fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, "doc-snapshot.json"), JSON.stringify(m.snapshotDocs(${JSON.stringify(dir)}, ["docs/plans/**", "docs/ideas/**", "docs/architecture/**"]))); })`;
  const r = spawnSync(process.execPath, ["-e", code], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr);
}

function docFixture() {
  const dir = makeFixture({ security: { enabled: false }, stopGate: { requireAcceptanceCriteria: false } });
  fs.mkdirSync(path.join(dir, "docs", "plans"), { recursive: true });
  fs.writeFileSync(path.join(dir, "docs", "plans", "a.md"), "# a\n");
  pushBase(dir);
  return dir;
}

test("stop-gate: a guarded doc edited out of band is reported, informationally and without blocking", async () => {
  const dir = docFixture();
  try {
    const sid = "oob-doc";
    docSnapshotFor(dir, sid);
    fs.writeFileSync(path.join(dir, "docs", "plans", "a.md"), "# edited behind the guard's back\n");
    const { code, stdout } = await runStopGate(dir, sid);
    assert.equal(code, 0);
    const out = JSON.parse(stdout);
    assert.equal(out.decision, undefined, "report only");
    assert.match(out.systemMessage, /guarded docs changed this session without passing the doc guard \(informational\)/);
    assert.match(out.systemMessage, /docs\/plans\/a\.md \(modified\)/);
  } finally { cleanup(dir); }
});

test("stop-gate: a doc edit the doc guard allowed this session, or no snapshot at all, is not reported", async () => {
  const dir = docFixture();
  try {
    const sid = "seen-doc";
    docSnapshotFor(dir, sid);
    fs.writeFileSync(path.join(dir, "docs", "plans", "a.md"), "# edited through Write\n");
    fs.appendFileSync(path.join(dir, ".craftsman", "events.jsonl"), JSON.stringify({ ts: Date.now(), ev: "preguard", sid, file: "docs/plans/a.md", result: "allowed" }) + "\n");
    const seen = await runStopGate(dir, sid);
    assert.doesNotMatch(seen.stdout, /guarded docs changed/);
    const none = await runStopGate(dir, "never-snapshotted");
    assert.doesNotMatch(none.stdout, /guarded docs changed/);
  } finally { cleanup(dir); }
});
