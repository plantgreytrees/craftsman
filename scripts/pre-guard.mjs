#!/usr/bin/env node
// PreToolUse (Read|Glob|Grep|Write|Edit|MultiEdit|NotebookEdit): deterministic
// checks in a SINGLE process (one Node spawn per tool call) —
//   1. hard-block edits to protected / generated / lock / secret paths
//   2. enforce that only the doc-writing commands (/plan, /orchestrate,
//      /sync-docs, /idea, /architect) may edit the guarded docs/ paths
// Doc authority is SESSION-SCOPED: each session holds its own grant, so
// concurrent sessions never block or leak into one another.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { loadConfig, enabled, globToRe, STATE_DIR, PROJECT_ROOT, sidOf, sessionDir, logEvent, readStdin, readWorktreeBinding, mainCheckoutRoot } from "./lib/core.mjs";
import { readScope, requiredFile } from "./scope.mjs";
import { generatedBlock } from "./tracker.mjs";

let input = {};
try { input = JSON.parse(await readStdin() || "{}"); } catch { process.exit(0); }
const file = input?.tool_input?.file_path;
const tool = input.tool_name || "";
const toolInput = input.tool_input || {};
const target = file || toolInput.path;
const command = typeof toolInput.command === "string" ? toolInput.command : "";

function mutatesGit(value) {
  const command = value.replace(/\r?\n/g, ";");
  return /(?:^|[;&|]\s*)\s*git\s+(?:(?:-[A-Za-z]+\s+[^\s]+)\s+)*(?:add|apply|checkout|clean|commit|merge|mv|rebase|revert|rm|restore|reset|stash|switch|cherry-pick|push)\b|(?:^|[;&|]\s*)\s*git\s+branch\s+-[dD]\b|(?:^|[;&|]\s*)\s*git\s+worktree\s+(?:remove|move|prune)\b/.test(command);
}

function commandDirectoryTargets(command, worktree) {
  const targets = [];
  for (const match of command.matchAll(/\bgit\s+-C\s+(?:"([^"]+)"|'([^']+)'|(\S+))/g)) {
    targets.push(match[1] || match[2] || match[3]);
  }
  for (const match of command.matchAll(/(?:^|&&|;|\|\|)\s*(?:cd|pushd)\s+(?:"([^"]+)"|'([^']+)'|(\S+))/g)) {
    targets.push(match[1] || match[2] || match[3]);
  }
  return targets.some((target) => {
    const absolute = path.resolve(process.cwd(), target);
    let ancestor = absolute;
    while (!fs.existsSync(ancestor) && path.dirname(ancestor) !== ancestor) ancestor = path.dirname(ancestor);
    let resolved;
    try { resolved = path.resolve(fs.realpathSync(ancestor), path.relative(ancestor, absolute)); }
    catch { return true; }
    const realWorktree = fs.realpathSync(worktree);
    return resolved !== realWorktree && !resolved.startsWith(realWorktree + path.sep);
  });
}

function usesAlternateGitRoot(command) {
  return /\bgit\b[^;&|]*(?:--git-dir|--work-tree|--separate-git-dir)(?:[=\s])|\bGIT_DIR\s*=|\bGIT_WORK_TREE\s*=/.test(command);
}

function allowed(entry, candidate) {
  const pattern = entry.replaceAll(path.sep, "/").replace(/^\.\//, "");
  return globToRe(pattern).test(candidate) || globToRe(pattern).test("./" + candidate);
}

function searchRootAllowed(scope, candidate) {
  return scope.some((entry) => {
    const pattern = entry.replaceAll(path.sep, "/").replace(/^\.\//, "");
    return pattern.endsWith("/**") && candidate === pattern.slice(0, -3).replace(/\/$/, "");
  });
}

function scopeViolation(scope, candidates, buckets) {
  return candidates.find((candidate) => !buckets.some((bucket) =>
    scope[bucket].some((entry) => allowed(entry, candidate))
  ));
}

function orchestrationMetadataAllowed(active, candidate) {
  if (candidate === "docs/plans/TRACKER.md" || candidate === active.plan) return true;
  // The authoritative tracker sits in the main checkout, outside a unit's worktree.
  const root = path.resolve(active.project_root || PROJECT_ROOT);
  return path.resolve(root, candidate) === path.join(mainCheckoutRoot(root), "docs", "plans", "TRACKER.md");
}

// The checkout-relative docs/plans/TRACKER.md this absolute path IS, as
// { root, main } — or null when it is any other file.
function trackerTarget(absolute) {
  if (!/(?:^|[\\/])docs[\\/]plans[\\/]TRACKER\.md$/.test(absolute)) return null;
  let dir = path.dirname(absolute);
  while (!fs.existsSync(dir) && path.dirname(dir) !== dir) dir = path.dirname(dir);
  let root;
  try { root = execFileSync("git", ["-C", dir, "rev-parse", "--show-toplevel"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
  catch { return null; }
  const real = path.resolve(fs.realpathSync(dir), path.relative(dir, absolute));
  if (path.relative(root, real).split(path.sep).join("/") !== "docs/plans/TRACKER.md") return null;
  return { root, main: mainCheckoutRoot(root), real };
}

// The file as it would read after this Write/Edit/MultiEdit, or null when the
// edit can't apply (the tool then fails on its own; nothing to guard).
function afterEdit(current) {
  if (tool === "Write") return typeof toolInput.content === "string" ? toolInput.content : null;
  const edits = tool === "MultiEdit" ? toolInput.edits || [] : [toolInput];
  let text = current;
  for (const edit of edits) {
    if (typeof edit?.old_string !== "string" || typeof edit?.new_string !== "string" || !text.includes(edit.old_string)) return null;
    text = edit.replace_all ? text.split(edit.old_string).join(edit.new_string) : text.replace(edit.old_string, () => edit.new_string);
  }
  return text;
}

function projectAllowed(active, candidate) {
  const root = path.resolve(active.project_root || PROJECT_ROOT);
  const absolute = path.resolve(root, candidate);
  let ancestor = absolute;
  while (!fs.existsSync(ancestor) && path.dirname(ancestor) !== ancestor) ancestor = path.dirname(ancestor);
  let resolved;
  try { resolved = path.resolve(fs.realpathSync(ancestor), path.relative(ancestor, absolute)); }
  catch { return false; }
  const realRoot = fs.realpathSync(root);
  return resolved === realRoot || resolved.startsWith(realRoot + path.sep);
}

// Decide whether one Read/Glob/Grep/Write/Edit/MultiEdit/NotebookEdit call is
// inside the active unit scope. Checked in strict precedence order — each
// step below is a named, independently-testable reason a call is or isn't
// allowed, so a wrong verdict here (a leak, or a false block that burns a
// retry) can be traced to exactly one rule instead of one dense expression:
//   1. Tracker/plan-doc reads always pass — every unit needs its own
//      bookkeeping metadata regardless of scope.
//   2. A candidate outside the active project's root always fails, even for
//      an otherwise-scoped path — the workspace project boundary is absolute.
//   3. No resolvable target path at all fails closed.
//   4. A search tool (Glob/Grep) whose search ROOT itself sits under a
//      declared `<dir>/**` entry passes without checking every match inside.
//   5. Otherwise every candidate must match a declared entry in the given
//      scope buckets (read+docs for reads, write for writes).
function scopeVerdict(activeScope, tool, bucket, buckets, candidates) {
  if (bucket === "read" && candidates.length &&
      candidates.every((candidate) => orchestrationMetadataAllowed(activeScope, candidate))) {
    return null; // (1) tracker/plan metadata read
  }
  const projectViolation = candidates.find((candidate) => !projectAllowed(activeScope, candidate));
  if (projectViolation) return projectViolation; // (2) project-boundary violation

  if (!candidates.length) return "(missing target path)"; // (3) no target

  const isSearchTool = bucket === "read" && tool !== "Read";
  if (isSearchTool && searchRootAllowed(buckets.flatMap((name) => activeScope.scope[name]), candidates[0])) {
    return null; // (4) search root itself is a declared `**` allow-list entry
  }
  return scopeViolation(activeScope.scope, candidates, buckets); // (5) per-entry scope check
}

// Active scopes are created by /orchestrate immediately before delegation.
// Once present, this is fail-closed for implementation context: a missing or
// incorrect dependency must trigger re-analysis and an explicit scope refresh.
const activeScope = readScope(input);
const binding = readWorktreeBinding(input, activeScope?.project_root
  ? { root: activeScope.project_root, stateDir: path.join(activeScope.project_root, ".craftsman"), worktreePath: activeScope.worktree_path }
  : null);
const activeRoot = activeScope?.project_root || PROJECT_ROOT;
const activeContext = { root: activeRoot, stateDir: path.join(activeRoot, ".craftsman"), offFlag: path.join(activeRoot, ".craftsman", "off") };
const cfg = loadConfig(activeContext);
if (!enabled(cfg, activeContext)) process.exit(0);
const rel = target ? path.relative(activeRoot, target).split(path.sep).join("/") : "";
if (activeScope && ["Read", "Glob", "Grep", "Write", "Edit", "MultiEdit", "NotebookEdit"].includes(tool)) {
  if (activeScope.scope_ambiguous) {
    process.stderr.write(`craftsman: ${tool} blocked because more than one active project scope matches this session. Activate the intended project scope explicitly before retrying.\n`);
    process.exit(2);
  }
  const bucket = ["Write", "Edit", "MultiEdit", "NotebookEdit"].includes(tool) ? "write" : "read";
  const candidates = [];
  if (tool === "Read" || bucket === "write") {
    if (file) candidates.push(path.relative(activeRoot, file).split(path.sep).join("/"));
  } else {
    const searchRoot = toolInput.path || ".";
    candidates.push(path.relative(activeRoot, searchRoot).split(path.sep).join("/") || ".");
  }
  const buckets = bucket === "read" ? ["read", "docs"] : ["write"];
  const violation = scopeVerdict(activeScope, tool, bucket, buckets, candidates);
  if (violation) {
    const message = `craftsman: ${tool} blocked outside active unit scope (${activeScope.unit}). ` +
      `Required target: ${violation}. Stop and re-analyse the unit dependencies; add the exact ` +
      `source/doc path to the plan scope, then refresh it with ` +
      `node "${process.env.CLAUDE_PLUGIN_ROOT || "<plugin-root>"}/scripts/scope.mjs" ` +
      `using the session scope JSON before retrying. Repository-wide searches are forbidden.`;
    logEvent({ ev: "scope_blocked", sid: sidOf(input), tool, unit: activeScope.unit, target: violation });
    process.stderr.write(message + "\n");
    process.exit(2);
  }
}

// _shared-machinery.md's Standing constraints: "a hook rejection is fixed in
// the worktree, never bypassed (--no-verify is forbidden)" — prose only until
// now. Unconditional (not gated on an active worktree binding): this applies
// to every git commit/push regardless of whether orchestrate's worktree flow
// is even in play.
if (tool === "Bash" && /\bgit\s+(?:(?:-[A-Za-z]+(?:[=\s]\S+)?)\s+)*(?:commit|push)\b/.test(command)
    && /--no-verify\b|--no-gpg-sign\b|-c\s+commit\.gpgsign=false|-c\s+core\.hooksPath=/.test(command)) {
  logEvent({ ev: "verify_bypass_blocked", sid: sidOf(input), command });
  process.stderr.write(
    `craftsman: Git commit/push hook bypass BLOCKED (--no-verify / --no-gpg-sign / gpgsign=false / ` +
    `core.hooksPath override). Fix the underlying hook failure instead of skipping it — this is a ` +
    `hard rule, not a suggestion.\n`
  );
  process.exit(2);
}

if (tool === "Bash" && binding && mutatesGit(command)) {
  const cwd = path.resolve(process.cwd());
  const worktree = path.resolve(binding.worktree_path);
  if ((cwd !== worktree && !cwd.startsWith(worktree + path.sep)) || commandDirectoryTargets(command, worktree) || usesAlternateGitRoot(command)) {
    logEvent({ ev: "git_guard_blocked", sid: sidOf(input), unit: binding.unit, command });
    process.stderr.write(
      `craftsman: Git mutation blocked outside the active worktree (${binding.worktree_path}). ` +
      `Run implementation Git commands from that worktree, or release the binding before the locked merge.\n`
    );
    process.exit(2);
  }
  let branch = "";
  try { branch = execFileSync("git", ["branch", "--show-current"], { cwd, encoding: "utf8" }).trim(); } catch {}
  if (!branch || branch !== binding.branch) {
    logEvent({ ev: "git_guard_blocked", sid: sidOf(input), unit: binding.unit, command, branch });
    process.stderr.write(
      `craftsman: Git mutation blocked because the active worktree is on branch "${branch || "(detached)"}", ` +
      `not the bound branch "${binding.branch}".\n`
    );
    process.exit(2);
  }
}

if (!activeScope && fs.existsSync(requiredFile(input)) && ["Read", "Glob", "Grep", "Write", "Edit", "MultiEdit", "NotebookEdit"].includes(tool)) {
  process.stderr.write(
    `craftsman: ${tool} blocked because this session requires an active unit scope. ` +
    `Re-analyse the unit boundary, activate scripts/scope.mjs with the exact read/docs/write ` +
    `manifest, then retry.\n`
  );
  process.exit(2);
}

if (!file) process.exit(0);

// 0) One tracker, in the main checkout. A linked worktree's copy of
//    docs/plans/TRACKER.md is invisible to every other session until a merge
//    (and then conflicts with the root copy), so it is never written; in the
//    root copy, the ledger block is generated by tracker.mjs and the
//    tracker-sync hook, so a hand edit that changes it is refused.
const tracker = ["Write", "Edit", "MultiEdit"].includes(tool) ? trackerTarget(path.resolve(activeRoot, file)) : null;
if (tracker) {
  if (path.resolve(tracker.main) !== path.resolve(tracker.root)) {
    const rootDoc = path.join(tracker.main, "docs", "plans", "TRACKER.md");
    logEvent({ ev: "tracker_guard", sid: sidOf(input), file: tracker.real, result: "worktree-copy" });
    process.stderr.write(
      `craftsman: this worktree's docs/plans/TRACKER.md is BLOCKED — the tracker lives only in the main ` +
      `checkout so every session sees it: ${rootDoc}. Register or move rows with ` +
      `node "\${CLAUDE_PLUGIN_ROOT}/scripts/tracker.mjs" (the root file's ledger block re-renders itself); ` +
      `edit hand-written sections of ${rootDoc} directly.\n`
    );
    process.exit(2);
  }
  {
    let current = "";
    try { current = fs.readFileSync(tracker.real, "utf8"); } catch {}
    const next = afterEdit(current);
    if (next !== null && generatedBlock(next) !== generatedBlock(current)) {
      logEvent({ ev: "tracker_guard", sid: sidOf(input), file: tracker.real, result: "generated-block" });
      process.stderr.write(
        `craftsman: edit BLOCKED — it changes TRACKER.md's generated ledger block (between the ` +
        `craftsman:ledger markers). That block is rendered from .craftsman/tracker/events.jsonl: move the ` +
        `row with node "\${CLAUDE_PLUGIN_ROOT}/scripts/tracker.mjs" and it updates itself. Edit only the ` +
        `hand-written sections outside it.\n`
      );
      process.exit(2);
    }
  }
}

// 1) Protected paths — generated / vendored / lock / secret.
const hit = (cfg.protectedPaths || []).find((p) => globToRe(p).test(rel));
if (hit) {
  logEvent({ ev: "preguard", file: rel, pattern: hit, result: "blocked" });
  process.stderr.write(
    `craftsman: ${rel} is a protected path (matches "${hit}") — generated, vendored, ` +
    `lock, or secret file. Do not edit it directly. Change the source that generates it, ` +
    `or ask the user to make this change themselves.\n`
  );
  process.exit(2);
}

// 2) Doc-write authority — session-scoped.
const g = cfg.docWriteGuard || {};
const writeTool = ["Write", "Edit", "MultiEdit", "NotebookEdit"].includes(tool);
if (g.enabled !== false && writeTool) {
  const docPaths = g.docPaths || ["docs/**"];
  // The root tracker counts as a doc even when edited from a linked worktree,
  // where its worktree-relative path ("../../docs/…") matches no doc glob.
  const isDoc = Boolean(tracker) || docPaths.some((p) => globToRe(p).test(rel) || globToRe(p).test("./" + rel));
  if (isDoc) {
    const sid = sidOf(input);
    const marker = path.join(sessionDir(sid, activeContext), "doc-write");   // this session's own authority
    const pending = path.join(activeContext.stateDir, "doc-write-pending"); // grant dropped by doc-write.mjs
    const ttl = g.ttlMs ?? 3600000;
    const pendingTtl = g.pendingTtlMs ?? 1800000;
    let ok = false;

    // (a) this session already holds authority (refresh keeps long runs alive)
    try { if (Date.now() - fs.statSync(marker).mtimeMs < ttl) ok = true; } catch {}

    // (b) else CLAIM a fresh grant set by /plan|/orchestrate|/sync-docs. The grant
    //     is NOT consumed (so multiple concurrent writer sessions can each claim
    //     their own per-session marker); it simply expires by pendingTtl.
    if (!ok) {
      try {
        if (Date.now() - fs.statSync(pending).mtimeMs < pendingTtl) {
          fs.mkdirSync(sessionDir(sid, activeContext), { recursive: true });
          fs.writeFileSync(marker, `claimed ${new Date().toISOString()}\n`);
          ok = true;
        }
      } catch {}
    }

    if (ok) {
      try { const now = new Date(); fs.utimesSync(marker, now, now); } catch {} // keep alive for long writer commands
    } else {
      logEvent({ ev: "docguard", file: rel, sid, result: "blocked" });
      process.stderr.write(
        `craftsman: "${rel}" matches this repo's guarded doc path(s) (docWriteGuard.docPaths). ` +
        `Do NOT write it directly. Hand the change to /plan (plan docs + tracker rows) — or whichever ` +
        `command this repo's config designates for this path. If you ARE that command, first run: ` +
        `node "\${CLAUDE_PLUGIN_ROOT}/scripts/doc-write.mjs" on\n`
      );
      process.exit(2);
    }
  }
}

process.exit(0);
