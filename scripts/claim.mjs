#!/usr/bin/env node
// Atomically claim one plan unit so concurrent orchestrators cannot execute it twice.
import fs from "node:fs";
import path from "node:path";
import { atomicWrite, logEvent, projectContext, readStdin, sidOf } from "./lib/core.mjs";

export function claimPath(plan, unit, project = ".", context = null) {
  const key = `${project}--${plan}--${unit}`.replace(/[^A-Za-z0-9_.-]/g, "_");
  return path.join(context?.stateDir || projectContext(project).stateDir, "claims", `${key}.lock`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const input = JSON.parse(await readStdin() || "{}");
    if (!input.plan || !input.unit) throw new Error("claim requires plan and unit");
    const context = projectContext(input.project || ".");
    const lock = claimPath(input.plan, input.unit, input.project || ".", context);
    if (input.action === "release") {
      let owner;
      try { owner = JSON.parse(fs.readFileSync(path.join(lock, "owner.json"), "utf8")); } catch {}
      if (owner && owner.session_id !== sidOf(input)) throw new Error("unit is owned by another session");
      fs.rmSync(lock, { recursive: true, force: true });
      logEvent({ ev: "unit_released", sid: sidOf(input), plan: input.plan, unit: input.unit });
      process.stdout.write(`unit released: ${input.unit}\n`);
      process.exit(0);
    }
    fs.mkdirSync(path.dirname(lock), { recursive: true });
    try {
      fs.mkdirSync(lock);
    } catch (error) {
      if (error.code === "EEXIST") {
        try {
          const owner = JSON.parse(fs.readFileSync(path.join(lock, "owner.json"), "utf8"));
          if (owner.session_id === sidOf(input)) {
            process.stdout.write(`unit already claimed by this session: ${input.unit}\n`);
            process.exit(0);
          }
        } catch {}
        process.stderr.write(`craftsman: unit already claimed: ${input.plan} / ${input.unit}\n`);
        process.exit(2);
      }
      throw error;
    }
    atomicWrite(path.join(lock, "owner.json"), JSON.stringify({
      session_id: sidOf(input), plan: input.plan, unit: input.unit, project: input.project || ".",
      claimed_at: new Date().toISOString(), project_root: context.root,
    }, null, 2) + "\n");
    logEvent({ ev: "unit_claimed", sid: sidOf(input), plan: input.plan, unit: input.unit });
    process.stdout.write(`unit claimed: ${input.unit}\n`);
  } catch (error) {
    process.stderr.write(`craftsman: unit claim failed: ${error.message}\n`);
    process.exitCode = 2;
  }
}
