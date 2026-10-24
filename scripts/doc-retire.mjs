#!/usr/bin/env node
// Retires a finished plan doc (ARCH-DOCS-02/07/08): refuses without the
// doc-write grant, refuses while anything still references the doc, then removes
// the plan + its closed scrutinise-/investigate- siblings, archives the ledger
// rows and commits removal + archive together. There is no force option.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { grantValid, hasDocWriteGrant, isMain, loadWorkspaceManifest, logEvent, projectContext, readStdin, safetyEnabled } from "./lib/core.mjs";
import { classifyArchive, copyAndCommit, productIdFor, resolveArchive } from "./lib/archive.mjs";
import { parseNext } from "./lib/next-queue.mjs";
import { descendantSlugs, docGoal, loadIndex, removeChild, TRACKER_FILE } from "./lib/plan-index.mjs";
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

const NEXT_DOC = "docs/plans/NEXT.md";
const isBlockingKind = (file) => /^scripts\/[^/]*\.test\.mjs$/.test(file) || !file.includes("/") && file.endsWith(".md")
  || /^docs\/architecture\/.*\.rules\.md$/.test(file);
const isProseDoc = (file) => /^docs\/(plans|ideas)\/.*\.md$/.test(file);

// Read-only referrer scan (ARCH-DOCS-13): writes nothing. NEXT.md is never a referrer. Blocking = rule cite:/source:,
// a scripts/*.test.mjs, a top-level *.md (and anything unclassified); rewritable = prose docs under docs/plans or
// docs/ideas, only when an archive project resolves, else every hit blocks. Null when the scan itself fails.
export function findReferrers(context, plan, slug) {
  const found = scanReferrers(context, plan, slug);
  if (found === null) return null;
  const hits = found.filter((f) => f !== NEXT_DOC).sort();
  let archived = false;
  try { archived = Boolean(resolveArchive(context).root); } catch { /* off */ }
  const rewritable = archived ? hits.filter((f) => !isBlockingKind(f) && isProseDoc(f)) : [];
  const blocking = hits.filter((f) => !rewritable.includes(f));
  return { hits, blocking, rewritable };
}

// Read-only referrer check for all-closed plans (ARCH-DOCS-02): one {plan, referrers[], reason?}
// per plan. Never throws and mutates nothing; a scan error yields no referrers plus a reason.
export function retireCheck(plans, root) {
  const list = Array.isArray(plans) ? plans : [];
  return list.map((plan) => {
    try {
      if (typeof plan !== "string" || !plan.trim()) return { plan, referrers: [], reason: "invalid plan path" };
      const slug = path.posix.basename(plan, ".md");
      const hits = scanReferrers({ root: path.resolve(String(root)) }, plan, slug)?.filter((f) => f !== NEXT_DOC) ?? null;
      if (hits === null) return { plan, referrers: [], reason: "referrer scan failed" };
      const referrers = hits.filter((f) => f !== plan && !TRACKER_FILE.test(f)).sort();
      return { plan, referrers };
    } catch (error) {
      return { plan, referrers: [], reason: `referrer scan failed: ${error?.message ?? error}` };
    }
  });
}

// Fallback goal for a goal-less plan: front-matter `goal:`, else the H1 (ARCH-DOCS-09).
function planDocGoal(context, plan) {
  try { return docGoal(fs.readFileSync(path.join(context.root, plan), "utf8")); } catch { return ""; }
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
  // The grant is always required. CRAFTSMAN_SAFETY is read here only to word the refusal: it is in this script's own environment, which
  // any child process can set, so nothing is skipped or granted on the strength of it (ARCH-SAFETY-05).
  if (!hasGrant(input.sid, context)) {
    return refuse(safetyEnabled()
      ? "retire refused: no doc-write grant (run doc-write.mjs first)"
      : "retire refused: no doc-write grant; with CRAFTSMAN_SAFETY=off no guard runs and doc-write.mjs grants nothing, so /sync-docs --archive needs a session with safety on");
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

  // A parent whose descendant plans still have an open row (or no row to prove them closed) is live
  // (ARCH-DOCS-09); our own closed siblings and closed descendants retire with it.
  const hierarchy = new Set();
  const descendants = [];
  try {
    const index = loadIndex(context.root);
    const own = new Set(siblings.map((p) => path.posix.basename(p, ".md")));
    const isParent = (n) => n && (n.level === "epic" || n.level === "story");
    if (isParent(index.get(slug))) hierarchy.add(plan);
    const found = index.get(slug) ? descendantSlugs(slug, { index }).filter((s) => !own.has(s)) : [];
    const live = [];
    for (const child of found) {
      const node = index.get(child);
      const childPlan = node.path;
      const rows = rowsOf(childPlan);
      const open = rows.filter((row) => !CLOSED.includes(row.status));
      if (open.length || (!rows.length && !isParent(node) && !node.derived)) { live.push(child); continue; }
      if (!rows.length) hierarchy.add(childPlan);
      descendants.push({ slug: child, plan: childPlan, goal: rows.find((row) => row.goal)?.goal || planDocGoal(context, childPlan) || child });
    }
    if (live.length) return refuse(`retire refused: ${plan} has live descendants: ${live.join(", ")}`);
  } catch (error) {
    return refuse(`retire refused: cannot read the plan hierarchy: ${error.message}`);
  }

  // Every sibling takes its own goal (rows, else doc); read before the docs leave the tree.
  const siblingGoal = new Map(siblings.map((p) => [p, rowsOf(p).find((row) => row.goal)?.goal || planDocGoal(context, p) || path.posix.basename(p, ".md")]));
  const rollupOf = (s) => path.posix.join("docs/plans", s, "TRACKER.md");
  const rollup = rollupOf(slug);
  const removing = [plan, ...siblings, ...descendants.map((d) => d.plan)];
  for (const r of [rollup, ...descendants.map((d) => rollupOf(d.slug))]) {
    if (tryGit(context, ["ls-files", "--error-unmatch", "--", r]) !== null) removing.push(r);
  }
  if (tryGit(context, ["ls-files", "--error-unmatch", "--", plan]) === null) {
    return refuse(`retire refused: ${plan} is not tracked by git`);
  }
  if (git(context, ["status", "--porcelain", "--", ...removing]).trim()) {
    return refuse(`retire refused: uncommitted changes in ${removing.join(", ")}`);
  }

  const parentSlug = (() => { try { return loadIndex(context.root).get(slug)?.parent ?? null; } catch { return null; } })();
  const parentDoc = parentSlug ? path.posix.join(dir, `${parentSlug}.md`) : null;
  // Every ancestor's rollup is regenerated by the archive; each lands in the same commit.
  const ancestorRollups = [];
  try {
    const index = loadIndex(context.root);
    for (let p = parentSlug; p; p = index.get(p)?.parent) ancestorRollups.push(rollupOf(p));
  } catch { /* the index check below decides */ }
  // The parent's child list drops this plan in the same commit so the index still loads (ARCH-TRACKER-10).
  let parentEdit = null;
  if (parentDoc && tryGit(context, ["ls-files", "--error-unmatch", "--", parentDoc]) !== null) {
    if (git(context, ["status", "--porcelain", "--", parentDoc]).trim()) {
      return refuse(`retire refused: uncommitted changes in ${parentDoc}`);
    }
    try {
      const old = fs.readFileSync(path.join(context.root, parentDoc), "utf8");
      const next = removeChild(old, slug);
      if (next !== null) parentEdit = { file: parentDoc, next };
    } catch { /* unreadable parent: the post-edit index check decides */ }
  }
  // The shared classifier (ARCH-VIEWS-15) decides what is a referrer: exempt are the removing set, the parent rollup, a parent
  // doc that only lists the child, and NEXT.md. A rewritable prose hit is rewritten; anything else refuses.
  const found = new Set();
  const rewriteFiles = new Set();
  for (const doc of [{ plan, slug }, ...descendants]) {
    const verdict = classifyArchive(context, doc.plan ?? plan, { slug: doc.slug ?? slug, removing, primary: doc.plan === undefined || doc.plan === plan });
    if (verdict.scanFailed) return refuse("retire refused: referrer scan failed");
    for (const file of verdict.blocking) found.add(file);
    for (const file of verdict.rewritable) rewriteFiles.add(file);
  }
  // Rewritable prose files must be clean so the rewrite lands alone in the retire commit.
  for (const file of rewriteFiles) {
    if (git(context, ["status", "--porcelain", "--", file]).trim()) return refuse(`retire refused: uncommitted changes in ${file}`, [file]);
  }
  // ARCH-DOCS-13: prose mentions become archive pointers (sha pending in the dry run).
  const productId = productIdFor(context);
  const rewriteDocs = [{ plan, slug }, ...descendants.map((d) => ({ plan: d.plan, slug: d.slug }))];
  const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // One pass over every doc's plan path and slug: a pointer written for one doc is never rewritten for another (ARCH-DOCS-13).
  const tokenDoc = new Map();
  for (const d of rewriteDocs) { for (const t of [d.plan, d.slug]) if (!tokenDoc.has(t)) tokenDoc.set(t, d); }
  const tokenRe = new RegExp(`(?<![\\w/.-])(?:${[...tokenDoc.keys()].sort((a, b) => b.length - a.length).map(esc).join("|")})(?![\\w-])`, "g");
  const rewriteLine = (line, shaOf) => line.replace(tokenRe, (m) => {
    const d = tokenDoc.get(m);
    return `archive:${productId}/plans/${d.slug}@${shaOf(d.plan)}`;
  });
  const rewriteBase = (file) => (parentEdit?.file === file ? parentEdit.next : fs.readFileSync(path.join(context.root, file), "utf8"));
  const rewriteText = (file, shaOf) => rewriteBase(file).split("\n").map((l) => rewriteLine(l, shaOf)).join("\n");
  const rewrites = [];
  for (const file of [...rewriteFiles].sort()) {
    const before = rewriteBase(file).split("\n");
    const after = rewriteText(file, () => "pending").split("\n");
    before.forEach((line, i) => { if (line !== after[i]) rewrites.push({ file, line: i + 1, before: line, after: after[i] }); });
    if (!rewrites.some((r) => r.file === file)) found.add(file); // a hit with nothing to rewrite stays a referrer
  }
  const digest = crypto.createHash("sha256").update(JSON.stringify(rewrites)).digest("hex");
  const referrers = [...found].sort();
  if (referrers.length) {
    logEvent({ ev: "doc_prune_refused", path: plan, cited_by: referrers }, context);
    return refuse(`retire refused: ${plan} is referenced by ${referrers.join(", ")}`, referrers);
  }

  if (input.dry_run) return { dry_run: true, rewrites, digest };
  if (rewrites.length && input.confirm_rewrites !== digest) {
    const files = [...new Set(rewrites.map((r) => r.file))];
    return refuse(input.confirm_rewrites
      ? `retire refused: confirm_rewrites is stale; re-run the dry run (referenced by ${files.join(", ")})`
      : `retire refused: ${plan} is referenced by ${files.join(", ")}; run a dry run and confirm its digest as confirm_rewrites`, files);
  }

  // The retired plans' lines leave NEXT.md in the same commit (ARCH-DOCS-13).
  let nextEdit = null;
  if (tryGit(context, ["ls-files", "--error-unmatch", "--", NEXT_DOC]) !== null) {
    try {
      const old = fs.readFileSync(path.join(context.root, NEXT_DOC), "utf8");
      const gone = new Set([plan, ...siblings, ...descendants.map((d) => d.plan)].map((p) => path.posix.basename(p, ".md")));
      const canonical = new Set(parseNext(old).filter((e) => gone.has(e.slug)).map((e) => e.slug));
      const lines = old.split("\n");
      const kept = lines.filter((line) => { const m = parseNext(line)[0]; return !(m && canonical.has(m.slug)); });
      if (kept.length !== lines.length) {
        if (git(context, ["status", "--porcelain", "--", NEXT_DOC]).trim()) return refuse(`retire refused: uncommitted changes in ${NEXT_DOC}`);
        nextEdit = kept.join("\n");
      }
    } catch { /* unreadable NEXT.md: left alone */ }
  }

  const doc_sha = git(context, ["rev-parse", "HEAD"]).trim();
  const goal = input.goal || rowsOf(plan).find((row) => row.goal)?.goal || planDocGoal(context, plan) || slug;
  const landed_sha = input.landed_sha || doc_sha;

  // ARCH-ARCHIVE-03: copy into the archive repo first; any failure refuses with nothing touched here.
  let archiveShas = null;
  let archiveSha;
  try {
    const archive = resolveArchive(context);
    if (archive.root) {
        const seams = { context };
      archiveShas = new Map();
      const copied = copyAndCommit({ archive, productId, kind: "plans", slug, files: [plan, ...siblings], sourceRoot: context.root, plan }, seams);
      archiveSha = copied.sha;
      for (const p of [plan, ...siblings]) archiveShas.set(p, copied.sha);
      for (const d of descendants) {
        archiveShas.set(d.plan, copyAndCommit({ archive, productId, kind: "plans", slug: d.slug, files: [d.plan], sourceRoot: context.root, plan: d.plan }, seams).sha);
      }
    }
  } catch (error) {
    return refuse(`retire refused: archive copy failed: ${error.message}`);
  }
  const archiveOf = (p) => archiveShas?.get(p);

  // Archiving re-renders every rollup; only the ancestors' are ours, so the rest are put back as found.
  const ancestorSet = new Set(ancestorRollups);
  const unrelated = (tryGit(context, ["ls-files", "--", "docs/plans/*/TRACKER.md"]) ?? "").split("\n").filter((f) => f && !ancestorSet.has(f) && !removing.includes(f))
    .map((f) => { const file = path.join(context.root, f); try { return { file, text: fs.readFileSync(file, "utf8") }; } catch { return { file, text: null }; } });
  const restoreUnrelated = () => {
    for (const { file, text } of unrelated) {
      if (text === null) fs.rmSync(file, { force: true });
      else if (fs.readFileSync(file, "utf8") !== text) fs.writeFileSync(file, text);
    }
  };
  const backups = [ledgerPath(context), archivePath(context), trackerDocPath(context), ...ancestorRollups.map((r) => path.join(context.root, r))].map((file) => {
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
    if (parentEdit) {
      removing.push(parentEdit.file); // on the rollback set before it is written
      fs.writeFileSync(path.join(context.root, parentEdit.file), parentEdit.next);
      git(context, ["add", "--", parentEdit.file]);
    }
    if (parentSlug) {
      try { loadIndex(context.root); } catch (error) { throw new Error(`the plan index would not load after retiring: ${error.message}`); }
    }
    if (nextEdit !== null) {
      removing.push(NEXT_DOC);
      fs.writeFileSync(path.join(context.root, NEXT_DOC), nextEdit);
      git(context, ["add", "--", NEXT_DOC]);
    }
    if (rewrites.length) {
      const shaOf = (p) => { const v = archiveOf(p); if (!v) throw new Error(`no archive sha for ${p}`); return v; };
      for (const file of rewriteFiles) {
        if (!rewrites.some((r) => r.file === file)) continue;
        const next = rewriteText(file, shaOf);
        if (!removing.includes(file)) removing.push(file); // on the rollback set before it is written
        fs.writeFileSync(path.join(context.root, file), next);
        git(context, ["add", "--", file]);
      }
    }
    archivePlan({ plan, goal, doc: doc_sha, landed: landed_sha, archive: archiveOf(plan), hierarchy: hierarchy.has(plan) }, context);
    for (const d of descendants) archivePlan({ plan: d.plan, goal: d.goal, doc: doc_sha, landed: landed_sha, archive: archiveOf(d.plan), hierarchy: hierarchy.has(d.plan) }, context);
    for (const sibling of siblings) archivePlan({ plan: sibling, goal: siblingGoal.get(sibling), doc: doc_sha, landed: landed_sha, archive: archiveOf(sibling), hierarchy: !rowsOf(sibling).length }, context);
    restoreUnrelated();
    const extra = [archivePath(context), trackerDocPath(context), ...ancestorRollups.map((r) => path.join(context.root, r))]
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
    try { restoreUnrelated(); } catch { /* best effort */ }
    return refuse(`retire refused: ${error.message}${restoreFailure}`);
  }
  const sha = git(context, ["rev-parse", "HEAD"]).trim();
  for (const file of new Set(rewrites.map((r) => r.file))) logEvent({ ev: "archive_rewrite", file, plan }, context);
  logEvent({ ev: "doc_retired", plan, sha, siblings, descendants: descendants.map((d) => d.plan), archive: archiveSha, ...(input.auto === true ? { auto: true } : {}) }, context);
  return { retired: plan, siblings, rollup: removing.includes(rollup) ? rollup : null, sha, doc_sha };
}

if (isMain(import.meta.url)) {
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
