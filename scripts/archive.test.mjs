import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync, execFileSync } from "node:child_process";
import { loadConfig } from "./lib/core.mjs";
import { resolveArchive, archivePathFor, copyAndCommit, restoreCommand, classifyArchive, productIdFor } from "./lib/archive.mjs";

const tmp = (n) => fs.mkdtempSync(path.join(os.tmpdir(), `craftsman-archive-${n}-`));
const sh = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
function repo(dir) {
  fs.mkdirSync(dir, { recursive: true });
  spawnSync("git", ["init", "-q"], { cwd: dir });
  sh(dir, "config", "user.email", "t@example.com");
  sh(dir, "config", "user.name", "t");
  sh(dir, "config", "commit.gpgsign", "false");
  return fs.realpathSync(dir);
}
function withManifest(file, fn) {
  const prev = process.env.CRAFTSMAN_WORKSPACE_MANIFEST;
  if (file) process.env.CRAFTSMAN_WORKSPACE_MANIFEST = file; else process.env.CRAFTSMAN_WORKSPACE_MANIFEST = path.join(tmp("none"), "craftsman.workspace.json");
  try { return fn(); } finally { if (prev === undefined) delete process.env.CRAFTSMAN_WORKSPACE_MANIFEST; else process.env.CRAFTSMAN_WORKSPACE_MANIFEST = prev; }
}
function workspace(ids, { empty = [] } = {}) {
  const root = tmp("ws");
  const projects = {};
  for (const id of ids) { projects[id] = { root: id }; if (empty.includes(id)) fs.mkdirSync(path.join(root, id)); else repo(path.join(root, id)); }
  const file = path.join(root, "craftsman.workspace.json");
  fs.writeFileSync(file, JSON.stringify({ version: 1, projects }));
  return { root: fs.realpathSync(root), file };
}
function fixture() {
  const archive = repo(tmp("repo"));
  const src = tmp("src");
  fs.mkdirSync(path.join(src, "docs/plans"), { recursive: true });
  fs.writeFileSync(path.join(src, "docs/plans/p.md"), "plan\n");
  fs.writeFileSync(path.join(src, "docs/plans/s.md"), "sibling\n");
  const events = [];
  const stateDir = tmp("state");
  const readEvents = () => fs.existsSync(path.join(stateDir, "events.jsonl")) ? fs.readFileSync(path.join(stateDir, "events.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l)) : [];
  const args = { archive, productId: "prod", kind: "plans", slug: "p", plan: "docs/plans/p.md", files: ["docs/plans/p.md", "docs/plans/s.md"], sourceRoot: src };
  return { archive, src, args, seams: { context: { root: src, stateDir } }, readEvents, events };
}

test("config: archive.project defaults to archive and loads", () => {
  assert.equal(loadConfig().archive.project, "archive");
});

test("resolveArchive: off with no manifest", () => {
  const r = withManifest(null, () => resolveArchive());
  assert.match(r.off, /no workspace manifest/);
});
test("resolveArchive: off for an unknown id", () => {
  const ws = workspace(["other"]);
  assert.match(withManifest(ws.file, () => resolveArchive()).off, /not registered/);
});
test("resolveArchive: off for an uninitialised checkout", () => {
  const ws = workspace(["archive"], { empty: ["archive"] });
  assert.match(withManifest(ws.file, () => resolveArchive()).off, /uninitialised/);
});
test("resolveArchive: hit returns id and root", () => {
  const ws = workspace(["archive", "app"]);
  const r = withManifest(ws.file, () => resolveArchive());
  assert.deepEqual(r, { id: "archive", root: path.join(ws.root, "archive") });
});

test("archivePathFor: layout and refusals", () => {
  assert.equal(archivePathFor({ productId: "p", kind: "ideas", slug: "s", file: "docs/ideas/x.md" }), "p/ideas/s/docs/ideas/x.md");
  const base = { productId: "p", kind: "plans", slug: "s" };
  for (const file of ["../x.md", "docs/../../x", "/etc/passwd", "C:\\x", "docs/architecture/a.rules.md", "docs/architecture/a.md", "./docs/architecture/a.md"]) {
    assert.throws(() => archivePathFor({ ...base, file }), Error, file);
  }
  assert.throws(() => archivePathFor({ ...base, kind: "architecture", file: "a.md" }));
  assert.throws(() => archivePathFor({ ...base, slug: "../s", file: "a.md" }));
});

test("copyAndCommit: copies, verifies, commits locally, logs, never pushes", () => {
  const f = fixture();
  const calls = [];
  const git = (a, cwd) => { calls.push(a[0]); return execFileSync("git", a, { cwd, encoding: "utf8" }); };
  const r = copyAndCommit(f.args, { ...f.seams, git });
  assert.equal(r.committed, true);
  assert.equal(r.sha, sh(f.archive, "rev-parse", "HEAD"));
  assert.equal(fs.readFileSync(path.join(f.archive, "prod/plans/p/docs/plans/p.md"), "utf8"), "plan\n");
  assert.ok(!calls.includes("push"));
  const ev = f.readEvents().find((e) => e.ev === "archive_copied");
  assert.deepEqual([ev.plan, ev.archive_sha, ev.files.length], ["docs/plans/p.md", r.sha, 2]);
});

test("copyAndCommit: a corrupted copy aborts before any commit and leaves nothing", () => {
  const f = fixture();
  assert.throws(() => copyAndCommit(f.args, { ...f.seams, copy: (a, b) => fs.writeFileSync(b, "corrupt") }), /verification failed/);
  assert.equal(spawnSync("git", ["rev-parse", "HEAD"], { cwd: f.archive }).status !== 0, true);
  assert.equal(fs.existsSync(path.join(f.archive, "prod/plans/p/docs/plans/p.md")), false);
  assert.equal(sh(f.archive, "status", "--porcelain"), "");
  const ev = f.readEvents().find((e) => e.ev === "archive_refused");
  assert.match(ev.reason, /verification failed/);
});

test("copyAndCommit: re-run with identical content makes no new commit", () => {
  const f = fixture();
  const first = copyAndCommit(f.args, f.seams);
  const again = copyAndCommit(f.args, f.seams);
  assert.equal(again.committed, false);
  assert.equal(again.sha, first.sha);
  assert.equal(sh(f.archive, "rev-list", "--count", "HEAD"), "1");
});

test("copyAndCommit: an archived file is never rewritten with different content", () => {
  const f = fixture();
  copyAndCommit(f.args, f.seams);
  fs.writeFileSync(path.join(f.src, "docs/plans/p.md"), "changed\n");
  assert.throws(() => copyAndCommit(f.args, f.seams), /never rewritten/);
});

test("copyAndCommit: commits only the copied pathspecs", () => {
  const f = fixture();
  fs.writeFileSync(path.join(f.archive, "other.txt"), "x");
  sh(f.archive, "add", "other.txt");
  copyAndCommit(f.args, f.seams);
  assert.equal(sh(f.archive, "diff", "--cached", "--name-only"), "other.txt");
});

test("copyAndCommit: refuses on a merge in progress", () => {
  const f = fixture();
  fs.writeFileSync(path.join(f.archive, ".git", "MERGE_HEAD"), "0".repeat(40) + "\n");
  assert.throws(() => copyAndCommit(f.args, f.seams), /in progress \(MERGE_HEAD\)/);
  assert.equal(fs.existsSync(path.join(f.archive, "prod")), false);
  assert.match(f.readEvents().find((e) => e.ev === "archive_refused").reason, /MERGE_HEAD/);
});

test("copyAndCommit: refuses on a held index.lock", () => {
  const f = fixture();
  fs.writeFileSync(path.join(f.archive, ".git", "index.lock"), "");
  assert.throws(() => copyAndCommit(f.args, f.seams), /index is locked/);
  assert.equal(fs.existsSync(path.join(f.archive, "prod")), false);
});

test("copyAndCommit: refuses a rules doc", () => {
  const f = fixture();
  assert.throws(() => copyAndCommit({ ...f.args, files: ["docs/architecture/x.rules.md"] }, f.seams), /never archived/);
});

test("restoreCommand returns the git show string", () => {
  assert.equal(restoreCommand("/a/archive", "abc123", "prod/plans/p/docs/plans/p.md"), "git -C /a/archive show abc123:prod/plans/p/docs/plans/p.md");
});

test("classifyArchive: one table test per class (auto, rewrite, blocked, not-archivable)", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-classify-"));
  const ctx = { root };
  const plan = "docs/plans/p.md";
  const on = { root: "/archive" };
  const scan = (value) => ({ findReferrers: () => value });
  const table = [
    ["auto: no referrer", { archive: on, ...scan({ hits: [plan], blocking: [plan], rewritable: [] }) }, "auto", [], []],
    ["auto: only exempt files (rollup, sibling, tracker, NEXT)", { archive: on, ...scan({ hits: ["docs/plans/p/TRACKER.md", "docs/plans/scrutinise-p.md", "docs/plans/TRACKER-archive.md", "docs/plans/NEXT.md"], blocking: ["docs/plans/p/TRACKER.md", "docs/plans/scrutinise-p.md", "docs/plans/TRACKER-archive.md", "docs/plans/NEXT.md"], rewritable: [] }) }, "auto", [], []],
    ["auto: the removing set is exempt", { archive: on, removing: ["docs/plans/x.md"], ...scan({ hits: ["docs/plans/x.md"], blocking: [], rewritable: ["docs/plans/x.md"] }) }, "auto", [], []],
    ["rewrite: prose referrer", { archive: on, ...scan({ hits: ["docs/plans/n.md"], blocking: [], rewritable: ["docs/plans/n.md"] }) }, "rewrite", [], ["docs/plans/n.md"]],
    ["blocked: rules doc names the file", { archive: on, ...scan({ hits: ["docs/architecture/z.rules.md", "docs/plans/n.md"], blocking: ["docs/architecture/z.rules.md"], rewritable: ["docs/plans/n.md"] }) }, "blocked", ["docs/architecture/z.rules.md"], ["docs/plans/n.md"]],
    ["blocked: scan failed", { archive: on, ...scan(null) }, "blocked", ["referrer scan failed"], []],
    ["not-archivable: no archive project", { archive: { off: "none" }, ...scan({ hits: [], blocking: [], rewritable: [] }) }, "not-archivable", [], []],
    ["blocked still names its file without an archive project", { archive: { off: "none" }, ...scan({ hits: ["README.md"], blocking: ["README.md"], rewritable: [] }) }, "blocked", ["README.md"], []],
  ];
  for (const [name, opts, cls, blocking, rewritable] of table) {
    const v = classifyArchive(ctx, plan, opts);
    assert.equal(v.class, cls, name);
    assert.deepEqual(v.blocking, blocking, name);
    assert.deepEqual(v.rewritable, rewritable, name);
  }
});

test("productIdFor: the workspace project whose root is this checkout, else the directory name", () => {
  const ws = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-pid-")));
  const root = path.join(ws, "app");
  fs.mkdirSync(root);
  execFileSync("git", ["-C", root, "init", "-q"]);
  const prev = process.env.CRAFTSMAN_WORKSPACE_MANIFEST;
  try {
    process.env.CRAFTSMAN_WORKSPACE_MANIFEST = path.join(ws, "absent.json");
    assert.equal(productIdFor({ root }), "app");
    const manifest = path.join(ws, "craftsman.workspace.json");
    fs.writeFileSync(manifest, JSON.stringify({ version: 1, projects: { shop: { root: "app" } } }));
    process.env.CRAFTSMAN_WORKSPACE_MANIFEST = manifest;
    assert.equal(productIdFor({ root }), "shop");
  } finally { if (prev === undefined) delete process.env.CRAFTSMAN_WORKSPACE_MANIFEST; else process.env.CRAFTSMAN_WORKSPACE_MANIFEST = prev; }
});
