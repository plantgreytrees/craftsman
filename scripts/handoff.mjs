#!/usr/bin/env node
// Persist the small, durable hand-off that the next compact/clear session needs.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { atomicWrite, logEvent, projectContext, readStdin, sessionDir, sidOf } from "./lib/core.mjs";
import { recordMemory } from "./plan-memory.mjs";

export function handoffFile(input) {
  const context = projectContext(input.project || ".");
  return path.join(sessionDir(sidOf(input), context), "handoff.json");
}

export function normalizeHandoff(value, context = null) {
  if (!value || typeof value !== "object") throw new Error("handoff must be a JSON object");
  const required = ["plan", "next_action"];
  for (const key of required) {
    if (typeof value[key] !== "string" || !value[key].trim()) {
      throw new Error(`handoff.${key} must be a non-empty string`);
    }
  }
  const state = {
    plan: value.plan,
    unit: value.unit || null,
    completed_units: Array.isArray(value.completed_units) ? value.completed_units : [],
    remaining_units: Array.isArray(value.remaining_units) ? value.remaining_units : [],
    changed_files: Array.isArray(value.changed_files) ? value.changed_files : [],
  };
  let commit = null;
  try {
    if (context?.root) commit = execFileSync("git", ["-C", context.root, "rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {}
  return {
    ...value,
    handoff_id: crypto.randomUUID(),
    session_id: value.session_id || null,
    written_at: new Date().toISOString(),
    state_hash: crypto.createHash("sha256").update(JSON.stringify(state)).digest("hex").slice(0, 16),
    project_root: context?.root || null,
    repository_commit: commit,
    ...state,
    memory_entries: Array.isArray(value.memory_entries) ? value.memory_entries : [],
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const input = JSON.parse(await readStdin() || "{}");
    const handoff = normalizeHandoff(input, projectContext(input.project || "."));
    atomicWrite(handoffFile(input), JSON.stringify(handoff, null, 2) + "\n");
    for (const entry of handoff.memory_entries) {
      try {
        recordMemory({ ...entry, plan: entry.plan || handoff.plan, unit: entry.unit || handoff.unit,
          scope_id: entry.scope_id || handoff.scope_id, project: input.project || "." });
      } catch (error) {
        logEvent({ ev: "memory_record_failed", sid: sidOf(input), plan: handoff.plan, unit: handoff.unit || null, error: error.message });
      }
    }
    logEvent({ ev: "handoff_written", sid: sidOf(input), plan: handoff.plan, unit: handoff.unit || null });
    process.stdout.write(`handoff written: ${handoffFile(input)}\n`);
  } catch (error) {
    process.stderr.write(`handoff failed: ${error.message}\n`);
    process.exitCode = 2;
  }
}

export function readHandoff(input) {
  try { return JSON.parse(fs.readFileSync(handoffFile(input), "utf8")); }
  catch { return null; }
}
