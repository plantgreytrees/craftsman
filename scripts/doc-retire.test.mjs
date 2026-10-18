import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { grantValid, retire } from "./doc-retire.mjs";
import { loadIndex } from "./lib/plan-index.mjs";
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
function repo({ grant = true, sibStatus = "COMPLETE", planStatus = "COMPLETE", files = {}, goal = "Ship alpha" } = {}) {
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
