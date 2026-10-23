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
    return spawnSync("node", [tracker], { cwd: repo, env, input: JSON.stringify(input), encoding: "utf8", timeout: 30000 });
  } finally { fs.rmSync(repo, { recursive: true, force: true }); }
}

test("tracker CLI publish (on-approve) exits 0 with one JSON line", () => {
  const r = publish({ action: "publish" });
  assert.equal(r.status, 0, r.stderr);
  const lines = r.stdout.trim().split("\n");
  assert.equal(lines.length, 1);
  assert.equal(JSON.parse(lines[0]).published, false);
});

test("tracker CLI publish --manual settles without an unsettled top-level await", () => {
  const r = publish({ action: "publish", manual: true });
  assert.notEqual(r.status, 13, r.stderr);
  assert.doesNotMatch(r.stderr, /unsettled top-level await/);
});
