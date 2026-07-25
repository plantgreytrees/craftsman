#!/usr/bin/env node
// Grants doc-write authority. Run ONLY by /plan, /orchestrate and /sync-docs as
// their first action. Writes a short-lived global "grant"; the PreToolUse guard
// (which alone knows the session id) claims it into a per-session marker on that
// session's first docs/ write. This indirection exists because command-run
// scripts get no session_id (only hooks do), yet authority must be per-session
// so concurrent sessions never clear each other's. Everything else is blocked by
// pre-guard.mjs (doc-authority check).
import fs from "node:fs";
import path from "node:path";
import { STATE_DIR } from "./lib/core.mjs";

const pending = path.join(STATE_DIR, "doc-write-pending");
fs.mkdirSync(STATE_DIR, { recursive: true });
const arg = (process.argv[2] || "on").toLowerCase();
if (arg === "off") {
  try { fs.unlinkSync(pending); } catch {}
  console.log("doc-write grant cleared.");
} else {
  fs.writeFileSync(pending, `granted ${new Date().toISOString()}\n`);
  console.log("doc-write authority granted for this session — files under docs/ are now editable this turn.");
}
