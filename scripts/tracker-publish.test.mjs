import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { publishTracker } from "./tracker-publish.mjs";
import { ledgerPath, transition } from "./tracker.mjs";
import { forceBlocked } from "./lib/force-block.mjs";

const fixtures = [];
const ENV = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t", LC_ALL: "C" };
Object.assign(process.env, { GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" });
const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", env: ENV }).trim();

afterEach(() => { for (const f of fixtures.splice(0)) fs.rmSync(f, { recursive: true, force: true }); });

function tmp(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `craftsman-pub-${name}-`));
  fixtures.push(dir);
  return dir;
}

function remote() {
  const bare = tmp("bare");
  git(bare, "init", "--bare", "-b", "main");
  const seed = tmp("seed");
  git(seed, "init", "-b", "main");
  fs.writeFileSync(path.join(seed, "README.md"), "seed\n");
  git(seed, "add", "."); git(seed, "commit", "-m", "seed");
  git(seed, "remote", "add", "origin", bare);
  git(seed, "push", "origin", "main");
  return { bare, seed };
}

function clone(bare) {
  const dir = tmp("clone");
  execFileSync("git", ["clone", "-q", bare, dir], { env: ENV });
  return { id: ".", root: dir, stateDir: path.join(dir, ".craftsman") };
}

const EVENTS = [
  { key: ".::docs/plans/p.md::u1", project: ".", plan: "docs/plans/p.md", unit: "u1", scope_id: null, goal: null, module: "m", status: "MERGED", evidence: "sha1", session_id: "s", updated_at: "2026-01-01T00:00:00.000Z", decision: null, autonomous: false, criteria: null },
  { key: ".::docs/plans/p.md::u2", project: ".", plan: "docs/plans/p.md", unit: "u2", scope_id: null, goal: null, module: null, status: "PENDING", evidence: null, session_id: "s", updated_at: "2026-01-01T00:00:00.000Z", decision: null, autonomous: false, criteria: null },
];

function seedLedger(ctx, events = EVENTS) {
  const file = ledgerPath(ctx);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, events.map((e) => JSON.stringify(e)).join("\n") + "\n");
}

test("publish: two ledgers with the same rows publish identical bytes, second is a no-op", () => {
  const { bare } = remote();
  const a = clone(bare), b = clone(bare);
  seedLedger(a); seedLedger(b);
  const first = publishTracker({}, a);
  assert.equal(first.published, true);
  const bytes = git(a.root, "show", "origin/main:docs/plans/TRACKER.jsonl");
  const second = publishTracker({}, b);
  assert.equal(second.published, false);
  assert.equal(second.unchanged, true);
  assert.equal(git(bare, "show", "main:docs/plans/TRACKER.jsonl"), bytes);
  assert.match(git(bare, "show", "main:docs/plans/TRACKER.md"), /craftsman:ledger:begin/);
  assert.match(git(bare, "log", "-1", "--format=%s", "main"), /^docs\(tracker\):/);
  assert.deepEqual(git(bare, "show", "--name-only", "--format=", "main").split("\n").sort(), ["docs/plans/TRACKER.jsonl", "docs/plans/TRACKER.md"]);
  assert.equal(fs.readdirSync(path.join(a.root, ".git", ".craftsman", "publish")).length, 0);
});

test("publish: a competing push is retried once against the new base", () => {
  const { bare } = remote();
  const a = clone(bare), other = clone(bare);
  seedLedger(a);
  const result = publishTracker({}, a, {
    beforePush(attempt) {
      if (attempt !== 1) return;
      fs.writeFileSync(path.join(other.root, "other.txt"), "x\n");
      git(other.root, "add", "."); git(other.root, "commit", "-m", "competing");
      git(other.root, "push", "origin", "main");
    },
  });
  assert.equal(result.published, true);
  assert.equal(result.attempt, 2);
  assert.equal(git(bare, "show", "main:other.txt"), "x");
  assert.ok(git(bare, "show", "main:docs/plans/TRACKER.jsonl"));
});

test("publish: off mode is a no-op", () => {
  const { bare } = remote();
  const a = clone(bare);
  seedLedger(a);
  fs.writeFileSync(path.join(a.root, "craftsman.config.json"), JSON.stringify({ tracker: { publish: "off" } }));
  const before = git(bare, "rev-parse", "main");
  assert.deepEqual(publishTracker({}, a), { published: false, mode: "off" });
  assert.equal(git(bare, "rev-parse", "main"), before);
});

test("publish: refuses to blank a committed non-empty block without an archive event", () => {
  const { bare } = remote();
  const a = clone(bare);
  seedLedger(a);
  assert.equal(publishTracker({}, a).published, true);
  const fresh = clone(bare);
  fs.mkdirSync(path.dirname(ledgerPath(fresh)), { recursive: true });
  fs.writeFileSync(ledgerPath(fresh), "");
  const before = git(bare, "rev-parse", "main");
  const refused = publishTracker({}, fresh);
  assert.equal(refused.published, false);
  assert.match(refused.refused, /blank/);
  assert.equal(git(bare, "rev-parse", "main"), before);
  assert.equal(publishTracker({ archived: true }, fresh).published, true);
  assert.equal(git(bare, "show", "main:docs/plans/TRACKER.jsonl"), "");
});

test("publish: a checkout merely behind origin cannot blank the block; a real archive event can", () => {
  const { bare } = remote();
  const a = clone(bare);
  seedLedger(a);
  assert.equal(publishTracker({}, a).published, true);
  // Another checkout changes the archive file on origin; `fresh` is cloned before and stays behind.
  const fresh = clone(bare);
  fs.mkdirSync(path.dirname(ledgerPath(fresh)), { recursive: true });
  fs.writeFileSync(ledgerPath(fresh), "");
  const other = clone(bare);
  fs.writeFileSync(path.join(other.root, "docs/plans/TRACKER-archive.md"), "archived elsewhere\n");
  git(other.root, "add", "."); git(other.root, "commit", "-m", "archive"); git(other.root, "push", "origin", "main");
  const refused = publishTracker({}, fresh);
  assert.equal(refused.published, false);
  assert.match(refused.refused, /blank/);
  fs.mkdirSync(fresh.stateDir, { recursive: true });
  fs.writeFileSync(path.join(fresh.stateDir, "events.jsonl"), JSON.stringify({ ts: 1, ev: "tracker_archived", plan: "p", units: 2 }) + "\n");
  assert.equal(publishTracker({}, fresh).published, true);
  assert.equal(git(bare, "show", "main:docs/plans/TRACKER.jsonl"), "");
});

test("publish: a failed worktree remove then a retry succeeds", () => {
  const { bare } = remote();
  const a = clone(bare), other = clone(bare);
  seedLedger(a);
  const result = publishTracker({}, a, {
    beforePush(attempt) {
      if (attempt !== 1) return;
      // An untracked file makes `git worktree remove` fail, leaving a stale registration after rm.
      const dir = path.join(a.root, ".git", ".craftsman", "publish");
      fs.writeFileSync(path.join(dir, fs.readdirSync(dir)[0], "junk.txt"), "x\n");
      fs.writeFileSync(path.join(other.root, "other.txt"), "x\n");
      git(other.root, "add", "."); git(other.root, "commit", "-m", "competing");
      git(other.root, "push", "origin", "main");
    },
  });
  assert.equal(result.published, true);
  assert.equal(result.attempt, 2);
});

test("init: rehydrates an absent local ledger from TRACKER.jsonl", () => {
  const { bare } = remote();
  const a = clone(bare);
  seedLedger(a);
  publishTracker({}, a);
  const fresh = clone(bare);
  assert.equal(fs.existsSync(ledgerPath(fresh)), false);
  const out = JSON.parse(execFileSync("node", [new URL("./tracker.mjs", import.meta.url).pathname], {
    input: JSON.stringify({ action: "init", project: "." }), cwd: fresh.root, encoding: "utf8",
    env: { ...ENV, CLAUDE_PROJECT_DIR: fresh.root },
  }));
  assert.equal(out.ledger, ledgerPath(fresh));
  const rows = fs.readFileSync(ledgerPath(fresh), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.deepEqual(rows.map((r) => r.key), EVENTS.map((e) => e.key));
  // An existing ledger is never overwritten.
  fs.writeFileSync(ledgerPath(fresh), "");
  execFileSync("node", [new URL("./tracker.mjs", import.meta.url).pathname], { input: JSON.stringify({ action: "init" }), cwd: fresh.root, env: { ...ENV, CLAUDE_PROJECT_DIR: fresh.root } });
  assert.equal(fs.readFileSync(ledgerPath(fresh), "utf8"), "");
});

test("force block: allows the plain publish push, still blocks force flags", async () => {
  assert.equal(await forceBlocked("git push origin HEAD:main"), null);
  for (const cmd of ["git push --force origin HEAD:main", "git push -f origin HEAD:main", "git push --force-with-lease origin HEAD:main", "git push origin +HEAD:main"]) {
    assert.ok(await forceBlocked(cmd), cmd);
  }
});
