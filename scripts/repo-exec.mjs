#!/usr/bin/env node
// Repository-local worktree, branch, lock, merge, and cleanup lifecycle.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { acceptanceCriteria, atomicWrite, featureCriteria, forgetSessionWorktree, loadConfig, logEvent, mainCheckoutRoot, projectContext, readStdin, recordSessionWorktree, sidOf, splitCmd } from "./lib/core.mjs";
import { loadIndex, resolve as resolvePlan } from "./lib/plan-index.mjs";
import { mergedInto } from "./worktree-sweep.mjs";
import { detectHost, openPullRequest, preflightHost } from "./lib/land.mjs";
import { currentState, transition } from "./tracker.mjs";
import { afterLand, gateFeature, gatePark, noteUnenforced } from "./lib/approval-gate.mjs";
import { findGateCommand } from "./lib/gate-command.mjs";
import { NeedsNetwork, drainQueue, enqueueDelete, enqueuePush, isUnreachable, networkError, networkMode, readQueue, recordFetch, remote, requireFreshRef, scrub } from "./lib/network.mjs";

function run(root, args, options = {}) {
  try {
    return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: options.allowFailure ? ["ignore", "pipe", "pipe"] : undefined, env: { ...process.env, LC_ALL: "C" } }).trim();
  } catch (error) {
    if (options.allowFailure) return "";
    throw error;
  }
}

// Network phase (ARCH-LAND-19). Online (root, or any process that reaches origin
// as itself): fetch and push as before. Offline (a sandboxed runner): fetch only
// reads origin/<base> if root fetched it recently, and every push is queued for
// root's `network drain`; whole actions that cannot be deferred raise NeedsNetwork
// before touching anything.
const online = (root, input) => networkMode(root, input) === "online";
const maxFetchAge = (context) => loadConfig(context).repoExec?.offlineMaxFetchAgeMinutes ?? 120;
const retryAs = (input) => ({ ...input, network: "online" });
const fetchAction = (info, branch) => ({ action: "network", step: "fetch", project: info.project, base_branch: branch });

function fetchBase(context, root, input, info, branch = info.base_branch) {
  if (!info.has_remote || input.fetch === false) return;
  if (!online(root, input)) {
    requireFreshRef(root, info, branch, maxFetchAge(context), fetchAction(info, branch));
    return;
  }
  try { remote(root, ["fetch", "origin", branch]); }
  catch (error) { throw isUnreachable(error) ? networkError(error, fetchAction(info, branch)) : error; }
  recordFetch(info, branch);
}

// `args` is the plain `git push` argument list; `ref` the local ref it sends
// to refs/heads/<dst>. Returns true when pushed, false when queued for root.
function pushOrDefer(context, input, info, { cwd, args, ref, dst, upstream = false }) {
  if (online(cwd, input)) {
    try { remote(cwd, ["push", ...args]); return true; }
    catch (error) { throw isUnreachable(error) ? networkError(error) : error; }
  }
  const entry = enqueuePush(cwd, info, { sha: run(cwd, ["rev-parse", ref]), dst, upstream, reason: input.unit || input.slug || "" });
  logEvent({ ev: "network_deferred", kind: "push", project: info.project, dst, id: entry.id }, context);
  return false;
}

function deleteRemoteBranch(input, info, root, branch) {
  if (!online(root, input)) {
    enqueueDelete(info, branch);
    return false;
  }
  try { remote(root, ["push", "--quiet", "origin", "--delete", branch]); return true; }
  catch { return false; }
}

function requireOnline(root, input, info, label) {
  if (!info.has_remote || online(root, input)) return;
  throw new NeedsNetwork(`${label} talks to the host API and this process cannot reach origin`, retryAs(input));
}

// A superproject checks its submodules out detached. When HEAD is exactly origin/<base> and
// local <base> is missing or an ancestor of HEAD, attaching is safe: the ref moves forward to
// HEAD (compare-and-swap, never backwards) and HEAD is checked out on it, so no file changes.
// Returns "" once attached, else the reason it was left detached. Off via repoExec.attachDetached: false.
function attachDetached(context, base) {
  const root = context.root;
  if (loadConfig(context).repoExec?.attachDetached === false) return "repoExec.attachDetached is false";
  if (!base) return "its base branch is unknown; pass base_branch";
  const head = run(root, ["rev-parse", "HEAD"], { allowFailure: true });
  const tip = run(root, ["rev-parse", "--verify", "--quiet", `refs/remotes/origin/${base}`], { allowFailure: true });
  if (!head || head !== tip) return `HEAD is not at origin/${base}; check out ${base} yourself`;
  const local = run(root, ["rev-parse", "--verify", "--quiet", `refs/heads/${base}`], { allowFailure: true });
  try {
    if (local && local !== head) {
      run(root, ["merge-base", "--is-ancestor", local, head]);
      run(root, ["update-ref", `refs/heads/${base}`, head, local]);
    } else if (!local) run(root, ["branch", base, head]);
    run(root, ["checkout", "--quiet", base]);
  } catch {
    return `local ${base} is not an ancestor of HEAD, or is checked out elsewhere; reconcile it by hand`;
  }
  run(root, ["branch", "--set-upstream-to", `origin/${base}`, base], { allowFailure: true });
  logEvent({ ev: "attach_detached", project: context.id, branch: base, sha: head }, context);
  return "";
}

function inspectRepo(context, input = {}) {
  const commonRaw = run(context.root, ["rev-parse", "--git-common-dir"]);
  const commonDir = path.resolve(context.root, commonRaw);
  const branch = run(context.root, ["symbolic-ref", "--quiet", "--short", "HEAD"], { allowFailure: true });
  const remoteHead = run(context.root, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"], { allowFailure: true });
  const origin = run(context.root, ["remote", "get-url", "origin"], { allowFailure: true });
  // `remote show` queries the host, so only when nothing local names the base.
  const remoteShow = origin && !remoteHead && !input.base_branch ? run(context.root, ["remote", "show", "origin"], { allowFailure: true }) : "";
  const advertised = remoteShow.match(/^\s*HEAD branch:\s*(\S+)/m)?.[1] || "";
  const base = input.base_branch || (remoteHead.startsWith("origin/")
    ? remoteHead.slice("origin/".length)
    : advertised || branch);
  if (!branch) {
    const why = attachDetached(context, base);
    if (why) throw new Error(`selected repository is detached: ${context.id} (${why})`);
  }
  if (!input.base_branch && /^((feat|feature|fix|chore|docs|refactor)\/|wip[/-])/.test(base)) {
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

// Plan files the feature must find on origin/<base> before its worktree exists:
// the plan doc and each parent ancestor (from the plan index). Generated rollups
// (docs/plans/<slug>/TRACKER.md) are excluded: every tracker transition rewrites them locally.
function planGateFiles(root, planSlug) {
  let index;
  try { index = loadIndex(root); } catch (error) { throw new Error(`plan gate: plan index failed: ${error.message}`); }
  const leafPath = `docs/plans/${planSlug}.md`;
  const files = [leafPath];
  const leaf = [...index.nodes.values()].find((n) => n.path === leafPath);
  const seen = new Set(leaf ? [leaf.slug] : []);
  for (let slug = leaf?.parent; slug && !seen.has(slug); ) {
    seen.add(slug);
    const node = index.nodes.get(slug);
    if (!node) throw new Error(`plan gate: plan index has no node for parent '${slug}'`);
    files.push(node.path);
    slug = node.parent || "";
  }
  return files;
}

function planGate(context, input, info, planSlug) {
  const ref = `origin/${info.base_branch}`;
  const differing = [];
  for (const file of planGateFiles(context.root, planSlug)) {
    const abs = path.join(context.root, file);
    const local = fs.existsSync(abs) ? run(context.root, ["hash-object", abs], { allowFailure: true }) : "";
    const remote = run(context.root, ["rev-parse", "--verify", "--quiet", `${ref}:${file}`], { allowFailure: true });
    if (!local || !remote || local !== remote) differing.push(file);
  }
  logEvent({ ev: "plan_gate", plan: planSlug, base: info.base_branch, ok: differing.length === 0, differing }, context);
  if (differing.length) {
    throw new Error(`plan gate: ${differing.join(", ")} differ from ${ref}; land them through /craftsman:merge before preparing a feature`);
  }
}

// A feature session owns one long-lived worktree under the MAIN checkout, never
// under the linked .claude/worktrees directory the session runs in
// (ARCH-LAND-13); the branch is pushed at creation (ARCH-LAND-09).
function assertFeatureId(id) {
  const text = String(id ?? "");
  if (!/^[A-Za-z0-9._-]+$/.test(text) || text.includes("..")) throw new Error(`invalid feature id: ${JSON.stringify(text)}`);
}

function featureLockInfo(info, feature) {
  return { ...info, base_branch: `feature-${feature.replace(/[^A-Za-z0-9_-]/g, "-")}` };
}

function prepareFeature(context, input, info) {
  assertFeatureId(input.feature);
  const main = mainCheckoutRoot(context.root);
  const anchored = { ...context, root: main, stateDir: path.join(main, ".craftsman") };
  const planSlug = path.basename(String(input.plan || ""), ".md");
  if (!planSlug) throw new Error("feature prepare requires plan");
  const slug = `${planSlug}-${input.feature}`;
  const branch = `feature/${slug}`;
  const worktree = path.join(main, ".worktrees", slug);
  const baseRef = info.has_remote ? `origin/${info.base_branch}` : info.base_branch;
  fetchBase(context, main, input, info);
  if (info.has_remote) planGate(anchored, input, info, planSlug);
  let reattached = false;
  let pushed = true;
  if (fs.existsSync(worktree)) {
    if (!sameRepository(worktree, main)) throw new Error(`worktree belongs to another repository: ${worktree}`);
    const current = run(worktree, ["branch", "--show-current"], { allowFailure: true });
    if (current !== branch) throw new Error(`worktree already exists on ${current || "detached HEAD"}: ${worktree}`);
    reattached = true;
  } else {
    fs.mkdirSync(path.dirname(worktree), { recursive: true });
    const existing = run(main, ["show-ref", "--verify", `refs/heads/${branch}`], { allowFailure: true });
    if (existing) run(main, ["worktree", "add", worktree, branch]);
    else run(main, ["worktree", "add", "-b", branch, worktree, baseRef]);
    if (info.has_remote) pushed = pushOrDefer(context, input, info, { cwd: worktree, args: ["-u", "origin", branch], ref: branch, dst: branch, upstream: true });
  }
  recordSessionWorktree(input, worktree, anchored);
  logEvent({ ev: "feature_worktree", plan: planSlug, feature: input.feature, branch, worktree, reattached }, anchored);
  return { ...info, worktree_path: worktree, branch, base_ref: baseRef, reattached, ...(pushed ? {} : { network_pending: true }) };
}

function prepare(context, input, info) {
  if (input.feature && loadConfig(context).planning?.featureBranches) return prepareFeature(context, input, info);
  const slug = input.slug || input.unit;
  if (!slug) throw new Error("prepare requires slug or unit");
  const worktree = safeWorktree(context, input.worktree_path, slug);
  const branch = input.branch || `feat/${slug}`;
  const baseRef = info.has_remote ? `origin/${info.base_branch}` : info.base_branch;
  fetchBase(context, context.root, input, info);
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
  fetchBase(context, context.root, input, info);
  run(worktree, ["merge", "--no-edit", baseRef]);
  return { ...info, worktree_path: worktree, base_ref: baseRef };
}

export { findGateCommand };

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
  noteUnenforced(cfg, context);
  if (land === "direct" && run(context.root, ["rev-parse", "--verify", "MERGE_HEAD"], { allowFailure: true })) {
    throw new Error("selected repository already has an in-progress merge");
  }
  const checkedOutBranch = run(worktree, ["branch", "--show-current"]);
  if (input.branch && input.branch !== checkedOutBranch) throw new Error(`requested branch ${input.branch} is not checked out in ${worktree}`);
  const branch = checkedOutBranch;
  if (run(worktree, ["status", "--porcelain"])) throw new Error("worktree is not clean before merge");
  verifyGateBeforeMerge(context, worktree);
  // ARCH-LAND-12: a unit PR targets its feature branch when one is given.
  if (land === "pr") return landPullRequest(context, input, input.feature_branch ? { ...info, base_branch: input.feature_branch } : info, { worktree, branch, cfg, runner: deps.runner });
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
  let pushed = true;
  let step = null; // the landing step that PARKs instead of throwing (ARCH-LAND-06)
  try {
    heartbeat(lock);
    if (!holder) run(at, ["checkout", info.base_branch]);
    if (info.has_remote && input.pull !== false) {
      heartbeat(lock);
      step = "ff-only";
      if (online(at, input)) {
        try { remote(at, ["pull", "--ff-only", "origin", info.base_branch]); }
        catch (error) { throw isUnreachable(error) ? networkError(error, fetchAction(info, info.base_branch)) : error; }
        recordFetch(info, info.base_branch);
      } else {
        requireFreshRef(at, info, info.base_branch, maxFetchAge(context), fetchAction(info, info.base_branch));
        run(at, ["merge", "--ff-only", `origin/${info.base_branch}`]);
      }
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
      pushed = pushOrDefer(context, input, info, { cwd: at, args: ["origin", info.base_branch], ref: info.base_branch, dst: info.base_branch });
      step = null;
    }
  } catch (error) {
    if (error?.needsNetwork) throw error;
    if (mergeStarted && step !== "rejected-push") {
      try { run(at, ["merge", "--abort"], { allowFailure: true }); } catch {}
    }
    // Untracked files in the way are a dirty checkout, not a conflict: throw.
    if (!step || /untracked working tree files would be overwritten/.test(`${error?.stderr || ""}${error?.message || ""}`)) throw error;
    // A refused push comes after the local merge, so local base holds it.
    return landingPark(step, { ...info, branch, land: "direct", merged: false, merged_locally: step === "rejected-push", worktree_path: worktree }, error);
  } finally {
    if (originalBranch && originalBranch !== info.base_branch) {
      try { run(context.root, ["checkout", originalBranch], { allowFailure: true }); } catch {}
    }
    releaseLock(lock);
  }
  return cleanupAfterLanding(context, input, info, { ...info, branch, land: "direct", merged: true, ...(pushed ? {} : { merged_locally: true, pushed: false, network_pending: true }) });
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
  let pushed = true;
  try {
    heartbeat(lock);
    if (input.pull !== false) fetchBase(context, context.root, { ...input, fetch: undefined }, info);
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
    pushed = pushOrDefer(context, input, info, { cwd: temp, args: ["origin", `HEAD:${info.base_branch}`], ref: "HEAD", dst: info.base_branch });
    step = null;
  } catch (error) {
    if (added && step === "conflict") run(temp, ["merge", "--abort"], { allowFailure: true });
    if (!step || error?.needsNetwork) throw error;
    return landingPark(step, result, error);
  } finally {
    if (added) run(context.root, ["worktree", "remove", temp], { allowFailure: true });
    fs.rmSync(temp, { recursive: true, force: true });
    run(context.root, ["worktree", "prune"], { allowFailure: true });
    releaseLock(lock);
  }
  return cleanupAfterLanding(context, input, info, { ...result, merged: true, ...(pushed ? {} : { pushed: false, network_pending: true }) });
}

// ARCH-LAND-14: a unit lands inside its feature's worktree (input.worktree_path):
// gate re-run, feature branch checked out, unit branch merged --no-ff, feature
// branch pushed, unit branch deleted. A conflict or refused push PARKs
// (ARCH-LAND-06); a PARKED or BLOCKED unit keeps its branch and the feature
// worktree is left clean on the feature branch.
function landUnit(context, input, info) {
  // ARCH-LAND-13: the feature worktree lives under the MAIN checkout, so paths
  // are checked against it, not the linked .claude/worktrees session root.
  const main = mainCheckoutRoot(context.root);
  const anchored = { ...context, root: main, stateDir: path.join(main, ".craftsman") };
  const worktree = safeWorktree(anchored, input.worktree_path, input.slug || input.unit);
  if (!sameRepository(worktree, context.root)) throw new Error(`worktree belongs to another repository: ${worktree}`);
  if (!input.unit && !input.branch) throw new Error("land-unit requires unit or branch");
  const unitBranch = input.branch || `feat/${input.unit}`;
  const feature = input.feature_branch || run(worktree, ["branch", "--show-current"]);
  if (!feature) throw new Error("land-unit needs a feature branch: worktree is detached");
  if (feature === unitBranch) throw new Error(`feature branch and unit branch are both ${feature}`);
  if (!run(context.root, ["rev-parse", "--verify", "--quiet", `refs/heads/${unitBranch}`], { allowFailure: true })) {
    throw new Error(`unit branch ${unitBranch} does not exist`);
  }
  if (run(worktree, ["status", "--porcelain"])) throw new Error("feature worktree is not clean before land-unit");
  if (run(worktree, ["rev-parse", "--verify", "MERGE_HEAD"], { allowFailure: true })) throw new Error("feature worktree has a merge in progress");
  const gateDir = input.unit_worktree ? safeWorktree(anchored, input.unit_worktree, input.unit) : worktree;
  verifyGateBeforeMerge(context, gateDir);
  const featureLock = acquireLock(featureLockInfo(info, feature), input);
  try {
    if (run(worktree, ["branch", "--show-current"]) !== feature) run(worktree, ["checkout", feature]);
    const result = { ...info, base_branch: feature, branch: unitBranch, feature_branch: feature, land: "unit", merged: false, merged_locally: false, worktree_path: worktree };
    let step = "conflict";
    try {
      run(worktree, ["merge", "--no-ff", "--no-edit", unitBranch]);
      step = null;
    } catch (error) {
      run(worktree, ["merge", "--abort"], { allowFailure: true });
      if (/untracked working tree files would be overwritten/.test(`${error?.stderr || ""}${error?.message || ""}`)) throw error;
      logEvent({ ev: "land_unit", unit: input.unit, branch: unitBranch, feature, ok: false, reason: "conflict" }, context);
      return landingPark("conflict", result, error);
    }
    run(worktree, ["merge-base", "--is-ancestor", unitBranch, "HEAD"]);
    const hasRemoteFeature = info.has_remote && input.push !== false;
    let pushedFeature = true;
    if (hasRemoteFeature) {
      try { pushedFeature = pushOrDefer(context, input, info, { cwd: worktree, args: ["-u", "origin", feature], ref: feature, dst: feature, upstream: true }); }
      catch (error) {
        if (error?.needsNetwork) throw error;
        logEvent({ ev: "land_unit", unit: input.unit, branch: unitBranch, feature, ok: false, reason: "rejected-push" }, context);
        return landingPark("rejected-push", { ...result, merged_locally: true }, error);
      }
    }
    if (input.unit_worktree && fs.existsSync(gateDir) && gateDir !== worktree) {
      run(context.root, ["worktree", "remove", gateDir]);
      forgetSessionWorktree(input, gateDir, context);
    }
    run(context.root, ["branch", "-D", unitBranch]); // merged into feature, verified above;
    let remoteDeleted = false;
    if (info.has_remote && run(context.root, ["rev-parse", "--verify", "--quiet", `refs/remotes/origin/${unitBranch}`], { allowFailure: true })) {
      remoteDeleted = deleteRemoteBranch(input, info, context.root, unitBranch);
    }
    const pushedOk = Boolean(hasRemoteFeature) && pushedFeature;
    logEvent({ ev: "land_unit", unit: input.unit, branch: unitBranch, feature, ok: true, pushed: pushedOk }, context);
    return { ...result, merged: true, merged_locally: true, pushed: pushedOk, ...(hasRemoteFeature && !pushedFeature ? { network_pending: true } : {}), branch_deleted: true, remote_branch_deleted: remoteDeleted, cleaned: false };
  } finally {
    releaseLock(featureLock);
  }
}

/**
 * Is `feature` the last feature of plan `slug`?
 * @returns {{ last: boolean } | { error: string }} `{ error }` when the plan
 *   index cannot be resolved; never folded into `last: false`.
 */
function isLastFeature(slug, feature, root) {
  try {
    return { last: resolvePlan(slug, { level: "epic", root }).features.at(-1)?.id === String(feature) };
  } catch (err) {
    if (!(err instanceof Error)) throw err;
    return { error: err.message };
  }
}

// ARCH-LAND-18: a finished feature (every row FEATURE_MERGED) lands on base: detached temp
// worktree at the approved head, base merged in, gate re-run, --no-ff, push; feature lock
// then base. Conflict, ff-only, red gate, rejected push PARK; never forced.
function landFeature(context, input, info, deps = {}) {
  if (input.feature !== undefined && input.feature !== null) assertFeatureId(input.feature);
  const config = loadConfig(context);
  if (!config.planning?.featureBranches) throw new Error("land-feature requires planning.featureBranches");
  if (!input.plan || !input.feature) throw new Error("land-feature requires plan and feature");
  if (!info.has_remote) throw new Error("land-feature requires an origin remote");
  const planSlug = path.basename(String(input.plan), ".md");
  const rows = currentState(context).filter((row) => path.basename(row.plan, ".md") === planSlug && row.feature === input.feature);
  if (!rows.length) throw new Error(`land-feature: no tracker rows for feature ${input.feature} of ${input.plan}`);
  const open = rows.filter((row) => row.status !== "FEATURE_MERGED");
  if (open.length) throw new Error(`land-feature refused: ${open.map((row) => `${row.unit} is ${row.status}`).join(", ")}; every unit must be FEATURE_MERGED`);
  // ARCH-TRACKER-08: open [feature:<id>] criteria (and, for the plan's last feature, untagged ones) refuse the landing.
  const main = mainCheckoutRoot(context.root);
  const acceptanceFile = path.join(main, ".craftsman", "acceptance.md");
  if (fs.existsSync(acceptanceFile)) {
    const text = fs.readFileSync(acceptanceFile, "utf8");
    const lastCheck = isLastFeature(planSlug, input.feature, main);
    const openCriteria = featureCriteria(text, input.feature, lastCheck.last === true).filter((c) => !c.done);
    if (lastCheck.error !== undefined) {
      // Fail closed: an unresolvable index cannot clear an open untagged line.
      const untagged = acceptanceCriteria(text).filter((c) => c.feature == null && !c.unit && !c.done);
      if (untagged.length) throw new Error(`land-feature refused: cannot resolve plan index to tell if ${input.feature} is last: ${lastCheck.error}`);
    }
    if (openCriteria.length) throw new Error(`land-feature refused: open acceptance criteria for feature ${input.feature}: ${openCriteria.map((c) => c.line.trim()).join(" | ")}`);
  }
  const slug = `${planSlug}-${input.feature}`;
  const feature = input.feature_branch || rows.find((row) => row.feature_branch)?.feature_branch || `feature/${slug}`;
  if (!run(context.root, ["rev-parse", "--verify", "--quiet", `refs/heads/${feature}`], { allowFailure: true })) {
    throw new Error(`feature branch ${feature} does not exist`);
  }
  const lastUnit = rows[rows.length - 1].unit;
  requireOnline(context.root, input, info, "land-feature");
  const units = rows.map((row) => row.unit);
  // lock first, then gate
  const featureLock = acquireLock(featureLockInfo(info, feature), input);
  let baseLock = null;
  let added = false;
  let step = null;
  const temp = path.join(info.common_git_dir, ".craftsman", "land", `feature-${slug}-${process.pid}`);
  const result = { ...info, branch: feature, feature_branch: feature, land: "feature", merged: false, merged_locally: false, park_unit: lastUnit, units };
  const tip = () => run(context.root, ["rev-parse", `refs/heads/${feature}`]);
  let gate, head;
  try {
    gate = gateFeature({ config, context, input, branch: feature });
    if (gate.park) return { ...result, ...gate.park };
    head = gate.head || tip();
    deps.afterGate?.();
    if ((gate.mode || landMode(config)) === "pr") return afterLand({ gate, mode: "open-pr", context }, landFeaturePullRequest(context, input, info, { feature, head, config, runner: deps.runner, units, lastUnit }));
    fetchBase(context, context.root, { ...input, fetch: undefined }, info);
    baseLock = acquireLock(info, input);
    fs.mkdirSync(path.dirname(temp), { recursive: true });
    run(context.root, ["worktree", "add", "--detach", temp, head]);
    added = true;
    heartbeat(baseLock);
    step = "conflict";
    run(temp, ["merge", "--no-edit", `origin/${info.base_branch}`]);
    step = "gate";
    verifyGateBeforeMerge(context, temp);
    step = null;
    const ready = run(temp, ["rev-parse", "HEAD"]);
    step = "ff-only";
    run(temp, ["merge-base", "--is-ancestor", `origin/${info.base_branch}`, ready]);
    run(temp, ["checkout", "--detach", `origin/${info.base_branch}`]);
    step = "conflict";
    run(temp, ["merge", "--no-ff", "--no-edit", ready]);
    step = null;
    heartbeat(baseLock);
    step = "rejected-push";
    pushOrDefer(context, input, info, { cwd: temp, args: ["origin", `HEAD:${info.base_branch}`], ref: "HEAD", dst: info.base_branch });
    step = null;
    result.merge_sha = run(temp, ["rev-parse", "HEAD"]);
  } catch (error) {
    if (added && step === "conflict") run(temp, ["merge", "--abort"], { allowFailure: true });
    if (!step || error?.needsNetwork) throw error;
    logEvent({ ev: "land_feature", plan: planSlug, feature: input.feature, ok: false, reason: step }, context);
    return landingPark(step, result, error);
  } finally {
    if (added) run(context.root, ["worktree", "remove", temp], { allowFailure: true });
    fs.rmSync(temp, { recursive: true, force: true });
    run(context.root, ["worktree", "prune"], { allowFailure: true });
    releaseLock(baseLock);
    releaseLock(featureLock);
  }
  const promoted = [];
  const promote_errors = [];
  for (const row of rows) {
    try {
      transition({ project: row.project, plan: row.plan, unit: row.unit, status: "COMPLETE", evidence: `land-feature ${result.merge_sha}`, session_id: input.session_id }, context);
      promoted.push(row.unit);
    } catch (error) { promote_errors.push(`${row.unit}: ${error.message}`); }
  }
  let cleaned = false;
  let remoteDeleted = false;
  if (input.cleanup !== false && tip() === head) {
    const worktree = path.join(mainCheckoutRoot(context.root), ".worktrees", slug);
    try {
      if (fs.existsSync(worktree)) {
        run(context.root, ["worktree", "remove", worktree]);
        forgetSessionWorktree(input, worktree, context);
      }
      run(context.root, ["worktree", "prune"]);
      run(context.root, ["branch", "-D", feature]); // merged into origin/<base> above
      cleaned = true;
      remoteDeleted = deleteRemoteBranch(input, info, context.root, feature);
    } catch (error) { result.cleanup_error = String(error.stderr || error.message).trim(); }
  }
  logEvent({ ev: "land_feature", plan: planSlug, feature: input.feature, ok: true, sha: result.merge_sha }, context);
  afterLand({ gate, sha: result.merge_sha, rows, context, retire: deps.retireCheck });
  return { ...result, merged: true, merged_locally: true, pushed: true, promoted, promote_errors, cleaned, remote_branch_deleted: remoteDeleted };
}

// ARCH-LAND-12: "pr" mode pushes the feature, opens or reuses its PR; nothing merges.
function landFeaturePullRequest(context, input, info, { feature, head, config, runner, units, lastUnit }) {
  const host = detectHost(info.origin, config.repoExec?.host);
  if (!host) throw new Error(`cannot tell which host ${info.origin} is on; set repoExec.host to github, gitlab or azure`);
  const options = {
    host, cwd: context.root, branch: feature, base: info.base_branch,
    autoMerge: config.repoExec?.autoMerge !== false,
    mergeMethod: config.repoExec?.mergeMethod || "merge",
  };
  preflightHost(options, runner);
  const result = { ...info, branch: feature, feature_branch: feature, land: "pr", merged: false, merged_locally: false, park_unit: lastUnit, units };
  try { remote(context.root, ["push", "-u", "origin", `${head}:refs/heads/${feature}`]); }
  catch (error) {
    if (isUnreachable(error)) throw networkError(error, retryAs(input));
    return landingPark("rejected-push", { ...result, pushed: false }, error);
  }
  const pr = openPullRequest({
    ...options,
    title: `Feature ${input.feature} of ${path.basename(String(input.plan), ".md")}`,
    body: `Landed by craftsman (repoExec.land: "pr").\n\n${units.map((unit) => `- ${unit}`).join("\n")}`,
  }, runner);
  const { auto_merge, auto_merge_error, ...request } = pr;
  if (auto_merge_error) return landingPark("auto-merge", { ...result, pushed: true, pr: request, auto_merge, auto_merge_error }, new Error(auto_merge_error));
  return { ...result, pushed: true, pr: request, auto_merge };
}

// Landing failures that PARK (ARCH-LAND-06): {parked:true, decision}, branch kept.
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
  gate: gatePark,
  "auto-merge": (r) => ({
    question: `${r.pr?.url || "The pull request"} for ${r.branch} is open, but the host refused auto-merge. How should it be merged?`,
    options: ["Merge the pull request by hand on the host", "Enable auto-merge for the repository and retry", "Leave the pull request open for review"],
    recommended: "Merge the pull request by hand on the host",
  }),
};

function landingPark(reason, result, error) {
  const output = `${error?.stderr || ""}${error?.stdout || ""}`.trim();
  const detail = scrub((output || String(error?.message || "")).trim().split("\n").slice(-10).join("\n"));
  return { ...result, parked: true, reason, error: detail, cleaned: false, decision: PARK_DECISIONS[reason](result) };
}

// "pr" mode: no lock, base untouched; push the unit branch, open or reuse its
// PR and ask for auto-merge. Every refusal is checked before the push.
function landPullRequest(context, input, info, { worktree, branch, cfg, runner }) {
  if (!info.has_remote) throw new Error(`repoExec.land is "pr" but ${info.project} has no origin remote`);
  requireOnline(worktree, input, info, 'repoExec.land "pr"');
  const host = detectHost(info.origin, cfg.repoExec?.host);
  if (!host) throw new Error(`cannot tell which host ${info.origin} is on; set repoExec.host to github, gitlab or azure`);
  const options = {
    host, cwd: worktree, branch, base: info.base_branch,
    autoMerge: cfg.repoExec?.autoMerge !== false,
    mergeMethod: cfg.repoExec?.mergeMethod || "merge",
  };
  preflightHost(options, runner);
  fetchBase(context, context.root, input, info);
  const subjects = run(worktree, ["log", "--reverse", "--format=%s", `origin/${info.base_branch}..${branch}`]);
  if (!subjects) throw new Error(`${branch} has no commits beyond origin/${info.base_branch}`);
  try { remote(worktree, ["push", "-u", "origin", branch]); }
  catch (error) {
    if (isUnreachable(error)) throw networkError(error, retryAs(input));
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
    remoteBranchDeleted = deleteRemoteBranch(input, info, context.root, branch);
  }
  return { ...info, cleaned: true, branch, branch_deleted: branchDeleted, remote_branch_deleted: remoteBranchDeleted };
}

// Root-only network phase (ARCH-LAND-19): fetch the base before a run, drain the
// queued pushes after it. Refuses to run where origin is unreachable.
function networkAction(context, input, info) {
  const step = input.step || "status";
  if (!["fetch", "drain", "status"].includes(step)) throw new Error("network step must be fetch, drain, or status");
  if (step === "status") return { ...info, network: networkMode(context.root, input), queue: readQueue(info).map(({ id, kind, dst, reason, queued_at }) => ({ id, kind, dst, reason, queued_at })) };
  if (!info.has_remote) return { ...info, step, pushed: [], parked: [] };
  if (input.network === "offline" || !online(context.root, { ...input, network: input.network ?? process.env.CRAFTSMAN_NETWORK })) {
    throw new NeedsNetwork(`network ${step} must run where origin is reachable, not in the sandbox`, { ...input, network: "online" });
  }
  if (step === "fetch") {
    for (const branch of [info.base_branch, ...(input.branches || [])]) {
      try { remote(context.root, ["fetch", "origin", branch]); }
      catch (error) { throw isUnreachable(error) ? networkError(error) : error; }
      recordFetch(info, branch);
    }
    return { ...info, step, fetched: [info.base_branch, ...(input.branches || [])] };
  }
  const { pushed, rejected } = drainQueue(context.root, info);
  logEvent({ ev: "network_drain", project: info.project, pushed: pushed.length, rejected: rejected.length }, context);
  return {
    ...info, step,
    pushed: pushed.map(({ dst, sha }) => ({ branch: dst, sha })),
    parked: rejected.map(({ entry, error }) => landingPark("rejected-push", { ...info, branch: entry.dst, base_branch: entry.dst, land: "direct", merged: false, merged_locally: true }, error)),
  };
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
    else if (input.action === "land-unit") result = landUnit(context, input, info);
    else if (input.action === "land-feature") result = landFeature(context, input, info);
    else if (input.action === "cleanup") result = cleanup(context, input, info);
    else if (input.action === "network") result = networkAction(context, input, info);
    else throw new Error("action must be inspect, prepare, sync, merge, land-unit, land-feature, cleanup, or network");
    process.stdout.write(JSON.stringify(result) + "\n");
  } catch (error) {
    if (error?.needsNetwork) {
      // One clear message naming the fix, plus the action root should run (ARCH-LAND-19).
      process.stdout.write(JSON.stringify({ needs_network: true, message: scrub(error.message), action: error.action || null }) + "\n");
      process.stderr.write(`craftsman: needs network: ${scrub(error.message)}\n`);
      process.exitCode = 3;
    } else {
      process.stderr.write(`craftsman: repository execution failed: ${scrub(error.message)}\n`);
      process.exitCode = 2;
    }
  }
}

export { inspectRepo, prepare, sync, merge, landUnit, landFeature, cleanup, networkAction, acquireLock, releaseLock, heartbeat, run };
