import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { claimPath } from "./claim.mjs";
import { projectContext } from "./lib/core.mjs";

const CLAIM = path.join(path.dirname(fileURLToPath(import.meta.url)), "claim.mjs");

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

test("claim: transfer hands a claim to the replacing session, never one owned by someone else", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-claim-"));
  try {
    spawnSync("git", ["init", "-q"], { cwd: dir });
    const input = { plan: "docs/plans/example.md", unit: "unit-1", project: ".", session_id: "old" };
    const env = { ...process.env, CLAUDE_PROJECT_DIR: dir };
    const run = (payload) => spawnSync(process.execPath, [CLAIM], { cwd: dir, env, input: JSON.stringify(payload), encoding: "utf8" });
    assert.equal(run(input).status, 0);
    const ownerPath = path.join(claimPath(input.plan, input.unit, ".", { stateDir: path.join(dir, ".craftsman") }), "owner.json");

    assert.notEqual(run({ ...input, session_id: "new", action: "transfer", from_session: "old" }).status, 0, "needs confirm");
    const stolen = run({ ...input, session_id: "new", action: "transfer", from_session: "other", confirm: true });
    assert.notEqual(stolen.status, 0);
    assert.match(stolen.stderr, /owned by old/);

    const moved = run({ ...input, session_id: "new", action: "transfer", from_session: "old", confirm: true });
    assert.equal(moved.status, 0, moved.stderr);
    const owner = JSON.parse(fs.readFileSync(ownerPath, "utf8"));
    assert.equal(owner.session_id, "new");
    assert.equal(owner.transferred_from, "old");
    assert.match(run({ ...input, session_id: "new" }).stdout, /already claimed by this session/);

    // A still-running owner keeps its claim.
    const config = path.join(dir, "config");
    fs.mkdirSync(path.join(config, "sessions"), { recursive: true });
    fs.writeFileSync(path.join(config, "sessions", "1.json"), JSON.stringify({ pid: process.pid, sessionId: "new" }));
    const live = spawnSync(process.execPath, [CLAIM], { cwd: dir, env: { ...env, CLAUDE_CONFIG_DIR: config },
      input: JSON.stringify({ ...input, session_id: "third", action: "transfer", from_session: "new", confirm: true }), encoding: "utf8" });
    assert.notEqual(live.status, 0);
    assert.match(live.stderr, /still running/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test("claim: feature:<id> units are exclusive across sessions and the ':' is sanitised in the lock path", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-claim-"));
  try {
    spawnSync("git", ["init", "-q"], { cwd: dir });
    const input = { plan: "docs/plans/example.md", unit: "feature:auth", project: ".", session_id: "first" };
    const env = { ...process.env, CLAUDE_PROJECT_DIR: dir };
    const run = (payload) => spawnSync(process.execPath, [CLAIM], { cwd: dir, env, input: JSON.stringify(payload), encoding: "utf8" });
    const lock = claimPath(input.plan, input.unit, ".", { stateDir: path.join(dir, ".craftsman") });
    assert.equal(path.basename(lock).includes(":"), false);
    assert.match(path.basename(lock), /feature_auth\.lock$/);

    assert.equal(run(input).status, 0);
    assert.equal(fs.existsSync(lock), true);
    const second = run({ ...input, session_id: "second" });
    assert.equal(second.status, 2);
    assert.match(second.stderr, /unit already claimed/);
    assert.match(run(input).stdout, /already claimed by this session/);

    // A different feature is independent.
    assert.equal(run({ ...input, unit: "feature:billing", session_id: "second" }).status, 0);

    // Stale recovery is unchanged for feature units.
    const ownerPath = path.join(lock, "owner.json");
    const owner = JSON.parse(fs.readFileSync(ownerPath, "utf8"));
    owner.claimed_at = new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString();
    fs.writeFileSync(ownerPath, JSON.stringify(owner));
    assert.equal(run({ ...input, action: "recover", confirm: true, session_id: "second" }).status, 0);
    assert.equal(fs.existsSync(lock), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
