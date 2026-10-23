// Tests for scripts/lib/dashboard.mjs (ARCH-VIEWS-04/10/11).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildModel, renderHtml, writeDashboard, esc, SECTIONS, MERMAID_SRC } from "./lib/dashboard.mjs";

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

test("buildModel: fixture yields all six sections, titles only, one project", () => {
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
<script src="${MERMAID_SRC}"></script>
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
  assert.equal((html.match(/class="empty"/g) || []).length, 6);
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
  assert.equal(ev.sections, 6);
});
