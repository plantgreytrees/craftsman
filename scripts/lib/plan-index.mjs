// The only parser of docs/plans frontmatter for hierarchy (ARCH-PLAN-02).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, basename } from "node:path";

export const LEVELS = ["epic", "story", "feature"];
const PRIORITIES = ["P0", "P1", "P2", "P3"];
export const SLUG_RE = /^[A-Za-z0-9._-]+$/;
const DERIVED = /^(scrutinise|investigate)-/;

// ---- minimal YAML subset: maps, block lists, lists of maps, inline [a, b] ----
function scalar(raw) {
  const v = raw.trim();
  if (v.startsWith("[") && v.endsWith("]")) {
    const parts = [];
    let depth = 0, cur = "";
    for (const ch of v.slice(1, -1)) {
      if (ch === "[" || ch === "{") depth++;
      if (ch === "]" || ch === "}") depth--;
      if (ch === "," && depth === 0) { parts.push(cur); cur = ""; } else cur += ch;
    }
    if (cur.trim()) parts.push(cur);
    return parts.map(scalar);
  }
  if (/^(["']).*\1$/.test(v)) return v.slice(1, -1);
  if (/^-?\d+$/.test(v)) return Number(v);
  return v;
}

function stripComment(line) {
  let q = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === q) q = null; } else if (c === '"' || c === "'") q = c;
    else if (c === "#" && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
  }
  return line;
}

function parseLines(lines) {
  let i = 0;
  function block(indent) {
    return lines[i].text.startsWith("- ") || lines[i].text === "-" ? list(indent) : map(indent);
  }
  function list(indent) {
    const out = [];
    while (i < lines.length && lines[i].indent === indent && (lines[i].text.startsWith("- ") || lines[i].text === "-")) {
      const rest = lines[i].text.slice(1).trim();
      if (/^[A-Za-z_][\w-]*:(\s|$)/.test(rest)) {
        lines[i] = { indent: indent + 2, text: rest };
        out.push(map(indent + 2));
      } else { i++; out.push(scalar(rest)); }
    }
    return out;
  }
  function map(indent) {
    const out = {};
    while (i < lines.length && lines[i].indent === indent && !lines[i].text.startsWith("- ")) {
      const m = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(lines[i].text);
      if (!m) { i++; continue; }
      i++;
      if (m[2] !== "") out[m[1]] = scalar(m[2]);
      else if (i < lines.length && (lines[i].indent > indent || (lines[i].indent === indent && lines[i].text.startsWith("- ")))) out[m[1]] = block(lines[i].indent);
      else out[m[1]] = null;
    }
    return out;
  }
  return lines.length ? block(lines[0].indent) : {};
}

export function parseFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!m) return {};
  const lines = m[1].split(/\r?\n/).map((l) => stripComment(l).replace(/\s+$/, "")).filter((l) => l.trim())
    .map((l) => ({ indent: l.length - l.trimStart().length, text: l.trim() }));
  const parsed = parseLines(lines);
  return Array.isArray(parsed) ? {} : parsed;
}

const slugOf = (ref) => basename(String(ref).trim(), ".md");
const asList = (v) => (Array.isArray(v) ? v : v == null || v === "" ? [] : [v]);

// ---- building ----
// docs: [{ slug?, path?, text }] ; returns the validated index.
export function buildIndex(docs) {
  const nodes = new Map();
  for (const doc of docs) {
    const fm = parseFrontmatter(doc.text);
    const slug = String(fm.slug || doc.slug || (doc.path ? slugOf(doc.path) : ""));
    if (!slug) throw new Error("plan doc without a slug");
    if (!SLUG_RE.test(slug) || /^\.+$/.test(slug)) throw Object.assign(new Error(`invalid plan slug: ${JSON.stringify(slug)} must match ${SLUG_RE}`), { docPath: doc.path || null });
    if (nodes.has(slug)) throw Object.assign(new Error(`duplicate plan slug: ${slug} (also ${nodes.get(slug).path || "an earlier doc"})`), { docPath: doc.path || null });
    const level = fm.level == null ? "feature" : String(fm.level);
    if (!LEVELS.includes(level)) throw new Error(`${slug}: invalid level '${level}'`);
    if (fm.priority != null && !PRIORITIES.includes(String(fm.priority))) throw new Error(`${slug}: invalid priority '${fm.priority}'`);
    const units = asList(fm.units).filter((u) => u && typeof u === "object" && u.id != null).map((u) => ({ id: String(u.id), feature: u.feature == null ? null : String(u.feature) }));
    let features;
    if (Array.isArray(fm.features) && fm.features.length) {
      features = fm.features.map((f) => {
        const g = f && typeof f === "object" ? f : { id: f };
        const own = asList(g.units).map(String);
        const tagged = units.filter((u) => u.feature === String(g.id)).map((u) => u.id);
        return { id: String(g.id), units: [...new Set([...own, ...tagged])] };
      });
    } else {
      features = [{ id: slug, units: units.map((u) => u.id), implicit: true }];
    }
    nodes.set(slug, {
      slug, path: doc.path || null, ownLevel: fm.level == null ? null : level, level, derived: DERIVED.test(slug),
      parent: fm.parent == null || fm.parent === "" ? null : slugOf(fm.parent),
      declaredChildren: fm.children == null ? null : asList(fm.children).map(slugOf),
      ownPriority: fm.priority == null ? null : String(fm.priority),
      priority: "P2", features, units: units.map((u) => u.id), children: [],
    });
  }
  // dangling + cycles
  for (const n of nodes.values()) {
    if (n.parent && !nodes.has(n.parent)) throw new Error(`${n.slug}: dangling parent '${n.parent}'`);
  }
  for (const n of nodes.values()) {
    const seen = [n.slug];
    for (let p = n.parent; p; p = nodes.get(p).parent) {
      if (seen.includes(p)) throw new Error(`${n.slug}: cyclic parent chain ${[...seen, p].join(" -> ")}`);
      seen.push(p);
    }
  }
  // derived docs inherit the level of their parent plan (resolved top-down)
  const levelOf = (n, guard = new Set()) => {
    if (!n.derived || !n.parent || guard.has(n.slug)) return n.level;
    guard.add(n.slug);
    return levelOf(nodes.get(n.parent), guard);
  };
  for (const n of nodes.values()) if (n.derived && n.parent) n.level = levelOf(n);
  // structure rules
  for (const n of nodes.values()) {
    if (n.level === "epic" && n.units.length) throw new Error(`${n.slug}: an epic is a thin doc with no units`);
    if (!n.parent || n.derived) continue;
    const p = nodes.get(n.parent);
    if (p.level === "story") throw new Error(`${n.slug}: parent '${p.slug}' is a story; a story's features are its own features: groups, not separate plans`);
    if (p.level !== "epic") throw new Error(`${n.slug}: parent '${p.slug}' is a ${p.level}; expected an epic`);
    if (n.level === "epic") throw new Error(`${n.slug}: an epic cannot have a parent`);
  }
  // priority inheritance
  const prio = (n) => n.ownPriority || (n.parent ? prio(nodes.get(n.parent)) : "P2");
  for (const n of nodes.values()) n.priority = prio(n);
  // children cross-check
  const actual = new Map([...nodes.keys()].map((s) => [s, []]));
  for (const n of nodes.values()) if (n.parent && !n.derived) actual.get(n.parent).push(n.slug);
  const rank = (s) => PRIORITIES.indexOf(nodes.get(s).priority);
  const fallback = (a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0);
  for (const n of nodes.values()) {
    const real = actual.get(n.slug);
    if (n.declaredChildren) {
      const declared = n.declaredChildren;
      const same = declared.length === real.length && declared.every((c) => real.includes(c)) && new Set(declared).size === declared.length;
      if (!same) throw new Error(`${n.slug}: children [${declared.join(", ")}] disagree with children's parent: [${[...real].sort().join(", ")}]`);
      n.children = [...declared];
    } else n.children = [...real].sort(fallback);
  }
  return { nodes, get: (s) => nodes.get(slugOf(s)) };
}

export function loadIndex(root = process.cwd()) {
  const dir = join(root, "docs", "plans");
  if (!existsSync(dir)) return buildIndex([]);
  const docs = readdirSync(dir).filter((f) => f.endsWith(".md")).sort()
    .map((f) => ({ path: `docs/plans/${f}`, slug: f.slice(0, -3), text: readFileSync(join(dir, f), "utf8") }));
  return buildIndex(docs);
}

function indexFrom(opts) { return opts.index || loadIndex(opts.root); }

export function descendantSlugs(slug, opts = {}) {
  const idx = indexFrom(opts);
  const start = idx.get(slug);
  if (!start) throw new Error(`unknown plan: ${slug}`);
  const out = [];
  const walk = (n) => { for (const c of n.children) { out.push(c); walk(idx.nodes.get(c)); } };
  walk(start);
  // derived docs (scrutinise-/investigate-) hang off their source plan too
  const all = [start.slug, ...out];
  for (const n of idx.nodes.values()) if (n.derived && all.includes(n.parent) && !out.includes(n.slug)) out.push(n.slug);
  return out;
}

// Ordered features then units for a slug. level: epic|story|feature|unit (default feature).
export function resolve(slug, { level = "feature", feature, index, root } = {}) {
  if (![...LEVELS, "unit"].includes(level)) throw new Error(`invalid level: ${level}`);
  const idx = index || loadIndex(root);
  const start = idx.get(slug);
  if (!start) throw new Error(`unknown plan: ${slug}`);
  const featuresOf = (n) => n.features.map((f) => ({ plan: n.slug, id: f.id, units: [...f.units], implicit: !!f.implicit }));
  const subtree = (n) => (n.level === "epic" ? n.children.flatMap((c) => subtree(idx.nodes.get(c))) : featuresOf(n));
  let features = subtree(start);
  if (feature != null) {
    features = features.filter((f) => f.id === String(feature));
    if (!features.length) throw new Error(`${slug}: no feature '${feature}'`);
  } else if (level === "feature" || level === "unit") {
    features = features.slice(0, 1);
  } else if (level === "story" && start.level === "epic") {
    features = features.filter((f) => f.plan === start.children[0]);
  }
  const units = features.flatMap((f) => f.units.map((id) => ({ plan: f.plan, feature: f.id, id })));
  return { slug, level, features, units };
}
