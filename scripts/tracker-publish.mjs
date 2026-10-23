#!/usr/bin/env node
// Publishes generated tracker progress to base (ARCH-TRACKER-11/12, ARCH-LAND-17):
// under the base merge lock, in a detached temp worktree at origin/<base>, render
// the root block, the rollups and docs/plans/TRACKER.jsonl, commit only those
// pathspecs and push HEAD:<base> (plain push). One retry on rejection. Never parks.
import fs from "node:fs";
import path from "node:path";
import { loadConfig, logEvent, projectContext, readStdin } from "./lib/core.mjs";
import { loadIndex } from "./lib/plan-index.mjs";
import { writeRollups } from "./lib/tracker-rollup.mjs";
import { acquireLock, releaseLock, heartbeat, inspectRepo, run } from "./repo-exec.mjs";
import { generatedBlock, renderBlock, renderState, spliceBlock, trackerRoot } from "./tracker.mjs";

const DOC = "docs/plans/TRACKER.md";
const JSONL = "docs/plans/TRACKER.jsonl";
const ARCHIVE = "docs/plans/TRACKER-archive.md";

// A real archive event is a tracker_archived or doc_retired line in the event log;
// a checkout merely behind origin differs in TRACKER-archive.md but logs neither.
// Only events after the last tracker_published count (an earlier one was already
// published); a log with no tracker_published counts every archive event. Without a
// stateDir nothing is read, so the process cwd is never consulted.
function archivedPlans(context) {
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

function read(file) {
  try { return fs.readFileSync(file, "utf8"); } catch { return ""; }
}

// Row identity shared by the ledger and the rendered block: plan basename | unit.
const rowKey = (plan, unit) => `${path.posix.basename(String(plan).split(path.sep).join("/"), ".md")}|${unit}`;

// Committed row keys: from TRACKER.jsonl when it holds rows, else from the committed
// block's plan|unit pairs (ARCH-TRACKER-13).
function committedKeys(doc, committedJsonl) {
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

export function jsonlText(rows) {
  return rows.length ? rows.map((row) => JSON.stringify(row)).join("\n") + "\n" : "";
}

// Render into `temp`; returns the pathspecs to stage, or a refusal.
function render(temp, rows, context, input) {
  const docFile = path.join(temp, DOC);
  const jsonlFile = path.join(temp, JSONL);
  const doc = read(docFile);
  const committedJsonl = read(jsonlFile);
  const have = new Set(rows.map((row) => rowKey(row.plan, row.unit)));
  const archived = input.archived === true ? { all: true, plans: new Set() } : archivedPlans(context);
  const dropped = [...committedKeys(doc, committedJsonl)]
    .filter((key) => !have.has(key) && !archived.all && !archived.plans.has(key.slice(0, key.lastIndexOf("|"))));
  if (dropped.length) {
    logEvent({ ev: "tracker_publish_refused", dropped }, context);
    const what = rows.length ? "shrink" : "blank";
    return { refused: `${what}: refusing to drop ${dropped.length} committed tracker row(s) without an archive event`, dropped };
  }
  const paths = [];
  if (rows.length || generatedBlock(doc) !== null) {
    const next = spliceBlock(doc, renderBlock(rows));
    if (next !== doc) { fs.mkdirSync(path.dirname(docFile), { recursive: true }); fs.writeFileSync(docFile, next, "utf8"); }
    paths.push(DOC);
  }
  const jsonl = jsonlText(rows);
  if (jsonl !== committedJsonl) { fs.mkdirSync(path.dirname(jsonlFile), { recursive: true }); fs.writeFileSync(jsonlFile, jsonl, "utf8"); }
  if (jsonl || committedJsonl) paths.push(JSONL);
  try {
    for (const file of writeRollups(temp, loadIndex(temp), rows)) paths.push(path.relative(temp, file).split(path.sep).join("/"));
  } catch { /* a malformed plan index never blocks publishing */ }
  return { paths };
}

// `deps.beforePush(attempt)` is a test seam for a competing push.
export function publishTracker(input = {}, context = projectContext(input.project || "."), deps = {}) {
  const mode = loadConfig(context).tracker?.publish ?? "push";
  if (mode === "on-approve" ? input.approved !== true && input.manual !== true : mode !== "push") return { published: false, mode };
  let lock = null;
  let temp = null;
  let added = false;
  const root = trackerRoot(context);
  try {
    const info = inspectRepo({ ...context, root }, input);
    if (!info.has_remote) return { published: false, mode, skipped: "no remote" };
    const base = info.base_branch;
    const rows = renderState(context);
    lock = acquireLock(info, { ...input, unit: input.unit || "tracker-publish" });
    temp = path.join(info.common_git_dir, ".craftsman", "publish", `${base.replace(/[^A-Za-z0-9_-]/g, "-")}-${process.pid}`);
    let reason = "";
    for (let attempt = 1; attempt <= 2; attempt++) {
      heartbeat(lock);
      run(root, ["fetch", "origin", base]);
      fs.mkdirSync(path.dirname(temp), { recursive: true });
      run(root, ["worktree", "prune"], { allowFailure: true });
      run(root, ["worktree", "add", "--detach", temp, `origin/${base}`]);
      added = true;
      const rendered = render(temp, rows, context, input);
      if (rendered.refused) return { published: false, mode, refused: rendered.refused };
      if (rendered.paths.length) run(temp, ["add", "--", ...rendered.paths]);
      if (!rendered.paths.length || !run(temp, ["diff", "--cached", "--name-only"])) return { published: false, mode, unchanged: true };
      run(temp, ["commit", "-m", `docs(tracker): publish ledger (${rows.length} rows)`, "--", ...rendered.paths]);
      deps.beforePush?.(attempt);
      try {
        run(temp, ["push", "origin", `HEAD:${base}`]);
        const sha = run(temp, ["rev-parse", "HEAD"]);
        logEvent({ ev: "tracker_published", base, rows: rows.length, sha, attempt }, context);
        return { published: true, mode, base, sha, attempt };
      } catch (error) {
        reason = String(error.stderr || error.message).trim().split("\n")[0];
        logEvent({ ev: "tracker_publish_rejected", base, attempt, reason }, context);
      }
      run(root, ["worktree", "remove", temp], { allowFailure: true });
      fs.rmSync(temp, { recursive: true, force: true });
      added = false;
    }
    return { published: false, mode, rejected: true, reason };
  } catch (error) {
    logEvent({ ev: "tracker_publish_rejected", reason: error.message }, context);
    return { published: false, mode, error: error.message };
  } finally {
    if (added) run(root, ["worktree", "remove", temp], { allowFailure: true });
    if (temp) fs.rmSync(temp, { recursive: true, force: true });
    run(root, ["worktree", "prune"], { allowFailure: true });
    releaseLock(lock);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const input = JSON.parse(await readStdin() || "{}");
  process.stdout.write(JSON.stringify(publishTracker(input, projectContext(input.project || "."))) + "\n");
}
