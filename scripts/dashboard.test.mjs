// Tests for scripts/lib/dashboard.mjs (ARCH-VIEWS-04/10/11).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { projectContext } from "./lib/core.mjs";
import { ledgerPath } from "./tracker.mjs";
import { autoArchiveEligible } from "./lib/archive.mjs";
import { landingCapability } from "./doc-retire.mjs";
import { buildModel, renderHtml, writeDashboard, esc, SECTIONS, MERMAID_SRC, MERMAID_SRI } from "./lib/dashboard.mjs";

const SECRET_BODY = "SECRET-BODY-TEXT-NEVER-RENDERED";
const EVIL = "</script><img onerror=1>";
const mk = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-")));
const put = (root, rel, text) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), text); };

function fixture() {
  const root = mk();
  put(root, "docs/plans/alpha.md", `---\nslug: alpha\ngoal: ${JSON.stringify(EVIL)}\npriority: P1\n---\n${SECRET_BODY}\n`);
  put(root, "docs/plans/beta.md", `---\nslug: beta\ngoal: Ship beta\n---\n`);
  put(root, "docs/plans/NEXT.md", "1. beta — do beta first\n");
  put(root, "docs/ideas/one.md", `---\ntitle: Idea one\nverdict: pursue\nstatus: architected\nconfidence: medium\n---\n${SECRET_BODY}\n`);
  put(root, "docs/architecture/views.rules.md", `---\narea: views\ngoverns: ["a.mjs", "b.mjs"]\nsource: docs/ideas/one.md\n---\n- **ARCH-VIEWS-01** [decided] ${SECRET_BODY}\n- **ARCH-VIEWS-02** [superseded by ARCH-VIEWS-01] x\n`);
  put(root, "docs/architecture/views.md", "# Views\n\n```mermaid\ngraph TD\n  A-->B\n```\n");
  put(root, "craftsman.workspace.json", JSON.stringify({ projects: [{ path: "other" }] }));
  const rows = [
    { plan: "docs/plans/alpha.md", unit: "u1", status: "COMPLETE", updated_at: "2026-10-02T00:00:00Z" },
    { plan: "docs/plans/alpha.md", unit: "u2", status: "IN_PROGRESS", updated_at: "2026-10-03T00:00:00Z" },
    { plan: "docs/plans/beta.md", unit: "u1", status: "PENDING", updated_at: "2026-10-03T00:00:00Z" },
  ];
  return { root, context: { root, rows, stateDir: path.join(root, ".craftsman"), sessions: 1 } };
}

test("buildModel: fixture yields all seven sections, titles only, one project", () => {
  const { context } = fixture();
  const m = buildModel(context);
  assert.deepEqual(m.plans.map((c) => c.state), ["PENDING", "IN_PROGRESS", "COMPLETE"]);
  assert.equal(m.plans.find((c) => c.state === "COMPLETE").cards[0].goal, EVIL);
  assert.deepEqual(m.queue.map((e) => [e.slug, e.source, e.lane]), [["beta", "next", true], ["alpha", "ready", false]]);
  assert.equal(m.ideas[0].verdict, "pursue");
  assert.equal(m.ideas[0].items[0].title, "Idea one");
  const a = m.architecture[0];
  assert.deepEqual([a.area, a.rules, a.governs, a.from_idea, a.diagrams], ["views", { decided: 1, superseded: 1 }, 2, "docs/ideas/one.md", ["graph TD\n  A-->B"]]);
  assert.deepEqual(m.tree.map((t) => t.slug), ["alpha", "beta"]);
  assert.ok(m.sizes.length === 6 && m.sizes.every((s) => s.bytes > 0));
  assert.ok(!JSON.stringify(m).includes(SECRET_BODY));
  assert.ok(!JSON.stringify(m).includes("other"), "workspace manifest not read");
});

test("renderHtml: golden skeleton of an empty-model page", () => {
  const html = renderHtml({ project: "p", plans: [], queue: [], ideas: [], architecture: [], tree: [], sizes: [], hasNext: false });
  const skeleton = html.replace(/<style>[\s\S]*?<\/style>/, "<style></style>").replace(/<script>[\s\S]*?<\/script>/, "<script></script>");
  assert.equal(skeleton, `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>p dashboard</title>
<style></style></head><body>
<h1>p dashboard</h1>
<section id="plans"><h2>Plans board</h2><p class="empty">No ledger yet: no plan rows recorded.</p></section>
<section id="queue"><h2>Session queue</h2><p class="empty">No docs/plans/NEXT.md and nothing ready.</p></section>
<section id="ideas"><h2>Ideas by verdict</h2><p class="empty">No ideas yet.</p></section>
<section id="architecture"><h2>Architecture map</h2><p class="empty">No architecture rules yet.</p></section>
<section id="tree"><h2>Plan tree</h2><p class="empty">No plans in the plan tree.</p></section>
<section id="sizes"><h2>Doc sizes</h2><p class="empty">No docs found.</p></section>
<section id="archive"><h2>Archive</h2><h3>Archived</h3><p class="empty">Nothing archived yet.</p><h3>Archive candidates</h3><p class="empty">No archive candidates.</p></section>
<script src="${MERMAID_SRC}" integrity="${MERMAID_SRI}" crossorigin="anonymous"></script>
<script></script>
</body></html>
`);
  assert.match(html, /prefers-color-scheme:dark/);
  assert.match(html, /max-width:500px/);
});

test("renderHtml: hostile goal is escaped; no off-page src or href beyond pinned mermaid", () => {
  const { context } = fixture();
  const html = renderHtml(buildModel(context));
  assert.ok(!html.includes(EVIL));
  assert.ok(html.includes(esc(EVIL)));
  assert.equal((html.match(/<img/g) || []).length, 0);
  const urls = [...html.matchAll(/\b(?:src|href)\s*=\s*"([^"]*)"/g)].map((x) => x[1]);
  assert.deepEqual(urls, [MERMAID_SRC]);
  assert.match(MERMAID_SRC, /^https:\/\/cdn\.jsdelivr\.net\/npm\/mermaid@10\.9\.1\//);
  assert.equal((html.match(/<script/g) || []).length, 2);
  assert.equal((html.match(/<script src=/g) || []).length, 1);
  assert.match(MERMAID_SRI, /^sha384-[A-Za-z0-9+/]{64}$/);
  assert.ok(html.includes(`integrity="${MERMAID_SRI}" crossorigin="anonymous"`));
  assert.ok(!/https?:\/\//.test(html.replace(MERMAID_SRC, "")));
  assert.match(html, /<pre class="mermaid">graph TD\n  A--&gt;B<\/pre>/);
  assert.match(html, /<details class="src"><summary>diagram source/);
  assert.ok(!html.includes(SECRET_BODY));
});

test("empty repo: no ledger, ideas or NEXT.md renders every section with an empty state", () => {
  const root = mk();
  const context = { root, rows: [], stateDir: path.join(root, ".craftsman") };
  const html = renderHtml(buildModel(context));
  for (const s of SECTIONS) assert.match(html, new RegExp(`<section id="${s}">`));
  assert.equal((html.match(/class="empty"/g) || []).length, 8);
  assert.match(html, /No ledger yet/);
  assert.match(html, /No ideas yet/);
  assert.match(html, /No docs\/plans\/NEXT\.md/);
});

test("writeDashboard: writes only under .craftsman/export and logs dashboard_render", () => {
  const { root, context } = fixture();
  const before = new Set(fs.readdirSync(root));
  const file = writeDashboard(context);
  assert.equal(file, path.join(root, ".craftsman", "export", "dashboard.html"));
  assert.ok(fs.readFileSync(file, "utf8").startsWith("<!doctype html>"));
  assert.deepEqual(new Set(fs.readdirSync(root).filter((n) => n !== ".craftsman")), new Set([...before].filter((n) => n !== ".craftsman")));
  const events = fs.readFileSync(path.join(root, ".craftsman", "events.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const ev = events.find((e) => e.ev === "dashboard_render");
  assert.equal(typeof ev.ms, "number");
  assert.equal(ev.skipped, false);
  assert.equal(ev.sections, 7);
});

const git = (root, ...a) => execFileSync("git", ["-C", root, ...a], { encoding: "utf8" });
function archiveFixture() {
  const root = mk();
  git(root, "init", "-q");
  const plan = (n) => put(root, `docs/plans/${n}.md`, `---\nslug: ${n}\ngoal: Goal ${n}\n---\nbody\n`);
  for (const n of ["free", "prose", "ruled"]) plan(n);
  put(root, "docs/plans/notes.md", "see prose-plan docs/plans/prose.md\n");
  put(root, "docs/architecture/z.rules.md", "- **ARCH-Z-01** [decided] x — cite: docs/plans/ruled.md\n");
  put(root, "docs/plans/TRACKER-archive.md", [
    "# Tracker archive", "",
    "## docs/plans/old.md (2026-10-01) — Old goal · doc abc1234 · landed def5678 · archive 9999999",
    "## docs/plans/older.md (2026-09-01) — Older goal · doc aaa1111 · landed bbb2222", ""].join("\n"));
  git(root, "add", "-A");
  git(root, "-c", "user.email=t@e.x", "-c", "user.name=t", "-c", "commit.gpgsign=false", "commit", "-qm", "init");
  const row = (p, status) => ({ plan: `docs/plans/${p}.md`, unit: "u", status, updated_at: "2026-10-02T00:00:00Z" });
  const rows = [row("free", "COMPLETE"), row("prose", "COMPLETE"), row("ruled", "CANCELLED"), row("notes", "PENDING")];
  return { root, context: { root, rows, stateDir: path.join(root, ".craftsman") } };
}

test("archive: headings listed with and without archive sha", () => {
  const { context } = archiveFixture();
  const m = buildModel(context);
  assert.deepEqual(m.archive.headings.map((h) => [h.name, h.goal, h.doc_sha, h.archive_sha]),
    [["docs/plans/old.md", "Old goal", "abc1234", "9999999"], ["docs/plans/older.md", "Older goal", "aaa1111", ""]]);
  const html = renderHtml(m);
  assert.match(html, /<section id="archive">/);
  assert.match(html, /docs\/plans\/old\.md<\/code> <span class="mut">2026-10-01<\/span> &mdash; Old goal <span class="mut">doc abc1234, archive 9999999/);
  assert.match(html, /docs\/plans\/older\.md<\/code>.*doc aaa1111<\/span>/);
});

test("archive: candidates classed auto, rewrite or blocked, blocked names its file", () => {
  const { context } = archiveFixture();
  const noWs = path.join(os.tmpdir(), "craftsman-none-dash", "craftsman.workspace.json");
  const prev = process.env.CRAFTSMAN_WORKSPACE_MANIFEST;
  process.env.CRAFTSMAN_WORKSPACE_MANIFEST = noWs;
  let m;
  try { m = buildModel(context); } finally { if (prev === undefined) delete process.env.CRAFTSMAN_WORKSPACE_MANIFEST; else process.env.CRAFTSMAN_WORKSPACE_MANIFEST = prev; }
  const by = Object.fromEntries(m.archive.candidates.map((c) => [path.basename(c.plan, ".md"), c]));
  assert.deepEqual(Object.keys(by).sort(), ["free", "prose", "ruled"], "open plan and missing docs are not candidates");
  assert.equal(by.free.class, "not-archivable", "no archive project resolves: never auto (matches autoArchiveEligible)");
  assert.deepEqual(by.free.blocking, []);
  assert.ok(by.free.bytes > 0);
  assert.equal(by.ruled.class, "blocked");
  assert.deepEqual(by.ruled.blocking, ["docs/architecture/z.rules.md"]);
  // no archive project: every prose hit blocks too
  assert.equal(by.prose.class, "blocked");
  assert.deepEqual(by.prose.blocking, ["docs/plans/notes.md"]);
  const html = renderHtml(m);
  assert.match(html, /<strong>blocked<\/strong>.*blocked by <code>docs\/architecture\/z\.rules\.md/);
});

test("archive: with an archive project prose referrers class as rewrite", () => {
  const { context } = archiveFixture();
  const ws = mk();
  const arch = path.join(ws, "archive");
  fs.mkdirSync(arch);
  git(arch, "init", "-q");
  fs.writeFileSync(path.join(ws, "craftsman.workspace.json"), JSON.stringify({ version: 1, projects: { archive: { root: "archive" } } }));
  const prev = process.env.CRAFTSMAN_WORKSPACE_MANIFEST;
  process.env.CRAFTSMAN_WORKSPACE_MANIFEST = path.join(ws, "craftsman.workspace.json");
  let m;
  try { m = buildModel(context); } finally { if (prev === undefined) delete process.env.CRAFTSMAN_WORKSPACE_MANIFEST; else process.env.CRAFTSMAN_WORKSPACE_MANIFEST = prev; }
  const by = Object.fromEntries(m.archive.candidates.map((c) => [path.basename(c.plan, ".md"), c]));
  assert.equal(by.prose.class, "rewrite");
  assert.deepEqual(by.prose.referrers, ["docs/plans/notes.md"]);
  assert.deepEqual(by.prose.blocking, []);
  assert.equal(by.free.class, "auto");
  assert.equal(by.ruled.class, "blocked");
  assert.ok(!JSON.stringify(m).includes("body"), "no doc body text");
});

test("buildModel: real project context lists ready plans and execution.maxSessions lanes (ARCH-VIEWS-07)", () => {
  const root = mk();
  git(root, "init", "-q");
  put(root, "craftsman.config.json", JSON.stringify({ execution: { maxSessions: 2 } }));
  for (const n of ["one", "two", "three"]) put(root, `docs/plans/${n}.md`, `---\nslug: ${n}\ngoal: Goal ${n}\n---\n`);
  const ctx = { ...projectContext("."), root, stateDir: path.join(root, ".craftsman") };
  const row = (n) => JSON.stringify({ key: `.::docs/plans/${n}.md::u`, project: ".", plan: `docs/plans/${n}.md`, unit: "u", status: "PENDING", evidence: "t", updated_at: "2026-10-02T00:00:00Z" });
  put(root, path.relative(root, ledgerPath(ctx)), ["one", "two", "three"].map(row).join("\n") + "\n");
  const q = buildModel(ctx).queue;
  assert.deepEqual(q.map((e) => e.slug).sort(), ["one", "three", "two"]);
  assert.equal(q.filter((e) => e.lane).length, 2);
});

test("writeDashboard refuses a symlinked dashboard.html and leaves no temp file (ARCH-VIEWS-11)", () => {
  const root = mk(); const victim = path.join(mk(), "victim"); fs.writeFileSync(victim, "keep");
  fs.mkdirSync(path.join(root, ".craftsman", "export"), { recursive: true });
  fs.symlinkSync(victim, path.join(root, ".craftsman", "export", "dashboard.html"));
  assert.throws(() => writeDashboard({ root, rows: [] }), /not a regular file/);
  assert.equal(fs.readFileSync(victim, "utf8"), "keep");
  assert.deepEqual(fs.readdirSync(path.join(root, ".craftsman", "export")), ["dashboard.html"]);
});

test("archive: the dashboard label equals the autoArchiveEligible verdict for the same plan (ARCH-VIEWS-15, ARCH-DOCS-18)", () => {
  for (const withArchive of [false, true]) {
    const { context } = archiveFixture();
    const ws = mk();
    const manifest = path.join(ws, "craftsman.workspace.json");
    if (withArchive) {
      const arch = path.join(ws, "archive");
      fs.mkdirSync(arch);
      git(arch, "init", "-q");
      fs.writeFileSync(manifest, JSON.stringify({ version: 1, projects: { archive: { root: "archive" } } }));
    }
    const prev = process.env.CRAFTSMAN_WORKSPACE_MANIFEST;
    process.env.CRAFTSMAN_WORKSPACE_MANIFEST = manifest;
    try {
      const m = buildModel(context);
      assert.equal(m.archive.candidates.length, 3);
      for (const c of m.archive.candidates) {
        const verdict = autoArchiveEligible(context, c.plan, { capability: landingCapability(), currentState: () => context.rows });
        assert.equal(c.class === "auto", verdict.eligible, `${c.plan} (archive ${withArchive}): ${c.class} vs ${verdict.reason}`);
      }
      if (withArchive) assert.ok(m.archive.candidates.some((c) => c.class === "auto"), "at least one plan is auto");
    } finally { if (prev === undefined) delete process.env.CRAFTSMAN_WORKSPACE_MANIFEST; else process.env.CRAFTSMAN_WORKSPACE_MANIFEST = prev; }
  }
});
