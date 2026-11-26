import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { transition } from "./tracker.mjs";

// ARCH-TRACKER-20: no test writes a ledger outside its own fixture. The suites
// that call tracker.mjs run twice against a scratch repository R that already
// holds a committed ledger: once with TMPDIR inside R, once with GIT_DIR set to
// R. Either way R's ledger must stay byte-identical and R must gain no runs/.
const SUITES = ["digest", "run-manifest", "loop-smoke", "tracker"].map((name) => path.join(import.meta.dirname, `${name}.test.mjs`));
const GIT = ["-c", "user.name=isolation", "-c", "user.email=isolation@example.invalid"];

function scratchRepo() {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-isolation-")));
  const env = { ...process.env };
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  execFileSync("git", ["init", "-q", base], { env });
  // The sentinel is a real ledger event, so a leaked write would append to it.
  transition({ plan: "docs/plans/sentinel.md", unit: "sentinel", status: "PENDING" }, { id: ".", root: base, stateDir: path.join(base, ".craftsman") });
  fs.rmSync(path.join(base, ".craftsman", "runs"), { recursive: true, force: true }); // the sentinel's own manifest is not under test
  execFileSync("git", [...GIT, "-C", base, "add", "-f", "-A"], { env });
  execFileSync("git", [...GIT, "-C", base, "commit", "-q", "-m", "sentinel ledger"], { env });
  fs.mkdirSync(path.join(base, "tmp"));
  return base;
}

function runSuites(env) {
  const clean = { ...process.env, ...env };
  delete clean.NODE_TEST_CONTEXT; // a nested `node --test` must report on its own, not as this run's child
  if (!("GIT_DIR" in env)) delete clean.GIT_DIR;
  if (!("GIT_WORK_TREE" in env)) delete clean.GIT_WORK_TREE;
  return spawnSync(process.execPath, ["--test", ...SUITES], { env: clean, encoding: "utf8", timeout: 240000 });
}

function assertEnclosingRepoUntouched(repo, before, run) {
  const ledger = path.join(repo, ".craftsman", "tracker", "events.jsonl");
  const detail = `\n--- inner run (exit ${run.status}) ---\n${run.stdout}${run.stderr}`.slice(-4000);
  assert.equal(fs.readFileSync(ledger, "utf8").length === before.length && fs.readFileSync(ledger).equals(before), true, `the enclosing ledger changed${detail}`);
  assert.equal(fs.existsSync(path.join(repo, ".craftsman", "runs")), false, `the enclosing repo gained .craftsman/runs/${detail}`);
  assert.equal(run.status, 0, `the inner suites failed${detail}`);
}

for (const [name, envFor] of [
  ["TMPDIR inside a scratch git repository", (repo) => ({ TMPDIR: path.join(repo, "tmp") })],
  ["GIT_DIR set to a scratch git repository", (repo) => ({ GIT_DIR: path.join(repo, ".git") })],
]) {
  test(`tracker isolation: ${name} leaves the enclosing ledger and runs/ alone`, () => {
    const repo = scratchRepo();
    try {
      const ledger = path.join(repo, ".craftsman", "tracker", "events.jsonl");
      const before = fs.readFileSync(ledger);
      assert.ok(before.length > 0, "the sentinel ledger exists");
      const run = runSuites(envFor(repo));
      assertEnclosingRepoUntouched(repo, before, run);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });
}

test("fixture-root: gitRootedTmp returns a directory that is its own git root", async () => {
  const { gitRootedTmp } = await import("./lib/fixture-root.mjs");
  const root = gitRootedTmp("craftsman-fixture-root-");
  try {
    assert.equal(execFileSync("git", ["-C", root, "rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim(), root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
