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
import { loadConfig, enabled, sessionDir } from "./lib/core.mjs";

const pexec = promisify(execFile);
const sid = (process.argv[2] || "shared").replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64) || "shared";
const cfg = loadConfig();
if (!enabled(cfg) || cfg.stopGate?.enabled === false || cfg.stopGate?.snapshotAtStart === false) process.exit(0);

function markerPresent(m) {
  if (m.includes("*")) {
    try {
      const re = new RegExp("^" + m.replace(/[.]/g, "\\.").replace(/\*/g, ".*") + "$");
      return fs.readdirSync(process.cwd()).some((f) => re.test(f));
    } catch { return false; }
  }
  return fs.existsSync(m);
}

const entry = Object.entries(cfg.stopGate?.commands || {}).find(([m]) => markerPresent(m));
if (!entry) process.exit(0);

const [, cmd] = entry;
const [bin, ...args] = cmd.split(" ");
let green = false;
try { await pexec(bin, args, { timeout: cfg.stopGate?.testTimeoutMs ?? 180000, maxBuffer: 8e6 }); green = true; } catch {}

try {
  const dir = sessionDir(sid);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "session-start.json"),
    JSON.stringify({ testsGreenAtStart: green, cmd, sid, ts: Date.now() }));
} catch {}
