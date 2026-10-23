// Workspace archive library (ARCH-ARCHIVE-01/02/06/08): resolve the archive repo, name archived paths,
// copy + verify + commit locally. Never pushes (ARCH-ARCHIVE-05). Errors are thrown as Error; doc-retire turns them into refuse().
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { loadConfig, loadWorkspaceManifest, logEvent } from "./core.mjs";
import { findReferrers, retire as docRetire } from "../doc-retire.mjs";
import { currentState } from "../tracker.mjs";
import { mainCheckoutRoot } from "./core.mjs";

const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const KINDS = ["plans", "ideas"];

// ARCH-ARCHIVE-01: any missing prerequisite switches archiving off (retirement then behaves as ARCH-DOCS-09).
export function resolveArchive(context = null) {
  const id = loadConfig(context).archive?.project || "archive";
  let manifest;
  try { manifest = loadWorkspaceManifest(); }
  catch (error) { return { off: `workspace manifest unusable: ${error.message}` }; }
  if (!manifest) return { off: "no workspace manifest" };
  if (!Object.hasOwn(manifest.projects, id)) return { off: `archive project "${id}" is not registered in the workspace manifest` };
  const project = manifest.projects[id];
  if (project.initialized === false) return { off: `archive project "${id}" is not checked out (uninitialised)` };
  return { id, root: project.root };
}

// ARCH-ARCHIVE-02/06: <productId>/<kind>/<slug>/<file>; rules docs and traversal are refused.
export function archivePathFor({ productId, kind, slug, file }) {
  if (!KINDS.includes(kind)) throw new Error(`archive kind must be one of ${KINDS.join(", ")}: ${kind}`);
  for (const [name, value] of [["productId", productId], ["slug", slug]]) {
    if (typeof value !== "string" || !SEGMENT.test(value) || value.includes("..")) throw new Error(`invalid archive ${name}: ${value}`);
  }
  if (typeof file !== "string" || !file.trim()) throw new Error("archive file is required");
  const raw = file.replaceAll("\\", "/");
  if (raw.startsWith("/") || /^[A-Za-z]:/.test(raw)) throw new Error(`archive file must be repo-relative: ${file}`);
  const parts = raw.split("/");
  if (parts.includes("..")) throw new Error(`archive file must not traverse: ${file}`);
  const clean = path.posix.normalize(raw).replace(/^(\.\/)+/, "");
  if (!clean || clean === "." || clean.startsWith("../") || clean.split("/").includes(".git")) throw new Error(`invalid archive file: ${file}`);
  if (clean === "docs/architecture" || clean.startsWith("docs/architecture/")) {
    throw new Error(`architecture rules docs are never archived (ARCH-ARCHIVE-06): ${file}`);
  }
  return `${productId}/${kind}/${slug}/${clean}`;
}

export function restoreCommand(archiveRoot, sha, file) {
  const q = (s) => (/^[A-Za-z0-9_@%+=:,./~-]+$/.test(s) ? s : `'${String(s).replaceAll("'", "'\\''")}'`);
  return `git -C ${q(archiveRoot)} show ${q(`${sha}:${file}`)}`;
}

const defaultGit = (args, cwd) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const defaultCopy = (from, to) => fs.copyFileSync(from, to);

// files: repo-relative strings (read from sourceRoot) or {file, from}. seams: {git(args, cwd), copy(from, to), context}.
export function copyAndCommit({ archive, productId, kind, slug, files, sourceRoot = process.cwd(), plan = slug }, seams = {}) {
  const git = seams.git || defaultGit;
  const copy = seams.copy || defaultCopy;
  const context = seams.context ?? null;
  const archiveRoot = typeof archive === "string" ? archive : archive?.root;
  const created = [];
  try {
    if (!archiveRoot) throw new Error("no archive root");
    if (!Array.isArray(files) || !files.length) throw new Error("no files to archive");
    const plans = files.map((entry) => {
      const file = typeof entry === "string" ? entry : entry.file;
      const rel = archivePathFor({ productId, kind, slug, file });
      const from = typeof entry === "string" || !entry.from ? path.resolve(sourceRoot, file) : entry.from;
      return { file, rel, from, to: path.join(archiveRoot, ...rel.split("/")) };
    });
    // A merge, rebase, cherry-pick, revert or held index.lock in the archive repo: refuse, touch nothing.
    const gitDir = path.resolve(archiveRoot, git(["rev-parse", "--absolute-git-dir"], archiveRoot).trim());
    for (const name of ["index.lock", "MERGE_HEAD", "rebase-merge", "rebase-apply", "CHERRY_PICK_HEAD", "REVERT_HEAD"]) {
      if (fs.existsSync(path.join(gitDir, name))) {
        throw new Error(name === "index.lock" ? `archive repo index is locked (${gitDir}/index.lock)` : `archive repo has an operation in progress (${name})`);
      }
    }
    for (const p of plans) {
      if (!fs.existsSync(p.from)) throw new Error(`source file missing: ${p.file}`);
      const source = fs.readFileSync(p.from);
      if (fs.existsSync(p.to)) {
        // Archived files are never edited after their commit (ARCH-ARCHIVE-02): identical is a re-run, different refuses.
        if (!fs.readFileSync(p.to).equals(source)) throw new Error(`archived file differs from source and is never rewritten: ${p.rel}`);
        continue;
      }
      fs.mkdirSync(path.dirname(p.to), { recursive: true });
      created.push(p.to);
      copy(p.from, p.to);
      if (!fs.existsSync(p.to) || !fs.readFileSync(p.to).equals(source)) throw new Error(`copy verification failed (bytes differ): ${p.rel}`);
    }
    const specs = plans.map((p) => p.rel);
    git(["add", "--", ...specs], archiveRoot);
    let committed = false;
    if (git(["status", "--porcelain", "--", ...specs], archiveRoot).trim()) {
      git(["commit", "-q", "-m", `archive ${kind}/${slug} (${productId})`, "--", ...specs], archiveRoot);
      committed = true;
    }
    const sha = git(["log", "-1", "--format=%H", "--", ...specs], archiveRoot).trim();
    if (!sha) throw new Error("archive commit not found after copy");
    logEvent({ ev: "archive_copied", plan, archive_sha: sha, files: specs }, context);
    return { sha, files: specs, committed };
  } catch (error) {
    for (const file of created) { try { fs.rmSync(file, { force: true }); } catch { /* best effort */ } }
    if (created.length) { try { git(["reset", "-q", "--", ...created.map((f) => path.relative(archiveRoot, f))], archiveRoot); } catch { /* nothing staged */ } }
    const err = error instanceof Error ? error : new Error(String(error));
    logEvent({ ev: "archive_refused", plan, reason: err.message }, context);
    throw err;
  }
}

// ARCH-DOCS-14 / ARCH-LAND-30: may land-feature archive this plan on its own? Read-only; returns {eligible, reason?}, never throws.
// Every condition must hold: an archive project resolves, every tracker row of the plan is COMPLETE or CANCELLED, the referrer
// scan succeeds and finds no hit at all (the plan, its ledger/rollup and its own scrutinise-/investigate- siblings excepted),
// and the doc is tracked and clean. seams: {resolveArchive, currentState, findReferrers, git(args, context)}.
export function autoArchiveEligible(context, plan, seams = {}) {
  const no = (reason) => ({ eligible: false, reason });
  try {
    if (typeof plan !== "string" || !plan.trim() || plan.startsWith("/") || plan.split(/[\\/]/).includes("..")) return no("invalid plan path");
    const slug = path.posix.basename(plan, ".md");
    const dir = path.posix.dirname(plan);
    const archive = (seams.resolveArchive || resolveArchive)(context);
    if (!archive?.root) return no(`no archive project: ${archive?.off ?? "unresolved"}`);
    const rows = (seams.currentState || currentState)(context).filter((row) => row.plan === plan);
    if (!rows.length) return no("plan has no tracker rows");
    const open = rows.filter((row) => row.status !== "COMPLETE" && row.status !== "CANCELLED");
    if (open.length) return no(`open rows: ${open.map((row) => `${row.unit}=${row.status}`).join(", ")}`);
    const scan = (seams.findReferrers || findReferrers)(context, plan, slug);
    if (scan === null || scan === undefined) return no("referrer scan failed");
    const own = new Set([plan, path.posix.join("docs/plans", slug, "TRACKER.md"),
      path.posix.join(dir, `scrutinise-${slug}.md`), path.posix.join(dir, `investigate-${slug}.md`)]);
    const hits = (scan.hits ?? []).filter((file) => !own.has(file) && !/^docs\/plans\/TRACKER[^/]*\.md$/.test(file));
    if (hits.length) return no(`referenced by ${hits.sort().join(", ")}`);
    const git = seams.git || ((args, ctx) => execFileSync("git", ["-C", ctx.root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
    try { git(["ls-files", "--error-unmatch", "--", plan], context); } catch { return no(`${plan} is not tracked by git`); }
    if (String(git(["status", "--porcelain", "--", plan], context) ?? "").trim()) return no(`uncommitted changes in ${plan}`);
    return { eligible: true };
  } catch (error) {
    return no(`eligibility check failed: ${error?.message ?? error}`);
  }
}

const sh = (root, args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const quiet = (root, args) => { try { return sh(root, args); } catch { return ""; } };

// The retire commits in the main checkout, so it must sit on base and hold the landed merge. A clean checkout whose tip is an
// ancestor of the merge is fast-forwarded to it (never anything else); a dirty or diverged one is left alone and the retire skipped.
function holdsLanding(main, base, sha) {
  const is = (a, b) => { try { sh(main, ["merge-base", "--is-ancestor", a, b]); return true; } catch { return false; } };
  if (quiet(main, ["rev-parse", "--abbrev-ref", "HEAD"]) !== base) return false;
  if (is(sha, "HEAD")) return true;
  if (!is("HEAD", sha) || quiet(main, ["status", "--porcelain", "-uno"])) return false;
  try { sh(main, ["merge", "--ff-only", "-q", sha]); return true; } catch { return false; }
}

// ARCH-LAND-30 / ARCH-DOCS-14: after land-feature has promoted and pushed, archive each closed, unreferenced plan. The archive repo is
// committed locally and archive_push_pending is logged; nothing is ever pushed (ARCH-ARCHIVE-05). Nothing here can throw, park or
// change the landing result (ARCH-LAND-06 is for real landing failures): refusals and exceptions are logged and swallowed.
// deps seams: autoArchiveEligible(context, plan), retire(input, context).
export function autoArchive(context, input, info, { rows, sha, deps = {} }) {
  const note = (ev) => { try { logEvent(ev, context); } catch { /* logging never changes a landing */ } };
  try {
    const main = mainCheckoutRoot(context.root);
    const here = { ...context, root: main };
    const eligible = deps.autoArchiveEligible || autoArchiveEligible;
    const retire = deps.retire || docRetire;
    for (const plan of [...new Set(rows.map((row) => row.plan))]) {
      try {
        if (!holdsLanding(main, info.base_branch, sha)) {
          note({ ev: "doc_retire_skipped", plan, reason: `main checkout is not on ${info.base_branch} holding the landed merge` });
          continue;
        }
        const verdict = eligible(here, plan);
        if (!verdict.eligible) { note({ ev: "doc_retire_skipped", plan, reason: verdict.reason }); continue; }
        const out = retire({ plan, sid: input.session_id, auto: true, landed_sha: sha }, here);
        if (out?.refused) { note({ ev: "doc_retire_skipped", plan, reason: out.reason }); continue; }
        note({ ev: "doc_retired", plan, sha: out.sha, auto: true });
        const archive = resolveArchive(here);
        note({ ev: "archive_push_pending", plan, commit: archive.root ? quiet(archive.root, ["rev-parse", "HEAD"]) : "" });
      } catch (error) {
        note({ ev: "doc_retire_skipped", plan, reason: `auto-archive failed: ${error?.message ?? error}` });
      }
    }
  } catch (error) {
    note({ ev: "doc_retire_skipped", reason: `auto-archive failed: ${error?.message ?? error}` });
  }
}
