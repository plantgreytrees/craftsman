import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { claimPath } from "./claim.mjs";
import { projectContext } from "./lib/core.mjs";

const CLAIM = path.join(path.dirname(new URL(import.meta.url).pathname), "claim.mjs");

test("claim: explicitly recovers a stale claim", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-claim-"));
  try {
    spawnSync("git", ["init", "-q"], { cwd: dir });
    const input = { plan: "docs/plans/example.md", unit: "unit-1", project: ".", session_id: "owner" };
    const env = { ...process.env, CLAUDE_PROJECT_DIR: dir };
    assert.equal(spawnSync(process.execPath, [CLAIM], { cwd: dir, env, input: JSON.stringify(input), encoding: "utf8" }).status, 0);
    const lock = claimPath(input.plan, input.unit, ".", { stateDir: path.join(dir, ".craftsman") });
    const ownerPath = path.join(lock, "owner.json");
    const owner = JSON.parse(fs.readFileSync(ownerPath, "utf8"));
    owner.claimed_at = new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString();
    fs.writeFileSync(ownerPath, JSON.stringify(owner));
    const recovered = spawnSync(process.execPath, [CLAIM], {
      cwd: dir, env, input: JSON.stringify({ ...input, action: "recover", confirm: true, session_id: "recovery" }), encoding: "utf8",
    });
    assert.equal(recovered.status, 0, recovered.stderr);
    assert.equal(fs.existsSync(lock), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});