#!/usr/bin/env node
// Structured tracker ledger. TRACKER.md remains the human-readable projection.
import fs from "node:fs";
import path from "node:path";
import {
  atomicWrite, logEvent, projectContext, readStdin, sidOf,
  loadConfig, enabled, acceptancePath, acceptanceCriteria, uncheckedAcceptance,
  mainCheckoutRoot,
} from "./lib/core.mjs";
import { syncRunManifest } from "./run-manifest.mjs";

export const STATUSES = ["PENDING", "IN_PROGRESS", "MERGED", "COMPLETE", "BLOCKED", "PARKED", "CANCELLED"];
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

// A PARKED row's open question for /auto's Phase C (ARCH-TRACKER-03,
// ARCH-ENGINE-07): what to ask, the real options, and optionally the one the
// runner would pick. Returns a clean copy; anything malformed is refused.
export function validateDecision(decision) {
  const text = (value) => typeof value === "string" && value.trim() !== "";
  if (!decision || typeof decision !== "object" || Array.isArray(decision)) throw new Error("decision must be an object {question, options[], recommended?}");
  if (!text(decision.question)) throw new Error("decision needs a question");
  if (!Array.isArray(decision.options) || decision.options.length < 2 || !decision.options.every(text)) {
    throw new Error("decision needs at least two non-empty options");
  }
  if (decision.recommended !== undefined && !text(decision.recommended)) throw new Error("decision.recommended must be a non-empty string");
  return {
    question: decision.question.trim(),
    options: decision.options.map((option) => option.trim()),
    ...(decision.recommended !== undefined ? { recommended: decision.recommended.trim() } : {}),
  };
}

// Input-only rules for the new fields; replaying old events never runs them.
// An autonomous run parks only with a decision and never cancels a unit
// (ARCH-TRACKER-03/04); a decision belongs to a PARKED row alone.
function validateParkInput(input, status) {
  if (input.autonomous !== undefined && typeof input.autonomous !== "boolean") throw new Error("autonomous must be a boolean");
  if (input.autonomous && status === "CANCELLED") throw new Error("CANCELLED refused: an autonomous run never cancels a unit; PARK it with a decision instead");
  if (input.decision !== undefined && input.decision !== null) {
    if (status !== "PARKED") throw new Error(`decision is only recorded on PARKED, not ${status}`);
    return validateDecision(input.decision);
  }
  if (input.autonomous && status === "PARKED") {
    throw new Error("PARKED refused: an autonomous park needs decision {question, options[], recommended?} for Phase C");
  }
  return null;
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

// The unit's own `[unit:<id>]` lines as they stand at MERGED/COMPLETE. The
// acceptance file is per checkout and gitignored, so a unit's worktree copy
// dies with the worktree; the ledger (main checkout) keeps them instead.
function unitCriteria(ids, context) {
  let text = "";
  try { text = fs.readFileSync(acceptancePath(context), "utf8"); } catch { return []; }
  return acceptanceCriteria(text).filter((c) => c.unit && ids.has(c.unit)).map((c) => c.line);
}

// The ledger and its TRACKER.md view live in the MAIN checkout, never in the
// linked worktree a session happens to run in: every session (and every
// worktree) must see one tracker the moment it changes — not after a merge.
export function trackerRoot(context = projectContext(".")) {
  return mainCheckoutRoot(context.root);
}

export function ledgerPath(context = projectContext(".")) {
  return path.join(trackerRoot(context), ".craftsman", "tracker", "events.jsonl");
}

export function trackerDocPath(context = projectContext(".")) {
  return path.join(trackerRoot(context), "docs", "plans", "TRACKER.md");
}

// ---------------------------------------------------- TRACKER.md view ---
// The ledger rows are projected into a fenced, generated block of the root
// TRACKER.md on every ledger write (and by the tracker-sync hook as a
// backstop). Everything outside the fence stays hand-written; the fence
// itself is never hand-edited — pre-guard refuses any edit that changes it.
export const BLOCK_BEGIN = "<!-- craftsman:ledger:begin -->";
export const BLOCK_END = "<!-- craftsman:ledger:end -->";
const BLOCK_RE = new RegExp(`${BLOCK_BEGIN}[\\s\\S]*?${BLOCK_END}`);

// The generated block inside `text`, or null when it has none.
export function generatedBlock(text) {
  return BLOCK_RE.exec(String(text))?.[0] ?? null;
}

function cell(value, max = 0) {
  let text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (max && text.length > max) text = text.slice(0, max - 1) + "…";
  return text ? text.replaceAll("|", "\\|") : "—";
}

export function renderBlock(rows) {
  const multiProject = rows.some((row) => row.project && row.project !== ".");
  const header = [...(multiProject ? ["project"] : []), "plan", "unit", "module", "status", "evidence", "updated"];
  const lines = [
    BLOCK_BEGIN,
    "<!-- Generated from the tracker ledger (.craftsman/tracker/events.jsonl) after every transition. " +
      "Do not edit by hand: change a row with scripts/tracker.mjs. -->",
    "",
    `| ${header.join(" | ")} |`,
    `|${header.map(() => "---").join("|")}|`,
  ];
  for (const row of rows) {
    const plan = row.plan.split(path.sep).join("/");
    const link = path.posix.relative("docs/plans", plan);
    const unit = row.scope_id && row.scope_id !== row.unit ? `${row.unit} (${row.scope_id})` : row.unit;
    lines.push(`| ${[
      ...(multiProject ? [cell(row.project)] : []),
      `[${cell(path.posix.basename(plan, ".md"))}](${link.startsWith(".") ? link : `./${link}`})`,
      cell(unit), cell(row.module), row.status, cell(row.evidence, 80), cell(row.updated_at?.slice(0, 10)),
    ].join(" | ")} |`);
  }
  if (!rows.length) lines.push(`| ${header.map(() => "—").join(" | ")} |`);
  lines.push("", BLOCK_END);
  return lines.join("\n");
}

// Splice a freshly rendered block into `text`: replace the existing fence, or
// append a "Live ledger" section when the file has none yet.
export function spliceBlock(text, block) {
  if (generatedBlock(text) !== null) return text.replace(BLOCK_RE, () => block);
  const base = text.trimEnd();
  return `${base ? `${base}\n\n` : "# Execution tracker\n\n"}## Live ledger\n\n${block}\n`;
}

// Re-render the root TRACKER.md's generated block from the ledger. Writes
// only on a real change; an empty ledger with no block yet is a no-op, so a
// repo that never used the ledger never grows the section.
export function syncTrackerDoc(context = projectContext(".")) {
  const rows = renderState(context);
  const file = trackerDocPath(context);
  let text = "";
  try { text = fs.readFileSync(file, "utf8"); } catch { /* not created yet */ }
  if (!rows.length && generatedBlock(text) === null) return { file, changed: false };
  const next = spliceBlock(text, renderBlock(rows));
  if (next === text) return { file, changed: false };
  atomicWrite(file, next);
  logEvent({ ev: "tracker_doc_synced", rows: rows.length }, context);
  return { file, changed: true };
}

// Bookkeeping after a ledger write — must never fail the write itself.
function syncQuietly(context) {
  try { return syncTrackerDoc(context); } catch { return null; }
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
  const event = writeTransition(input, context);
  // Order-independent trigger: criteria ticked before the merge are only
  // "met" for the tracker once the unit is MERGED, so reconcile right here.
  if (event.status === "MERGED" && event.previous_status !== "MERGED") {
    try { event.acceptance = reconcileAcceptance(context, input); } catch { /* bookkeeping — never fail the transition */ }
  }
  delete event.previous_status;
  syncQuietly(context);
  manifestQuietly(context, [event.plan]);
  return event;
}

// The derived .craftsman/runs/<slug>.json (ARCH-TRACKER-01) — bookkeeping,
// so like the TRACKER.md view it never fails the ledger write.
function manifestQuietly(context, plans) {
  try {
    const rows = currentState(context);
    for (const plan of new Set(plans)) syncRunManifest(context, plan, rows);
  } catch { /* the next transition regenerates it */ }
}

function writeTransition(input, context) {
  validateIdentity(input);
  const file = ledgerPath(context);
  return withLock(file, () => {
    const state = currentState(context);
    const key = keyOf(input);
    const previous = state.find((row) => row.key === key);
    const status = input.status || (previous ? "IN_PROGRESS" : "PENDING");
    validateTransition(previous?.status, status, input.evidence);
    const decision = validateParkInput(input, status);
    const scopeId = input.scope_id || previous?.scope_id;
    if (previous?.status !== status) assertUnitAcceptance({ ...input, scope_id: scopeId }, status, context);
    const read = ["MERGED", "COMPLETE"].includes(status) ? unitCriteria(new Set([input.unit, scopeId].filter(Boolean)), context) : [];
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
      // Added fields (ARCH-TRACKER-02): null on every non-PARKED event so a
      // row that moves on never keeps a stale question.
      decision,
      autonomous: input.autonomous === true,
      // Carried forward: compaction keeps only the latest event per key.
      criteria: read.length ? read : previous?.criteria || null,
    };
    fs.appendFileSync(file, JSON.stringify(event) + "\n", "utf8");
    logEvent({ ev: "tracker_transition", key, from: previous?.status || null, to: status, unit: input.unit }, context);
    return { ...event, previous_status: previous?.status || null };
  });
}

// The "all acceptance criteria met → update the tracker" trigger. Runs when
// acceptance.md is edited (quality-gate), when a unit lands on MERGED (above),
// and at Stop (catches ticks made through Bash). For every `[unit:<id>]` whose
// own criteria are all ticked:
//   - MERGED, and no untagged whole-plan criterion is still open → COMPLETE
//     (untagged lines are the whole-request checks /orchestrate Phase F and
//     /scrutinise verify; "all rows MERGED" alone is not done);
//   - IN_PROGRESS → reported as ready to merge — the model's "you're done
//     implementing" signal; a merge can't be inferred from ticks.
// Untagged-only (legacy) files name no units, so nothing is transitioned.
export function reconcileAcceptance(context = projectContext("."), input = {}) {
  const cfg = loadConfig(context);
  if (!enabled(cfg, context) || cfg.stopGate?.enabled === false || cfg.stopGate?.requireAcceptanceCriteria === false) return null;
  let text;
  try { text = fs.readFileSync(acceptancePath(context), "utf8"); } catch { return null; }
  const criteria = acceptanceCriteria(text);
  if (!criteria.length) return null;
  const planWideOpen = criteria.some((c) => !c.unit && !c.done);
  const metUnits = [...new Set(criteria.filter((c) => c.unit).map((c) => c.unit))]
    .filter((unit) => criteria.every((c) => c.unit !== unit || c.done));
  const completed = [];
  const ready = [];
  for (const row of currentState(context)) {
    const id = [row.unit, row.scope_id].find((candidate) => candidate && metUnits.includes(candidate));
    if (!id) continue;
    if (row.status === "IN_PROGRESS") ready.push({ plan: row.plan, unit: row.unit });
    if (row.status !== "MERGED" || planWideOpen) continue;
    const count = criteria.filter((c) => c.unit === id).length;
    try {
      // The key's own project segment, not row.project: keyOf() used the
      // caller's project (often "."), and a different one would mint a new row.
      writeTransition({
        project: row.key.split("::")[0], plan: row.plan, unit: row.unit, status: "COMPLETE",
        evidence: `all ${count} acceptance criteria ticked${row.evidence ? `; ${row.evidence}` : ""}`,
        session_id: input.session_id,
      }, context);
      completed.push({ plan: row.plan, unit: row.unit });
    } catch { /* raced by another writer or refused — leave it for the model */ }
  }
  if (completed.length) {
    logEvent({ ev: "tracker_auto_complete", units: completed.map((c) => c.unit) }, context);
    syncQuietly(context);
    manifestQuietly(context, completed.map((c) => c.plan));
  }
  return { completed, ready, plan_wide_open: planWideOpen, all_met: criteria.every((c) => c.done) };
}

// One-paragraph notice for the model, or "" when there is nothing to say.
export function acceptanceNotice(result) {
  if (!result) return "";
  const name = (r) => `${r.plan}#${r.unit}`;
  const parts = [];
  if (result.completed.length) {
    parts.push(`craftsman: all acceptance criteria met → tracker ledger moved ${result.completed.map(name).join(", ")} MERGED → COMPLETE; the root docs/plans/TRACKER.md ledger block was re-rendered automatically.`);
  }
  if (result.ready.length) {
    parts.push(`craftsman: every acceptance criterion for ${result.ready.map(name).join(", ")} is ticked — implementation is done; merge it now (Phase X step 9: merge cleans up the worktree), then tracker → MERGED.`);
  }
  if (result.all_met && !result.completed.length && !result.ready.length) {
    parts.push("craftsman: every criterion in .craftsman/acceptance.md is ticked — run the Finalization block (worktree sweep, phase-tracker) before COMPLETE.");
  }
  return parts.join("\n");
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

export function archivePath(context = projectContext(".")) {
  return path.join(trackerRoot(context), "docs", "plans", "TRACKER-archive.md");
}

// Retire a finished plan: every row must be COMPLETE or CANCELLED. Its rows
// leave the ledger and the live TRACKER.md block; a one-line entry per unit,
// with the criteria it closed on, goes to the committed TRACKER-archive.md.
export function archivePlan(input, context = projectContext(".")) {
  if (typeof input.plan !== "string" || !input.plan.trim()) throw new Error("archive needs plan");
  const file = ledgerPath(context);
  const archived = withLock(file, () => {
    const rows = currentState(context).filter((row) => row.plan === input.plan);
    if (!rows.length) throw new Error(`archive refused: no tracker rows for ${input.plan}`);
    const open = rows.filter((row) => !["COMPLETE", "CANCELLED"].includes(row.status));
    if (open.length) throw new Error(`archive refused: ${open.map((r) => `${r.unit}=${r.status}`).join(", ")} not COMPLETE or CANCELLED`);
    const keys = new Set(rows.map((row) => row.key));
    const kept = readEvents(file).filter((event) => !keys.has(event.key));
    const day = new Date().toISOString().slice(0, 10);
    const entries = rows.sort((a, b) => a.key.localeCompare(b.key)).map((row) => [
      `- ${day} **${path.posix.basename(row.plan, ".md")}#${row.unit}** ${row.status} — ${cell(row.evidence, 160)}`,
      ...(row.criteria || []).map((line) => `  ${line}`),
    ].join("\n"));
    const doc = archivePath(context);
    let text = "";
    try { text = fs.readFileSync(doc, "utf8"); } catch { text = "# Tracker archive\n\nRows retired from the live ledger by `tracker.mjs archive`.\n"; }
    atomicWrite(doc, `${text.trimEnd()}\n\n## ${input.plan} (${day})\n\n${entries.join("\n")}\n`);
    atomicWrite(file, kept.length ? kept.map((e) => JSON.stringify(e)).join("\n") + "\n" : "");
    return rows.map((row) => row.unit);
  });
  logEvent({ ev: "tracker_archived", plan: input.plan, units: archived.length }, context);
  syncQuietly(context);
  return { plan: input.plan, archived, archive: archivePath(context) };
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
    else if (input.action === "sync") output = syncTrackerDoc(context);
    else if (input.action === "archive") output = archivePlan(input, context);
    else throw new Error("action must be init, transition, status, list, compact, sync, or archive");
    process.stdout.write(JSON.stringify(output) + "\n");
    const notice = acceptanceNotice(output?.acceptance);
    if (notice) process.stdout.write(notice + "\n");
  } catch (error) {
    process.stderr.write(`craftsman: tracker failed: ${error.message}\n`);
    process.exitCode = 2;
  }
}
