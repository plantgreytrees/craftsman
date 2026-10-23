#!/usr/bin/env node
// Publishes generated tracker progress to base (ARCH-TRACKER-11/12, ARCH-LAND-17):
// under the base merge lock, in a detached temp worktree at origin/<base>, render
// the root block, the rollups and docs/plans/TRACKER.jsonl, commit only those
// pathspecs and push HEAD:<base> (plain push). One retry on rejection. Never parks.
import fs from "node:fs";
import path from "node:path";
import { loadConfig, logEvent, mainCheckoutRoot, projectContext, readStdin } from "./lib/core.mjs";
import { loadIndex } from "./lib/plan-index.mjs";
import { writeRollups } from "./lib/tracker-rollup.mjs";
import { acquireLock, releaseLock, heartbeat, inspectRepo, run } from "./repo-exec.mjs";
import { approvalRequired } from "./lib/approval-gate.mjs";
import { markPublished } from "./approval.mjs";
import { droppedKeys } from "./lib/ledger-keys.mjs";
import { generatedBlock, renderBlock, renderState, spliceBlock, trackerRoot } from "./tracker.mjs";

const DOC = "docs/plans/TRACKER.md";
const JSONL = "docs/plans/TRACKER.jsonl";
const ARCHIVE = "docs/plans/TRACKER-archive.md";

function read(file) {
  try { return fs.readFileSync(file, "utf8"); } catch { return ""; }
}

export function jsonlText(rows) {
  return rows.length ? rows.map((row) => JSON.stringify(row)).join("\n") + "\n" : "";
}

// Render into `temp`; returns the pathspecs to stage, or a refusal.
function render(temp, rows, context) {
  const docFile = path.join(temp, DOC);
  const jsonlFile = path.join(temp, JSONL);
  const doc = read(docFile);
  const committedJsonl = read(jsonlFile);
  const dropped = droppedKeys(rows, doc, committedJsonl, context);
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

// ARCH-LAND-24: on-approve publishes only for a landed approval record named by `run`
// (ARCH-LAND-22), or a /sync-docs --tracker the owner ran (`manual:true`).
function runLanded(context, run) {
  if (typeof run !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(run)) return false;
  const file = path.join(mainCheckoutRoot(context.root), ".craftsman", "approvals", `${run}.json`);
  try { const rec = JSON.parse(fs.readFileSync(file, "utf8")); return rec.status === "landed" && !rec.published_at; } catch { return false; }
}

// Consume the approval token; a refusal after the push is logged, never thrown.
function consume(mode, input, context, base) {
  if (mode !== "on-approve" || input.manual === true) return;
  const marked = markPublished(input.run, { root: context.root });
  if (!marked?.ok) logEvent({ ev: "tracker_publish_mark_failed", run: input.run, base, reason: marked?.error || marked?.reason || "refused" }, context);
}

// `deps.beforePush(attempt)` is a test seam for a competing push; `deps.afterLock()` runs once the base lock is held.
export function publishTracker(input = {}, context = projectContext(input.project || "."), deps = {}) {
  const cfg = loadConfig(context);
  let mode = cfg.tracker?.publish ?? "on-approve";
  if (mode === "push" && approvalRequired(cfg)) mode = "on-approve";
  if (mode === "on-approve" ? !(input.manual === true || (input.approved === true && runLanded(context, input.run))) : mode !== "push") return { published: false, mode };
  if (mode === "push") logEvent({ ev: "tracker_publish_unapproved", mode }, context);
  if (mode === "on-approve" && input.manual === true) logEvent({ ev: "tracker_publish_manual" }, context);
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
    deps.afterLock?.();
    // The token may have been spent while this publish waited for the lock.
    if (mode === "on-approve" && input.manual !== true && !runLanded(context, input.run)) {
      logEvent({ ev: "tracker_publish_token_spent", run: input.run }, context);
      return { published: false, mode, refused: "token spent" };
    }
    temp = path.join(info.common_git_dir, ".craftsman", "publish", `${base.replace(/[^A-Za-z0-9_-]/g, "-")}-${process.pid}`);
    let reason = "";
    for (let attempt = 1; attempt <= 2; attempt++) {
      heartbeat(lock);
      run(root, ["fetch", "origin", base]);
      fs.mkdirSync(path.dirname(temp), { recursive: true });
      run(root, ["worktree", "prune"], { allowFailure: true });
      run(root, ["worktree", "add", "--detach", temp, `origin/${base}`]);
      added = true;
      const rendered = render(temp, rows, context);
      if (rendered.refused) return { published: false, mode, refused: rendered.refused };
      if (rendered.paths.length) run(temp, ["add", "--", ...rendered.paths]);
      if (!rendered.paths.length || !run(temp, ["diff", "--cached", "--name-only"])) { consume(mode, input, context, base); return { published: false, mode, unchanged: true }; }
      run(temp, ["commit", "-m", `docs(tracker): publish ledger (${rows.length} rows)`, "--", ...rendered.paths]);
      deps.beforePush?.(attempt);
      try {
        run(temp, ["push", "origin", `HEAD:${base}`]);
        const sha = run(temp, ["rev-parse", "HEAD"]);
        logEvent({ ev: "tracker_published", base, rows: rows.length, sha, attempt }, context);
        consume(mode, input, context, base);
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
