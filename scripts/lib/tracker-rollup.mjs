// Per-epic and per-story rollups of the tracker ledger (ARCH-TRACKER-10).
// Pure rendering: rows come in, text goes out. The root TRACKER.md block and
// renderBlock are untouched. Each rollup lives at docs/plans/<slug>/TRACKER.md
// inside a fence that is generated and never hand-edited (pre-guard).
import fs from "node:fs";
import path from "node:path";
import { descendantSlugs } from "./plan-index.mjs";

export const ROLLUP_BEGIN = "<!-- craftsman:rollup:begin -->";
export const ROLLUP_END = "<!-- craftsman:rollup:end -->";
const ROLLUP_RE = new RegExp(`${ROLLUP_BEGIN}[\\s\\S]*?${ROLLUP_END}`);

export function rollupBlock(text) {
  return ROLLUP_RE.exec(String(text))?.[0] ?? null;
}

export function rollupPath(root, slug) {
  const base = path.resolve(root, "docs", "plans");
  const file = path.resolve(base, String(slug), "TRACKER.md");
  if (!/^[A-Za-z0-9._-]+$/.test(String(slug)) || String(slug).split(".").every((x) => x === "") || !file.startsWith(base + path.sep)) {
    throw new Error(`refusing rollup path outside docs/plans for slug: ${JSON.stringify(slug)}`);
  }
  return file;
}

const STATUS_ORDER = ["PENDING", "IN_PROGRESS", "MERGED", "FEATURE_MERGED", "COMPLETE", "BLOCKED", "PARKED", "CANCELLED"];
const planSlug = (row) => path.posix.basename(String(row.plan).split(path.sep).join("/"), ".md");

// COMPLETE only when every row is COMPLETE; no rows is PENDING.
export function rollupStatus(rows) {
  if (!rows.length) return "PENDING";
  if (rows.every((r) => r.status === "COMPLETE")) return "COMPLETE";
  if (rows.some((r) => r.status === "BLOCKED")) return "BLOCKED";
  if (rows.every((r) => r.status === "PENDING")) return "PENDING";
  return "IN_PROGRESS";
}

function summary(rows) {
  const done = rows.filter((r) => r.status === "COMPLETE").length;
  const counts = STATUS_ORDER.map((s) => [s, rows.filter((r) => r.status === s).length]).filter(([, n]) => n);
  return {
    status: rollupStatus(rows), total: rows.length, done,
    percent: rows.length ? Math.floor((done / rows.length) * 100) : 0,
    counts: counts.length ? counts.map(([s, n]) => `${s} ${n}`).join(", ") : "no rows",
  };
}

// The slugs that get a rollup: every epic and story that is not a derived doc.
export function rollupSlugs(index) {
  return [...index.nodes.values()].filter((n) => !n.derived && (n.level === "epic" || n.level === "story")).map((n) => n.slug).sort();
}

export function renderRollup(slug, index, rows) {
  const node = index.get(slug);
  if (!node) throw new Error(`unknown plan: ${slug}`);
  const family = (s) => new Set([s, ...descendantSlugs(s, { index })]);
  const mine = rows.filter((r) => family(slug).has(planSlug(r)));
  const s = summary(mine);
  const lines = [
    ROLLUP_BEGIN,
    "<!-- Generated from the tracker ledger by scripts/lib/tracker-rollup.mjs. Do not edit by hand. -->",
    "",
    `# ${slug} (${node.level})`,
    "",
    `Plan: [${slug}](../${slug}.md)`,
    "",
    `**Status: ${s.status}** — ${s.done}/${s.total} rows COMPLETE (${s.percent}%)`,
    "",
    `Counts: ${s.counts}`,
    "",
  ];
  if (node.level === "epic") {
    lines.push("| child | status | complete | percent | link |", "|---|---|---|---|---|");
    for (const child of node.children) {
      const sub = summary(rows.filter((r) => family(child).has(planSlug(r))));
      const link = index.get(child).level === "story" ? `../${child}/TRACKER.md` : `../${child}.md`;
      lines.push(`| ${child} | ${sub.status} | ${sub.done}/${sub.total} | ${sub.percent}% | [${child}](${link}) |`);
    }
    if (!node.children.length) lines.push("| — | — | — | — | — |");
  } else {
    lines.push("| feature | unit | status |", "|---|---|---|");
    let any = false;
    for (const f of node.features) {
      for (const unit of f.units) {
        const row = mine.find((r) => r.unit === unit && planSlug(r) === slug);
        lines.push(`| ${f.id} | ${unit} | ${row ? row.status : "PENDING"} |`);
        any = true;
      }
    }
    if (!any) lines.push("| — | — | — |");
  }
  lines.push("", ROLLUP_END);
  return lines.join("\n");
}

function splice(text, block) {
  if (rollupBlock(text) !== null) return text.replace(ROLLUP_RE, () => block);
  return `${text.trimEnd() ? `${text.trimEnd()}\n\n` : ""}${block}\n`;
}

// Write every rollup that changed; returns the files written.
export function writeRollups(root, index, rows) {
  const written = [];
  for (const slug of rollupSlugs(index)) {
    const file = rollupPath(root, slug);
    let text = "";
    try { text = fs.readFileSync(file, "utf8"); } catch { /* new */ }
    const next = splice(text, renderRollup(slug, index, rows));
    if (next === text) continue;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, next, "utf8");
    written.push(file);
  }
  return written;
}
