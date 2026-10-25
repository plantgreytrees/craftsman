import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { findReferrers, grantValid, landingCapability, retire, retireCheck } from "./doc-retire.mjs";
import { resolveArchive as resolveArchiveReal } from "./lib/archive.mjs";
import { loadIndex } from "./lib/plan-index.mjs";
import { classifyArchive } from "./lib/archive.mjs";
import { archivePath, ledgerPath, lookupArchive, transition } from "./tracker.mjs";

const fixtures = new Set();
afterEach(() => {
  for (const fixture of fixtures) fs.rmSync(fixture, { recursive: true, force: true });
  fixtures.clear();
});

const run = (root, ...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });
const PLAN = "docs/plans/alpha.md";
const SIB = "docs/plans/scrutinise-alpha.md";

// A real temp git repo: a plan, a closed sibling citing it, and COMPLETE ledger rows.
function repo({ grant = true, sibStatus = "COMPLETE", planStatus = "COMPLETE", files = {}, goal = "Ship alpha", dirName = null } = {}) {
  let root = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-retire-"));
  fixtures.add(root);
  if (dirName) { root = path.join(root, dirName); fs.mkdirSync(root); }
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
  const stateDir = path.join(root, ".craftsman");
  const context = { id: ".", root, stateDir, grantStateDir: stateDir };
  for (const [plan, status] of [[PLAN, planStatus], [SIB, sibStatus]]) {
    transition({ plan, unit: "u1", goal, status: "PENDING" }, context);
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

test("doc-retire: always requires the grant, whatever CRAFTSMAN_SAFETY says in its own environment, and under safety off it says why (47.1)", () => {
  const was = process.env.CRAFTSMAN_SAFETY;
  try {
    process.env.CRAFTSMAN_SAFETY = "off";
    const off = repo({ grant: false });
    const refused = retire({ plan: PLAN }, off);
    assert.equal(refused.refused, true, "a variable a child process can set grants nothing");
    assert.match(refused.reason, /CRAFTSMAN_SAFETY=off/);
    assert.match(refused.reason, /session with safety on/);
    assert.doesNotMatch(refused.reason, /run doc-write\.mjs first/, "doc-write.mjs grants nothing there, so it must not be suggested");
    assert.ok(fs.existsSync(path.join(off.root, PLAN)), "the plan doc is still there");
    delete process.env.CRAFTSMAN_SAFETY;
    const on = retire({ plan: PLAN }, repo({ grant: false }));
    assert.equal(on.refused, true);
    assert.match(on.reason, /no doc-write grant \(run doc-write\.mjs first\)/);
  } finally { if (was === undefined) delete process.env.CRAFTSMAN_SAFETY; else process.env.CRAFTSMAN_SAFETY = was; }
});

test("doc-retire: run as the loop form runs it (the variable exported to the child), the command line still refuses and deletes nothing (47.2)", () => {
  const context = repo({ grant: false });
  const env = { ...process.env, CRAFTSMAN_SAFETY: "off", CLAUDE_PROJECT_DIR: context.root, CLAUDE_CODE_SESSION_ID: "loop" };
  const r = spawnSync(process.execPath, [path.join(path.dirname(fileURLToPath(import.meta.url)), "doc-retire.mjs")], {
    cwd: context.root, env, input: JSON.stringify({ plan: PLAN }), encoding: "utf8" });
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stdout, /refused/);
  assert.ok(fs.existsSync(path.join(context.root, PLAN)), "the plan doc is untouched");
  assert.equal(run(context.root, "log", "--oneline").split("\n").filter(Boolean).length, 1, "and nothing was committed");
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
  const viaLink = { id: ".", root: link, stateDir: path.join(link, ".craftsman"), grantStateDir: context.grantStateDir };
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

test("doc-retire: a failing pre-commit hook refuses and leaves index, tree and status untouched", () => {
  const context = repo();
  run(context.root, "add", "-A");
  run(context.root, "commit", "-q", "-m", "tracker doc");
  const hooks = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-retire-hooks-"));
  fixtures.add(hooks);
  const marker = path.join(hooks, "ran");
  fs.writeFileSync(path.join(hooks, "pre-commit"), `#!/bin/sh\necho ran > "${marker}"\nexit 1\n`, { mode: 0o755 });
  run(context.root, "config", "core.hooksPath", hooks);
  const before = snapshot(context);
  const out = retire({ plan: PLAN }, context);
  assert.equal(out.refused, true);
  assert.ok(fs.existsSync(marker));
  assert.deepEqual(snapshot(context), before);
  run(context.root, "diff", "--cached", "--quiet");
  assert.equal(run(context.root, "status", "--porcelain"), "");
  assert.ok(fs.existsSync(path.join(context.root, PLAN)));
  assert.ok(fs.existsSync(path.join(context.root, SIB)));
});

test("doc-retire: an archive failure restores the whole index, keeping unrelated staged content", () => {
  const context = repo({ planStatus: "IN_PROGRESS" });
  fs.writeFileSync(path.join(context.root, "staged.md"), "staged\n");
  run(context.root, "add", "staged.md");
  fs.writeFileSync(path.join(context.root, "README.md"), "nothing relevant\nedited\n");
  run(context.root, "add", "README.md");
  const tree = run(context.root, "write-tree");
  const out = retire({ plan: PLAN }, context);
  assert.equal(out.refused, true);
  assert.match(out.reason, /archive refused/);
  assert.equal(run(context.root, "write-tree"), tree);
  assert.match(run(context.root, "status", "--porcelain"), /^A  staged\.md$/m);
});

test("doc-retire: unmerged index entries refuse before any change", () => {
  const context = repo();
  const f = "conflict.md";
  const base = run(context.root, "rev-parse", "--abbrev-ref", "HEAD").trim();
  run(context.root, "checkout", "-q", "-b", "other");
  fs.writeFileSync(path.join(context.root, f), "a\n"); run(context.root, "add", f); run(context.root, "commit", "-q", "-m", "a");
  run(context.root, "checkout", "-q", base);
  fs.writeFileSync(path.join(context.root, f), "b\n"); run(context.root, "add", f); run(context.root, "commit", "-q", "-m", "b");
  try { run(context.root, "merge", "other"); } catch { /* conflict expected */ }
  const out = retire({ plan: PLAN }, context);
  assert.equal(out.refused, true);
  assert.match(out.reason, /snapshot the index/);
  assert.ok(fs.existsSync(path.join(context.root, PLAN)));
});

test("doc-retire: a parent with live descendants is refused with no change", () => {
  const context = repo({
    files: {
      [PLAN]: "---\nlevel: epic\nchildren: [beta]\n---\n# alpha\n",
      "docs/plans/beta.md": "---\nparent: alpha\n---\n# beta\n",
    },
  });
  const before = snapshot(context);
  const out = retire({ plan: PLAN }, context);
  assert.equal(out.refused, true);
  assert.match(out.reason, /live descendants: beta/);
  assert.deepEqual(snapshot(context), before);
  assert.ok(fs.existsSync(path.join(context.root, PLAN)));
});

test("doc-retire: success removes the rollup and writes the full DOCS-09 heading", () => {
  const rollup = "docs/plans/alpha/TRACKER.md";
  const context = repo({ files: { [rollup]: "rollup\n" } });
  const docSha = run(context.root, "rev-parse", "HEAD").trim();
  const out = retire({ plan: PLAN }, context);
  assert.equal(out.retired, PLAN, JSON.stringify(out));
  assert.ok(!fs.existsSync(path.join(context.root, rollup)));
  assert.equal(run(context.root, "status", "--porcelain").trim(), "");
  assert.ok(run(context.root, "show", "--name-status", "--format=", "HEAD").includes(`D\t${rollup}`));
  const date = new Date().toISOString().slice(0, 10);
  const archive = fs.readFileSync(archivePath(context), "utf8");
  assert.ok(archive.includes(`## ${PLAN} (${date}) — Ship alpha · doc ${docSha} · landed ${docSha}`), archive);
});

test("doc-retire: a goal-less row still writes the full heading, goal from front-matter, H1 or slug", () => {
  const date = new Date().toISOString().slice(0, 10);
  for (const [body, want] of [
    ["---\ngoal: Front goal\n---\n# Title\n", "Front goal"],
    ["# Only H1\n", "Only H1"],
    ["no heading\n", "alpha"],
  ]) {
    const context = repo({ goal: null, files: { [PLAN]: body } });
    const docSha = run(context.root, "rev-parse", "HEAD").trim();
    const out = retire({ plan: PLAN }, context);
    assert.equal(out.retired, PLAN, JSON.stringify(out));
    const archive = fs.readFileSync(archivePath(context), "utf8");
    assert.ok(archive.includes(`## ${PLAN} (${date}) — ${want} · doc ${docSha} · landed ${docSha}`), archive);
  }
});

const EPIC = "---\nlevel: epic\nchildren: [beta]\n---\n# alpha\n";
const CHILD = "---\nparent: alpha\n---\n# beta\n";
function addBetaRows(context, status) {
  const beta = "docs/plans/beta.md";
  transition({ plan: beta, unit: "u1", goal: "Ship beta", status: "PENDING" }, context);
  if (status === "PENDING") return;
  transition({ plan: beta, unit: "u1", status: "IN_PROGRESS", evidence: "claimed" }, context);
  if (status === "IN_PROGRESS") return;
  transition({ plan: beta, unit: "u1", status: "MERGED", evidence: "abc" }, context);
  transition({ plan: beta, unit: "u1", status: "COMPLETE", evidence: "abc" }, context);
}
// Transitions regenerate rollups in the tree; commit them so the tree is clean.
const settle = (context) => { run(context.root, "add", "-A"); try { run(context.root, "commit", "-q", "-m", "rollups"); } catch { /* nothing to commit */ } };

test("doc-retire: an epic with a COMPLETE child retires both docs and both rollups in one commit", () => {
  const files = {
    [PLAN]: EPIC, "docs/plans/beta.md": CHILD,
    "docs/plans/alpha/TRACKER.md": "alpha rollup\nbeta\n", "docs/plans/beta/TRACKER.md": "beta rollup\n",
  };
  const context = repo({ files });
  addBetaRows(context, "COMPLETE");
  settle(context);
  const out = retire({ plan: PLAN }, context);
  assert.equal(out.retired, PLAN, JSON.stringify(out));
  const gone = run(context.root, "show", "--name-status", "--format=", "HEAD");
  for (const f of [PLAN, SIB, "docs/plans/beta.md", "docs/plans/alpha/TRACKER.md", "docs/plans/beta/TRACKER.md"]) {
    assert.ok(gone.includes(`D\t${f}`), `${f} in ${gone}`);
  }
  assert.equal(run(context.root, "status", "--porcelain").trim(), "");
  const archive = fs.readFileSync(archivePath(context), "utf8");
  assert.match(archive, /## docs\/plans\/beta\.md \(.*\) — Ship beta · doc \S+ · landed \S+/);
  assert.equal(fs.readFileSync(ledgerPath(context), "utf8").trim(), "");
});

test("doc-retire: an epic with an open child is refused naming it", () => {
  const context = repo({ files: { [PLAN]: EPIC, "docs/plans/beta.md": CHILD } });
  addBetaRows(context, "IN_PROGRESS");
  settle(context);
  const before = snapshot(context);
  const out = retire({ plan: PLAN }, context);
  assert.equal(out.refused, true);
  assert.match(out.reason, /live descendants: beta/);
  assert.deepEqual(snapshot(context), before);
});

test("doc-retire: a child is not refused for its parent's rollup or children list", () => {
  const context = repo({
    files: {
      [PLAN]: EPIC, "docs/plans/beta.md": CHILD,
      "docs/plans/alpha/TRACKER.md": "rollup mentions docs/plans/beta.md\n",
    },
  });
  addBetaRows(context, "COMPLETE");
  settle(context);
  const out = retire({ plan: "docs/plans/beta.md" }, context);
  assert.equal(out.retired, "docs/plans/beta.md", JSON.stringify(out));
  assert.ok(fs.existsSync(path.join(context.root, PLAN)));
});

test("doc-retire: a rows-less epic archives with the full heading and lookup round-trips", () => {
  const context = repo({ files: { [PLAN]: EPIC.replace("children: [beta]\n", ""), "docs/plans/alpha/TRACKER.md": "r\n" } });
  fs.rmSync(ledgerPath(context), { force: true });
  settle(context);
  const docSha = run(context.root, "rev-parse", "HEAD").trim();
  const out = retire({ plan: PLAN, goal: "Ship the epic" }, context);
  assert.equal(out.retired, PLAN, JSON.stringify(out));
  assert.ok(!fs.existsSync(path.join(context.root, "docs/plans/alpha/TRACKER.md")));
  const found = lookupArchive({ plan: PLAN }, context);
  assert.equal(found.doc, docSha);
  assert.equal(found.goal, "Ship the epic");
  assert.equal(found.landed, docSha);
});

test("doc-retire: retiring a child heals the parent's children list so the index loads and a later retire works", () => {
  const files = {
    [PLAN]: "---\nlevel: epic\nchildren: [beta, gamma]\n---\n# alpha\n",
    "docs/plans/beta.md": CHILD, "docs/plans/gamma.md": "---\nparent: alpha\n---\n# gamma\n",
    "docs/plans/other.md": "# other\n",
  };
  const context = repo({ files });
  addBetaRows(context, "COMPLETE");
  settle(context);
  const out = retire({ plan: "docs/plans/beta.md" }, context);
  assert.equal(out.retired, "docs/plans/beta.md", JSON.stringify(out));
  const index = loadIndex(context.root);
  assert.deepEqual(index.get("alpha").children, ["gamma"]);
  assert.ok(!/beta/.test(fs.readFileSync(path.join(context.root, PLAN), "utf8")));
  assert.ok(run(context.root, "show", "--name-status", "--format=", "HEAD").includes(`M\t${PLAN}`));
  assert.ok(!run(context.root, "status", "--porcelain").includes("alpha.md"));
  transition({ plan: "docs/plans/other.md", unit: "u1", goal: "o", status: "PENDING" }, context);
  transition({ plan: "docs/plans/other.md", unit: "u1", status: "IN_PROGRESS", evidence: "c" }, context);
  transition({ plan: "docs/plans/other.md", unit: "u1", status: "MERGED", evidence: "a" }, context);
  transition({ plan: "docs/plans/other.md", unit: "u1", status: "COMPLETE", evidence: "a" }, context);
  settle(context);
  const next = retire({ plan: "docs/plans/other.md" }, context);
  assert.equal(next.retired, "docs/plans/other.md", JSON.stringify(next));
});

test("doc-retire: block-form children lists are healed too", () => {
  const context = repo({ files: {
    [PLAN]: "---\nlevel: epic\nchildren:\n  - beta\n  - gamma\n---\n# alpha\n",
    "docs/plans/beta.md": CHILD, "docs/plans/gamma.md": "---\nparent: alpha\n---\n# gamma\n",
  } });
  addBetaRows(context, "COMPLETE");
  settle(context);
  const out = retire({ plan: "docs/plans/beta.md" }, context);
  assert.equal(out.retired, "docs/plans/beta.md", JSON.stringify(out));
  assert.deepEqual(loadIndex(context.root).get("alpha").children, ["gamma"]);
});

test("doc-retire: a rows-less scrutinise- sibling gets a full heading in the same commit", () => {
  const context = repo();
  const kept = fs.readFileSync(ledgerPath(context), "utf8").split("\n").filter((l) => l && !l.includes("scrutinise-alpha"));
  fs.writeFileSync(ledgerPath(context), kept.join("\n") + "\n");
  const docSha = run(context.root, "rev-parse", "HEAD").trim();
  const out = retire({ plan: PLAN }, context);
  assert.equal(out.retired, PLAN, JSON.stringify(out));
  const archive = fs.readFileSync(archivePath(context), "utf8");
  const date = new Date().toISOString().slice(0, 10);
  assert.ok(archive.includes(`## ${SIB} (${date}) —`), archive);
  assert.ok(archive.includes(`## ${PLAN} (${date}) —`), archive);
  assert.match(archive, new RegExp(`${SIB.replace(/[./]/g, "\\$&")} .*doc ${docSha} · landed ${docSha}`));
  assert.equal(run(context.root, "status", "--porcelain").trim(), "");
});

test("doc-retire: a rows-less derived descendant is judged like a rows-less sibling, not refused as live", () => {
  const context = repo({ files: {
    [PLAN]: "---\nlevel: epic\nchildren: [beta]\n---\n# alpha\n",
    "docs/plans/beta.md": CHILD,
    "docs/plans/scrutinise-beta.md": "---\nparent: beta\n---\n# scrutinise beta\n",
  } });
  addBetaRows(context, "COMPLETE");
  settle(context);
  const out = retire({ plan: PLAN }, context);
  assert.equal(out.retired, PLAN, JSON.stringify(out));
  assert.ok(!fs.existsSync(path.join(context.root, "docs/plans/scrutinise-beta.md")));
  const archive = fs.readFileSync(archivePath(context), "utf8");
  assert.match(archive, /## docs\/plans\/scrutinise-beta\.md \(.*\) — .* · doc \S+ · landed \S+/);
});

test("doc-retire 13.1: retiring a child commits the parent's rollup and doc, leaves the tree clean, and the parent retires later", () => {
  const context = repo({ files: {
    [PLAN]: "---\nlevel: epic\nchildren: [beta, gamma]\n---\n# alpha\n",
    "docs/plans/beta.md": CHILD, "docs/plans/gamma.md": "---\nparent: alpha\n---\n# gamma\n",
  } });
  addBetaRows(context, "COMPLETE");
  settle(context);
  const out = retire({ plan: "docs/plans/beta.md" }, context);
  assert.equal(out.retired, "docs/plans/beta.md", JSON.stringify(out));
  assert.equal(run(context.root, "status", "--porcelain").trim(), "");
  assert.ok(run(context.root, "show", "--name-status", "--format=", "HEAD").includes("M\tdocs/plans/alpha/TRACKER.md"));
  assert.ok(!/beta/.test(fs.readFileSync(path.join(context.root, "docs/plans/alpha/TRACKER.md"), "utf8").replace(/Counts[^\n]*/g, "")));
});

test("doc-retire 13.1: a retired child leaves a parent that can itself be retired", () => {
  const context = repo({ files: { [PLAN]: EPIC, "docs/plans/beta.md": CHILD } });
  addBetaRows(context, "COMPLETE");
  settle(context);
  assert.equal(retire({ plan: "docs/plans/beta.md" }, context).retired, "docs/plans/beta.md");
  fs.mkdirSync(context.stateDir, { recursive: true });
  fs.writeFileSync(path.join(context.stateDir, "doc-write-pending"), "granted\n");
  const next = retire({ plan: PLAN }, context);
  assert.equal(next.retired, PLAN, JSON.stringify(next));
});

test("doc-retire 13.1: a forced git add failure leaves the parent doc and rollup unchanged", () => {
  const context = repo({ files: {
    [PLAN]: "---\nlevel: epic\nchildren: [beta, gamma]\n---\n# alpha\n",
    "docs/plans/beta.md": CHILD, "docs/plans/gamma.md": "---\nparent: alpha\n---\n# gamma\n",
  } });
  addBetaRows(context, "COMPLETE");
  settle(context);
  const rollup = path.join(context.root, "docs/plans/alpha/TRACKER.md");
  const before = { doc: fs.readFileSync(path.join(context.root, PLAN), "utf8"), rollup: fs.readFileSync(rollup, "utf8"), snap: snapshot(context) };
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-fakegit-"));
  fixtures.add(bin);
  const realGit = execFileSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).trim();
  fs.writeFileSync(path.join(bin, "git"), `#!/bin/sh\ncase " $* " in *" add "*docs/plans/alpha/TRACKER.md*) echo forced >&2; exit 1;; esac\nexec ${realGit} "$@"\n`, { mode: 0o755 });
  const oldPath = process.env.PATH;
  process.env.PATH = `${bin}${path.delimiter}${oldPath}`;
  let out;
  try { out = retire({ plan: "docs/plans/beta.md" }, context); } finally { process.env.PATH = oldPath; }
  assert.ok(out.refused, JSON.stringify(out));
  assert.equal(fs.readFileSync(path.join(context.root, PLAN), "utf8"), before.doc);
  assert.equal(fs.readFileSync(rollup, "utf8"), before.rollup);
  assert.deepEqual(snapshot(context), before.snap);
});

test("doc-retire 13.2: a parent with a trailing comment on children: is healed", () => {
  const context = repo({ files: {
    [PLAN]: "---\nlevel: epic\nchildren: [beta, gamma] # kids\n---\n# alpha\n",
    "docs/plans/beta.md": CHILD, "docs/plans/gamma.md": "---\nparent: alpha\n---\n# gamma\n",
  } });
  addBetaRows(context, "COMPLETE");
  settle(context);
  const out = retire({ plan: "docs/plans/beta.md" }, context);
  assert.equal(out.retired, "docs/plans/beta.md", JSON.stringify(out));
  assert.deepEqual(loadIndex(context.root).get("alpha").children, ["gamma"]);
  assert.ok(fs.readFileSync(path.join(context.root, PLAN), "utf8").includes("children: [gamma] # kids"));
});

test("doc-retire 13.2: a loadIndex failure after the edit is refused with an unchanged snapshot", () => {
  // delta names alpha as parent but is not listed: removing beta leaves an index that cannot load.
  const context = repo({ files: {
    [PLAN]: "---\nlevel: epic\nchildren: [beta, delta]\n---\n# alpha\n",
    "docs/plans/beta.md": CHILD, "docs/plans/delta.md": "---\nparent: alpha\nlevel: epic\n---\n# delta\n",
  } });
  addBetaRows(context, "COMPLETE");
  settle(context);
  const before = snapshot(context);
  const doc = fs.readFileSync(path.join(context.root, PLAN), "utf8");
  const out = retire({ plan: "docs/plans/beta.md" }, context);
  assert.ok(out.refused, JSON.stringify(out));
  assert.deepEqual(snapshot(context), before);
  assert.equal(fs.readFileSync(path.join(context.root, PLAN), "utf8"), doc);
});

test("doc-retire 13.3: a rows-less sibling and a rows-less descendant each carry their own doc's goal", () => {
  const context = repo({ files: {
    [PLAN]: "---\nlevel: epic\nchildren: [beta]\n---\n# alpha\n",
    "docs/plans/beta.md": CHILD,
    [SIB]: "---\ngoal: Sibling own goal\n---\n# scrutinise alpha\n",
    "docs/plans/scrutinise-beta.md": "---\nparent: beta\ngoal: Descendant own goal\n---\n# scrutinise beta\n",
  } });
  addBetaRows(context, "COMPLETE");
  const kept = fs.readFileSync(ledgerPath(context), "utf8").split("\n").filter((l) => l && !l.includes("scrutinise-alpha"));
  fs.writeFileSync(ledgerPath(context), kept.join("\n") + "\n");
  settle(context);
  const out = retire({ plan: PLAN, goal: "Plan goal" }, context);
  assert.equal(out.retired, PLAN, JSON.stringify(out));
  assert.equal(lookupArchive({ plan: SIB }, context).goal, "Sibling own goal");
  assert.equal(lookupArchive({ plan: "docs/plans/scrutinise-beta.md" }, context).goal, "Descendant own goal");
});

test("doc-retire 16.1: a column-0 comment inside the child list does not make the parent a referrer", () => {
  const context = repo({ files: {
    [PLAN]: "---\nlevel: epic\nchildren:\n  - gamma\n# note\n  - beta\n---\n# alpha\n",
    "docs/plans/beta.md": CHILD, "docs/plans/gamma.md": "---\nparent: alpha\n---\n# gamma\n",
  } });
  addBetaRows(context, "COMPLETE");
  settle(context);
  const out = retire({ plan: "docs/plans/beta.md" }, context);
  assert.equal(out.retired, "docs/plans/beta.md", JSON.stringify(out));
  assert.ok(!fs.readFileSync(path.join(context.root, PLAN), "utf8").includes("beta"));
});

test("doc-retire 16.2: a sibling with rows writes its own goal; an unrelated stale rollup stays untouched", () => {
  const context = repo({ goal: "Plan goal", files: {
    [PLAN]: "---\nlevel: epic\nchildren: [beta, gamma]\n---\n# alpha\n",
    "docs/plans/beta.md": CHILD, "docs/plans/gamma.md": "---\nparent: alpha\n---\n# gamma\n",
    [SIB]: "---\ngoal: Sibling doc goal\n---\n# scrutinise alpha\n",
  } });
  addBetaRows(context, "COMPLETE");
  settle(context);
  // an unrelated stale rollup: an epic with its own committed (stale) rollup
  const other = "docs/plans/zeta.md";
  fs.writeFileSync(path.join(context.root, other), "---\nlevel: epic\nchildren: []\n---\n# zeta\n");
  fs.mkdirSync(path.join(context.root, "docs/plans/zeta"), { recursive: true });
  const stale = "<!-- craftsman:rollup:begin -->\nstale\n<!-- craftsman:rollup:end -->\n";
  fs.writeFileSync(path.join(context.root, "docs/plans/zeta/TRACKER.md"), stale);
  run(context.root, "add", "-A"); run(context.root, "commit", "-q", "-m", "zeta");
  const out = retire({ plan: "docs/plans/beta.md" }, context);
  assert.equal(out.retired, "docs/plans/beta.md", JSON.stringify(out));
  assert.equal(fs.readFileSync(path.join(context.root, "docs/plans/zeta/TRACKER.md"), "utf8"), stale);
  assert.equal(run(context.root, "status", "--porcelain").trim(), "");
});

test("doc-retire 16.2: a sibling that has rows archives under its own goal", () => {
  const context = repo({ goal: "Shared goal", files: { [SIB]: "---\ngoal: Sibling doc goal\n---\n# scrutinise alpha\n" } });
  const out = retire({ plan: PLAN, goal: "Explicit plan goal" }, context);
  assert.equal(out.retired, PLAN, JSON.stringify(out));
  assert.equal(lookupArchive({ plan: SIB }, context).goal, "Shared goal");
  assert.equal(lookupArchive({ plan: PLAN }, context).goal, "Explicit plan goal");
});

test("retireCheck lists referrers for a cited plan and none for an uncited one, without mutating", () => {
  const root = repo({ files: { "docs/plans/beta.md": "# beta\n", "docs/guide.md": "see docs/plans/alpha.md\n" } }).root;
  const before = run(root, "status", "--porcelain");
  const result = retireCheck([PLAN, "docs/plans/beta.md"], root);
  assert.deepEqual(result.find((r) => r.plan === PLAN).referrers.includes("docs/guide.md"), true);
  assert.deepEqual(result.find((r) => r.plan === "docs/plans/beta.md").referrers, []);
  assert.equal(run(root, "status", "--porcelain"), before);
  assert.ok(fs.existsSync(path.join(root, PLAN)));
});

test("retireCheck agrees with classifyArchive: the plan's own rollup and sibling are not referrers (ARCH-VIEWS-15)", () => {
  const root = repo({ files: { "docs/plans/alpha/TRACKER.md": "rollup docs/plans/alpha.md\n", "docs/guide.md": "see docs/plans/alpha.md\n" } }).root;
  const { referrers } = retireCheck([PLAN], root)[0];
  assert.ok(referrers.includes("docs/guide.md"));
  assert.ok(!referrers.includes("docs/plans/alpha/TRACKER.md"));
  assert.ok(!referrers.includes(SIB));
  assert.deepEqual(referrers, classifyArchive({ root }, PLAN, { slug: "alpha", archive: {} }).hits);
});

test("retireCheck never throws: an unreadable root returns an empty list and a reason", () => {
  const result = retireCheck([PLAN], path.join(os.tmpdir(), "craftsman-no-such-root-xyz"));
  assert.deepEqual(result[0].referrers, []);
  assert.match(result[0].reason, /scan failed/);
  assert.doesNotThrow(() => retireCheck(null, undefined));
});

// --- retire-copy: archive copy, NEXT.md, findReferrers ---
function withArchive(fn) {
  const ws = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-retire-ws-")));
  fixtures.add(ws);
  const archive = path.join(ws, "archive");
  fs.mkdirSync(archive);
  run(archive, "init", "-q");
  run(archive, "config", "user.email", "t@example.com");
  run(archive, "config", "user.name", "t");
  run(archive, "config", "commit.gpgsign", "false");
  const file = path.join(ws, "craftsman.workspace.json");
  fs.writeFileSync(file, JSON.stringify({ version: 1, projects: { archive: { root: "archive" } } }));
  const prev = process.env.CRAFTSMAN_WORKSPACE_MANIFEST;
  process.env.CRAFTSMAN_WORKSPACE_MANIFEST = file;
  try { return fn(archive); } finally { if (prev === undefined) delete process.env.CRAFTSMAN_WORKSPACE_MANIFEST; else process.env.CRAFTSMAN_WORKSPACE_MANIFEST = prev; }
}
const noManifest = (fn) => {
  const prev = process.env.CRAFTSMAN_WORKSPACE_MANIFEST;
  process.env.CRAFTSMAN_WORKSPACE_MANIFEST = path.join(os.tmpdir(), "craftsman-none-xyz", "craftsman.workspace.json");
  try { return fn(); } finally { if (prev === undefined) delete process.env.CRAFTSMAN_WORKSPACE_MANIFEST; else process.env.CRAFTSMAN_WORKSPACE_MANIFEST = prev; }
};

test("findReferrers: classifies by referrer kind, with and without an archive project; NEXT.md ignored", () => {
  const files = {
    "docs/architecture/x.rules.md": "- **ARCH-X-01** cite: docs/plans/alpha.md\n",
    "scripts/x.test.mjs": "// docs/plans/alpha.md\n",
    "NOTES.md": "docs/plans/alpha.md\n",
    "docs/plans/other.md": "related: alpha\n",
    "docs/ideas/idea.md": "docs/plans/alpha.md\n",
    "docs/plans/NEXT.md": "- docs/plans/alpha.md\n",
  };
  const context = repo({ files });
  const blockingKinds = ["NOTES.md", "docs/architecture/x.rules.md", "scripts/x.test.mjs"];
  const withoutArchive = noManifest(() => findReferrers(context, PLAN, "alpha"));
  assert.ok(!withoutArchive.hits.includes("docs/plans/NEXT.md"));
  assert.deepEqual(withoutArchive.rewritable, []);
  assert.deepEqual(withoutArchive.blocking, withoutArchive.hits);
  for (const f of [...blockingKinds, "docs/plans/other.md", "docs/ideas/idea.md"]) assert.ok(withoutArchive.blocking.includes(f), f);
  const before = run(context.root, "status", "--porcelain");
  const withArchiveOut = withArchive(() => findReferrers(context, PLAN, "alpha"));
  assert.deepEqual(withArchiveOut.rewritable.slice().sort(), ["docs/ideas/idea.md", "docs/plans/alpha.md", "docs/plans/other.md", "docs/plans/scrutinise-alpha.md"]);
  assert.deepEqual(withArchiveOut.blocking.sort(), blockingKinds);
  assert.equal(run(context.root, "status", "--porcelain"), before);
});

test("doc-retire: NEXT.md is never a referrer and the retired plan line leaves in the retire commit", () => {
  const context = noManifest(() => repo({ files: { "docs/plans/NEXT.md": "# Next\n\n1. alpha — first\n2. scrutinise-alpha — sibling\n3. beta — second\n\nnotes about alpha stay\n" } }));
  const out = noManifest(() => retire({ plan: PLAN }, context));
  assert.equal(out.retired, PLAN, out.reason);
  assert.equal(fs.readFileSync(path.join(context.root, "docs/plans/NEXT.md"), "utf8"), "# Next\n\n3. beta — second\n\nnotes about alpha stay\n");
  assert.ok(run(context.root, "show", "--name-only", "--format=", "HEAD").includes("docs/plans/NEXT.md"));
});

test("doc-retire: a NEXT.md line that only mentions the slug as a word is kept", () => {
  const context = noManifest(() => repo({ files: { "docs/plans/NEXT.md": "# Next\n1. alpha — first\n2. beta — after alpha\n" } }));
  const out = noManifest(() => retire({ plan: PLAN }, context));
  assert.equal(out.retired, PLAN, out.reason);
  assert.equal(fs.readFileSync(path.join(context.root, "docs/plans/NEXT.md"), "utf8"), "# Next\n2. beta — after alpha\n");
});

test("doc-retire: with an archive project the docs are copied first, the heading carries archive <sha>, the event too", () => {
  const context = repo();
  withArchive((archive) => {
    const out = retire({ plan: PLAN }, context);
    assert.equal(out.retired, PLAN, out.reason);
    const asha = run(archive, "rev-parse", "HEAD").trim();
    const slugDir = fs.readdirSync(archive).find((d) => !d.startsWith("."));
    assert.ok(fs.existsSync(path.join(archive, slugDir, "plans/alpha", PLAN)));
    assert.ok(fs.existsSync(path.join(archive, slugDir, "plans/alpha", SIB)));
    const text = fs.readFileSync(archivePath(context), "utf8");
    assert.equal(text.split("\n").filter((l) => l.endsWith(` · archive ${asha}`)).length, 2);
    assert.equal(lookupArchive({ plan: PLAN }, context).archive, asha);
    assert.equal(events(context).find((e) => e.ev === "doc_retired").archive, asha);
  });
});

test("doc-retire: a failed archive copy leaves every doc, the ledger and TRACKER-archive.md untouched", () => {
  const context = repo();
  withArchive((archive) => {
    const slugDir = path.basename(fs.realpathSync(context.root));
    const clash = path.join(archive, slugDir, "plans/alpha", PLAN);
    fs.mkdirSync(path.dirname(clash), { recursive: true });
    fs.writeFileSync(clash, "different\n");
    const before = snapshot(context);
    const out = retire({ plan: PLAN }, context);
    assert.equal(out.refused, true);
    assert.match(out.reason, /archive copy failed/);
    assert.deepEqual(snapshot(context), before);
    assert.ok(fs.existsSync(path.join(context.root, PLAN)) && fs.existsSync(path.join(context.root, SIB)));
    assert.equal(fs.existsSync(archivePath(context)), false);
  });
});

test("doc-retire: without an archive project the event has no archive field and headings no archive sha", () => {
  const context = repo();
  const out = noManifest(() => retire({ plan: PLAN }, context));
  assert.equal(out.retired, PLAN);
  assert.ok(!("archive" in events(context).find((e) => e.ev === "doc_retired")));
  assert.ok(!/ · archive /.test(fs.readFileSync(archivePath(context), "utf8")));
});

// --- retire-rewrite: dry run, digest-confirmed rewrite, rollback, events ---
const PROSE = { "docs/plans/other.md": "# other\nline two\nsee docs/plans/alpha.md here\n", "docs/ideas/idea.md": "related: alpha\n" };
const tree = (context) => Object.fromEntries(Object.keys(PROSE).map((f) => [f, fs.readFileSync(path.join(context.root, f), "utf8")]));

test("doc-retire rewrite: dry run lists each line with a pending pointer and writes nothing", () => {
  const context = repo({ files: PROSE });
  withArchive((archive) => {
    const before = { snap: snapshot(context), files: tree(context), archive: fs.readdirSync(archive) };
    const out = retire({ plan: PLAN, dry_run: true }, context);
    assert.equal(out.dry_run, true, JSON.stringify(out));
    assert.equal(out.rewrites.length, 2);
    const other = out.rewrites.find((r) => r.file === "docs/plans/other.md");
    assert.equal(other.line, 3);
    assert.equal(other.before, "see docs/plans/alpha.md here");
    assert.match(other.after, /^see archive:[^/]+\/plans\/alpha@pending here$/);
    assert.match(out.rewrites.find((r) => r.file === "docs/ideas/idea.md").after, /^related: archive:.+\/plans\/alpha@pending$/);
    assert.deepEqual(snapshot(context), before.snap);
    assert.deepEqual(tree(context), before.files);
    assert.deepEqual(fs.readdirSync(archive), before.archive);
  });
});

test("doc-retire rewrite: a missing digest refuses and lists the referrers, changing nothing", () => {
  const context = repo({ files: PROSE });
  withArchive(() => {
    const before = snapshot(context);
    const out = retire({ plan: PLAN }, context);
    assert.equal(out.refused, true);
    assert.deepEqual(out.referrers, ["docs/ideas/idea.md", "docs/plans/other.md"]);
    assert.deepEqual(snapshot(context), before);
    assert.deepEqual(tree(context), PROSE);
  });
});

test("doc-retire rewrite: a stale digest refuses", () => {
  const context = repo({ files: PROSE });
  withArchive(() => {
    const { digest } = retire({ plan: PLAN, dry_run: true }, context);
    fs.writeFileSync(path.join(context.root, "docs/ideas/idea.md"), "related: alpha, extra\n");
    run(context.root, "commit", "-qam", "edit");
    const out = retire({ plan: PLAN, confirm_rewrites: digest }, context);
    assert.equal(out.refused, true);
    assert.match(out.reason, /stale/);
    assert.ok(fs.existsSync(path.join(context.root, PLAN)));
  });
});

test("doc-retire rewrite: the matching digest rewrites to the archive sha in the removal commit and logs events", () => {
  const context = repo({ files: PROSE });
  withArchive((archive) => {
    const { digest } = retire({ plan: PLAN, dry_run: true }, context);
    const out = retire({ plan: PLAN, confirm_rewrites: digest }, context);
    assert.equal(out.retired, PLAN, out.reason);
    const asha = run(archive, "rev-parse", "HEAD").trim();
    const files = tree(context);
    assert.match(files["docs/plans/other.md"], new RegExp(`see archive:[^/]+/plans/alpha@${asha} here`));
    assert.match(files["docs/ideas/idea.md"], new RegExp(`related: archive:[^/]+/plans/alpha@${asha}\n`));
    const changed = run(context.root, "show", "--name-only", "--format=", "HEAD");
    assert.ok(changed.includes("docs/plans/other.md") && changed.includes("docs/ideas/idea.md") && changed.includes(PLAN));
    assert.equal(run(context.root, "status", "--porcelain").trim(), "");
    const logged = events(context).filter((e) => e.ev === "archive_rewrite");
    assert.deepEqual(logged.map((e) => e.file).sort(), ["docs/ideas/idea.md", "docs/plans/other.md"]);
    assert.ok(logged.every((e) => e.plan === PLAN));
  });
});

test("doc-retire rewrite: a rule, test or top-level doc citation still refuses even with a digest", () => {
  for (const [file, text] of [["docs/architecture/x.rules.md", "cite: docs/plans/alpha.md\n"], ["scripts/x.test.mjs", "// docs/plans/alpha.md\n"], ["NOTES.md", "docs/plans/alpha.md\n"]]) {
    const context = repo({ files: { ...PROSE, [file]: text } });
    withArchive(() => {
      const dry = retire({ plan: PLAN, dry_run: true }, context);
      assert.equal(dry.refused, true);
      assert.ok(dry.referrers.includes(file));
      const out = retire({ plan: PLAN, confirm_rewrites: "anything" }, context);
      assert.equal(out.refused, true);
      assert.ok(out.referrers.includes(file));
      assert.deepEqual(tree(context), PROSE);
    });
  }
});

test("doc-retire rewrite: a failing commit restores every rewritten file", () => {
  const context = repo({ files: PROSE });
  withArchive(() => {
    const { digest } = retire({ plan: PLAN, dry_run: true }, context);
    const hook = path.join(context.root, ".git", "hooks", "pre-commit");
    fs.writeFileSync(hook, "#!/bin/sh\nexit 1\n", { mode: 0o755 });
    const before = snapshot(context);
    const out = retire({ plan: PLAN, confirm_rewrites: digest }, context);
    assert.equal(out.refused, true);
    assert.deepEqual(snapshot(context), before);
    assert.deepEqual(tree(context), PROSE);
    assert.ok(fs.existsSync(path.join(context.root, PLAN)));
    assert.equal(events(context).some((e) => e.ev === "archive_rewrite"), false);
  });
});

test("doc-retire rewrite: a product id equal to the slug yields one pointer, not a pointer rewritten again", () => {
  const context = repo({ files: PROSE, dirName: "alpha" });
  withArchive((archive) => {
    const { digest } = retire({ plan: PLAN, dry_run: true }, context);
    const out = retire({ plan: PLAN, confirm_rewrites: digest }, context);
    assert.equal(out.retired, PLAN, out.reason);
    const asha = run(archive, "rev-parse", "HEAD").trim();
    assert.match(tree(context)["docs/plans/other.md"], new RegExp(`^see archive:alpha/plans/alpha@${asha} here$`, "m"));
    assert.equal((tree(context)["docs/plans/other.md"].match(/archive:/g) ?? []).length, 1);
  });
});

test("doc-retire: a NEXT.md line for a retired sibling is removed and lookup of the sibling prints its archived path", () => {
  const context = noManifest(() => repo({ files: { "docs/plans/NEXT.md": "1. scrutinise-alpha — look\n2. beta — keep\n" } }));
  withArchive((archive) => {
    const out = retire({ plan: PLAN }, context);
    assert.equal(out.retired, PLAN, out.reason);
    assert.equal(fs.readFileSync(path.join(context.root, "docs/plans/NEXT.md"), "utf8"), "2. beta — keep\n");
    const hit = lookupArchive({ plan: "scrutinise-alpha" }, context);
    const slugDir = fs.readdirSync(archive).find((d) => !d.startsWith("."));
    assert.ok(hit.restoreCommand.endsWith(`show ${hit.archive}:${slugDir}/plans/alpha/${SIB}`), hit.restoreCommand);
    assert.ok(fs.existsSync(path.join(archive, slugDir, "plans/alpha", SIB)));
  });
});

test("doc-retire rewrite: a pointer written for one doc is never rewritten for a descendant whose slug is the product id (ARCH-DOCS-13)", () => {
  const files = {
    [PLAN]: EPIC, "docs/plans/beta.md": CHILD,
    "docs/plans/alpha/TRACKER.md": "alpha rollup\n", "docs/plans/beta/TRACKER.md": "beta rollup\n",
    "docs/plans/other.md": "# other\nsee alpha here\n",
  };
  const context = repo({ files, dirName: "beta" });
  addBetaRows(context, "COMPLETE");
  settle(context);
  withArchive(() => {
    const out = retire({ plan: PLAN, dry_run: true }, context);
    assert.equal(out.dry_run, true, JSON.stringify(out));
    const hit = out.rewrites.find((r) => r.file === "docs/plans/other.md");
    assert.equal(hit.after, "see archive:beta/plans/alpha@pending here");
    assert.equal((hit.after.match(/archive:/g) ?? []).length, 1);
  });
});

const docRetiredEvents = (context) => (fs.existsSync(path.join(context.stateDir, "events.jsonl")) ? events(context) : []).filter((e) => e.ev === "doc_retired");

test("doc-retire: a call carrying the landing capability needs no grant and logs exactly one doc_retired with auto true (ARCH-DOCS-18)", () => {
  const auto = noManifest(() => repo({ grant: false }));
  assert.equal(withArchive(() => retire({ plan: PLAN }, auto, landingCapability())).retired, PLAN);
  const autoEvents = docRetiredEvents(auto);
  assert.equal(autoEvents.length, 1);
  assert.equal(autoEvents[0].auto, true);
});

test("doc-retire: a manual retire is never logged auto, even when it passes auto:true (ARCH-DOCS-18)", () => {
  const manual = noManifest(() => repo());
  assert.equal(noManifest(() => retire({ plan: PLAN, auto: true }, manual)).retired, PLAN);
  const manualEvents = docRetiredEvents(manual);
  assert.equal(manualEvents.length, 1);
  assert.equal("auto" in manualEvents[0], false);
});

test("doc-retire: auto:true without the capability keeps the grant requirement and logs nothing (ARCH-DOCS-18)", () => {
  const context = noManifest(() => repo({ grant: false }));
  const before = snapshot(context);
  for (const forged of [undefined, true, { landing: true }, Object.freeze({ landing: true }), "landing"]) {
    const out = noManifest(() => retire({ plan: PLAN, sid: "s", auto: true }, context, forged));
    assert.equal(out.refused, true, String(forged));
    assert.match(out.reason, /no doc-write grant/);
  }
  assert.deepEqual(snapshot(context), before);
  assert.equal(docRetiredEvents(context).length, 0);
});

test("doc-retire: auto:true through the CLI path without a grant is refused and logs no doc_retired with auto (ARCH-DOCS-18)", () => {
  const context = repo({ grant: false });
  const before = snapshot(context);
  const env = { ...process.env, CLAUDE_PROJECT_DIR: context.root, CLAUDE_CODE_SESSION_ID: "cli" };
  delete env.CRAFTSMAN_WORKSPACE_MANIFEST;
  const r = spawnSync(process.execPath, [path.join(path.dirname(fileURLToPath(import.meta.url)), "doc-retire.mjs")], {
    cwd: context.root, env, input: JSON.stringify({ plan: PLAN, auto: true, sid: "cli", landed_sha: "abc" }), encoding: "utf8" });
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stdout, /no doc-write grant/);
  assert.deepEqual(snapshot(context), before);
  assert.ok(fs.existsSync(path.join(context.root, PLAN)), "the plan doc is untouched");
  assert.equal(docRetiredEvents(context).filter((e) => e.auto === true).length, 0);
});

test("doc-retire: the landing capability skips only the grant; every other refusal still applies", () => {
  const context = noManifest(() => repo({ grant: false, sibStatus: "IN_PROGRESS" }));
  const out = withArchive(() => retire({ plan: PLAN }, context, landingCapability()));
  assert.equal(out.refused, true);
  assert.match(out.reason, /open sibling plans keep/);
  assert.ok(fs.existsSync(path.join(context.root, PLAN)));
});

test("doc-retire: the landing capability with no archive project is refused before anything is touched (ARCH-ARCHIVE-03, ARCH-DOCS-18)", () => {
  const context = noManifest(() => repo({ grant: false }));
  const before = snapshot(context);
  const out = noManifest(() => retire({ plan: PLAN }, context, landingCapability()));
  assert.equal(out.refused, true);
  assert.match(out.reason, /automatic archive needs an archive project/);
  assert.deepEqual(snapshot(context), before);
  assert.ok(fs.existsSync(path.join(context.root, PLAN)), "the plan doc is untouched");
  assert.equal(docRetiredEvents(context).length, 0);
});

test("doc-retire: a landing retire copies into the archive resolved at its guard and never resolves a second time (ARCH-ARCHIVE-03, ARCH-DOCS-18)", () => {
  const context = noManifest(() => repo({ grant: false }));
  withArchive((archive) => {
    // The real resolver answers once; any later resolve yields no root, as if the archive project vanished mid-retire.
    let calls = 0;
    const resolveArchive = (ctx) => { calls += 1; return calls === 1 ? resolveArchiveReal(ctx) : { off: "gone" }; };
    const out = retire({ plan: PLAN }, context, landingCapability(), { resolveArchive });
    assert.equal(out.retired, PLAN, out.reason);
    assert.equal(calls, 1, "the archive resolved at the guard is the one copied into");
    assert.ok(fs.readdirSync(archive).some((d) => !d.startsWith(".")), "the archive holds the copy");
    assert.ok(!fs.existsSync(path.join(context.root, PLAN)), "removed only after the verified copy");
  });
});

test("doc-retire: a landing retire whose archive has no root removes nothing (ARCH-ARCHIVE-03)", () => {
  const context = noManifest(() => repo({ grant: false }));
  const before = snapshot(context);
  const out = retire({ plan: PLAN }, context, landingCapability(), { resolveArchive: () => ({ off: "gone" }) });
  assert.equal(out.refused, true);
  assert.match(out.reason, /automatic archive needs an archive project/);
  assert.deepEqual(snapshot(context), before);
  assert.ok(fs.existsSync(path.join(context.root, PLAN)));
});

test("doc-retire: NEXT.md lines of a retired descendant leave with it", () => {
  const context = noManifest(() => repo({ files: {
    [PLAN]: "---\nlevel: epic\nchildren: [beta]\n---\n# alpha\n",
    "docs/plans/beta.md": CHILD,
    "docs/plans/NEXT.md": "# Next\n\n1. alpha — first\n2. beta — child\n3. gamma — other\n",
  } }));
  addBetaRows(context, "COMPLETE");
  settle(context);
  const out = noManifest(() => retire({ plan: PLAN }, context));
  assert.equal(out.retired, PLAN, out.reason);
  assert.equal(fs.readFileSync(path.join(context.root, "docs/plans/NEXT.md"), "utf8"), "# Next\n\n3. gamma — other\n");
});

test("doc-retire: a NEXT.md line for a prefix slug is kept (alpha retired, alpha-two kept)", () => {
  const context = noManifest(() => repo({ files: { "docs/plans/NEXT.md": "# Next\n\n1. alpha — first\n2. alpha-two — second\n" } }));
  const out = noManifest(() => retire({ plan: PLAN }, context));
  assert.equal(out.retired, PLAN, out.reason);
  assert.equal(fs.readFileSync(path.join(context.root, "docs/plans/NEXT.md"), "utf8"), "# Next\n\n2. alpha-two — second\n");
});
