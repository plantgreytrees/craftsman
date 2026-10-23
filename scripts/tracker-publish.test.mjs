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
  // The shipped default is "on-approve"; these tests exercise the push path.
  fs.writeFileSync(path.join(dir, "craftsman.config.json"), JSON.stringify({ tracker: { publish: "push" } }));
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

function onApprove(ctx) {
  fs.writeFileSync(path.join(ctx.root, "craftsman.config.json"), JSON.stringify({ tracker: { publish: "on-approve" } }));
}
function record(ctx, run, status) {
  const dir = path.join(ctx.root, ".craftsman", "approvals");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${run}.json`), JSON.stringify({ run, status }));
}

test("publish: on-approve refuses approved:true without a run or with a run not landed", () => {
  const { bare } = remote();
  const a = clone(bare);
  seedLedger(a); onApprove(a);
  const before = git(bare, "rev-parse", "main");
  record(a, "r-decided", "decided");
  for (const input of [{ approved: true }, { approved: true, run: "r-missing" }, { approved: true, run: "r-decided" }, { approved: true, run: "../x" }]) {
    assert.equal(publishTracker(input, a).published, false);
  }
  assert.equal(git(bare, "rev-parse", "main"), before);
});

test("publish: on-approve publishes for a landed run record or manual:true", () => {
  const a = clone(remote().bare), b = clone(remote().bare);
  seedLedger(a); onApprove(a); record(a, "r1", "landed");
  assert.equal(publishTracker({ approved: true, run: "r1" }, a).published, true);
  seedLedger(b); onApprove(b);
  assert.equal(publishTracker({ manual: true }, b).published, true);
});

test("publish: legacy push mode logs tracker_publish_unapproved", () => {
  const { bare } = remote();
  const a = clone(bare);
  seedLedger(a);
  publishTracker({}, a);
  assert.match(fs.readFileSync(path.join(a.stateDir, "events.jsonl"), "utf8"), /tracker_publish_unapproved/);
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

function blankedFixture() {
  const { bare } = remote();
  const a = clone(bare);
  seedLedger(a);
  assert.equal(publishTracker({}, a).published, true);
  const fresh = clone(bare);
  fs.mkdirSync(path.dirname(ledgerPath(fresh)), { recursive: true });
  fs.writeFileSync(ledgerPath(fresh), "");
  return fresh;
}

const evLine = (ev) => JSON.stringify({ ts: 1, ev }) + "\n";
function writeLog(ctx, ...evs) {
  fs.mkdirSync(ctx.stateDir, { recursive: true });
  fs.writeFileSync(path.join(ctx.stateDir, "events.jsonl"), evs.map(evLine).join(""));
}

test("publish: unset stateDir refuses and never reads the process cwd", () => {
  const fresh = blankedFixture();
  const cwdDir = tmp("cwd");
  fs.writeFileSync(path.join(cwdDir, "events.jsonl"), evLine("tracker_archived"));
  const old = process.cwd();
  process.chdir(cwdDir);
  try {
    const { stateDir, ...noState } = fresh;
    const refused = publishTracker({}, noState);
    assert.equal(refused.published, false);
    assert.match(refused.refused, /blank/);
  } finally { process.chdir(old); }
});

test("publish: an archive event before the last publish cannot unlock; one after it can", () => {
  const fresh = blankedFixture();
  writeLog(fresh, "tracker_archived", "tracker_published");
  assert.match(publishTracker({}, fresh).refused, /blank/);
  writeLog(fresh, "tracker_archived", "tracker_published", "doc_retired");
  assert.equal(publishTracker({}, fresh).published, true);
});

test("publish: a log with no publish line and an archive event unlocks", () => {
  const fresh = blankedFixture();
  writeLog(fresh, "tracker_archived");
  assert.equal(publishTracker({}, fresh).published, true);
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

function manyRows(n) {
  return Array.from({ length: n }, (_, i) => ({ ...EVENTS[0], key: `.::docs/plans/p.md::m${i}`, unit: `m${i}` }));
}

function shrunkFixture({ dropJsonl = false } = {}) {
  const { bare } = remote();
  const a = clone(bare);
  seedLedger(a, manyRows(50));
  assert.equal(publishTracker({}, a).published, true);
  if (dropJsonl) {
    const other = clone(bare);
    git(other.root, "rm", "-q", "docs/plans/TRACKER.jsonl");
    git(other.root, "commit", "-m", "drop jsonl"); git(other.root, "push", "origin", "main");
  }
  const fresh = clone(bare);
  seedLedger(fresh, manyRows(5));
  return { bare, fresh };
}

test("publish guard: 50 committed rows vs 5 local rows is refused and logs the dropped keys", () => {
  const { bare, fresh } = shrunkFixture();
  const before = git(bare, "rev-parse", "main");
  const result = publishTracker({}, fresh);
  assert.equal(result.published, false);
  assert.ok(result.refused);
  assert.equal(git(bare, "rev-parse", "main"), before);
  const log = fs.readFileSync(path.join(fresh.stateDir, "events.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const ev = log.find((e) => e.ev === "tracker_publish_refused");
  assert.equal(ev.dropped.length, 45);
});

test("publish guard: TRACKER.jsonl absent, the committed block alone guards the rows", () => {
  const { bare, fresh } = shrunkFixture({ dropJsonl: true });
  const before = git(bare, "rev-parse", "main");
  assert.equal(publishTracker({}, fresh).published, false);
  assert.equal(git(bare, "rev-parse", "main"), before);
});

test("publish guard: an archive event for another plan does not excuse the dropped rows; one for the dropped plan does", () => {
  const planLog = (ctx, plan) => {
    fs.mkdirSync(ctx.stateDir, { recursive: true });
    fs.writeFileSync(path.join(ctx.stateDir, "events.jsonl"), JSON.stringify({ ts: 1, ev: "tracker_archived", plan, units: 1 }) + "\n");
  };
  const other = shrunkFixture();
  planLog(other.fresh, "docs/plans/other.md");
  assert.equal(publishTracker({}, other.fresh).published, false);
  const same = shrunkFixture();
  planLog(same.fresh, "docs/plans/p.md");
  assert.equal(publishTracker({}, same.fresh).published, true);
});

test("publish guard: archived:true or a later archive event lets the shrink through", () => {
  const { fresh } = shrunkFixture();
  assert.equal(publishTracker({ archived: true }, fresh).published, true);
  const second = shrunkFixture();
  writeLog(second.fresh, "tracker_archived");
  assert.equal(publishTracker({}, second.fresh).published, true);
});
