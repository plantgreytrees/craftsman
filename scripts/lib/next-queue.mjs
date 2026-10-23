// Session queue from docs/plans/NEXT.md plus the ledger (ARCH-VIEWS-06/07).
// The lane count is passed in as `context.sessions`; this module reads no config.
import fs from "node:fs";
import path from "node:path";
import { basename } from "node:path";
import { loadIndex } from "./plan-index.mjs";
import { logEvent } from "./core.mjs";

const PRIORITIES = ["P0", "P1", "P2", "P3"];
const STATUS_WORDS = /\b(PENDING|IN_PROGRESS|MERGED|FEATURE_MERGED|COMPLETE|BLOCKED|PARKED|CANCELLED|DONE)\b/;
const LINE = /^\s*\d+\.\s+(\S+)\s+[—–-]+\s+(.+?)\s*$/;
const slugOf = (p) => basename(String(p || ""), ".md");

export function nextPath(root) { return path.join(root, "docs", "plans", "NEXT.md"); }

// `N. <slug> — <intent>` lines, in written order; anything else is ignored.
export function parseNext(text) {
  const out = [];
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const m = LINE.exec(line);
    if (m) out.push({ slug: m[1], intent: m[2] });
  }
  return out;
}

function readNext(context) {
  if (context.nextText != null) return context.nextText;
  try { return fs.readFileSync(nextPath(context.root), "utf8"); } catch { return ""; }
}

function indexOf(context) {
  if (context.index) return context.index;
  try { return loadIndex(context.root); } catch { return null; }
}

function groupRows(rows = []) {
  const plans = new Map();
  for (const r of rows) {
    const slug = slugOf(r.plan);
    if (!slug) continue;
    if (!plans.has(slug)) plans.set(slug, []);
    plans.get(slug).push(r);
  }
  return plans;
}

export function readyList(context) {
  const index = indexOf(context);
  const ready = [];
  for (const [slug, rows] of groupRows(context.rows)) {
    const st = rows.map((r) => r.status);
    if (!st.some((s) => s === "PENDING" || s === "IN_PROGRESS")) continue;
    if (st.some((s) => s === "PARKED" || s === "BLOCKED")) continue;
    const node = index?.get(slug) || null;
    const parent = node?.parent ? index.get(node.parent) : null;
    const pos = parent ? parent.children.indexOf(slug) : 0;
    const updated = rows.map((r) => String(r.updated_at || "")).sort()[0] || "";
    ready.push({ slug, priority: PRIORITIES.indexOf(node?.priority || "P2"), pos: pos < 0 ? 0 : pos, updated });
  }
  ready.sort((a, b) => a.priority - b.priority || a.pos - b.pos || (a.updated < b.updated ? -1 : a.updated > b.updated ? 1 : 0)
    || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  return ready.map((r) => r.slug);
}

// -> [{ slug, intent?, source: "next"|"ready", lane: boolean }]
export function queue(context) {
  const lanes = Math.max(1, Number(context.sessions) || 1);
  const seen = new Set();
  const entries = [];
  for (const e of parseNext(readNext(context))) {
    if (seen.has(e.slug)) continue;
    seen.add(e.slug);
    entries.push({ slug: e.slug, intent: e.intent, source: "next" });
  }
  for (const slug of readyList(context)) {
    if (seen.has(slug)) continue;
    seen.add(slug);
    entries.push({ slug, source: "ready" });
  }
  return entries.map((e, i) => ({ ...e, lane: i < lanes }));
}

// -> [{ slug, problem: "unresolved"|"status-word"|"complete" }]; logs each as next_queue_lint.
export function lintNext(context) {
  const text = readNext(context);
  if (!text) return [];
  const index = indexOf(context);
  const byPlan = groupRows(context.rows);
  const problems = [];
  for (const line of String(text).split(/\r?\n/)) {
    const m = LINE.exec(line);
    if (!m) continue;
    const slug = m[1];
    if (STATUS_WORDS.test(line)) problems.push({ slug, problem: "status-word" });
    if (index && !index.get(slug)) problems.push({ slug, problem: "unresolved" });
    const rows = byPlan.get(slug) || [];
    if (rows.length && rows.every((r) => r.status === "COMPLETE" || r.status === "CANCELLED") && rows.some((r) => r.status === "COMPLETE")) {
      problems.push({ slug, problem: "complete" });
    }
  }
  const stateDir = context.stateDir || path.join(context.root, ".craftsman");
  for (const p of problems) logEvent({ ev: "next_queue_lint", ...p }, { stateDir });
  return problems;
}
