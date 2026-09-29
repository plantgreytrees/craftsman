#!/usr/bin/env node
// Repository-local worktree, branch, lock, merge, and cleanup lifecycle.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { atomicWrite, forgetSessionWorktree, loadConfig, projectContext, readStdin, recordSessionWorktree, sidOf, splitCmd } from "./lib/core.mjs";
import { mergedInto } from "./worktree-sweep.mjs";

function run(root, args, options = {}) {
  try {
    return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: options.allowFailure ? ["ignore", "pipe", "pipe"] : undefined }).trim();
  } catch (error) {
    if (options.allowFailure) return "";
    throw error;
  }
}

function inspectRepo(context, input = {}) {
  const commonRaw = run(context.root, ["rev-parse", "--git-common-dir"]);
  const commonDir = path.resolve(context.root, commonRaw);
  const branch = run(context.root, ["symbolic-ref", "--quiet", "--short", "HEAD"], { allowFailure: true });
  const remoteHead = run(context.root, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"], { allowFailure: true });
  const origin = run(context.root, ["remote", "get-url", "origin"], { allowFailure: true });
  const remoteShow = origin ? run(context.root, ["remote", "show", "origin"], { allowFailure: true }) : "";
  const advertised = remoteShow.match(/^\s*HEAD branch:\s*(\S+)/m)?.[1] || "";
  const base = input.base_branch || (remoteHead.startsWith("origin/")
    ? remoteHead.slice("origin/".length)
    : advertised || branch);
  if (!branch) throw new Error(`selected repository is detached: ${context.id}`);
  if (!input.base_branch && /^((feat|fix|chore|docs|refactor)\/|wip[/-])/.test(base)) {
    throw new Error(`cannot infer a safe base branch from ${base}; provide base_branch explicitly`);
  }
  return {
    project: context.id,
    project_root: context.root,
    common_git_dir: commonDir,
    base_branch: base,
    origin: origin || null,
    has_remote: Boolean(origin),
  };
}

function safeWorktree(context, requested, slug) {
  const candidate = path.resolve(context.root, requested || path.join(".worktrees", slug));
  const root = fs.realpathSync(context.root);
  let ancestor = path.dirname(candidate);
  while (!fs.existsSync(ancestor) && path.dirname(ancestor) !== ancestor) ancestor = path.dirname(ancestor);
  const resolved = fs.existsSync(candidate)
    ? fs.realpathSync(candidate)
    : path.resolve(fs.realpathSync(ancestor), path.relative(ancestor, candidate));
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`worktree escapes selected repository: ${candidate}`);
  }
  return candidate;
}

function sameRepository(worktree, root) {
  try {
    const common = (repo) => path.resolve(repo, run(repo, ["rev-parse", "--git-common-dir"]));
    return common(worktree) === common(root);
  } catch { return false; }
}

function lockPath(info, base) {
  return path.join(info.common_git_dir, ".craftsman", "merge-locks", `${base}.lock`);
}

function acquireLock(info, input) {
  const lock = lockPath(info, info.base_branch);
  fs.mkdirSync(path.dirname(lock), { recursive: true });
  try { fs.mkdirSync(lock); }
  catch (error) {
    if (error.code === "EEXIST") {
      let owner = null;
      try { owner = JSON.parse(fs.readFileSync(path.join(lock, "owner.json"), "utf8")); } catch {}
      const lockTime = (() => { try { return fs.statSync(lock).mtimeMs; } catch { return 0; } })();
      const recordedHeartbeat = Date.parse(owner?.heartbeat_at || owner?.started_at || "") || 0;
      const heartbeat = Math.max(recordedHeartbeat, lockTime);
      if (!heartbeat || Date.now() - heartbeat <= 30 * 60 * 1000) {
        throw new Error(`merge lock is held for ${info.project}:${info.base_branch}`);
      }
      const takeover = `${lock}.stale-${process.pid}-${Date.now()}`;
      try { fs.renameSync(lock, takeover); }
      catch (renameError) {
        if (renameError.code === "ENOENT" || renameError.code === "EEXIST") throw new Error(`merge lock changed during stale takeover: ${info.project}:${info.base_branch}`);
        throw renameError;
      }
      let takeoverOwner = null;
      try { takeoverOwner = JSON.parse(fs.readFileSync(path.join(takeover, "owner.json"), "utf8")); } catch {}
      const takeoverRecorded = Date.parse(takeoverOwner?.heartbeat_at || takeoverOwner?.started_at || "") || 0;
      const takeoverHeartbeat = Math.max(takeoverRecorded, fs.statSync(takeover).mtimeMs);
      if (takeoverHeartbeat && Date.now() - takeoverHeartbeat <= 30 * 60 * 1000) {
        try { fs.renameSync(takeover, lock); } catch {}
        throw new Error(`merge lock became active during stale takeover: ${info.project}:${info.base_branch}`);
      }
      fs.rmSync(takeover, { recursive: true, force: true });
      try {
        fs.mkdirSync(lock);
      } catch (reclaimError) {
        if (reclaimError.code === "EEXIST") {
          throw new Error(`merge lock was reclaimed during stale takeover: ${info.project}:${info.base_branch}`);
        }
        throw reclaimError;
      }
    }
    if (error.code !== "EEXIST") throw error;
  }
  atomicWrite(path.join(lock, "owner.json"), JSON.stringify({
    session_id: sidOf(input), project: info.project, unit: input.unit,
    started_at: new Date().toISOString(), heartbeat_at: new Date().toISOString(),
  }, null, 2) + "\n");
  return lock;
}

function releaseLock(lock) { if (lock) fs.rmSync(lock, { recursive: true, force: true }); }
function heartbeat(lock) {
  try { const now = new Date(); fs.utimesSync(lock, now, now); } catch {}
}

function prepare(context, input, info) {
  const slug = input.slug || input.unit;
  if (!slug) throw new Error("prepare requires slug or unit");
  const worktree = safeWorktree(context, input.worktree_path, slug);
  const branch = input.branch || `feat/${slug}`;
  const baseRef = info.has_remote ? `origin/${info.base_branch}` : info.base_branch;
  if (info.has_remote && input.fetch !== false) run(context.root, ["fetch", "origin", info.base_branch]);
  if (fs.existsSync(worktree)) {
    if (!sameRepository(worktree, context.root)) throw new Error(`worktree belongs to another repository: ${worktree}`);
    const current = run(worktree, ["branch", "--show-current"], { allowFailure: true });
    if (current !== branch) throw new Error(`worktree already exists on ${current || "detached HEAD"}: ${worktree}`);
    // Reattaching means this session now owns it, so it joins the ledger too.
    recordSessionWorktree(input, worktree, context);
    return { ...info, worktree_path: worktree, branch, base_ref: baseRef, reattached: true };
  }
  fs.mkdirSync(path.dirname(worktree), { recursive: true });
  const existing = run(context.root, ["show-ref", "--verify", `refs/heads/${branch}`], { allowFailure: true });
  if (existing) run(context.root, ["worktree", "add", worktree, branch]);
  else run(context.root, ["worktree", "add", "-b", branch, worktree, baseRef]);
  recordSessionWorktree(input, worktree, context);
  return { ...info, worktree_path: worktree, branch, base_ref: baseRef, reattached: false };
}

function sync(context, input, info) {
  const worktree = safeWorktree(context, input.worktree_path, input.slug || input.unit);
  if (!sameRepository(worktree, context.root)) throw new Error(`worktree belongs to another repository: ${worktree}`);
  const baseRef = info.has_remote ? `origin/${info.base_branch}` : info.base_branch;
  if (info.has_remote && input.fetch !== false) run(context.root, ["fetch", "origin", info.base_branch]);
  run(worktree, ["merge", "--no-edit", baseRef]);
  return { ...info, worktree_path: worktree, base_ref: baseRef };
}

// Finds the project's own detected test command via the SAME cfg.stopGate.commands
// convention stop-gate.mjs/session-context.mjs already use (marker file → command) —
// no new config surface, just reused. Fails open (returns null) when nothing is
// detected, matching this plugin's "no repo check for a dimension → note it, don't
// invent one" rule elsewhere.
function findGateCommand(worktree, cfg) {
  for (const [marker, command] of Object.entries(cfg.stopGate?.commands || {})) {
    if (marker.includes("*")) {
      let entries = [];
      try { entries = fs.readdirSync(worktree); } catch { continue; }
      const re = new RegExp(`^${marker.replaceAll(".", "\\.").replaceAll("*", ".*")}$`);
      if (entries.some((entry) => re.test(entry))) return command;
    } else if (fs.existsSync(path.join(worktree, marker))) {
      return command;
    }
  }
  return null;
}

// The one check `merge()` previously had zero awareness of: whether the code
// being merged actually passes its own tests. _shared-execution.md's Phase X
// step 7 (GATE) already runs this once during implementation, but that was
// pure self-report as far as the merge boundary was concerned — nothing here
// verified it actually happened or actually passed. This re-runs the test
// command independently, inside the worktree, right before the merge that
// makes it permanent. Deliberately NOT skippable via any per-call input field
// — a caller-controlled skip flag would make this exactly as bypassable as
// the prose it replaces. The only way to disable it is an actual config
// change: `repoExec.verifyTestsBeforeMerge: false` or `stopGate.enabled: false`
// in craftsman.config.json — a visible, auditable edit, not a silent runtime flag.
function verifyGateBeforeMerge(context, worktree) {
  const cfg = loadConfig(context);
  if (cfg.stopGate?.enabled === false || cfg.repoExec?.verifyTestsBeforeMerge === false) return;
  const command = findGateCommand(worktree, cfg);
  if (!command) return; // no detected test command for this stack — nothing to verify
  const [bin, ...args] = splitCmd(command);
  const timeoutMs = cfg.stopGate?.testTimeoutMs ?? 250000;
  try {
    execFileSync(bin, args, { cwd: worktree, timeout: timeoutMs, stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    const output = ((error.stdout || "") + (error.stderr || "")).toString().split("\n").slice(-30).join("\n");
    throw new Error(`pre-merge gate failed — "${command}" did not pass in ${worktree}:\n${output}`);
  }
}

function merge(context, input, info) {
  const worktree = safeWorktree(context, input.worktree_path, input.slug || input.unit);
  if (!sameRepository(worktree, context.root)) throw new Error(`worktree belongs to another repository: ${worktree}`);
  if (run(context.root, ["rev-parse", "--verify", "MERGE_HEAD"], { allowFailure: true })) {
    throw new Error("selected repository already has an in-progress merge");
  }
  const checkedOutBranch = run(worktree, ["branch", "--show-current"]);
  if (input.branch && input.branch !== checkedOutBranch) throw new Error(`requested branch ${input.branch} is not checked out in ${worktree}`);
  const branch = checkedOutBranch;
  if (run(worktree, ["status", "--porcelain"])) throw new Error("worktree is not clean before merge");
  verifyGateBeforeMerge(context, worktree);
  const lock = acquireLock(info, input);
  const originalBranch = run(context.root, ["branch", "--show-current"]);
  let mergeStarted = false;
  try {
    heartbeat(lock);
    run(context.root, ["checkout", info.base_branch]);
    if (info.has_remote && input.pull !== false) { heartbeat(lock); run(context.root, ["pull", "--ff-only", "origin", info.base_branch]); }
    heartbeat(lock);
    mergeStarted = true;
    run(context.root, ["merge", "--no-ff", branch]);
    heartbeat(lock);
    run(context.root, ["merge-base", "--is-ancestor", branch, info.base_branch]);
    if (info.has_remote && input.push !== false) { heartbeat(lock); run(context.root, ["push", "origin", info.base_branch]); }
  } catch (error) {
    if (mergeStarted) {
      try { run(context.root, ["merge", "--abort"], { allowFailure: true }); } catch {}
    }
    throw error;
  } finally {
    if (originalBranch && originalBranch !== info.base_branch) {
      try { run(context.root, ["checkout", originalBranch], { allowFailure: true }); } catch {}
    }
    releaseLock(lock);
  }
  // A merged worktree has nothing left to do. Cleanup used to be a separate
  // step the model had to remember, and skipping it is exactly how merged
  // worktrees lingered — so it happens here, after the lock is released.
  // Opt out only with cleanup:false. A cleanup failure never un-merges: it is
  // reported, and the session ledger keeps the path so Stop's sweep catches it.
  if (input.cleanup === false) return { ...info, branch, merged: true, cleaned: false };
  try {
    return { ...info, ...cleanup(context, { ...input, branch }, info), branch, merged: true };
  } catch (error) {
    return { ...info, branch, merged: true, cleaned: false, cleanup_error: String(error.stderr || error.message).trim() };
  }
}

function cleanup(context, input, info) {
  const worktree = safeWorktree(context, input.worktree_path, input.slug || input.unit);
  if (!sameRepository(worktree, context.root)) throw new Error(`worktree belongs to another repository: ${worktree}`);
  const checkedOutBranch = run(worktree, ["branch", "--show-current"]);
  if (input.branch && input.branch !== checkedOutBranch) throw new Error(`requested branch ${input.branch} is not checked out in ${worktree}`);
  const branch = checkedOutBranch;
  run(context.root, ["worktree", "remove", worktree]);
  forgetSessionWorktree(input, worktree, context);
  run(context.root, ["worktree", "prune"]);
  // Not `branch -d`: that judges "merged" against the primary checkout's HEAD,
  // which merge() restores to whatever was checked out before — often not the
  // base — so it failed after the worktree was already gone. Decide against
  // the base branch explicitly; an unmerged (parked) branch is kept.
  const branchDeleted = Boolean(mergedInto(context.root, branch, [info.base_branch]));
  if (branchDeleted) run(context.root, ["branch", "-D", branch]);
  return { ...info, cleaned: true, branch, branch_deleted: branchDeleted };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const input = JSON.parse(await readStdin() || "{}");
    const context = projectContext(input.project || ".");
    const info = inspectRepo(context, input);
    let result;
    if (input.action === "inspect") result = info;
    else if (input.action === "prepare") result = prepare(context, input, info);
    else if (input.action === "sync") result = sync(context, input, info);
    else if (input.action === "merge") result = merge(context, input, info);
    else if (input.action === "cleanup") result = cleanup(context, input, info);
    else throw new Error("action must be inspect, prepare, sync, merge, or cleanup");
    process.stdout.write(JSON.stringify(result) + "\n");
  } catch (error) {
    process.stderr.write(`craftsman: repository execution failed: ${error.message}\n`);
    process.exitCode = 2;
  }
}

export { inspectRepo, prepare, sync, merge, cleanup };
