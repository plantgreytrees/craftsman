// Workspace archive library (ARCH-ARCHIVE-01/02/06/08): resolve the archive repo, name archived paths,
// copy + verify + commit locally. Never pushes (ARCH-ARCHIVE-05). Errors are thrown as Error; doc-retire turns them into refuse().
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { logEvent } from "./core.mjs";
import { resolveArchive, archivePathFor, productIdFor, restoreCommand } from "../tracker.mjs";

// The path helpers live in tracker.mjs so it needs no import of this module (no tracker -> archive -> doc-retire -> tracker cycle).
export { resolveArchive, archivePathFor, productIdFor, restoreCommand };
import { findReferrers, retire as docRetire } from "../doc-retire.mjs";
import { currentState } from "../tracker.mjs";
import { buildIndex, descendantSlugs, loadIndex, removeChild, slugOf, TRACKER_FILE } from "./plan-index.mjs";
import { mainCheckoutRoot } from "./core.mjs";

// ARCH-VIEWS-15 / ARCH-DOCS-14: the one archive verdict for a plan doc, used by the dashboard, autoArchiveEligible and retire.
// class: blocked (a rule/test/top-level doc refers to it, or the scan failed; names the file), not-archivable (no archive
// project resolves and nothing blocks), rewrite (only prose referrers), auto (no referrer at all). blocking/rewritable name the files; hits is their sorted union.
// Exempt, as retire exempts them: the plan, the removing set, its scrutinise-/investigate- siblings, TRACKER*.md, NEXT.md,
// and (for the primary doc) the parent's rollup and a parent doc that only lists it in `children`.
// opts: {slug, removing, primary (default true), archive (pre-resolved), resolveArchive, findReferrers}.
export function classifyArchive(context, plan, opts = {}) {
  const slug = opts.slug ?? slugOf(plan);
  const dir = path.posix.dirname(plan);
  const archive = opts.archive ?? (opts.resolveArchive || resolveArchive)(context);
  let scan = null;
  try { scan = (opts.findReferrers || findReferrers)(context, plan, slug); } catch { scan = null; }
  if (scan === null || scan === undefined) {
    return { class: "blocked", scanFailed: true, blocking: ["referrer scan failed"], rewritable: [], hits: [], reason: "referrer scan failed" };
  }
  const skip = new Set([plan, ...(opts.removing ?? []), path.posix.join("docs/plans", slug, "TRACKER.md"),
    path.posix.join(dir, `scrutinise-${slug}.md`), path.posix.join(dir, `investigate-${slug}.md`), "docs/plans/NEXT.md"]);
  if (opts.primary !== false) {
    try {
      const parent = loadIndex(context.root).get(slug)?.parent ?? null;
      if (parent) {
        skip.add(path.posix.join("docs/plans", parent, "TRACKER.md"));
        const parentDoc = path.posix.join(dir, `${parent}.md`);
        const next = removeChild(fs.readFileSync(path.join(context.root, parentDoc), "utf8"), slug);
        if (next !== null && ![plan, slug].some((t) => next.includes(t))) skip.add(parentDoc);
      }
    } catch { /* no index or parent doc: nothing extra is exempt */ }
  }
  const keep = (file) => !skip.has(file) && !TRACKER_FILE.test(file);
  const hits = (scan.hits ?? []).filter(keep).sort();
  const rewritable = (scan.rewritable ?? []).filter(keep).sort();
  const blocking = (scan.blocking ?? scan.hits ?? []).filter(keep).filter((f) => !rewritable.includes(f)).sort();
  const cls = blocking.length ? "blocked" : !archive?.root ? "not-archivable" : rewritable.length ? "rewrite" : "auto";
  return { class: cls, blocking, rewritable, hits, reason: cls === "not-archivable" ? `no archive project: ${archive?.off ?? "unresolved"}` : undefined };
}

const defaultGit = (args, cwd) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const isLink = (f) => { try { return fs.lstatSync(f).isSymbolicLink(); } catch { return false; } };
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
      // ARCH-ARCHIVE-03: no symlink as the source or as any component under the archive root.
      if (isLink(p.from)) throw new Error(`source is a symlink: ${p.file}`);
      let walk = archiveRoot;
      for (const part of path.relative(archiveRoot, p.to).split(path.sep)) {
        walk = path.join(walk, part);
        if (isLink(walk)) throw new Error(`archive path contains a symlink: ${p.rel}`);
      }
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
// Every condition must hold: an archive project resolves, every tracker row of the plan is COMPLETE or CANCELLED, no
// scrutinise-/investigate- sibling and no descendant plan is still open (as retire refuses), the referrer scan succeeds and
// finds no hit at all (the plan, its ledger/rollup and its own siblings excepted), and the doc is tracked and clean.
// seams.sha: the landed merge; tracked-ness, siblings, hierarchy and the HEAD referrer scan are read from that commit, so a doc
// that exists only in the merge is judged as retire will see it after the fast-forward.
// seams: {resolveArchive, currentState, findReferrers, loadIndex(context, sha), git(args, context), sha}.
export function autoArchiveEligible(context, plan, seams = {}) {
  const no = (reason) => ({ eligible: false, reason });
  try {
    if (typeof plan !== "string" || !plan.trim() || plan.startsWith("/") || plan.split(/[\\/]/).includes("..")) return no("invalid plan path");
    const archive = (seams.resolveArchive || resolveArchive)(context);
    if (!archive?.root) return no(`no archive project: ${archive?.off ?? "unresolved"}`);
    const state = (seams.currentState || currentState)(context);
    const rowsOf = (p) => state.filter((row) => row.plan === p);
    const rows = rowsOf(plan);
    if (!rows.length) return no("plan has no tracker rows");
    const isOpen = (row) => row.status !== "COMPLETE" && row.status !== "CANCELLED";
    const open = rows.filter(isOpen);
    if (open.length) return no(`open rows: ${open.map((row) => `${row.unit}=${row.status}`).join(", ")}`);
    const sha = seams.sha;
    const git = seams.git || ((args, ctx) => execFileSync("git", ["-C", ctx.root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64e6 }));
    const tracked = (p) => { try { git(sha ? ["cat-file", "-e", `${sha}:${p}`] : ["ls-files", "--error-unmatch", "--", p], context); return true; } catch { return false; } };
    const slug = slugOf(plan);
    const dir = path.posix.dirname(plan);
    // Open siblings keep the plan (retire's refusal).
    const siblings = [`scrutinise-${slug}.md`, `investigate-${slug}.md`].map((n) => path.posix.join(dir, n)).filter(tracked);
    const openSiblings = siblings.map((s) => ({ s, open: rowsOf(s).filter(isOpen) })).filter((x) => x.open.length);
    if (openSiblings.length) return no(`open sibling plans keep ${plan}: ${openSiblings.map((x) => `${x.s} (${x.open.map((r) => `${r.unit}=${r.status}`).join(", ")})`).join("; ")}`);
    // Live descendants keep the plan (retire's refusal).
    let index;
    try {
      index = seams.loadIndex ? seams.loadIndex(context, sha) : sha ? indexAt(context, sha, git) : loadIndex(context.root);
    } catch (error) { return no(`cannot read the plan hierarchy: ${error.message}`); }
    if (index.get(slug)) {
      const own = new Set(siblings.map((p) => path.posix.basename(p, ".md")));
      const isParent = (n) => n && (n.level === "epic" || n.level === "story");
      const live = descendantSlugs(slug, { index }).filter((c) => !own.has(c)).filter((c) => {
        const node = index.get(c);
        const crows = rowsOf(node.path);
        return crows.some(isOpen) || (!crows.length && !isParent(node) && !node.derived);
      });
      if (live.length) return no(`${plan} has live descendants: ${live.join(", ")}`);
    }
    let scanContext = context;
    if (sha) {
      const base = context.git ?? ((args, ctx) => execFileSync("git", ["-C", ctx.root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64e6 }));
      scanContext = { ...context, git: (args, ctx) => {
        if (args[0] !== "grep" || !args.includes("HEAD")) return base(args, ctx);
        return String(base(args.map((a) => (a === "HEAD" ? sha : a)), ctx) ?? "").replaceAll(`${sha}:`, "HEAD:");
      } };
    }
    const verdict = classifyArchive(scanContext, plan, { archive, findReferrers: seams.findReferrers });
    if (verdict.scanFailed) return no("referrer scan failed");
    if (verdict.hits.length) return no(`referenced by ${verdict.hits.join(", ")}`);
    if (!tracked(plan)) return no(`${plan} is not tracked by git`);
    if (String(git(["status", "--porcelain", "--", plan], context) ?? "").trim()) return no(`uncommitted changes in ${plan}`);
    return { eligible: true };
  } catch (error) {
    return no(`eligibility check failed: ${error?.message ?? error}`);
  }
}

// The plan index as it stands at a commit, read from git rather than the working tree.
function indexAt(context, sha, git) {
  const names = String(git(["ls-tree", "--name-only", sha, "docs/plans/"], context) ?? "").split("\n").filter((f) => /^docs\/plans\/[^/]+\.md$/.test(f)).sort();
  return buildIndex(names.map((f) => ({ path: f, slug: path.posix.basename(f, ".md"), text: String(git(["show", `${sha}:${f}`], context) ?? "") })));
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
        const verdict = eligible(here, plan, { sha });
        if (!verdict.eligible) { note({ ev: "doc_retire_skipped", plan, reason: verdict.reason }); continue; }
        // Only a retire that will actually run may move the main checkout (ARCH-LAND-30).
        if (!holdsLanding(main, info.base_branch, sha)) {
          note({ ev: "doc_retire_skipped", plan, reason: `main checkout is not on ${info.base_branch} holding the landed merge` });
          continue;
        }
        const out = retire({ plan, sid: input.session_id, auto: true, landed_sha: sha }, here);
        if (out?.refused) { note({ ev: "doc_retire_skipped", plan, reason: out.reason }); continue; }
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
