#!/usr/bin/env node
// Structured tracker ledger. TRACKER.md remains the human-readable projection.
import fs from "node:fs";
import path from "node:path";
import {
  atomicWrite, logEvent, projectContext, readStdin, sidOf,
  requireCompact, COMPACT_REQUIRED_NOTICE,
  loadConfig, enabled, acceptancePath, uncheckedAcceptance,
} from "./lib/core.mjs";

export const STATUSES = ["PENDING", "IN_PROGRESS", "MERGED", "COMPLETE", "BLOCKED", "PARKED", "CANCELLED"];
// Landing on one of these ends the unit. A normal merge also reaches
// handoff.mjs, which arms the gate itself; PARK/BLOCKED exits (max-retry or
// max-round outs — precisely the worst-case-context units) often don't, so the
// transition arms it too. Both writes are idempotent, so the overlap is free.
export const TERMINAL_STATUSES = new Set(["MERGED", "COMPLETE", "BLOCKED", "PARKED", "CANCELLED"]);
const TRANSITIONS = {
  PENDING: new Set(["IN_PROGRESS", "CANCELLED", "BLOCKED"]),
  IN_PROGRESS: new Set(["MERGED", "BLOCKED", "PARKED", "CANCELLED"]),
  MERGED: new Set(["COMPLETE", "BLOCKED"]),
  COMPLETE: new Set(),
  BLOCKED: new Set(["PENDING", "IN_PROGRESS", "CANCELLED"]),
  PARKED: new Set(["PENDING", "IN_PROGRESS", "CANCELLED"]),
  CANCELLED: new Set(),
};

function keyOf(row) {
  return [row.project || ".", row.plan, row.unit].join("::");
}

function validateIdentity(row) {
  if (!row || typeof row !== "object") throw new Error("tracker row must be an object");
  for (const field of ["plan", "unit"]) {
    if (typeof row[field] !== "string" || !row[field].trim()) throw new Error(`tracker row needs ${field}`);
  }
  if (row.project !== undefined && (typeof row.project !== "string" || !row.project.trim())) {
    throw new Error("tracker row has an invalid project");
  }
  if (row.plan.startsWith("/") || row.plan.split(/[\\/]/).includes("..")) throw new Error("tracker plan must be relative");
}

function validateTransition(from, to, evidence) {
  if (!STATUSES.includes(to)) throw new Error(`invalid tracker status: ${to}`);
  if (from && from !== to && !TRANSITIONS[from]?.has(to)) throw new Error(`illegal tracker transition: ${from} -> ${to}`);
  if (["MERGED", "COMPLETE", "BLOCKED", "PARKED", "CANCELLED"].includes(to) && (!evidence || !String(evidence).trim())) {
    throw new Error(`${to} requires evidence`);
  }
}

// A unit is not done while its own acceptance criteria are unticked. This is
// the one mechanical "you are done / you are not" signal a unit gets before
// its hand-off: the transition fails and names what is left, instead of the
// model deciding it is finished and the Stop gate objecting a session later.
// Only `[unit:<id>]`-tagged lines count here; untagged whole-plan criteria
// stay with the Stop gate.
function assertUnitAcceptance(input, status, context) {
  if (status !== "MERGED" && status !== "COMPLETE") return;
  const cfg = loadConfig(context);
  if (!enabled(cfg, context) || cfg.stopGate?.enabled === false || cfg.stopGate?.requireAcceptanceCriteria === false) return;
  let text = "";
  try { text = fs.readFileSync(acceptancePath(context), "utf8"); } catch { return; }
  const ids = new Set([input.unit, input.scope_id].filter(Boolean));
  const open = uncheckedAcceptance(text).filter((c) => c.unit && ids.has(c.unit));
  if (open.length) {
    throw new Error(
      `${status} refused: unit ${input.unit} has ${open.length} unticked acceptance criteria in ` +
      `.craftsman/acceptance.md. Verify each against the merged code and tick it only if genuinely ` +
      `satisfied; otherwise implement it (or PARK/BLOCK the unit):\n${open.map((c) => c.line).join("\n")}`
    );
  }
}

export function ledgerPath(context = projectContext(".")) {
  return path.join(context.stateDir, "tracker", "events.jsonl");
}

function readEvents(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

export function currentState(context = projectContext(".")) {
  const state = new Map();
  for (const event of readEvents(ledgerPath(context))) {
    const previous = state.get(event.key);
    validateTransition(previous?.status, event.status, event.evidence);
    state.set(event.key, { ...previous, ...event });
  }
  return [...state.values()];
}

function withLock(file, action) {
  const lock = `${file}.lock`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try { fs.mkdirSync(lock); }
  catch (error) { throw new Error(`tracker ledger is busy: ${file}`); }
  try { return action(); }
  finally { fs.rmSync(lock, { recursive: true, force: true }); }
}

export function transition(input, context = projectContext(input.project || ".")) {
  validateIdentity(input);
  const file = ledgerPath(context);
  return withLock(file, () => {
    const state = currentState(context);
    const key = keyOf(input);
    const previous = state.find((row) => row.key === key);
    const status = input.status || (previous ? "IN_PROGRESS" : "PENDING");
    validateTransition(previous?.status, status, input.evidence);
    if (previous?.status !== status) assertUnitAcceptance({ ...input, scope_id: input.scope_id || previous?.scope_id }, status, context);
    const event = {
      key,
      project: input.project || context.id,
      plan: input.plan,
      unit: input.unit,
      scope_id: input.scope_id || previous?.scope_id || null,
      goal: input.goal || previous?.goal || null,
      module: input.module || previous?.module || null,
      status,
      evidence: input.evidence || previous?.evidence || null,
      session_id: sidOf(input),
      updated_at: new Date().toISOString(),
    };
    fs.appendFileSync(file, JSON.stringify(event) + "\n", "utf8");
    logEvent({ ev: "tracker_transition", key, from: previous?.status || null, to: status, unit: input.unit }, context);
    // Armed only on an actual move INTO a terminal status — a re-assertion of
    // the status a unit already holds closed nothing out.
    if (TERMINAL_STATUSES.has(status) && previous?.status !== status) {
      requireCompact(sidOf(input), context);
      // Return-only, deliberately set after the append: the ledger records the
      // transition, not this run's side effect. It tells the CLI below whether
      // to print the notice, which only a *new* terminal transition earns.
      event.compact_required = true;
    }
    return event;
  });
}

export function renderState(context = projectContext(".")) {
  return currentState(context).sort((a, b) => a.key.localeCompare(b.key));
}

// The ledger is append-only and `currentState`/`transition` replay it IN FULL
// on every single call — every claim, every status change, for the entire
// life of the project. Only the LATEST event per key is ever actually needed
// (validateTransition only ever looks at the immediately-preceding status);
// every earlier event for a key that has since moved on is dead weight that
// makes every future read/write slower, forever, with nothing to show for it.
// Safe to compact unconditionally: collapsing to "one event per key, in
// first-seen key order" cannot change any `currentState()`/`transition()`
// result, since neither ever consults more than the latest event per key.
export function compactLedger(context = projectContext(".")) {
  const file = ledgerPath(context);
  return withLock(file, () => {
    const events = readEvents(file);
    const latest = new Map();
    for (const event of events) latest.set(event.key, event); // last write wins; file order preserves recency
    const compacted = [...latest.values()];
    if (compacted.length === events.length) return { events_before: events.length, events_after: events.length };
    atomicWrite(file, compacted.length ? compacted.map((e) => JSON.stringify(e)).join("\n") + "\n" : "");
    logEvent({ ev: "tracker_compacted", events_before: events.length, events_after: compacted.length }, context);
    return { events_before: events.length, events_after: compacted.length };
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const input = JSON.parse(await readStdin() || "{}");
    const context = projectContext(input.project || ".");
    let output;
    if (input.action === "status" || input.action === "list") output = renderState(context);
    else if (input.action === "transition") output = transition(input, context);
    else if (input.action === "init") {
      const file = ledgerPath(context);
      if (!fs.existsSync(file)) atomicWrite(file, "");
      output = { ledger: file };
    } else if (input.action === "compact") output = compactLedger(context);
    else throw new Error("action must be init, transition, status, list, or compact");
    process.stdout.write(JSON.stringify(output) + "\n");
    if (output?.compact_required) {
      process.stdout.write(
        `craftsman: unit closed out (${output.status}). ${COMPACT_REQUIRED_NOTICE}\n`,
      );
    }
  } catch (error) {
    process.stderr.write(`craftsman: tracker failed: ${error.message}\n`);
    process.exitCode = 2;
  }
}
