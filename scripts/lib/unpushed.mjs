// Unpushed work in the main checkout and every worktree, from LOCAL refs only (ARCH-SAFETY-06): it
// never fetches and never talks to a remote, so it is safe to run at Stop and SessionEnd. "Unpushed"
// means work that exists on this machine alone: uncommitted changes, stashes, commits on a branch that
// has no upstream or is ahead of it, and commits that sit on no branch at all.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { isCraftsmanStateLine } from "./craftsman-state.mjs";

function git(cwd, args) {
  try { return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 8000 }).replace(/\n$/, ""); }
  catch { return null; }
}
const count = (cwd, args) => Number.parseInt(git(cwd, ["rev-list", "--count", ...args]) ?? "0", 10) || 0;

function worktrees(root) {
  const out = git(root, ["worktree", "list", "--porcelain"]);
  if (!out) return [];
  return out.split(/\n\n+/).map((block) => {
    const entry = { path: null, detached: false };
    for (const line of block.split("\n")) {
      if (line.startsWith("worktree ")) entry.path = line.slice(9);
      else if (line === "detached") entry.detached = true;
    }
    return entry;
  }).filter((entry) => entry.path && fs.existsSync(entry.path));
}

export function unpushedReport(root, { max = 12 } = {}) {
  const lines = [];
  const top = git(root, ["rev-parse", "--show-toplevel"]);
  if (!top) return { lines };
  const main = path.resolve(top);

  for (const wt of worktrees(root)) {
    const label = path.resolve(wt.path) === main ? "the main checkout" : wt.path;
    const changed = (git(wt.path, ["status", "--porcelain", "--untracked-files=all"]) || "").split("\n").filter((l) => l && !isCraftsmanStateLine(l));
    if (changed.length) lines.push(`uncommitted changes in ${label}: ${changed.length} file(s)`);
    if (wt.detached) {
      const n = count(wt.path, ["HEAD", "--not", "--branches", "--remotes", "--tags"]);
      if (n) lines.push(`detached HEAD in ${label} holds ${n} commit(s) on no branch`);
    }
  }

  const stashes = (git(root, ["stash", "list"]) || "").split("\n").filter(Boolean).length;
  if (stashes) lines.push(`${stashes} stash ${stashes === 1 ? "entry" : "entries"} (git stash list)`);

  // The full ref counts the commits, so a branch named like a tag or a file is not read as that tag or file.
  const refs = git(root, ["for-each-ref", "--format=%(refname)%09%(refname:lstrip=2)%09%(upstream:short)%09%(upstream:track)", "refs/heads"]) || "";
  for (const row of refs.split("\n").filter(Boolean)) {
    const [ref, branch, upstream, track] = row.split("\t");
    if (!upstream) {
      const n = count(root, [ref, "--not", "--remotes"]);
      if (n) lines.push(`branch ${branch} has no upstream: ${n} commit(s) on no remote`);
    } else if (track === "[gone]") {
      const n = count(root, [ref, "--not", "--remotes"]);
      if (n) lines.push(`branch ${branch}'s upstream ${upstream} is gone: ${n} commit(s) on no remote`);
    } else {
      const ahead = /ahead (\d+)/.exec(track || "");
      if (ahead) lines.push(`branch ${branch} is ahead of ${upstream} by ${ahead[1]} commit(s)`);
    }
  }

  if (lines.length > max) {
    const left = lines.length - max;
    return { lines: [...lines.slice(0, max), `… and ${left} more`] };
  }
  return { lines };
}

export function formatReport(lines) {
  return lines.length ? `craftsman: unpushed work (local refs only):\n${lines.map((l) => `  - ${l}`).join("\n")}` : "";
}
