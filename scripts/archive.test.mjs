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

test("copyAndCommit: a symlinked source is refused with no commit (ARCH-ARCHIVE-03)", () => {
  const f = fixture();
  fs.rmSync(path.join(f.src, "docs/plans/s.md"));
  fs.symlinkSync(path.join(f.src, "docs/plans/p.md"), path.join(f.src, "docs/plans/s.md"));
  assert.throws(() => copyAndCommit(f.args, f.seams), /symlink/);
  assert.equal(spawnSync("git", ["rev-parse", "HEAD"], { cwd: f.archive }).status !== 0, true);
  assert.equal(fs.existsSync(path.join(f.archive, "prod/plans/p/docs/plans/p.md")), false);
});

test("copyAndCommit: a symlinked archive subfolder is refused with no commit (ARCH-ARCHIVE-03)", () => {
  const f = fixture();
  const outside = tmp("outside");
  fs.mkdirSync(path.join(f.archive, "prod"), { recursive: true });
  fs.symlinkSync(outside, path.join(f.archive, "prod/plans"));
  assert.throws(() => copyAndCommit(f.args, f.seams), /symlink/);
  assert.equal(spawnSync("git", ["rev-parse", "HEAD"], { cwd: f.archive }).status !== 0, true);
  assert.deepEqual(fs.readdirSync(outside), []);
});

test("copyAndCommit: a symlinked source directory is refused with no commit (ARCH-ARCHIVE-03)", () => {
  const f = fixture();
  const real = path.join(f.src, "docs/plans-real");
  fs.renameSync(path.join(f.src, "docs/plans"), real);
  fs.symlinkSync(real, path.join(f.src, "docs/plans"));
  assert.throws(() => copyAndCommit(f.args, f.seams), /symlink/);
  assert.equal(spawnSync("git", ["rev-parse", "HEAD"], { cwd: f.archive }).status !== 0, true);
});

// ---- impl-landing-token 5.3: one liveBlockers check, two callers (ARCH-DOCS-09, ARCH-DOCS-17) ----
import { autoArchiveEligible, liveBlockers } from "./lib/archive.mjs";
import { landingCapability } from "./doc-retire.mjs";
import { buildIndex } from "./lib/plan-index.mjs";

test("liveBlockers: one table case per blocker, and the clean cases", () => {
  const P = "docs/plans/p.md";
  const closedRow = (plan) => ({ plan, unit: "u", status: "COMPLETE" });
  const openRow = (plan, status = "IN_PROGRESS") => ({ plan, unit: "o", status, });
  const epic = (children) => ({ path: P, slug: "p", text: `---\nlevel: epic\nchildren: [${children.join(", ")}]\n---\n# p\n` });
  const child = (slug) => ({ path: `docs/plans/${slug}.md`, slug, text: "---\nparent: p\n---\n# c\n" });
  const run = ({ rows = [], siblings = [], docs = [] }) => liveBlockers({
    plan: P, rowsOf: (p) => rows.filter((r) => r.plan === p), trackedSiblings: siblings, loadIndex: () => buildIndex(docs),
  });
  const table = [
    ["an open scrutinise- sibling", { siblings: ["docs/plans/scrutinise-p.md"], rows: [openRow("docs/plans/scrutinise-p.md")] }, /open sibling plans keep docs\/plans\/p\.md: docs\/plans\/scrutinise-p\.md \(o=IN_PROGRESS\)/],
    ["an open investigate- sibling", { siblings: ["docs/plans/investigate-p.md"], rows: [openRow("docs/plans/investigate-p.md", "PARKED")] }, /docs\/plans\/investigate-p\.md \(o=PARKED\)/],
    ["a descendant with an open row", { docs: [epic(["c"]), child("c")], rows: [openRow("docs/plans/c.md")] }, /has live descendants: c$/],
    ["a descendant with no row proving it closed", { docs: [epic(["c"]), child("c")] }, /has live descendants: c$/],
  ];
  for (const [name, input, reason] of table) {
    const out = run(input);
    assert.match(out.reason, reason, name);
  }
  const clean = run({ siblings: ["docs/plans/scrutinise-p.md"], rows: [closedRow("docs/plans/scrutinise-p.md"), closedRow("docs/plans/c.md")], docs: [epic(["c"]), child("c")] });
  assert.equal(clean.reason, undefined);
  assert.deepEqual(clean.siblings, ["docs/plans/scrutinise-p.md"]);
  assert.deepEqual(clean.descendants.map((d) => d.slug), ["c"]);
  assert.equal(clean.isParent, true);
  assert.equal(run({ docs: [{ path: P, slug: "p", text: "# p\n" }] }).isParent, false);
});

test("liveBlockers: defined once and called by both autoArchiveEligible and retire", () => {
  const here = path.dirname(new URL(import.meta.url).pathname);
  const archiveSrc = fs.readFileSync(path.join(here, "lib/archive.mjs"), "utf8");
  const retireSrc = fs.readFileSync(path.join(here, "doc-retire.mjs"), "utf8");
  assert.equal((archiveSrc.match(/function liveBlockers\(/g) ?? []).length, 1);
  assert.equal((retireSrc.match(/function liveBlockers\(/g) ?? []).length, 0, "doc-retire imports it, it does not redefine it");
  assert.equal((archiveSrc.match(/(?<!function )liveBlockers\(\{/g) ?? []).length, 1, "autoArchiveEligible is a caller");
  assert.equal((retireSrc.match(/liveBlockers\(\{/g) ?? []).length, 1, "retire is a caller");
});

test("autoArchiveEligible: the hierarchy at the landed commit is read with ls-tree -z and one cat-file --batch, multibyte text included", () => {
  const root = repo(tmp("indexat"));
  const put = (file, text) => { fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), text); };
  put("docs/plans/p.md", "---\nlevel: epic\nchildren: [c]\n---\n# p éü 中文\n");
  put("docs/plans/c.md", "---\nparent: p\n---\n# c é\n");
  put("docs/plans/odd\nname.md", "# odd\n");
  sh(root, "add", "-A");
  sh(root, "commit", "-q", "-m", "plans");
  const sha = sh(root, "rev-parse", "HEAD");
  fs.rmSync(path.join(root, "docs/plans/c.md")); // the working tree no longer has the child: only the commit does
  const calls = [];
  const git = (args, ctx, opts) => { calls.push(args.slice(0, 2).join(" ")); return execFileSync("git", ["-C", ctx.root, ...args], { encoding: opts?.buffer ? "buffer" : "utf8", input: opts?.input === undefined ? undefined : Buffer.from(opts.input) }); };
  const state = [{ plan: "docs/plans/p.md", unit: "u", status: "COMPLETE" }];
  const verdict = autoArchiveEligible({ root }, "docs/plans/p.md", {
    capability: landingCapability(), sha, git, resolveArchive: () => ({ root: "/tmp/archive" }), currentState: () => state,
    findReferrers: () => ({ hits: [], blocking: [], rewritable: [] }),
  });
  assert.equal(verdict.eligible, false);
  assert.match(verdict.reason, /has live descendants: c/);
  assert.ok(calls.includes("ls-tree -z"), calls.join("|"));
  assert.equal(calls.filter((c) => c === "cat-file --batch").length, 1);
  assert.ok(!calls.some((c) => c.startsWith("show ")), "no per-file git show");
});
