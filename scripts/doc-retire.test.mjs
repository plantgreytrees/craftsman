import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { grantValid, retire } from "./doc-retire.mjs";
import { archivePath, ledgerPath, transition } from "./tracker.mjs";

const fixtures = new Set();
afterEach(() => {
  for (const fixture of fixtures) fs.rmSync(fixture, { recursive: true, force: true });
  fixtures.clear();
});

const run = (root, ...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });
const PLAN = "docs/plans/alpha.md";
const SIB = "docs/plans/scrutinise-alpha.md";

// A real temp git repo: a plan, a closed sibling citing it, and COMPLETE ledger rows.
function repo({ grant = true, sibStatus = "COMPLETE", planStatus = "COMPLETE", files = {} } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-retire-"));
  fixtures.add(root);
  run(root, "init", "-q");
  run(root, "config", "user.email", "t@example.com");
  run(root, "config", "user.name", "t");
  run(root, "config", "commit.gpgsign", "false");
  const all = {
    [PLAN]: "# alpha\n",
    [SIB]: "# scrutinise alpha\nParent: docs/plans/alpha.md\n",
    "README.md": "nothing relevant\n",
    ".gitignore": ".craftsman/\n",
    ...files,
  };
  for (const [file, text] of Object.entries(all)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  }
  run(root, "add", "-A");
  run(root, "commit", "-q", "-m", "init");
  const context = { id: ".", root, stateDir: path.join(root, ".craftsman") };
  for (const [plan, status] of [[PLAN, planStatus], [SIB, sibStatus]]) {
    transition({ plan, unit: "u1", goal: "Ship alpha", status: "PENDING" }, context);
    if (status === "PENDING") continue;
    transition({ plan, unit: "u1", status: "IN_PROGRESS", evidence: "claimed" }, context);
    if (status === "IN_PROGRESS") continue;
    transition({ plan, unit: "u1", status: "MERGED", evidence: "abc" }, context);
    transition({ plan, unit: "u1", status: "COMPLETE", evidence: "abc" }, context);
  }
  if (grant) {
    fs.mkdirSync(context.stateDir, { recursive: true });
    fs.writeFileSync(path.join(context.stateDir, "doc-write-pending"), "granted\n");
  }
  return context;
}

const events = (context) => fs.readFileSync(path.join(context.stateDir, "events.jsonl"), "utf8")
  .split("\n").filter(Boolean).map((line) => JSON.parse(line));
const snapshot = (context) => ({
  head: run(context.root, "rev-parse", "HEAD"),
  status: run(context.root, "status", "--porcelain"),
  ledger: fs.readFileSync(ledgerPath(context), "utf8"),
  archive: fs.existsSync(archivePath(context)),
});

test("doc-retire: no doc-write grant refuses and changes no file and no ledger row", () => {
  const context = repo({ grant: false });
  const before = snapshot(context);
  const out = retire({ plan: PLAN }, context);
  assert.equal(out.refused, true);
  assert.match(out.reason, /no doc-write grant/);
  assert.deepEqual(snapshot(context), before);
  assert.ok(fs.existsSync(path.join(context.root, PLAN)));
});

test("doc-retire: the session marker is accepted as the grant when sid is given", () => {
  const context = repo({ grant: false });
  assert.equal(retire({ plan: PLAN, sid: "s1" }, context).refused, true);
  fs.mkdirSync(path.join(context.stateDir, "sessions", "s1"), { recursive: true });
  fs.writeFileSync(path.join(context.stateDir, "sessions", "s1", "doc-write"), "ok\n");
  assert.equal(retire({ plan: PLAN, sid: "s1" }, context).retired, PLAN);
});

test("doc-retire: any inbound reference refuses, lists every referrer, and no flag bypasses it", () => {
  const context = repo({
    files: {
      "docs/architecture/x.rules.md": "- **X-01** rule — cite: docs/plans/alpha.md:3\n",
      "scripts/thing.test.mjs": "// see alpha\n",
      "docs/plans/TRACKER.md": "alpha row\n",
    },
  });
  const before = snapshot(context);
  for (const extra of [{}, { force: true }, { bypass: true }, { sid: "x", force: true }]) {
    const out = retire({ plan: PLAN, ...extra }, context);
    assert.equal(out.refused, true);
    assert.deepEqual(out.referrers, ["docs/architecture/x.rules.md", "scripts/thing.test.mjs"]);
  }
  assert.deepEqual(snapshot(context), before);
  const refused = events(context).filter((e) => e.ev === "doc_prune_refused");
  assert.equal(refused.length, 4);
  assert.equal(refused[0].path, PLAN);
  assert.deepEqual(refused[0].cited_by, ["docs/architecture/x.rules.md", "scripts/thing.test.mjs"]);
});

test("doc-retire: success removes plan + closed sibling and commits removal + archive together", () => {
  const context = repo();
  const docSha = run(context.root, "rev-parse", "HEAD").trim();
  const out = retire({ plan: PLAN }, context);
  assert.equal(out.retired, PLAN);
  assert.deepEqual(out.siblings, [SIB]);
  assert.equal(out.doc_sha, docSha);
  assert.ok(!fs.existsSync(path.join(context.root, PLAN)));
  assert.ok(!fs.existsSync(path.join(context.root, SIB)));
  assert.equal(run(context.root, "status", "--porcelain").trim(), "");
  assert.equal(run(context.root, "log", "-1", "--format=%s").trim(), `docs: retire ${PLAN}`);
  const changed = run(context.root, "show", "--name-status", "--format=", "HEAD").trim().split("\n").sort();
  assert.ok(changed.includes(`D\t${PLAN}`));
  assert.ok(changed.includes(`D\t${SIB}`));
  assert.ok(changed.some((line) => line.endsWith("docs/plans/TRACKER-archive.md")));
  assert.match(fs.readFileSync(archivePath(context), "utf8"), /alpha#u1/);
  assert.equal(fs.readFileSync(ledgerPath(context), "utf8").trim(), "");
});

test("doc-retire: an open sibling keeps the plan", () => {
  const context = repo({ sibStatus: "IN_PROGRESS" });
  const before = snapshot(context);
  const out = retire({ plan: PLAN }, context);
  assert.equal(out.refused, true);
  assert.match(out.reason, /open sibling/);
  assert.deepEqual(snapshot(context), before);
});

test("doc-retire: an archive refusal leaves files and ledger unchanged", () => {
  const context = repo({ planStatus: "IN_PROGRESS", sibStatus: "COMPLETE" });
  const before = snapshot(context);
  const out = retire({ plan: PLAN }, context);
  assert.equal(out.refused, true);
  assert.match(out.reason, /archive refused/);
  assert.deepEqual(snapshot(context), before);
  assert.ok(fs.existsSync(path.join(context.root, PLAN)));
  assert.ok(fs.existsSync(path.join(context.root, SIB)));
  assert.equal(events(context).filter((e) => e.ev === "doc_retired").length, 0);
});

test("doc-retire: an archive failure keeps unrelated uncommitted docs/plans edits", () => {
  const other = "docs/plans/other.md";
  const context = repo({ planStatus: "IN_PROGRESS", files: { [other]: "# other\n" } });
  fs.writeFileSync(path.join(context.root, other), "# other\nuncommitted edit\n");
  fs.writeFileSync(path.join(context.root, "docs/plans/untracked.md"), "scratch\n");
  const out = retire({ plan: PLAN }, context);
  assert.equal(out.refused, true);
  assert.equal(fs.readFileSync(path.join(context.root, other), "utf8"), "# other\nuncommitted edit\n");
  assert.equal(fs.readFileSync(path.join(context.root, "docs/plans/untracked.md"), "utf8"), "scratch\n");
  assert.ok(fs.existsSync(path.join(context.root, PLAN)));
  assert.match(run(context.root, "status", "--porcelain"), /^ M docs\/plans\/other\.md$/m);
});

test("doc-retire: logs doc_retired {plan, sha, siblings}", () => {
  const context = repo();
  const out = retire({ plan: PLAN }, context);
  const [event] = events(context).filter((e) => e.ev === "doc_retired");
  assert.equal(event.plan, PLAN);
  assert.equal(event.sha, out.sha);
  assert.deepEqual(event.siblings, [SIB]);
});

test("doc-retire: an uncommitted referrer refuses with no change", () => {
  const context = repo({ files: { "notes.md": "plain\n" } });
  fs.writeFileSync(path.join(context.root, "notes.md"), "see docs/plans/alpha.md\n");
  const before = snapshot(context);
  const out = retire({ plan: PLAN }, context);
  assert.equal(out.refused, true);
  assert.deepEqual(out.referrers, ["notes.md"]);
  assert.deepEqual(snapshot(context), before);
  assert.ok(fs.existsSync(path.join(context.root, PLAN)));
});

test("doc-retire: a staged referrer refuses with no change", () => {
  const context = repo({ files: { "notes.md": "plain\n" } });
  fs.writeFileSync(path.join(context.root, "notes.md"), "see docs/plans/alpha.md\n");
  run(context.root, "add", "notes.md");
  fs.writeFileSync(path.join(context.root, "notes.md"), "plain\n");
  const before = snapshot(context);
  const out = retire({ plan: PLAN }, context);
  assert.equal(out.refused, true);
  assert.deepEqual(out.referrers, ["notes.md"]);
  assert.deepEqual(snapshot(context), before);
});

test("doc-retire: an injected git failure refuses 'referrer scan failed' with no change", () => {
  const context = repo();
  const before = snapshot(context);
  context.git = () => { throw Object.assign(new Error("boom"), { status: 128 }); };
  const out = retire({ plan: PLAN }, context);
  assert.equal(out.refused, true);
  assert.match(out.reason, /referrer scan failed/);
  assert.deepEqual(snapshot(context), before);
  assert.ok(fs.existsSync(path.join(context.root, PLAN)));
});

test("doc-retire: a linked worktree refuses; a main checkout under a symlinked path does not", () => {
  const context = repo();
  const linked = path.join(context.root, "..", path.basename(context.root) + "-wt");
  fixtures.add(linked);
  run(context.root, "worktree", "add", "-q", "-b", "wt", linked);
  const wtContext = { id: ".", root: linked, stateDir: path.join(linked, ".craftsman") };
  const before = snapshot(context);
  const out = retire({ plan: PLAN }, wtContext);
  assert.equal(out.refused, true);
  assert.match(out.reason, /run doc-retire from the main checkout/);
  assert.deepEqual(snapshot(context), before);

  const link = context.root + "-link";
  fixtures.add(link);
  try { fs.symlinkSync(context.root, link, "junction"); } catch { return; }
  const viaLink = { id: ".", root: link, stateDir: path.join(link, ".craftsman") };
  const res = retire({ plan: PLAN }, viaLink);
  assert.equal(res.retired, PLAN, JSON.stringify(res));
});

test("doc-retire: grantValid honours pending ttl, session ttl and refuses malformed ttls", () => {
  const now = 10_000_000;
  const base = { now, pendingTtlMs: 1800000, ttlMs: 3600000, sessionMtime: null };
  assert.equal(grantValid({ ...base, pendingMtime: now - 45 * 60000 }), false);
  assert.equal(grantValid({ ...base, pendingMtime: now - 1000 }), true);
  assert.equal(grantValid({ ...base, pendingMtime: now - 120000, pendingTtlMs: 60000 }), false);
  assert.equal(grantValid({ ...base, pendingMtime: null, sessionMtime: now - 45 * 60000 }), true);
  for (const bad of [0, -1, NaN, Infinity, "5", null]) {
    assert.equal(grantValid({ ...base, pendingMtime: now, pendingTtlMs: bad }), false);
    assert.equal(grantValid({ ...base, pendingMtime: now, ttlMs: bad }), false);
  }
});

test("doc-retire: a 45-minute pending marker is refused, a fresh one accepted, even with the guard disabled", () => {
  const context = repo();
  const pending = path.join(context.stateDir, "doc-write-pending");
  const old = new Date(Date.now() - 45 * 60000);
  fs.utimesSync(pending, old, old);
  const before = snapshot(context);
  assert.match(retire({ plan: PLAN }, context).reason, /no doc-write grant/);
  assert.deepEqual(snapshot(context), before);
  fs.writeFileSync(path.join(context.root, "craftsman.config.json"), JSON.stringify({ docWriteGuard: { enabled: false, pendingTtlMs: 60000 } }));
  const stale = new Date(Date.now() - 120000);
  fs.utimesSync(pending, stale, stale);
  assert.match(retire({ plan: PLAN }, context).reason, /no doc-write grant/);
  const now = new Date();
  fs.utimesSync(pending, now, now);
  assert.equal(retire({ plan: PLAN }, context).retired, PLAN);
});

test("doc-retire: a malformed configured ttl refuses", () => {
  const context = repo();
  fs.writeFileSync(path.join(context.root, "craftsman.config.json"), JSON.stringify({ docWriteGuard: { pendingTtlMs: "soon" } }));
  assert.match(retire({ plan: PLAN }, context).reason, /no doc-write grant/);
});
