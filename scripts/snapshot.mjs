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
import { loadConfig, enabled, sessionDir, markerPresent, PROJECT_ROOT, splitCmd } from "./lib/core.mjs";

const pexec = promisify(execFile);
const sid = (process.argv[2] || "shared").replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64) || "shared";
const cfg = loadConfig();
if (!enabled(cfg) || cfg.stopGate?.enabled === false || cfg.stopGate?.snapshotAtStart === false) process.exit(0);

const entries = [];
for (const [m, cmd] of Object.entries(cfg.stopGate?.commands || {})) {
  if (await markerPresent(m)) entries.push(cmd);
}
if (!entries.length) process.exit(0);

const results = [];
for (const cmd of entries) {
  const [bin, ...args] = splitCmd(cmd);
  let green = false;
  try { await pexec(bin, args, { timeout: cfg.stopGate?.testTimeoutMs ?? 250000, maxBuffer: 8e6, cwd: PROJECT_ROOT }); green = true; } catch {}
  results.push({ cmd, green });
}

try {
  const dir = sessionDir(sid);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "session-start.json"),
    JSON.stringify({ results, sid, ts: Date.now() }));
} catch {}
