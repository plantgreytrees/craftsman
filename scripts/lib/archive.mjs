// Workspace archive library (ARCH-ARCHIVE-01/02/06/08): resolve the archive repo, name archived paths,
// copy + verify + commit locally. Never pushes (ARCH-ARCHIVE-05). Errors are thrown as Error; doc-retire turns them into refuse().
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { loadConfig, loadWorkspaceManifest, logEvent } from "./core.mjs";

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
