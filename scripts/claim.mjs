#!/usr/bin/env node
// Atomically claim one plan unit so concurrent orchestrators cannot execute it twice.
import fs from "node:fs";
import path from "node:path";
import { atomicWrite, isMain, liveClaudeSession, logEvent, mainCheckoutRoot, projectContext, readStdin, sidOf } from "./lib/core.mjs";

export function claimPath(plan, unit, project = ".", context = null) {
  const key = `${project}--${plan}--${unit}`.replace(/[^A-Za-z0-9_.-]/g, "_");
  // Anchored at the main checkout so root and linked-worktree sessions share one lock directory.
  const root = context?.root || (context?.stateDir ? null : projectContext(project).root);
  const state = root ? path.join(mainCheckoutRoot(root), ".craftsman") : context.stateDir;
  return path.join(state, "claims", `${key}.lock`);
}

// Hand a claim to the session that replaced its owner (e.g. after an account
// switch opened a new session). Only the named previous owner can be replaced,
// so a live claim from an unrelated session is never taken, nor one whose
// owner is still running.
export function transferClaim(lock, fromSid, toSid, context = null) {
  const ownerFile = path.join(lock, "owner.json");
  const owner = JSON.parse(fs.readFileSync(ownerFile, "utf8"));
  if (owner.session_id !== fromSid) throw new Error(`unit is owned by ${owner.session_id}, not ${fromSid}`);
  if (fromSid === toSid) return owner;
  const pid = liveClaudeSession(fromSid);
  if (pid) throw new Error(`session ${fromSid} is still running (pid ${pid})`);
  const next = { ...owner, session_id: toSid, transferred_from: fromSid, transferred_at: new Date().toISOString() };
  atomicWrite(ownerFile, JSON.stringify(next, null, 2) + "\n");
  logEvent({ ev: "unit_transferred", sid: toSid, plan: owner.plan, unit: owner.unit, previous_session: fromSid }, context);
  return next;
}

if (isMain(import.meta.url)) {
  try {
    const input = JSON.parse(await readStdin() || "{}");
    if (!input.plan || !input.unit) throw new Error("claim requires plan and unit");
    const context = projectContext(input.project || ".");
    const lock = claimPath(input.plan, input.unit, input.project || ".", context);
    if (input.action === "recover") {
      if (input.confirm !== true) throw new Error("claim recovery requires confirm:true");
      let owner;
      try { owner = JSON.parse(fs.readFileSync(path.join(lock, "owner.json"), "utf8")); } catch {}
      const claimedAt = Date.parse(owner?.claimed_at || "") || 0;
      const staleAfter = Number(input.stale_after_ms) || 24 * 3600 * 1000;
      if (!owner || !claimedAt || Date.now() - claimedAt <= staleAfter) {
        throw new Error("unit claim is missing or not stale enough to recover");
      }
      fs.rmSync(lock, { recursive: true, force: true });
      logEvent({ ev: "unit_recovered", sid: sidOf(input), plan: input.plan, unit: input.unit, previous_session: owner.session_id });
      process.stdout.write(`stale unit claim recovered: ${input.unit}\n`);
      process.exit(0);
    }
    if (input.action === "transfer") {
      if (input.confirm !== true) throw new Error("claim transfer requires confirm:true");
      if (!input.from_session) throw new Error("claim transfer requires from_session");
      transferClaim(lock, sidOf({ session_id: input.from_session }), sidOf(input), context);
      process.stdout.write(`unit claim transferred: ${input.unit}\n`);
      process.exit(0);
    }
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
