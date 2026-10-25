#!/usr/bin/env node
// Routes the advisory `ui` gate (ARCH-GATES-01..06): to the optional Artist
// plugin when it is installed, enabled and the project has a format-2
// DESIGN.md, otherwise to the built-in accessibility floor (ui-ux-reviewer).
//
// Usage: node ui-gate.mjs <worktree> <base-ref>
// Prints one JSON object {route, reason, reuse?, critic?, a11y, steps} and
// exits 0 always: every outcome is advisory, a failure falls back.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const execFileAsync = promisify(execFile);
const KEY = "artist@artist-marketplace";
const REUSE_TIMEOUT_MS = 60_000;

const A11Y_STEP = "dispatch ui-ux-reviewer with the diff";
const REUSE_STEP = "report reuse.json findings (advisory)";
const criticStep = (c) =>
  `dispatch artist:design-critic once with only <${path.dirname(c.report)}/ screenshots, ${c.report}, ${c.design}, ${c.rubric}>; ` +
  "if blocked (not in execution.builtinAgents) apply its brief yourself, labelled NOT ISOLATED; never retry";

function fallback(reason) {
  return { route: "fallback", reason, a11y: true, steps: [A11Y_STEP] };
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}

const inside = (parent, child) => child === parent || child.startsWith(parent + path.sep);

function findInstall(home, mainRoot) {
  const file = path.join(home, ".claude", "plugins", "installed_plugins.json");
  const data = readJson(file);
  if (!data || typeof data !== "object") return { reason: "installed_plugins.json missing or unreadable" };
  const entries = data.plugins?.[KEY];
  if (!Array.isArray(entries) || entries.length === 0) return { reason: `${KEY} not installed` };
  const mainReal = realOr(mainRoot);
  const mine = entries.filter((e) => e && (e.scope === "user" || (e.projectPath && realOr(e.projectPath) === mainReal)));
  if (mine.length === 0) return { reason: `${KEY} not installed for this user or project` };
  let pluginsDir;
  try { pluginsDir = fs.realpathSync(path.join(home, ".claude", "plugins")); } catch { return { reason: "installPath outside ~/.claude/plugins/ (plugins dir missing)" }; }
  for (const e of mine) {
    try {
      const real = fs.realpathSync(e.installPath);
      if (inside(pluginsDir, real) && real !== pluginsDir && fs.statSync(path.join(real, "scripts", "reuse-check.mjs")).isFile()) return { installPath: real };
    } catch { /* try the next entry */ }
  }
  return { reason: "installPath outside ~/.claude/plugins/ or lacks scripts/reuse-check.mjs" };
}

function realOr(p) {
  try { return fs.realpathSync(p); } catch { return path.resolve(p); }
}

// Claude Code precedence: local > project > user; the first that sets the key wins.
function enabled(home, mainRoot) {
  for (const f of [
    path.join(mainRoot, ".claude", "settings.local.json"),
    path.join(mainRoot, ".claude", "settings.json"),
    path.join(home, ".claude", "settings.json"),
  ]) {
    const v = readJson(f)?.enabledPlugins?.[KEY];
    if (v !== undefined) return v === true;
  }
  return false;
}

function designOf(worktree) {
  for (const f of [path.join(worktree, "docs", "design", "DESIGN.md"), path.join(worktree, "DESIGN.md")]) {
    if (fs.existsSync(f)) return f;
  }
  return null;
}

function isFormat2(file) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(fs.readFileSync(file, "utf8"));
  return !!m && /^format:\s*2\s*$/m.test(m[1]);
}

async function git(cwd, args) {
  return (await execFileAsync("git", args, { cwd, maxBuffer: 16 * 1024 * 1024 })).stdout;
}

async function newestReport(worktree) {
  const lists = await Promise.all([
    git(worktree, ["ls-files", "-z", "--others", "--exclude-standard"]),
    git(worktree, ["ls-files", "-z", "--others", "--ignored", "--exclude-standard"]),
  ]);
  const found = new Set();
  for (const rel of lists.join("\0").split("\0")) {
    if (/^\.artist\/runs\/[^/]+\/report\.json$/.test(rel)) found.add(rel);
  }
  let best = null;
  for (const rel of found) {
    const abs = path.join(worktree, rel);
    let m;
    try { m = fs.statSync(abs).mtimeMs; } catch { continue; }
    if (!best || m > best.m || (m === best.m && abs > best.abs)) best = { abs, m };
  }
  return best?.abs ?? null;
}

async function route(worktreeArg, baseRef) {
  const home = os.homedir();
  const worktree = realOr(worktreeArg);
  let mainRoot;
  try {
    const common = (await git(worktree, ["rev-parse", "--git-common-dir"])).trim();
    mainRoot = path.dirname(realOr(path.resolve(worktree, common)));
  } catch (e) {
    return fallback(`not a git worktree: ${firstLine(e)}`);
  }

  const inst = findInstall(home, mainRoot);
  if (!inst.installPath) return fallback(inst.reason);
  if (!enabled(home, mainRoot)) return fallback(`${KEY} not enabled (local > project > user settings)`);
  const design = designOf(worktree);
  if (!design) return fallback("no DESIGN.md (docs/design/DESIGN.md or DESIGN.md)");
  if (!isFormat2(design)) return fallback("DESIGN.md is not format 2");

  let mergeBase;
  try {
    mergeBase = (await git(worktree, ["merge-base", baseRef, "HEAD"])).trim();
    if (!mergeBase) throw new Error("empty");
  } catch (e) {
    return fallback(`merge-base unresolvable for ${baseRef}: ${firstLine(e)}`);
  }

  let reuse;
  try {
    const parent = path.join(mainRoot, ".craftsman", "ui-gate");
    fs.mkdirSync(parent, { recursive: true });
    const runDir = fs.mkdtempSync(path.join(parent, "run-"));
    const script = path.join(inst.installPath, "scripts", "reuse-check.mjs");
    const json = path.join(runDir, "reuse.json");
    let code = 0;
    let stderr = "";
    try {
      const r = await execFileAsync(process.execPath, [script, "--project", worktree, "--run", runDir, "--base", mergeBase], { timeout: REUSE_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 });
      stderr = r.stderr;
    } catch (e) {
      if (e.killed || typeof e.code !== "number") return fallback(`reuse-check failed: ${e.killed ? "timed out" : firstLine(e)}`);
      code = e.code;
      stderr = e.stderr || "";
    }
    // exit 1 is "findings"; an uncaught throw also exits 1 but leaves no reuse.json.
    if (code === 2 || (code === 1 && !fs.existsSync(json)) || code > 2) {
      return fallback(`reuse-check exit ${code}: ${String(stderr).trim().split("\n").slice(0, 3).join(" ").slice(0, 400)}`);
    }
    reuse = { exit: code, json };
  } catch (e) {
    return fallback(`reuse-check failed: ${firstLine(e)}`);
  }

  const out = { route: "artist", reason: "artist installed, enabled, format-2 DESIGN.md", reuse, a11y: true, steps: [] };
  let report = null;
  try { report = await newestReport(worktree); } catch { /* no report -> a11y floor */ }
  if (report) {
    out.critic = { report, design, rubric: path.join(inst.installPath, "skills", "create", "references", "rubric.md") };
    out.a11y = false;
  }
  if (out.a11y) out.steps.push(A11Y_STEP);
  out.steps.push(REUSE_STEP);
  if (out.critic) out.steps.push(criticStep(out.critic));
  return out;
}

function firstLine(e) {
  return String(e?.stderr || e?.message || e).trim().split("\n")[0].slice(0, 300);
}

const [worktreeArg, baseRef] = process.argv.slice(2);
let result;
if (!worktreeArg || !baseRef || baseRef.startsWith("-")) {
  process.stderr.write("usage: ui-gate.mjs <worktree> <base-ref>\n");
  result = fallback("usage error");
} else {
  try { result = await route(worktreeArg, baseRef); } catch (e) { result = fallback(`ui-gate error: ${firstLine(e)}`); }
}
process.stdout.write(JSON.stringify(result) + "\n");
process.exit(0);
