#!/usr/bin/env node
// Retires a finished plan doc (ARCH-DOCS-02/07/08): refuses without the
// doc-write grant, refuses while anything still references the doc, then removes
// the plan + its closed scrutinise-/investigate- siblings, archives the ledger
// rows and commits removal + archive together. There is no force option.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { grantValid, hasDocWriteGrant, logEvent, projectContext, readStdin } from "./lib/core.mjs";
import { descendantSlugs, loadIndex } from "./lib/plan-index.mjs";
import { archivePath, archivePlan, currentState, ledgerPath, trackerDocPath, trackerRoot } from "./tracker.mjs";

const CLOSED = ["COMPLETE", "CANCELLED"];
function git(context, args) {
  return execFileSync("git", ["-C", context.root, ...args], {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64e6,
  });
}
const tryGit = (context, args) => { try { return git(context, args); } catch { return null; } };

// The grant rule and check live in core (ARCH-DOCS-07); re-exported for callers.
export { grantValid };
const hasGrant = (sid, context) => hasDocWriteGrant({ sid }, context);

// Default git runner for the referrer scan: throws on any non-zero status.
function defaultGit(args, context) {
  return execFileSync("git", ["-C", context.root, ...args], {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64e6,
  });
}

// Union of HEAD, the index and the working-tree copies of tracked files.
// Untracked files are NOT scanned. Status 1 with empty output means no hits;
// any other failure is returned as null so the caller refuses.
function scanReferrers(context, plan, slug) {
  const run = context.git ?? defaultGit;
  const base = ["grep", "-l", "-F", "-e", plan, "-e", slug];
  const hits = new Set();
  for (const extra of [["HEAD", "--"], ["--cached", "--"], ["--"]]) {
    let out = "";
    try { out = run([...base, ...extra], context) ?? ""; } catch (error) {
      if (error?.status === 1 && !String(error.stdout ?? "").trim()) continue;
      return null;
    }
    for (const line of out.split("\n").filter(Boolean)) hits.add(line.replace(/^HEAD:/, ""));
  }
  return [...hits];
}

function refuse(reason, referrers = []) {
  return { refused: true, reason, referrers };
}

export function retire(input, context = projectContext(".")) {
  const plan = input?.plan;
  if (typeof plan !== "string" || !plan.trim() || plan.startsWith("/") || plan.split(/[\\/]/).includes("..")) {
    return refuse("retire needs a relative plan path");
  }
  if (fs.realpathSync(trackerRoot(context)) !== fs.realpathSync(context.root)) {
    return refuse("retire refused: run doc-retire from the main checkout");
  }
  if (!hasGrant(input.sid, context)) {
    return refuse("retire refused: no doc-write grant (run doc-write.mjs first)");
  }
  const dir = path.posix.dirname(plan);
  const slug = path.posix.basename(plan, ".md");
  const rowsOf = (p) => currentState(context).filter((row) => row.plan === p);

  // Open rows of the plan itself are archive's refusal; open siblings keep the plan.
  const candidates = [`scrutinise-${slug}.md`, `investigate-${slug}.md`].map((n) => path.posix.join(dir, n))
    .filter((p) => tryGit(context, ["ls-files", "--error-unmatch", "--", p]) !== null);
  const siblings = [];
  const openSiblings = [];
  for (const sibling of candidates) {
    const open = rowsOf(sibling).filter((row) => !CLOSED.includes(row.status));
    if (open.length) openSiblings.push(`${sibling} (${open.map((r) => `${r.unit}=${r.status}`).join(", ")})`);
    else siblings.push(sibling);
  }
  if (openSiblings.length) return refuse(`retire refused: open sibling plans keep ${plan}: ${openSiblings.join("; ")}`);

  // A parent whose descendant plans still have docs is live (ARCH-DOCS-09); our own closed siblings go with it.
  let live;
  try {
    const index = loadIndex(context.root);
    const own = new Set(siblings.map((p) => path.posix.basename(p, ".md")));
    live = index.get(slug) ? descendantSlugs(slug, { index }).filter((s) => !own.has(s)) : [];
  } catch (error) {
    return refuse(`retire refused: cannot read the plan hierarchy: ${error.message}`);
  }
  if (live.length) return refuse(`retire refused: ${plan} has live descendants: ${live.join(", ")}`);

  const rollup = path.posix.join("docs/plans", slug, "TRACKER.md");
  const removing = [plan, ...siblings];
  if (tryGit(context, ["ls-files", "--error-unmatch", "--", rollup]) !== null) removing.push(rollup);
  if (tryGit(context, ["ls-files", "--error-unmatch", "--", plan]) === null) {
    return refuse(`retire refused: ${plan} is not tracked by git`);
  }
  if (git(context, ["status", "--porcelain", "--", ...removing]).trim()) {
    return refuse(`retire refused: uncommitted changes in ${removing.join(", ")}`);
  }

  const hits = scanReferrers(context, plan, slug);
  if (hits === null) return refuse("retire refused: referrer scan failed");
  const referrers = hits.filter((file) =>
    !removing.includes(file) && !/^docs\/plans\/TRACKER[^/]*\.md$/.test(file)).sort();
  if (referrers.length) {
    logEvent({ ev: "doc_prune_refused", path: plan, cited_by: referrers }, context);
    return refuse(`retire refused: ${plan} is referenced by ${referrers.join(", ")}`, referrers);
  }

  const doc_sha = git(context, ["rev-parse", "HEAD"]).trim();
  const goal = input.goal || rowsOf(plan).find((row) => row.goal)?.goal || "";
  const landed_sha = input.landed_sha || doc_sha;

  const backups = [ledgerPath(context), archivePath(context), trackerDocPath(context)].map((file) => {
    let text = null;
    try { text = fs.readFileSync(file, "utf8"); } catch { /* absent */ }
    return { file, text };
  });
  // Snapshot the whole index (refuses before any change if it cannot be written, e.g. unmerged entries).
  let snapshotTree;
  try { snapshotTree = git(context, ["write-tree"]).trim(); } catch (error) {
    return refuse(`retire refused: cannot snapshot the index: ${String(error.stderr || error.message).trim()}`);
  }
  try {
    git(context, ["rm", "-q", "--", ...removing]);
    archivePlan({ plan, goal, doc: doc_sha, landed: landed_sha }, context);
    for (const sibling of siblings) if (rowsOf(sibling).length) archivePlan({ plan: sibling, goal, doc: doc_sha, landed: landed_sha }, context);
    const extra = [archivePath(context), trackerDocPath(context)]
      .filter((file) => fs.existsSync(file)).map((file) => path.relative(fs.realpathSync(trackerRoot(context)), file));
    git(context, ["add", "--", ...extra]);
    git(context, ["commit", "-q", "-m", `docs: retire ${plan}`, "--", ...removing, ...extra]);
  } catch (error) {
    // Restore the whole index, then the removed files, then the ledger/archive/tracker backups.
    let restoreFailure = "";
    try { git(context, ["read-tree", snapshotTree]); } catch (restoreError) {
      restoreFailure = `; index restore failed: ${String(restoreError.stderr || restoreError.message).trim()}`;
    }
    try { git(context, ["checkout", "HEAD", "--", ...removing]); } catch (restoreError) {
      restoreFailure += `; checkout restore failed: ${String(restoreError.stderr || restoreError.message).trim()}`;
    }
    for (const { file, text } of backups) {
      if (text === null) fs.rmSync(file, { force: true });
      else fs.writeFileSync(file, text);
    }
    return refuse(`retire refused: ${error.message}${restoreFailure}`);
  }
  const sha = git(context, ["rev-parse", "HEAD"]).trim();
  logEvent({ ev: "doc_retired", plan, sha, siblings }, context);
  return { retired: plan, siblings, rollup: removing.includes(rollup) ? rollup : null, sha, doc_sha };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const input = JSON.parse(await readStdin() || "{}");
    const at = process.argv.indexOf("--sid");
    if (at > 0 && !input.sid) input.sid = process.argv[at + 1];
    const output = retire(input, projectContext(input.project || "."));
    process.stdout.write(JSON.stringify(output) + "\n");
    if (output.refused) process.exitCode = 2;
  } catch (error) {
    process.stderr.write(`craftsman: doc-retire failed: ${error.message}\n`);
    process.exitCode = 2;
  }
}
