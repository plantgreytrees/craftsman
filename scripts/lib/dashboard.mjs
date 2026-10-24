// Self-contained HTML dashboard (ARCH-VIEWS-04/10/11). buildModel reads only the
// ledger, plan-index, doc frontmatter, mermaid blocks, file sizes and NEXT.md;
// renderHtml turns the model into one file with inline CSS and JS whose only
// external resource is one pinned Mermaid script. Titles, goals, fields only.
import fs from "node:fs";
import path from "node:path";
import { logEvent, loadConfig } from "./core.mjs";
import { frontmatterGoal, listMd, loadIndex, parseFrontmatter, slugOf } from "./plan-index.mjs";
import { classifyArchive } from "./archive.mjs";
import { queue } from "./next-queue.mjs";
import { exportRoot, writeExportFile } from "./export-notes.mjs";
import { archivePath, currentState, parseArchiveHeading } from "../tracker.mjs";
import { execFileSync } from "node:child_process";

export const MERMAID_SRC = "https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js";
// SHA-384 of the pinned file (identical from jsdelivr and unpkg); a bumped version needs a new hash.
export const MERMAID_SRI = "sha384-WmdflGW9aGfoBdHc4rRyWzYuAjEmDwMdGdiPNacbwfGKxBW/SO6guzuQ76qjnSlr";
export const SECTIONS = ["plans", "queue", "ideas", "architecture", "tree", "sizes", "archive"];
const STATES = ["PENDING", "IN_PROGRESS", "BLOCKED", "PARKED", "MERGED", "FEATURE_MERGED", "COMPLETE", "CANCELLED"];
const one = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
function read(file) { try { return fs.readFileSync(file, "utf8"); } catch { return ""; } }
const fmOf = (file) => { try { return parseFrontmatter(read(file)); } catch { return {}; } };

function mermaidBlocks(text) {
  const out = [];
  const re = /```mermaid[ \t]*\r?\n([\s\S]*?)\r?\n```/g;
  for (let m; (m = re.exec(text)); ) out.push(m[1]);
  return out;
}

const CLOSED = ["COMPLETE", "CANCELLED"];
const tracked = (root, file) => {
  try { execFileSync("git", ["-C", root, "ls-files", "--error-unmatch", "--", file], { stdio: "ignore" }); return true; } catch { return false; }
};

// Archive section (ARCH-VIEWS-15): TRACKER-archive.md headings, and candidates = plans with closed (or already archived)
// rows whose doc is still tracked, classed from findReferrers: auto (none), rewrite (prose referrers), blocked (names the file).
function buildArchive(context, rows) {
  const root = context.root;
  const headings = [];
  const archived = new Set();
  for (const line of read(archivePath(context)).split("\n")) {
    const rec = parseArchiveHeading(line);
    if (!rec) continue;
    if (rec.kind === "plan") { archived.add(rec.plan); headings.push({ name: rec.plan, date: rec.date, goal: one(rec.goal), doc_sha: rec.doc ?? "", archive_sha: rec.archive ?? "" }); }
    else headings.push({ name: `idea ${rec.slug}`, date: rec.date, goal: one(rec.verdict), doc_sha: rec.doc ?? "", archive_sha: "" });
  }
  const byPlan = new Map();
  for (const r of rows) byPlan.set(r.plan, [...(byPlan.get(r.plan) ?? []), r.status]);
  const plans = new Set(archived);
  for (const [plan, st] of byPlan) if (st.every((x) => CLOSED.includes(x))) plans.add(plan);
  const candidates = [];
  for (const plan of [...plans].sort()) {
    if (/^docs\/plans\/(TRACKER|NEXT)/.test(plan) || !tracked(root, plan)) continue;
    const slug = slugOf(plan);
    let bytes = 0;
    try { bytes = fs.statSync(path.join(root, plan)).size; } catch { /* gone */ }
    const verdict = classifyArchive(context, plan);
    candidates.push({ plan, class: verdict.class, bytes, blocking: verdict.blocking, referrers: verdict.rewritable });
  }
  return { headings, candidates };
}

export function buildModel(context) {
  const root = context.root;
  const rows = context.rows ?? currentState(context);
  let index = null;
  try { index = context.index ?? loadIndex(root); } catch { index = null; }
  const planDir = path.join(root, "docs", "plans");
  const goalOf = (slug) => one(frontmatterGoal(read(path.join(planDir, `${slug}.md`))));

  // plans board: state -> [{slug, goal, units}]
  const byState = new Map(STATES.map((s) => [s, new Map()]));
  for (const r of rows) {
    const st = byState.get(r.status) ?? byState.set(String(r.status), new Map()).get(String(r.status));
    const slug = slugOf(r.plan);
    st.set(slug, (st.get(slug) ?? 0) + 1);
  }
  const plans = [...byState].map(([state, m]) => ({
    state, cards: [...m].sort(([a], [b]) => (a < b ? -1 : 1)).map(([slug, units]) => ({ slug, goal: goalOf(slug), units })),
  })).filter((c) => c.cards.length);

  let q = [];
  try { q = queue({ ...context, rows, sessions: loadConfig(context).execution?.maxSessions }); } catch { q = []; }
  const sessionQueue = q.map((e) => ({ slug: e.slug, intent: one(e.intent), source: e.source, lane: !!e.lane }));

  // ideas by verdict
  const ideaDir = path.join(root, "docs", "ideas");
  const verdicts = new Map();
  for (const f of listMd(ideaDir)) {
    const fm = fmOf(path.join(ideaDir, f));
    const v = one(fm.verdict) || "none";
    if (!verdicts.has(v)) verdicts.set(v, []);
    verdicts.get(v).push({ slug: f.slice(0, -3), title: one(fm.title || fm.goal) || f.slice(0, -3), status: one(fm.status), confidence: one(fm.confidence) });
  }
  const ideas = [...verdicts].sort(([a], [b]) => (a < b ? -1 : 1)).map(([verdict, items]) => ({ verdict, items }));

  // architecture map
  const archDir = path.join(root, "docs", "architecture");
  const files = listMd(archDir);
  const areas = [];
  for (const f of files.filter((n) => n.endsWith(".rules.md"))) {
    const text = read(path.join(archDir, f));
    const fm = fmOf(path.join(archDir, f));
    const name = f.replace(/\.rules\.md$/, "");
    const rules = {};
    for (const l of text.split("\n")) {
      if (!/^- \*\*ARCH-[A-Z0-9-]+\*\*/.test(l)) continue;
      const m = /^- \*\*[^*]+\*\*\s+\[([a-z-]+)/.exec(l);
      const k = m ? m[1] : "other";
      rules[k] = (rules[k] ?? 0) + 1;
    }
    const governs = Array.isArray(fm.governs) ? fm.governs : fm.governs ? [fm.governs] : [];
    const diagrams = [...mermaidBlocks(text), ...mermaidBlocks(read(path.join(archDir, `${name}.md`)))];
    areas.push({ area: one(fm.area) || name, rules, governs: governs.length, from_idea: one(fm.source), source: `docs/architecture/${f}`, diagrams });
  }

  // plan tree
  const tree = [];
  if (index) {
    const node = (slug, seen) => {
      const n = index.nodes.get(slug);
      if (!n || seen.has(slug)) return null;
      const s = new Set(seen).add(slug);
      return {
        slug, level: n.level, priority: n.priority, goal: goalOf(slug),
        features: n.features.filter((x) => !x.implicit).map((x) => x.id),
        children: n.children.map((c) => node(c, s)).filter(Boolean),
      };
    };
    for (const n of [...index.nodes.values()].filter((x) => (!x.parent || x.derived) && !["NEXT", "TRACKER", "TRACKER-archive"].includes(x.slug)).sort((a, b) => (a.slug < b.slug ? -1 : 1))) {
      const t = node(n.slug, new Set());
      if (t) tree.push(t);
    }
  }

  // doc size bars
  const sizes = [];
  for (const dir of ["plans", "ideas", "architecture"]) {
    for (const f of listMd(path.join(root, "docs", dir))) {
      try { sizes.push({ path: `docs/${dir}/${f}`, bytes: fs.statSync(path.join(root, "docs", dir, f)).size }); } catch { /* gone */ }
    }
  }
  sizes.sort((a, b) => b.bytes - a.bytes || (a.path < b.path ? -1 : 1));

  const archive = buildArchive(context, rows);

  return {
    project: one(path.basename(root)), plans, queue: sessionQueue, ideas, architecture: areas, tree, sizes, archive,
    hasLedger: rows.length > 0, hasNext: sessionQueue.some((e) => e.source === "next") || fs.existsSync(path.join(planDir, "NEXT.md")),
  };
}

// ---- rendering ----
export function esc(v) {
  return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const CSS = `:root{--bg:#fff;--fg:#1b1f24;--mut:#59636e;--card:#f4f6f8;--line:#d0d7de;--acc:#0969da}
@media(prefers-color-scheme:dark){:root{--bg:#0d1117;--fg:#e6edf3;--mut:#9198a1;--card:#161b22;--line:#30363d;--acc:#58a6ff}}
*{box-sizing:border-box}body{margin:0;padding:1rem;background:var(--bg);color:var(--fg);font:15px/1.45 system-ui,sans-serif;max-width:72rem;margin-inline:auto}
h1{font-size:1.4rem}h2{font-size:1.1rem;border-bottom:1px solid var(--line);padding-bottom:.25rem;margin-top:1.8rem}
.cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,14rem),1fr));gap:.75rem}
.card{background:var(--card);border:1px solid var(--line);border-radius:6px;padding:.5rem .7rem;overflow-wrap:anywhere}
.mut{color:var(--mut)}.empty{color:var(--mut);font-style:italic}code{font-size:.9em}
ul{padding-left:1.2rem}li{overflow-wrap:anywhere}.bar{height:.6rem;background:var(--acc);border-radius:3px;min-width:2px}
.row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,2fr) 5rem;gap:.5rem;align-items:center}
@media(max-width:500px){.row{grid-template-columns:1fr 5rem}.row .bar-wrap{grid-column:1/-1;order:3}}
pre{overflow-x:auto;background:var(--card);padding:.5rem;border-radius:4px}`;

const SCRIPT = `(function(){var m=window.mermaid;if(!m){document.documentElement.className="offline";return}
try{m.initialize({startOnLoad:false,securityLevel:"strict",theme:matchMedia("(prefers-color-scheme: dark)").matches?"dark":"default"});m.run({querySelector:"pre.mermaid"}).catch(function(){})}catch(e){}})();`;

const list = (items, fn, empty) => (items.length ? `<ul>${items.map(fn).join("")}</ul>` : `<p class="empty">${esc(empty)}</p>`);

function tree(nodes) {
  return `<ul>${nodes.map((n) => `<li><strong>${esc(n.slug)}</strong> <span class="mut">${esc(n.level)} ${esc(n.priority)}</span>${n.goal ? ` &mdash; ${esc(n.goal)}` : ""}${n.features.length ? ` <span class="mut">features: ${n.features.map(esc).join(", ")}</span>` : ""}${n.children.length ? tree(n.children) : ""}</li>`).join("")}</ul>`;
}

export function renderHtml(model) {
  const m = model;
  const max = Math.max(1, ...m.sizes.map((s) => s.bytes));
  const ar = m.archive ?? { headings: [], candidates: [] };
  const sec = {
    plans: m.plans.length
      ? `<div class="cols">${m.plans.map((c) => `<div class="card"><h3>${esc(c.state)}</h3>${list(c.cards, (p) => `<li><code>${esc(p.slug)}</code> <span class="mut">(${esc(p.units)})</span>${p.goal ? `<br>${esc(p.goal)}` : ""}</li>`, "")}</div>`).join("")}</div>`
      : `<p class="empty">No ledger yet: no plan rows recorded.</p>`,
    queue: list(m.queue, (e) => `<li>${e.lane ? "<strong>lane</strong> " : ""}<code>${esc(e.slug)}</code> <span class="mut">${esc(e.source)}</span>${e.intent ? ` &mdash; ${esc(e.intent)}` : ""}</li>`,
      m.hasNext ? "Queue is empty." : "No docs/plans/NEXT.md and nothing ready."),
    ideas: m.ideas.length
      ? m.ideas.map((g) => `<h3>${esc(g.verdict)}</h3>${list(g.items, (i) => `<li><code>${esc(i.slug)}</code> ${esc(i.title)} <span class="mut">${esc(i.status)} ${esc(i.confidence)}</span></li>`, "")}`).join("")
      : `<p class="empty">No ideas yet.</p>`,
    architecture: m.architecture.length
      ? m.architecture.map((a) => `<div class="card"><h3>${esc(a.area)}</h3><p class="mut">rules: ${Object.entries(a.rules).map(([k, v]) => `${esc(k)} ${esc(v)}`).join(", ") || "none"}; governs ${esc(a.governs)}${a.from_idea ? `; idea <code>${esc(a.from_idea)}</code>` : ""}; <code>${esc(a.source)}</code></p>${a.diagrams.map((d) => `<pre class="mermaid">${esc(d)}</pre><details class="src"><summary>diagram source</summary><pre>${esc(d)}</pre></details>`).join("")}</div>`).join("")
      : `<p class="empty">No architecture rules yet.</p>`,
    tree: m.tree.length ? tree(m.tree) : `<p class="empty">No plans in the plan tree.</p>`,
    sizes: m.sizes.length
      ? m.sizes.map((s) => `<div class="row"><code>${esc(s.path)}</code><div class="bar-wrap"><div class="bar" style="width:${Math.max(1, Math.round((100 * s.bytes) / max))}%"></div></div><span class="mut">${esc(s.bytes)} B</span></div>`).join("")
      : `<p class="empty">No docs found.</p>`,
    archive: `<h3>Archived</h3>${list(ar.headings, (h) => `<li><code>${esc(h.name)}</code> <span class="mut">${esc(h.date)}</span>${h.goal ? ` &mdash; ${esc(h.goal)}` : ""} <span class="mut">doc ${esc(h.doc_sha || "none")}${h.archive_sha ? `, archive ${esc(h.archive_sha)}` : ""}</span></li>`, "Nothing archived yet.")}`
      + `<h3>Archive candidates</h3>${list(ar.candidates, (c) => `<li><code>${esc(c.plan)}</code> <strong>${esc(c.class)}</strong> <span class="mut">${esc(c.bytes)} B</span>${c.blocking.length ? ` blocked by ${c.blocking.map((f) => `<code>${esc(f)}</code>`).join(", ")}` : ""}${c.referrers.length ? ` rewrite ${c.referrers.map((f) => `<code>${esc(f)}</code>`).join(", ")}` : ""}</li>`, "No archive candidates.")}`,
  };
  const titles = { plans: "Plans board", queue: "Session queue", ideas: "Ideas by verdict", architecture: "Architecture map", tree: "Plan tree", sizes: "Doc sizes", archive: "Archive" };
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(m.project)} dashboard</title>
<style>${CSS}</style></head><body>
<h1>${esc(m.project)} dashboard</h1>
${SECTIONS.map((k) => `<section id="${k}"><h2>${titles[k]}</h2>${sec[k]}</section>`).join("\n")}
<script src="${MERMAID_SRC}" integrity="${MERMAID_SRI}" crossorigin="anonymous"></script>
<script>${SCRIPT}</script>
</body></html>
`;
}

// Writes dashboard.html under the export tree only (ARCH-VIEWS-11) and logs the render.
export function writeDashboard(context, { skipped = false } = {}) {
  const t0 = Date.now();
  const file = path.join(exportRoot(context), "dashboard.html");
  const html = renderHtml(buildModel(context));
  writeExportFile(context, "dashboard.html", html);
  logRender(context, { ms: Date.now() - t0, skipped, sections: SECTIONS.length });
  return file;
}

export function logRender(context, { ms, skipped = false, sections = SECTIONS.length }) {
  logEvent({ ev: "dashboard_render", ms, skipped, sections }, { stateDir: context.stateDir || path.join(context.root, ".craftsman") });
}
