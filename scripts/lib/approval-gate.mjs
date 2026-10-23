// Pure approval-gate logic for land-feature (ARCH-LAND-22/27, ARCH-APPROVAL-04).
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { logEvent, mainCheckoutRoot } from "./core.mjs";
import { currentState } from "../tracker.mjs";
import { retireCheck } from "../doc-retire.mjs";
import { landed as approvalLanded } from "../approval.mjs";
import { CHOICES } from "./approval-page.mjs";

// Only with feature branches on: otherwise units merge straight to base and no verification point exists.
export function approvalRequired(cfg) {
  return cfg?.repoExec?.approval?.required === true && cfg?.planning?.featureBranches === true;
}
export const approvalUnenforced = (cfg) => cfg?.repoExec?.approval?.required === true && cfg?.planning?.featureBranches !== true;

export function noteUnenforced(cfg, context) {
  if (approvalUnenforced(cfg)) logEvent({ ev: "approval_unenforced", reason: "featureBranches off" }, context);
}

// A red gate after base moved in PARKs (ARCH-LAND-27).
export const gatePark = (r) => ({
  question: `The gate failed on ${r.branch} merged with the moved ${r.base_branch}; nothing landed. How should it proceed?`,
  options: ["Fix the feature, then request a new approval page", "Leave the feature unlanded"],
  recommended: "Fix the feature, then request a new approval page",
});

export const runIdFor = (plan, feature) => `${path.basename(String(plan), ".md")}-${feature}`;

// The record must be decided with a known choice, and head_sha must equal the feature head
// as it was BEFORE base is merged in; anything else needs a new approval page.
export function evaluateApproval(record, { headSha } = {}) {
  if (!record) return { ok: false, reason: "no approval record" };
  if (record.status !== "decided") return { ok: false, reason: `approval record status is ${record.status}, not decided` };
  if (!CHOICES.includes(record.choice)) return { ok: false, reason: "approval record has no valid choice" };
  if (!record.head_sha || record.head_sha !== headSha) return { ok: false, reason: "feature head differs from the approved head_sha" };
  return { ok: true, choice: record.choice };
}

export const approvalPark = (reason, feature) => ({
  question: `Landing ${feature} needs an approved page: ${reason}. How should it proceed?`,
  options: ["Request a new approval page and approve it", "Leave the feature unlanded"],
  recommended: "Request a new approval page and approve it",
});

// land-feature entry: {park} for the caller to return, {mode} when approved, {needed:false} when not required.
export function gateFeature({ config, context, input, branch }) {
  const log = (ev) => logEvent(ev, context);
  noteUnenforced(config, context);
  if (!approvalRequired(config)) return { needed: false };
  const runId = runIdFor(input.plan, input.feature);
  let record = null;
  try { record = JSON.parse(fs.readFileSync(path.join(mainCheckoutRoot(context.root), ".craftsman", "approvals", `${runId}.json`), "utf8")); } catch { /* none */ }
  const headSha = execFileSync("git", ["-C", context.root, "rev-parse", `refs/heads/${branch}`], { encoding: "utf8" }).trim();
  const v = evaluateApproval(record, { headSha });
  if (!v.ok) return { needed: true, runId, park: { pushed: false, parked: true, reason: "approval", error: v.reason, cleaned: false, decision: approvalPark(v.reason, branch) } };
  return { needed: true, runId, head: headSha, mode: v.choice === "open-pr" ? "pr" : "direct" };
}

// After a landing: mark the record landed, then log retire candidates (ARCH-LAND-26). Never throws.
export function afterLand({ gate, sha = gate.head, mode = "merge", rows = [], context, retire }, pr) {
  if (pr?.parked) return pr;
  try { if (gate.needed) approvalLanded({ run: gate.runId, sha, mode }, { root: context.root }); } catch { /* record only */ }
  try {
    const closed = (r) => r.status === "COMPLETE" || r.status === "CANCELLED";
    const state = currentState(context);
    const plans = [...new Set(rows.map((r) => r.plan))].filter((p) => state.filter((r) => r.plan === p).every(closed));
    for (const c of (retire || retireCheck)(plans, mainCheckoutRoot(context.root))) if (!c.reason) logEvent({ ev: "doc_retire_candidate", plan: c.plan, referrers: c.referrers }, context);
  } catch { /* a scan error never fails the landing */ }
  return pr;
}
