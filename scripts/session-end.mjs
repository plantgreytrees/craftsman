#!/usr/bin/env node
// SessionEnd: print the unpushed-work report and the session's hand-off to stderr, the one channel
// the docs say the user sees at exit (ARCH-SAFETY-06). SessionEnd has no decision control, so this never
// blocks, and it never throws: a broken report must not make ending a session fail. No SubagentStop
// is registered anywhere (ARCH-STATE-07).
import fs from "node:fs";
import path from "node:path";
import { loadConfig, projectContext, readStdin, safetyEnabled, sessionDir, sidOf } from "./lib/core.mjs";
import { formatReport, unpushedReport } from "./lib/unpushed.mjs";

try {
  let input = {};
  try { input = JSON.parse(await readStdin() || "{}"); } catch { /* bad input: report anyway, from the project root */ }
  if (!input || typeof input !== "object") input = {};
  if (safetyEnabled()) {
    const context = projectContext(input.project || ".");
    loadConfig(context);
    const parts = [formatReport(unpushedReport(context.root).lines)];
    try {
      const handoff = JSON.parse(fs.readFileSync(path.join(sessionDir(sidOf(input), context), "handoff.json"), "utf8"));
      if (handoff?.plan) parts.push(`craftsman hand-off: plan ${handoff.plan}; unit ${handoff.unit || "phase"}; next: ${handoff.next_action}`);
    } catch { /* no hand-off for this session */ }
    const text = parts.filter(Boolean).join("\n");
    if (text) process.stderr.write(text + "\n");
  }
} catch { /* never block, never throw */ }
process.exit(0);
