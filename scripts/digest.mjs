#!/usr/bin/env node
// /craftsman:digest — ADHD-friendly progress digest. Reads the same tracker
// ledger orchestrate/scrutinise already write to (scripts/tracker.mjs) and
// renders four things only: what shipped, what needs a human decision, what's
// next, and how far each plan is from COMPLETE. No new state to maintain.
import { projectContext } from "./lib/core.mjs";
import { currentState } from "./tracker.mjs";

const DONE_STATUSES = new Set(["COMPLETE", "MERGED"]);
const DECISION_STATUSES = new Set(["BLOCKED", "PARKED"]);
const NEXT_STATUSES = new Set(["PENDING", "IN_PROGRESS"]);

function byRecency(a, b) {
  return new Date(b.updated_at || 0) - new Date(a.updated_at || 0);
}

function byAge(a, b) {
  return new Date(a.updated_at || 0) - new Date(b.updated_at || 0);
}

function planPercents(rows) {
  const byPlan = new Map();
  for (const row of rows) {
    if (row.status === "CANCELLED") continue;
    const bucket = byPlan.get(row.plan) || { total: 0, complete: 0, merged: 0 };
    bucket.total += 1;
    if (row.status === "COMPLETE") bucket.complete += 1;
    if (row.status === "MERGED") bucket.merged += 1;
    byPlan.set(row.plan, bucket);
  }
  return [...byPlan.entries()].map(([plan, b]) => ({
    plan,
    percent: b.total ? Math.round((100 * b.complete) / b.total) : 0,
    shippedNotConfirmed: b.merged,
    total: b.total,
  }));
}

export function buildDigest(context = projectContext(".")) {
  const rows = currentState(context);
  const done = rows.filter((r) => DONE_STATUSES.has(r.status)).sort(byRecency).slice(0, 5);
  const decisions = rows.filter((r) => DECISION_STATUSES.has(r.status)).sort(byRecency);
  const next = rows.filter((r) => NEXT_STATUSES.has(r.status)).sort(byAge).slice(0, 5);
  const plans = planPercents(rows).sort((a, b) => a.plan.localeCompare(b.plan));
  return { done, decisions, next, plans };
}

function fmtRow(row) {
  const evidence = row.evidence ? ` — ${row.evidence}` : "";
  return `${row.plan}/${row.unit}${evidence}`;
}

function render(digest) {
  const lines = [];
  if (!digest.plans.length) {
    lines.push("No tracker rows yet. Nothing has gone through /plan or /orchestrate in this repo.");
    return lines.join("\n");
  }

  lines.push("% complete (COMPLETE rows / total rows, per plan):");
  for (const p of digest.plans) {
    const merged = p.shippedNotConfirmed ? `, ${p.shippedNotConfirmed} shipped awaiting COMPLETE` : "";
    lines.push(`  ${p.plan}: ${p.percent}%${merged}`);
  }

  lines.push("\n✅ Done recently:");
  lines.push(digest.done.length ? digest.done.map((r) => `  - ${fmtRow(r)}`).join("\n") : "  (nothing MERGED/COMPLETE yet)");

  lines.push("\n⚠️ Decisions needed:");
  lines.push(digest.decisions.length ? digest.decisions.map((r) => `  - ${fmtRow(r)}`).join("\n") : "  (none — nothing BLOCKED/PARKED)");

  lines.push("\n📋 Next:");
  lines.push(digest.next.length ? digest.next.map((r) => `  - ${fmtRow(r)}`).join("\n") : "  (nothing PENDING/IN_PROGRESS)");

  return lines.join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    process.stdout.write(render(buildDigest()) + "\n");
  } catch (error) {
    process.stderr.write(`craftsman: digest failed: ${error.message}\n`);
    process.exitCode = 2;
  }
}
