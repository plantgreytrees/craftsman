#!/usr/bin/env node
// Retires a finished plan doc (ARCH-DOCS-02/07/08): refuses without the
// doc-write grant, refuses while anything still references the doc, then removes
// the plan + its closed scrutinise-/investigate- siblings, archives the ledger
// rows and commits removal + archive together. There is no force option.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { logEvent, projectContext, readStdin, sessionDir, sidOf } from "./lib/core.mjs";
import { archivePath, archivePlan, currentState, ledgerPath, trackerDocPath } from "./tracker.mjs";

const CLOSED = ["COMPLETE", "CANCELLED"];
const GRANT_TTL_MS = 3600000;

function git(context, args) {
  return execFileSync("git", ["-C", context.root, ...args], {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64e6,
  });
}
const tryGit = (context, args) => { try { return git(context, args); } catch { return null; } };

function fresh(file) {
  try { return Date.now() - fs.statSync(file).mtimeMs < GRANT_TTL_MS; } catch { return false; }
}

// The grant is the global doc-write-pending marker, else the session's own marker.
function hasGrant(sid, context) {
  if (fresh(path.join(context.stateDir, "doc-write-pending"))) return true;
  return Boolean(sid) && fresh(path.join(sessionDir(sidOf({ session_id: sid }), context), "doc-write"));
}

function refuse(reason, referrers = []) {
  return { refused: true, reason, referrers };
}

export function retire(input, context = projectContext(".")) {
  const plan = input?.plan;
  if (typeof plan !== "string" || !plan.trim() || plan.startsWith("/") || plan.split(/[\\/]/).includes("..")) {
    return refuse("retire needs a relative plan path");
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

  const removing = [plan, ...siblings];
  if (tryGit(context, ["ls-files", "--error-unmatch", "--", plan]) === null) {
    return refuse(`retire refused: ${plan} is not tracked by git`);
  }
  if (git(context, ["status", "--porcelain", "--", ...removing]).trim()) {
    return refuse(`retire refused: uncommitted changes in ${removing.join(", ")}`);
  }

  const hits = (tryGit(context, ["grep", "-l", "-F", "-e", plan, "-e", slug, "HEAD", "--"]) || "")
    .split("\n").filter(Boolean).map((line) => line.replace(/^HEAD:/, ""));
  const referrers = [...new Set(hits)].filter((file) =>
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
  git(context, ["rm", "-q", "--", ...removing]);
  try {
    archivePlan({ plan, goal, doc_sha, landed_sha }, context);
    for (const sibling of siblings) if (rowsOf(sibling).length) archivePlan({ plan: sibling, goal, doc_sha, landed_sha }, context);
    const extra = [archivePath(context), trackerDocPath(context)]
      .filter((file) => fs.existsSync(file)).map((file) => path.relative(context.root, file));
    git(context, ["add", "--", ...extra]);
    git(context, ["commit", "-q", "-m", `docs: retire ${plan}`, "--", ...removing, ...extra]);
  } catch (error) {
    // Only the removed paths come back via git; ledger and archive docs return from the backups below.
    tryGit(context, ["reset", "-q", "HEAD", "--", ...removing]);
    tryGit(context, ["checkout", "HEAD", "--", ...removing]);
    for (const { file, text } of backups) {
      if (text === null) fs.rmSync(file, { force: true });
      else fs.writeFileSync(file, text);
    }
    return refuse(`retire refused: ${error.message}`);
  }
  const sha = git(context, ["rev-parse", "HEAD"]).trim();
  logEvent({ ev: "doc_retired", plan, sha, siblings }, context);
  return { retired: plan, siblings, sha, doc_sha };
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
