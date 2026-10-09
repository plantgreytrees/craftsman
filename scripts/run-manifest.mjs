#!/usr/bin/env node
// The run manifest: .craftsman/runs/<slug>.json, one feature per plan unit
// (unit, status, criteria ticked/total, decision). It is DERIVED — the
// tracker ledger stays the source of truth and every transition regenerates
// this file from it plus .craftsman/acceptance.md, so a hand edit never
// survives the next transition (ARCH-TRACKER-01). /auto's Phase C can read
// the open decisions from here or straight from the ledger; both agree.
import fs from "node:fs";
import path from "node:path";
import {
  acceptanceCriteria, acceptancePath, atomicWrite, mainCheckoutRoot, projectContext, readStdin,
} from "./lib/core.mjs";

export function planSlug(plan) {
  const slug = path.posix.basename(String(plan).split(path.sep).join("/"), ".md");
  if (!slug || slug === "." || slug === "..") throw new Error(`cannot derive a run slug from ${plan}`);
  return slug;
}

// Beside the ledger, in the main checkout, so every worktree sees one file.
export function manifestPath(context, plan) {
  return path.join(mainCheckoutRoot(context.root), ".craftsman", "runs", `${planSlug(plan)}.json`);
}

// Pure: the manifest for `plan` from ledger rows and acceptance.md text.
export function buildManifest(plan, rows, acceptanceText = "") {
  const criteria = acceptanceCriteria(acceptanceText).filter((c) => c.unit);
  const features = rows
    .filter((row) => row.plan === plan)
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((row) => {
      const ids = new Set([row.unit, row.scope_id].filter(Boolean));
      const own = criteria.filter((c) => ids.has(c.unit));
      return {
        unit: row.unit,
        ...(row.project && row.project !== "." ? { project: row.project } : {}),
        status: row.status,
        criteria: { ticked: own.filter((c) => c.done).length, total: own.length },
        decision: row.status === "PARKED" ? row.decision || null : null,
      };
    });
  return {
    generated_from: ".craftsman/tracker/events.jsonl",
    note: "Derived on every tracker transition; do not edit by hand.",
    plan,
    slug: planSlug(plan),
    features,
  };
}

// Rewrite the manifest for `plan` whenever it differs from what the ledger
// says — including after a hand edit.
export function syncRunManifest(context, plan, rows) {
  let text = "";
  try { text = fs.readFileSync(acceptancePath(context), "utf8"); } catch { /* no criteria yet */ }
  const file = manifestPath(context, plan);
  const next = JSON.stringify(buildManifest(plan, rows, text), null, 2) + "\n";
  let current = null;
  try { current = fs.readFileSync(file, "utf8"); } catch { /* not created yet */ }
  if (current === next) return { file, changed: false };
  atomicWrite(file, next);
  return { file, changed: true };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const input = JSON.parse(await readStdin() || "{}");
    const context = projectContext(input.project || ".");
    const { currentState } = await import("./tracker.mjs");
    const rows = currentState(context);
    const plans = input.plan ? [input.plan] : [...new Set(rows.map((row) => row.plan))];
    process.stdout.write(JSON.stringify(plans.map((plan) => syncRunManifest(context, plan, rows))) + "\n");
  } catch (error) {
    process.stderr.write(`craftsman: run manifest failed: ${error.message}\n`);
    process.exitCode = 2;
  }
}
