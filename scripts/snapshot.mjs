#!/usr/bin/env node
// Background test-state snapshot, spawned detached by session-context.mjs with
// the session id as argv[2]. Keeps session OPEN instant and records each
// session's OWN baseline at sessions/<sid>/session-start.json (no cross-session
// clobber). If it hasn't finished by Stop, that session's Stop skips the
// regression check (safe).
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { gateUsable } from "./lib/gate-command.mjs";
import { isScoped } from "./lib/changed.mjs";
import { withoutCraftsmanState } from "./lib/craftsman-state.mjs";
import { loadConfig, enabled, sessionDir, markerPresent, splitCmd, projectContext, git, sha1 } from "./lib/core.mjs";

const pexec = promisify(execFile);
const sid = (process.argv[2] || "shared").replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64) || "shared";
const context = projectContext(process.argv[3] || ".");
const startingTree = process.argv[4] || "";
const cfg = loadConfig(context);
if (!enabled(cfg) || cfg.stopGate?.enabled === false || cfg.stopGate?.snapshotAtStart === false) process.exit(0);

const entries = [];
for (const [m, cmd] of Object.entries(cfg.stopGate?.commands || {})) {
  if (await markerPresent(m, context) && gateUsable(context.root, m, cmd, { markerOk: true })) entries.push(cmd);
}
if (!entries.length) process.exit(0);

const results = [];
for (const cmd of entries) {
  // A scoped command (`{changed}` / `{changedDirs}`, whole or embedded) has no whole-tree baseline: Stop derives it from
  // config and runs it against the session change list, so it is neither run here nor listed (ARCH-STATE-21).
  if (isScoped(cmd)) continue;
  const [bin, ...args] = splitCmd(cmd);
  let green = false;
  try { await pexec(bin, args, { timeout: cfg.stopGate?.testTimeoutMs ?? 250000, maxBuffer: 8e6, cwd: context.root }); green = true; } catch (error) {
    // A program that is not installed was never a red test: skipped like a scoped command, so Stop has no baseline entry to call red-at-start (ARCH-STATE-22).
    if (error?.code === "ENOENT") continue;
  }
  results.push({ cmd, green });
}

// Craftsman's own state is not the user's work: a repo that does not gitignore `.craftsman/` must not drop its baseline for it (ARCH-STATE-04).
const endingTree = sha1(`${(await git(["rev-parse", "HEAD"], context)).trim()}\n${withoutCraftsmanState(await git(["status", "--porcelain", "--untracked-files=all"], context))}`);
if (startingTree && startingTree !== endingTree) process.exit(0);

try {
  const dir = sessionDir(sid, context);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "session-start.json"),
    JSON.stringify({ results, sid, project: context.id, project_root: context.root, ts: Date.now() }));
} catch {}
