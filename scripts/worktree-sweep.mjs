#!/usr/bin/env node
// Repository-wide worktree inventory and safe sweep.
//
// stop-gate.mjs's sweep is session-local by design: it only polices worktrees
// THIS session prepared through repo-exec.mjs. Everything else — a worktree a
// previous session merged but never removed, a crashed session's leftovers,
// Claude Code's own `.claude/worktrees/` (EnterWorktree, background jobs,
// `isolation: "worktree"` agents) — was nobody's business and lingered
// forever. This script sees all of them, and removes only the ones that can
// go without losing anything or pulling a worktree out from under a live
// session:
//
//   removable = on a named branch, fully merged into the base branch, no
//               uncommitted/untracked changes, not the caller's own cwd, and
//               either unlocked or locked by a process that no longer exists.
//
// Claude Code locks a live session's worktree with the reason
// "claude session <name> (pid N start T)"; a lock whose pid is gone (or whose
// pid was reused by a process with a different start time) is an orphan. A
// lock with any other reason is someone's deliberate `git worktree lock` and
// is always respected.
//
// Everything here is local-only (no fetch, no `remote show`): SessionStart and
// Stop call into it on every session/turn.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { projectContext, readStdin } from "./lib/core.mjs";

function git(root, args) {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}
function gitOk(root, args) {
  try { git(root, args); return true; } catch { return false; }
}
function gitOr(root, args, fallback = "") {
  try { return git(root, args); } catch { return fallback; }
}

// Candidate refs a finished branch lands in, most authoritative first. Only
// refs that actually exist are returned.
export function baseRefs(root) {
  const refs = [];
  const remoteHead = gitOr(root, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"]);
  if (remoteHead.startsWith("origin/")) refs.push(remoteHead.slice("origin/".length), remoteHead);
  refs.push("main", "master");
  return [...new Set(refs)].filter((ref) => gitOk(root, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]));
}

// First ref in `refs` that already contains `branch`, or null.
export function mergedInto(root, branch, refs) {
  for (const ref of refs) {
    if (gitOk(root, ["merge-base", "--is-ancestor", `refs/heads/${branch}`, ref])) return ref;
  }
  return null;
}

// true = the locking process is alive, false = provably gone, null = the lock
// reason names no pid (a human's lock — never second-guessed).
export function lockOwnerAlive(reason) {
  const match = /\(pid (\d+)(?: start (\d+))?\)/.exec(reason || "");
  if (!match) return null;
  const pid = Number(match[1]);
  try { process.kill(pid, 0); }
  catch (error) { if (error.code === "ESRCH") return false; }
  if (match[2]) {
    try {
      // /proc/<pid>/stat field 22 is starttime; fields after "comm)" start at 3.
      const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
      const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
      if (fields[19] !== match[2]) return false; // pid reused by another process
    } catch { /* no /proc (macOS) — kill(0) above is the best available signal */ }
  }
  return true;
}

function parsePorcelain(out) {
  return out.split("\n\n").map((block) => {
    const entry = { path: null, branch: null, locked: false, lock_reason: "", prunable: false };
    for (const line of block.split("\n")) {
      if (line.startsWith("worktree ")) entry.path = line.slice("worktree ".length);
      else if (line.startsWith("branch refs/heads/")) entry.branch = line.slice("branch refs/heads/".length);
      else if (line === "locked" || line.startsWith("locked ")) { entry.locked = true; entry.lock_reason = line.slice("locked".length).trim(); }
      else if (line === "prunable" || line.startsWith("prunable ")) entry.prunable = true;
    }
    return entry;
  }).filter((entry) => entry.path);
}

function inside(child, parent) {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

// Every non-primary worktree of the repository at `root`, classified.
export function listWorktrees(root, { cwd = process.cwd() } = {}) {
  const entries = parsePorcelain(git(root, ["worktree", "list", "--porcelain"]));
  const refs = baseRefs(root);
  return entries.slice(1).map((entry) => {
    const exists = fs.existsSync(entry.path);
    let dirty = null;
    if (exists) {
      try { dirty = git(entry.path, ["status", "--porcelain", "--untracked-files=all"]).split("\n").filter(Boolean).length; }
      catch { dirty = null; }
    }
    const merged_into = entry.branch ? mergedInto(root, entry.branch, refs) : null;
    const ownerAlive = entry.locked ? lockOwnerAlive(entry.lock_reason) : false;
    let keep = null;
    if (!exists || entry.prunable) keep = null; // stale admin entry — `worktree prune` handles it
    else if (!entry.branch) keep = "detached HEAD";
    else if (!merged_into) keep = "not merged into the base branch";
    else if (dirty === null) keep = "status unreadable";
    else if (dirty > 0) keep = `${dirty} uncommitted change(s)`;
    else if (inside(cwd, entry.path)) keep = "current working directory";
    else if (entry.locked && ownerAlive !== false) keep = ownerAlive === null ? `locked: ${entry.lock_reason || "(no reason)"}` : "locked by a live session";
    return {
      path: entry.path,
      branch: entry.branch,
      merged_into,
      dirty,
      locked: entry.locked,
      lock_reason: entry.lock_reason || null,
      missing: !exists || entry.prunable,
      removable: keep === null && exists && !entry.prunable,
      keep_reason: keep,
    };
  });
}

// Remove the removable subset of `paths` (or every removable worktree when
// `all_merged` is set). Never forces past a reason to keep; the branch is
// deleted only because mergedInto() already proved the base contains it.
export function sweep(root, { paths = [], all_merged = false, cwd = process.cwd() } = {}) {
  const inventory = listWorktrees(root, { cwd });
  const wanted = new Set(paths.map((p) => path.resolve(root, p)));
  const targets = all_merged ? inventory.filter((e) => e.removable) : inventory.filter((e) => wanted.has(path.resolve(e.path)));
  const removed = [];
  const skipped = [];
  for (const entry of targets) {
    if (!entry.removable) { skipped.push({ path: entry.path, reason: entry.keep_reason || "missing — pruned instead" }); continue; }
    try {
      if (entry.locked) git(root, ["worktree", "unlock", entry.path]);
      git(root, ["worktree", "remove", entry.path]);
      let branchDeleted = false;
      try { git(root, ["branch", "-D", entry.branch]); branchDeleted = true; } catch { /* checked out elsewhere — leave it */ }
      removed.push({ path: entry.path, branch: entry.branch, merged_into: entry.merged_into, branch_deleted: branchDeleted });
    } catch (error) {
      skipped.push({ path: entry.path, reason: String(error.stderr || error.message).trim().split("\n")[0] });
    }
  }
  for (const p of wanted) {
    if (!inventory.some((e) => path.resolve(e.path) === p)) skipped.push({ path: p, reason: "not a worktree of this repository" });
  }
  gitOr(root, ["worktree", "prune"]);
  return { removed, skipped };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const input = JSON.parse(await readStdin() || "{}");
    const context = projectContext(input.project || ".");
    const action = input.action || "list";
    let result;
    if (action === "list") result = listWorktrees(context.root);
    else if (action === "sweep") {
      if (!input.all_merged && !(Array.isArray(input.paths) && input.paths.length)) throw new Error("sweep requires paths or all_merged: true");
      result = sweep(context.root, input);
    } else throw new Error("action must be list or sweep");
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } catch (error) {
    process.stderr.write(`craftsman: worktree sweep failed: ${error.message}\n`);
    process.exitCode = 2;
  }
}
