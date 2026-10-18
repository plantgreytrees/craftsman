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

function read(file) {
  try { return fs.readFileSync(file, "utf8"); } catch { return ""; }
}

// A block holds data when any table row after the header has a cell other than the dash.
function blockHasRows(text) {
  const block = generatedBlock(text);
  if (!block) return false;
  const data = block.split("\n").filter((line) => line.startsWith("|")).slice(2);
  return data.some((line) => line.split("|").slice(1, -1).some((c) => c.trim() && c.trim() !== "—"));
}

export function jsonlText(rows) {
  return rows.length ? rows.map((row) => JSON.stringify(row)).join("\n") + "\n" : "";
}

// Render into `temp`; returns the pathspecs to stage, or a refusal.
function render(temp, rows, root, input) {
  const docFile = path.join(temp, DOC);
  const jsonlFile = path.join(temp, JSONL);
  const doc = read(docFile);
  const committedJsonl = read(jsonlFile);
  if (!rows.length && (blockHasRows(doc) || committedJsonl.trim())) {
    const archived = input.archived === true || read(path.join(root, ARCHIVE)) !== read(path.join(temp, ARCHIVE));
    if (!archived) return { refused: "blank: refusing to shrink a committed non-empty tracker block to empty without an archive event" };
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
  if (mode !== "push") return { published: false, mode };
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
      run(root, ["worktree", "add", "--detach", temp, `origin/${base}`]);
      added = true;
      const rendered = render(temp, rows, root, input);
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
