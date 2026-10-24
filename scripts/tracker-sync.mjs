#!/usr/bin/env node
// SessionStart, PostToolUse (Bash|Write|Edit) and Stop: keep the
// root TRACKER.md's generated ledger block equal to the ledger, whoever or
// whatever touched either. tracker.mjs already re-renders on every write it
// makes; this hook is the mechanical backstop — a hand edit of the block
// (Bash, a script, a merge), a ledger written by an older plugin version, or
// a session that only ever reads the tracker all converge here, without the
// model having to remember anything.
//
// On Stop only it also refreshes the export dashboard and notes (ARCH-VIEWS-05/13): when export.enabled and
// export.atStop hold and the input fingerprint changed, within a 6 s budget (child process, killed on overrun).
// SessionStart and PostToolUse never render.
//
// It never transitions a row and never arms the compact gate
// (wiring.test.mjs forbids that for every hook), and it always exits 0: a
// broken tracker must never block a tool call.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadConfig, enabled, isMain, projectContext, readStdin } from "./lib/core.mjs";
import { syncTrackerDoc, renderState } from "./tracker.mjs";
import { clearNotes, exportRoot, writeExportFile } from "./lib/export-notes.mjs";
import { logRender } from "./lib/dashboard.mjs";

export const RENDER_BUDGET_MS = 6000;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIGEST = path.join(HERE, "digest.mjs");

function walk(dir, out) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f, out); else stat(f, out);
  }
}
function stat(f, out) {
  try { const st = fs.statSync(f); out.push(`${f}|${st.mtimeMs}|${st.size}`); } catch { /* absent */ }
}

// Hash of the ledger plus mtimes and sizes of everything the dashboard and notes read.
export function inputFingerprint(context) {
  const parts = [JSON.stringify(renderState(context))];
  for (const d of ["docs/ideas", "docs/plans", "docs/architecture"]) walk(path.join(context.root, d), parts);
  for (const f of ["NEXT.md", "TRACKER-archive.md", "docs/plans/NEXT.md", "docs/plans/TRACKER-archive.md"]) stat(path.join(context.root, f), parts);
  return crypto.createHash("sha256").update(parts.map((p) => p.split(context.root).join("")).join("\n")).digest("hex");
}

export const fingerprintPath = (context) => path.join(exportRoot(context), ".fingerprint");

// Stop-time refresh. Returns "disabled" | "skipped" | "rendered" | "failed"; never throws.
export function stopRefresh(context, { budgetMs = RENDER_BUDGET_MS, script = DIGEST, args = ["--html"] } = {}) {
  try {
    const cfg = loadConfig(context).export || {};
    if (cfg.enabled === false) { clearNotes(context); return "disabled"; }
    if (cfg.atStop === false) return "disabled";
    const fp = inputFingerprint(context);
    const file = fingerprintPath(context);
    let prev = "";
    try { prev = fs.readFileSync(file, "utf8").trim(); } catch { /* first run */ }
    if (prev === fp) { logRender(context, { ms: 0, skipped: true }); return "skipped"; }
    const r = spawnSync(process.execPath, [script, ...args], { cwd: context.root, timeout: budgetMs, killSignal: "SIGKILL", stdio: "ignore" });
    if (r.error || r.status !== 0) return "failed";
    writeExportFile(context, ".fingerprint", fp + "\n");
    return "rendered";
  } catch { return "failed"; }
}

if (isMain(import.meta.url)) {
  try {
    const raw = await readStdin();
    let event = "";
    try { event = JSON.parse(raw || "{}").hook_event_name || ""; } catch { /* no payload */ }
    const context = projectContext(".");
    if (enabled(loadConfig(context), context)) {
      syncTrackerDoc(context);
      if (event === "Stop") stopRefresh(context);
    }
  } catch { /* fail open — bookkeeping only */ }
  process.exit(0);
}
