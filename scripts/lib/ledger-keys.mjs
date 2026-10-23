// Committed-row-key guard shared by publish and sync (ARCH-TRACKER-13).
import fs from "node:fs";
import path from "node:path";
import { generatedBlock } from "../tracker.mjs";

function read(file) {
  try { return fs.readFileSync(file, "utf8"); } catch { return ""; }
}

// A real archive event is a tracker_archived or doc_retired line in the event log;
// a checkout merely behind origin differs in TRACKER-archive.md but logs neither.
// Only events after the last tracker_published count (an earlier one was already
// published); a log with no tracker_published counts every archive event. Without a
// stateDir nothing is read, so the process cwd is never consulted.
export function archivedPlans(context) {
  const out = { all: false, plans: new Set() };
  if (!context?.stateDir) return out;
  const slug = (plan) => path.posix.basename(String(plan).split(path.sep).join("/"), ".md");
  const lines = read(path.join(context.stateDir, "events.jsonl")).split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    let ev;
    try { ev = JSON.parse(lines[i]); } catch { continue; }
    if (ev.ev === "tracker_published") break;
    if (ev.ev !== "tracker_archived" && ev.ev !== "doc_retired") continue;
    // ARCH-TRACKER-13: an archive excuses only the plans it names (the plan, its siblings and
    // descendants). Real events always carry `plan`; one without it archived the whole ledger.
    if (typeof ev.plan !== "string" || !ev.plan) { out.all = true; continue; }
    for (const plan of [ev.plan, ...(ev.siblings || []), ...(ev.descendants || [])]) if (typeof plan === "string" && plan) out.plans.add(slug(plan));
  }
  return out;
}

// Row identity shared by the ledger and the rendered block: plan basename | unit.
export const rowKey = (plan, unit) => `${path.posix.basename(String(plan).split(path.sep).join("/"), ".md")}|${unit}`;

// Committed row keys: from TRACKER.jsonl when it holds rows, else from the committed
// block's plan|unit pairs (ARCH-TRACKER-13).
export function committedKeys(doc, committedJsonl) {
  const keys = new Set();
  for (const line of committedJsonl.split("\n")) {
    try { const r = JSON.parse(line); if (r.plan && r.unit) keys.add(rowKey(r.plan, r.unit)); } catch { /* skip */ }
  }
  if (keys.size) return keys;
  const block = generatedBlock(doc);
  if (!block) return keys;
  const split = (line) => line.split(/(?<!\\)\|/).slice(1, -1).map((c) => c.trim());
  const table = block.split("\n").filter((line) => line.startsWith("|"));
  const header = table.length ? split(table[0]) : [];
  const pi = header.indexOf("plan"), ui = header.indexOf("unit");
  if (pi < 0 || ui < 0) return keys;
  for (const line of table.slice(2)) {
    const cells = split(line);
    const plan = /^\[([^\]]*)\]/.exec(cells[pi] ?? "")?.[1];
    const unit = (cells[ui] ?? "").replace(/\s*\([^)]*\)$/, "");
    if (plan && unit && unit !== "—") keys.add(`${plan}|${unit}`);
  }
  return keys;
}

// Committed keys the render `rows` would drop, minus those an archive event excuses.
export function droppedKeys(rows, doc, committedJsonl, context, allArchived = false) {
  const have = new Set(rows.map((row) => rowKey(row.plan, row.unit)));
  const archived = allArchived ? { all: true, plans: new Set() } : archivedPlans(context);
  return [...committedKeys(doc, committedJsonl)]
    .filter((key) => !have.has(key) && !archived.all && !archived.plans.has(key.slice(0, key.lastIndexOf("|"))));
}
