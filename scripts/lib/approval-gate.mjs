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

// ARCH-LAND-28: with the gate on, the merge action refuses any feature_branch (feature work lands through
// land-unit / land-feature) and lands directly only a docs-only change: A/M/D records of .md files under
// docs/plans or docs/ideas, no symlink or gitlink, read raw with renames off against origin/<base> when it
// exists (the direct path pushes the local base, so an unpushed local commit must not hide). Returns a
// check that the worktree HEAD is still the checked sha (called before any merge or push); a no-op when the gate is off.
const DOCS_ONLY = /^docs\/(plans|ideas)\/.+\.md$/;
const refused = () => new Error("approval required: land feature work through land-unit or land-feature; only docs-only merges land directly");
const git = (cwd, args, opts = {}) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", ...opts });
export function assertMergeAllowed(cfg, input, { info, worktree } = {}) {
  if (!approvalRequired(cfg)) return () => {};
  if (input.feature_branch) throw refused();
  const remote = `origin/${info.base_branch}`;
  let hasRemote = true;
  try { git(worktree, ["rev-parse", "--verify", "--quiet", `refs/remotes/${remote}`], { stdio: "ignore" }); } catch { hasRemote = false; }
  const head = git(worktree, ["rev-parse", "HEAD"]).trim();
  const f = git(worktree, ["diff", "--raw", "-z", "--no-renames", `${hasRemote ? remote : info.base_branch}...${head}`]).split("\0");
  let seen = 0;
  for (let i = 0; i + 1 < f.length; i += 2) {
    const m = /^:(\d+) (\d+) \w+ \w+ ([A-Z])\d*$/.exec(f[i]);
    if (!m || !"AMD".includes(m[3]) || m[2] === "120000" || m[2] === "160000" || m[1] === "120000" || m[1] === "160000" || !DOCS_ONLY.test(f[i + 1])) throw refused();
    seen++;
  }
  if (!seen) throw refused();
  return () => repin(worktree, head);
}

// The pinned worktree HEAD must be unchanged (a no-op when the gate is off).
function repin(worktree, pin) {
  if (pin && git(worktree, ["rev-parse", "HEAD"]).trim() !== pin) throw new Error("approval required: the worktree HEAD changed after the merge check; nothing landed");
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
export function afterLand({ gate, sha = gate.head, mode = "merge", rows = [], closing = [], context, retire }, pr) {
  if (pr?.parked) return pr;
  try {
    const r = gate.needed ? approvalLanded({ run: gate.runId, sha, mode }, { root: context.root }) : { ok: true };
    if (!r.ok) logEvent({ ev: "approval_landed_refused", run: gate.runId, reason: r.reason }, context);
  } catch { /* record only */ }
  try {
    const closed = (r) => r.status === "COMPLETE" || r.status === "CANCELLED" || closing.some((c) => c.plan === r.plan && c.unit === r.unit);
    const state = currentState(context);
    const plans = [...new Set(rows.map((r) => r.plan))].filter((p) => state.filter((r) => r.plan === p).every(closed));
    for (const c of (retire || retireCheck)(plans, mainCheckoutRoot(context.root))) if (!c.reason) logEvent({ ev: "doc_retire_candidate", plan: c.plan, referrers: c.referrers }, context);
  } catch { /* a scan error never fails the landing */ }
  return pr;
}

// A unit landing on base closes its own row (the tracker marks it MERGED next): log retire candidates (ARCH-LAND-26).
export function afterUnitLand(result, input, context, retire) {
  if (result?.merged && !result.parked && input.plan && input.unit) {
    const row = { plan: input.plan, unit: input.unit };
    afterLand({ gate: { needed: false }, rows: [row], closing: [row], context, retire });
  }
  return result;
}
