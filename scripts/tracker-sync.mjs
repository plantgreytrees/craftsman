#!/usr/bin/env node
// SessionStart, PostToolUse (Bash|Write|Edit|MultiEdit) and Stop: keep the
// root TRACKER.md's generated ledger block equal to the ledger, whoever or
// whatever touched either. tracker.mjs already re-renders on every write it
// makes; this hook is the mechanical backstop — a hand edit of the block
// (Bash, a script, a merge), a ledger written by an older plugin version, or
// a session that only ever reads the tracker all converge here, without the
// model having to remember anything.
//
// Rendering only. It never transitions a row and never arms the compact gate
// (wiring.test.mjs forbids that for every hook), and it always exits 0: a
// broken tracker must never block a tool call.
import { loadConfig, enabled, projectContext, readStdin } from "./lib/core.mjs";
import { syncTrackerDoc } from "./tracker.mjs";

try {
  await readStdin();
  const context = projectContext(".");
  if (enabled(loadConfig(context), context)) syncTrackerDoc(context);
} catch { /* fail open — bookkeeping only */ }
process.exit(0);
