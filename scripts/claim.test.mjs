import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { claimPath, claimsDir } from "./claim.mjs";
import { projectContext } from "./lib/core.mjs";

test("runner S helper: claim and tracker run from the workspace root share the root's claim directory", () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-helper-")));
  try {
    const git = (cwd, ...a) => spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...a], { cwd, encoding: "utf8" });
    const sub = path.join(dir, "svc");
    fs.mkdirSync(sub);
    git(dir, "init", "-q"); git(sub, "init", "-q");
    fs.writeFileSync(path.join(dir, "craftsman.workspace.json"), JSON.stringify({ version: 1, projects: { svc: { root: "svc" } } }));
    git(sub, "commit", "-q", "--allow-empty", "-m", "i");
    const wt = path.join(sub, ".worktrees", "u1");
    assert.equal(git(sub, "worktree", "add", "-q", "-b", "feat/u1", wt).status, 0);
    // The documented form: the cwd comes from agents/unit-runner.md; no environment assignment.
    const doc = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "agents", "unit-runner.md"), "utf8");
    const cwd = /cwd `<project_root>`/.test(doc) ? dir : wt;
    const env = { ...process.env };
    delete env.CLAUDE_PROJECT_DIR; delete env.CLAUDE_CODE_SESSION_ID;
    const script = (name) => path.join(path.dirname(fileURLToPath(import.meta.url)), name);
    const run = (name, input) => spawnSync(process.execPath, [script(name)], { cwd, env, input: JSON.stringify(input), encoding: "utf8" });
    const base = { plan: "docs/plans/p.md", unit: "u1", session_id: "root", worktree_path: wt };
    const claimed = run("claim.mjs", base);
    assert.equal(claimed.status, 0, claimed.stderr);
    const tracked = run("tracker.mjs", { ...base, action: "transition", project: "svc", status: "IN_PROGRESS", evidence: "unit-runner" });
    assert.equal(tracked.status, 0, tracked.stderr);
    const lock = claimPath(base.plan, base.unit, ".", { stateDir: path.join(dir, ".craftsman") });
    assert.equal(fs.existsSync(lock), true);
    assert.equal(fs.existsSync(path.join(sub, ".craftsman", "claims")), false);
    assert.equal(run("claim.mjs", { ...base, action: "release" }).status, 0);
    assert.equal(fs.existsSync(lock), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

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

test("claim: a claim from a linked worktree shares the main checkout's lock", () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-claim-")));
  try {
    const git = (...args) => spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], { cwd: dir });
    git("init", "-q", "-b", "main");
    git("commit", "-q", "--allow-empty", "-m", "init");
    const wt = path.join(dir, ".worktrees", "u");
    assert.equal(git("worktree", "add", "-q", wt, "-b", "feat/u").status, 0);
    const input = { plan: "docs/plans/example.md", unit: "unit-1", project: ".", session_id: "owner" };
    const run = (cwd, extra = {}) => spawnSync(process.execPath, [CLAIM], {
      cwd, env: { ...process.env, CLAUDE_PROJECT_DIR: cwd }, input: JSON.stringify({ ...input, ...extra }), encoding: "utf8",
    });
    assert.equal(run(dir).status, 0);
    assert.equal(run(wt, { session_id: "other" }).status, 2, "worktree claim must collide with the root claim");
    assert.equal(fs.existsSync(path.join(wt, ".craftsman", "claims")), false);
    assert.equal(run(wt, { action: "release", session_id: "other" }).status, 2, "a non-owner cannot release");
    assert.equal(run(wt, { action: "release" }).status, 0);
    assert.equal(fs.existsSync(claimPath(input.plan, input.unit, ".", { root: dir })), false);
    assert.equal(run(wt, { session_id: "other" }).status, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("claim: claimsDir is the main checkout's; transfer and recover work from a linked worktree", () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-claim-")));
  try {
    const git = (...args) => spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], { cwd: dir });
    git("init", "-q", "-b", "main");
    git("commit", "-q", "--allow-empty", "-m", "init");
    const wt = path.join(dir, ".worktrees", "u");
    assert.equal(git("worktree", "add", "-q", wt, "-b", "feat/u").status, 0);
    assert.equal(claimsDir({ root: wt }), path.join(dir, ".craftsman", "claims"));
    assert.equal(claimsDir({ stateDir: path.join(dir, ".craftsman") }), path.join(dir, ".craftsman", "claims"));

    const input = { plan: "docs/plans/example.md", unit: "unit-1", project: ".", session_id: "old" };
    const run = (payload) => spawnSync(process.execPath, [CLAIM], {
      cwd: wt, env: { ...process.env, CLAUDE_PROJECT_DIR: wt }, input: JSON.stringify(payload), encoding: "utf8",
    });
    assert.equal(run(input).status, 0);
    const lock = claimPath(input.plan, input.unit, ".", { root: wt });
    assert.equal(path.dirname(lock), claimsDir({ root: wt }));
    const moved = run({ ...input, session_id: "new", action: "transfer", from_session: "old", confirm: true });
    assert.equal(moved.status, 0, moved.stderr);
    const ownerPath = path.join(lock, "owner.json");
    const owner = JSON.parse(fs.readFileSync(ownerPath, "utf8"));
    assert.equal(owner.session_id, "new");

    owner.claimed_at = new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString();
    fs.writeFileSync(ownerPath, JSON.stringify(owner));
    const recovered = run({ ...input, session_id: "r", action: "recover", confirm: true });
    assert.equal(recovered.status, 0, recovered.stderr);
    assert.equal(fs.existsSync(lock), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
