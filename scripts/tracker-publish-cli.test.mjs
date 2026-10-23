import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const tracker = path.join(path.dirname(fileURLToPath(import.meta.url)), "tracker.mjs");

function publish(input) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-publish-cli-"));
  try {
    spawnSync("git", ["init", "-q"], { cwd: repo });
    const env = { ...process.env, CLAUDE_PROJECT_DIR: repo };
    return spawnSync(process.execPath, [tracker], { cwd: repo, env, input: JSON.stringify(input), encoding: "utf8", timeout: 30000 });
  } finally { fs.rmSync(repo, { recursive: true, force: true }); }
}

test("tracker CLI publish (on-approve) exits 0 with one JSON line", () => {
  const r = publish({ action: "publish" });
  assert.equal(r.status, 0, r.stderr);
  const lines = r.stdout.trim().split("\n");
  assert.equal(lines.length, 1);
  assert.equal(JSON.parse(lines[0]).published, false);
});

test("tracker CLI lookup for an unknown plan prints exactly null", () => {
  const r = publish({ action: "lookup", plan: "docs/plans/none.md" });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, "null\n");
});

test("tracker CLI publish --manual exits 0 with one JSON line", () => {
  const r = publish({ action: "publish", manual: true });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim().split("\n").length, 1);
  JSON.parse(r.stdout);
  assert.doesNotMatch(r.stderr, /unsettled top-level await/);
});

test("tracker CLI publish of a landed run publishes once, a second call is refused", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-publish-cli-"));
  try {
    const g = (cwd, ...a) => spawnSync("git", ["-C", cwd, ...a], { encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } });
    const bare = path.join(root, "bare"), work = path.join(root, "work");
    fs.mkdirSync(bare); g(bare, "init", "--bare", "-b", "main");
    fs.mkdirSync(work); g(work, "init", "-b", "main");
    fs.writeFileSync(path.join(work, "README.md"), "x\n");
    g(work, "add", "."); g(work, "commit", "-m", "seed"); g(work, "remote", "add", "origin", bare); g(work, "push", "origin", "main");
    fs.writeFileSync(path.join(work, "craftsman.config.json"), JSON.stringify({ tracker: { publish: "on-approve" } }));
    const row = { key: ".::docs/plans/p.md::u1", project: ".", plan: "docs/plans/p.md", unit: "u1", scope_id: null, goal: null, module: "m", status: "MERGED", evidence: "s", session_id: "s", updated_at: "2026-01-01T00:00:00.000Z", decision: null, autonomous: false, criteria: null };
    fs.mkdirSync(path.join(work, ".craftsman", "approvals"), { recursive: true });
    fs.mkdirSync(path.join(work, ".craftsman", "tracker"), { recursive: true });
    fs.writeFileSync(path.join(work, ".craftsman", "tracker", "events.jsonl"), JSON.stringify(row) + "\n");
    const rec = path.join(work, ".craftsman", "approvals", "r1.json");
    fs.writeFileSync(rec, JSON.stringify({ run: "r1", status: "landed" }));
    const env = { ...process.env, CLAUDE_PROJECT_DIR: work };
    const call = () => spawnSync(process.execPath, [tracker], { cwd: work, env, input: JSON.stringify({ action: "publish", approved: true, run: "r1" }), encoding: "utf8", timeout: 30000 });
    const first = call();
    assert.equal(first.status, 0, first.stderr);
    assert.equal(JSON.parse(first.stdout).published, true, first.stdout);
    assert.ok(JSON.parse(fs.readFileSync(rec, "utf8")).published_at);
    const second = JSON.parse(call().stdout);
    assert.equal(second.published, false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("tracker CLI publish --manual settles without an unsettled top-level await", () => {
  const r = publish({ action: "publish", manual: true });
  assert.notEqual(r.status, 13, r.stderr);
  assert.doesNotMatch(r.stderr, /unsettled top-level await/);
});
