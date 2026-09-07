#!/usr/bin/env node
// Background test-state snapshot, spawned detached by session-context.mjs with
// the session id as argv[2]. Keeps session OPEN instant and records each
// session's OWN baseline at sessions/<sid>/session-start.json (no cross-session
// clobber). If the tree changes while the snapshot runs, no baseline is
// written; Stop then blocks a dirty session until a fresh baseline exists.
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { loadConfig, enabled, sessionDir, markerPresent, splitCmd, projectContext, git, sha1 } from "./lib/core.mjs";

const pexec = promisify(execFile);
const sid = (process.argv[2] || "shared").replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64) || "shared";
const context = projectContext(process.argv[3] || ".");
const startingTree = process.argv[4] || "";
const cfg = loadConfig(context);
if (!enabled(cfg) || cfg.stopGate?.enabled === false || cfg.stopGate?.snapshotAtStart === false) process.exit(0);

const entries = [];
for (const [m, cmd] of Object.entries(cfg.stopGate?.commands || {})) {
  if (await markerPresent(m, context)) entries.push(cmd);
}
if (!entries.length) process.exit(0);

const results = [];
for (const cmd of entries) {
  const [bin, ...args] = splitCmd(cmd);
  let green = false;
  try { await pexec(bin, args, { timeout: cfg.stopGate?.testTimeoutMs ?? 250000, maxBuffer: 8e6, cwd: context.root }); green = true; } catch {}
  results.push({ cmd, green });
}

const endingTree = sha1(`${(await git(["rev-parse", "HEAD"], context)).trim()}\n${await git(["status", "--porcelain", "--untracked-files=all"], context)}`);
if (startingTree && startingTree !== endingTree) process.exit(0);

try {
  const dir = sessionDir(sid, context);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "session-start.json"),
    JSON.stringify({ results, sid, project: context.id, project_root: context.root, ts: Date.now() }));
} catch {}
