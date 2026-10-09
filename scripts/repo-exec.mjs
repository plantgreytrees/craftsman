#!/usr/bin/env node
// Repository-local worktree, branch, lock, merge, and cleanup lifecycle.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { atomicWrite, forgetSessionWorktree, loadConfig, projectContext, readStdin, recordSessionWorktree, sidOf, splitCmd } from "./lib/core.mjs";
import { mergedInto } from "./worktree-sweep.mjs";
import { detectHost, openPullRequest, preflightHost } from "./lib/land.mjs";

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

// The project's test command, by stop-gate's cfg.stopGate.commands (marker
// file → command); null when nothing is detected.
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

// Re-runs the tests in the worktree before merging; only config
// (`repoExec.verifyTestsBeforeMerge` / `stopGate.enabled` false) skips it.
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

// `repoExec.land` (config only): "direct" merges and pushes base; "pr" pushes
// the unit branch and leaves the merge to the host's review flow.
function landMode(cfg) {
  const land = cfg.repoExec?.land || "direct";
  if (land !== "direct" && land !== "pr") throw new Error(`repoExec.land must be "direct" or "pr" (got ${land})`);
  return land;
}

// `deps.runner` replaces the host CLI runner in tests; the stdin entry point
// never passes it.
function merge(context, input, info, deps = {}) {
  const worktree = safeWorktree(context, input.worktree_path, input.slug || input.unit);
  if (!sameRepository(worktree, context.root)) throw new Error(`worktree belongs to another repository: ${worktree}`);
  const cfg = loadConfig(context);
  const land = landMode(cfg);
  if (land === "direct" && run(context.root, ["rev-parse", "--verify", "MERGE_HEAD"], { allowFailure: true })) {
    throw new Error("selected repository already has an in-progress merge");
  }
  const checkedOutBranch = run(worktree, ["branch", "--show-current"]);
  if (input.branch && input.branch !== checkedOutBranch) throw new Error(`requested branch ${input.branch} is not checked out in ${worktree}`);
  const branch = checkedOutBranch;
  if (run(worktree, ["status", "--porcelain"])) throw new Error("worktree is not clean before merge");
  verifyGateBeforeMerge(context, worktree);
  if (land === "pr") return landPullRequest(context, input, info, { worktree, branch, cfg, runner: deps.runner });
  const holder = baseHeldElsewhere(context.root, info.base_branch);
  if (holder && info.has_remote && input.push !== false) return landDetached(context, input, info, { worktree, branch });
  // Otherwise the merge lands in the checkout that has base: this root, or
  // the other worktree holding it — never a dirty or mid-merge one.
  const at = holder || context.root;
  if (holder && (run(holder, ["rev-parse", "--verify", "MERGE_HEAD"], { allowFailure: true })
    || run(holder, ["status", "--porcelain", "--untracked-files=no"]))) {
    throw new Error(`${info.base_branch} is checked out in ${holder}, which has uncommitted changes or a merge in progress`);
  }
  const lock = acquireLock(info, input);
  const originalBranch = holder ? null : run(context.root, ["branch", "--show-current"]);
  let mergeStarted = false;
  let step = null; // the landing step that PARKs instead of throwing (ARCH-LAND-06)
  try {
    heartbeat(lock);
    if (!holder) run(at, ["checkout", info.base_branch]);
    if (info.has_remote && input.pull !== false) {
      heartbeat(lock);
      step = "ff-only";
      run(at, ["pull", "--ff-only", "origin", info.base_branch]);
    }
    heartbeat(lock);
    mergeStarted = true;
    step = "conflict";
    run(at, ["merge", "--no-ff", "--no-edit", branch]);
    step = null;
    heartbeat(lock);
    run(at, ["merge-base", "--is-ancestor", branch, info.base_branch]);
    if (info.has_remote && input.push !== false) {
      heartbeat(lock);
      step = "rejected-push";
      run(at, ["push", "origin", info.base_branch]);
      step = null;
    }
  } catch (error) {
    if (mergeStarted && step !== "rejected-push") {
      try { run(at, ["merge", "--abort"], { allowFailure: true }); } catch {}
    }
    if (!step) throw error;
    // A refused push comes after the local merge, so local base holds it.
    return landingPark(step, { ...info, branch, land: "direct", merged: false, merged_locally: step === "rejected-push", worktree_path: worktree }, error);
  } finally {
    if (originalBranch && originalBranch !== info.base_branch) {
      try { run(context.root, ["checkout", originalBranch], { allowFailure: true }); } catch {}
    }
    releaseLock(lock);
  }
  return cleanupAfterLanding(context, input, info, { ...info, branch, land: "direct", merged: true });
}

// The other worktree holding `base`, or null (git won't check it out twice).
function baseHeldElsewhere(root, base) {
  const here = fs.realpathSync(root);
  let current = null;
  for (const line of run(root, ["worktree", "list", "--porcelain"]).split("\n")) {
    if (line.startsWith("worktree ")) current = line.slice("worktree ".length);
    else if (line === `branch refs/heads/${base}` && current) {
      let resolved = current;
      try { resolved = fs.realpathSync(current); } catch {}
      if (resolved !== here) return current;
    }
  }
  return null;
}

// Base held elsewhere, pushing: merge in a temporary detached worktree at
// origin's base (removed on every path), push HEAD:<base>.
function landDetached(context, input, info, { worktree, branch }) {
  const result = { ...info, branch, land: "direct", merged: false, merged_locally: false, worktree_path: worktree };
  const lock = acquireLock(info, input);
  const temp = path.join(info.common_git_dir, ".craftsman", "land", `${branch.replace(/[^A-Za-z0-9_-]/g, "-")}-${process.pid}`);
  let added = false;
  let step = null;
  try {
    heartbeat(lock);
    if (input.pull !== false) run(context.root, ["fetch", "origin", info.base_branch]);
    fs.mkdirSync(path.dirname(temp), { recursive: true });
    run(context.root, ["worktree", "add", "--detach", temp, `origin/${info.base_branch}`]);
    added = true;
    heartbeat(lock);
    step = "conflict";
    run(temp, ["merge", "--no-ff", "--no-edit", branch]);
    step = null;
    run(temp, ["merge-base", "--is-ancestor", branch, "HEAD"]);
    heartbeat(lock);
    step = "rejected-push";
    run(temp, ["push", "origin", `HEAD:${info.base_branch}`]);
    step = null;
  } catch (error) {
    if (added && step === "conflict") run(temp, ["merge", "--abort"], { allowFailure: true });
    if (!step) throw error;
    return landingPark(step, result, error);
  } finally {
    if (added) run(context.root, ["worktree", "remove", temp], { allowFailure: true });
    fs.rmSync(temp, { recursive: true, force: true });
    run(context.root, ["worktree", "prune"], { allowFailure: true });
    releaseLock(lock);
  }
  return cleanupAfterLanding(context, input, info, { ...result, merged: true });
}

// The four landing failures that PARK (ARCH-LAND-06): {parked:true, decision},
// worktree and branch kept, recorded as tracker PARKED with the decision.
const PARK_DECISIONS = {
  "conflict": (r) => ({
    question: `Merging ${r.branch} into ${r.base_branch} conflicts (the merge was aborted; nothing landed). How should it be resolved?`,
    options: [`Resolve it in the unit worktree (merge ${r.base_branch} in) and land again`, "Re-plan the unit on the current base", "Drop the unit"],
    recommended: `Resolve it in the unit worktree (merge ${r.base_branch} in) and land again`,
  }),
  "ff-only": (r) => ({
    question: `Local ${r.base_branch} cannot fast-forward to origin/${r.base_branch} (they diverged), so ${r.branch} was not merged. How should base be reconciled?`,
    options: [`Reconcile local ${r.base_branch} with origin by hand, then land again`, `Land ${r.branch} through a pull request instead`],
    recommended: `Reconcile local ${r.base_branch} with origin by hand, then land again`,
  }),
  "rejected-push": (r) => ({
    question: r.land === "pr" || !r.merged_locally
      ? `origin rejected the push of ${r.branch} to ${r.base_branch}. How should it land?`
      : `origin rejected the push of ${r.base_branch} after ${r.branch} was merged locally (local ${r.base_branch} holds the unpushed merge). How should it land?`,
    options: ["Fix the remote's refusal (permissions, hooks, protection) and push again", "Land through a pull request instead (repoExec.land: \"pr\")", "Leave it unpushed for the user"],
    recommended: "Land through a pull request instead (repoExec.land: \"pr\")",
  }),
  "auto-merge": (r) => ({
    question: `${r.pr?.url || "The pull request"} for ${r.branch} is open, but the host refused auto-merge. How should it be merged?`,
    options: ["Merge the pull request by hand on the host", "Enable auto-merge for the repository and retry", "Leave the pull request open for review"],
    recommended: "Merge the pull request by hand on the host",
  }),
};

function landingPark(reason, result, error) {
  const output = `${error?.stderr || ""}${error?.stdout || ""}`.trim();
  const detail = (output || String(error?.message || "")).trim().split("\n").slice(-10).join("\n");
  return { ...result, parked: true, reason, error: detail, cleaned: false, decision: PARK_DECISIONS[reason](result) };
}

// "pr" mode: no lock, base untouched; push the unit branch, open or reuse its
// PR and ask for auto-merge. Every refusal is checked before the push.
function landPullRequest(context, input, info, { worktree, branch, cfg, runner }) {
  if (!info.has_remote) throw new Error(`repoExec.land is "pr" but ${info.project} has no origin remote`);
  const host = detectHost(info.origin, cfg.repoExec?.host);
  if (!host) throw new Error(`cannot tell which host ${info.origin} is on; set repoExec.host to github, gitlab or azure`);
  const options = {
    host, cwd: worktree, branch, base: info.base_branch,
    autoMerge: cfg.repoExec?.autoMerge !== false,
    mergeMethod: cfg.repoExec?.mergeMethod || "merge",
  };
  preflightHost(options, runner);
  if (input.fetch !== false) run(context.root, ["fetch", "origin", info.base_branch]);
  const subjects = run(worktree, ["log", "--reverse", "--format=%s", `origin/${info.base_branch}..${branch}`]);
  if (!subjects) throw new Error(`${branch} has no commits beyond origin/${info.base_branch}`);
  try { run(worktree, ["push", "-u", "origin", branch]); }
  catch (error) {
    return landingPark("rejected-push", { ...info, branch, land: "pr", merged: false, pushed: false, worktree_path: worktree }, error);
  }
  const lines = subjects.split("\n");
  const pr = openPullRequest({
    ...options,
    title: lines[0],
    body: `Landed by craftsman (repoExec.land: "pr").\n\n${lines.map((line) => `- ${line}`).join("\n")}`,
  }, runner);
  const { auto_merge, auto_merge_error, ...request } = pr;
  if (auto_merge_error) {
    return landingPark("auto-merge", {
      ...info, branch, land: "pr", merged: false, pushed: true, pr: request, auto_merge, auto_merge_error, worktree_path: worktree,
    }, new Error(auto_merge_error));
  }
  return cleanupAfterLanding(context, input, info, {
    ...info, branch, land: "pr", merged: false, pushed: true, pr: request, auto_merge,
  });
}

// A landed worktree is cleaned here (opt out: cleanup:false). A cleanup
// failure is reported, never un-lands; Stop's sweep catches the path.
function cleanupAfterLanding(context, input, info, result) {
  if (input.cleanup === false) return { ...result, cleaned: false };
  try {
    return { ...cleanup(context, { ...input, branch: result.branch }, info), ...result };
  } catch (error) {
    return { ...result, cleaned: false, cleanup_error: String(error.stderr || error.message).trim() };
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
  // "Merged" is judged against base (and origin's, for a detached landing),
  // not HEAD as `branch -d` would; an unmerged (parked) branch is kept.
  const bases = info.has_remote ? [info.base_branch, `refs/remotes/origin/${info.base_branch}`] : [info.base_branch];
  const branchDeleted = Boolean(mergedInto(context.root, branch, bases));
  if (branchDeleted) run(context.root, ["branch", "-D", branch]);
  // A pushed branch goes too; best-effort, the merge already landed.
  let remoteBranchDeleted = false;
  if (branchDeleted && info.has_remote
    && run(context.root, ["rev-parse", "--verify", "--quiet", `refs/remotes/origin/${branch}`], { allowFailure: true })) {
    try {
      execFileSync("git", ["-C", context.root, "push", "--quiet", "origin", "--delete", branch], { stdio: "ignore" });
      remoteBranchDeleted = true;
    } catch {}
  }
  return { ...info, cleaned: true, branch, branch_deleted: branchDeleted, remote_branch_deleted: remoteBranchDeleted };
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
