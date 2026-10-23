import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { inspectRepo, landFeature, prepare } from "./repo-exec.mjs";
import { approvalRequired, evaluateApproval, runIdFor } from "./lib/approval-gate.mjs";
import { publishTracker } from "./tracker-publish.mjs";
import { ledgerPath } from "./tracker.mjs";
import { projectContext } from "./lib/core.mjs";

const ENV = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t", LC_ALL: "C" };
const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", env: ENV, stdio: ["ignore", "pipe", "pipe"] }).trim();

// A repo + origin + pushed feature branch with one commit; both rows FEATURE_MERGED.
function setup(approval = { required: true }, extra = {}) {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-approval-"));
  const root = path.join(ws, "one");
  fs.mkdirSync(root);
  git(root, "init", "-q", "-b", "main");
  fs.writeFileSync(path.join(root, "craftsman.config.json"), JSON.stringify({ planning: { featureBranches: true }, repoExec: { approval }, ...extra }));
  fs.writeFileSync(path.join(root, "README.md"), "x\n");
  git(root, "add", "."); git(root, "commit", "-q", "-m", "init");
  git(ws, "init", "-q", "--bare", "-b", "main", "origin.git");
  git(root, "remote", "add", "origin", path.join(ws, "origin.git"));
  git(root, "push", "-q", "-u", "origin", "main");
  fs.writeFileSync(path.join(ws, "craftsman.workspace.json"), JSON.stringify({ version: 1, projects: { one: { root: "one" } } }));
  process.env.CRAFTSMAN_WORKSPACE_MANIFEST = path.join(ws, "craftsman.workspace.json");
  const context = projectContext("one");
  const info = inspectRepo(context);
  const feature = prepare(context, { unit: "f-x", slug: "p-f1", branch: "feature/p-f1" }, info);
  fs.writeFileSync(path.join(feature.worktree_path, "a.txt"), "a\n");
  git(feature.worktree_path, "add", "a.txt"); git(feature.worktree_path, "commit", "-q", "-m", "feat a");
  git(feature.worktree_path, "push", "-q", "-u", "origin", "feature/p-f1");
  const rows = ["u0", "u1"].map((unit) => ({ key: `.::p::${unit}`, project: ".", plan: "p", unit, status: "FEATURE_MERGED", evidence: "x", session_id: "s", feature: "f1", feature_branch: "feature/p-f1", updated_at: "2026-01-01T00:00:00Z" }));
  fs.mkdirSync(path.dirname(ledgerPath(context)), { recursive: true });
  fs.writeFileSync(ledgerPath(context), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  const head = () => git(root, "rev-parse", "refs/heads/feature/p-f1");
  const record = (over = {}) => {
    const dir = path.join(root, ".craftsman", "approvals");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "p-f1.json"), JSON.stringify({ run: "p-f1", status: "decided", choice: "merge", head_sha: head(), ...over }));
  };
  const baseHead = () => git(path.join(ws, "origin.git"), "rev-parse", "main");
  return { ws, root, context, info, feature, head, record, baseHead, land: (deps) => landFeature(context, { plan: "docs/plans/p.md", feature: "f1", session_id: "s" }, info, deps) };
}
const done = (t) => fs.rmSync(t.ws, { recursive: true, force: true });
const events = (t) => { try { return fs.readFileSync(path.join(t.root, ".craftsman", "events.jsonl"), "utf8"); } catch { return ""; } };

test("approval-gate: pure helpers", () => {
  assert.equal(approvalRequired({ repoExec: { approval: { required: true } }, planning: { featureBranches: true } }), true);
  assert.equal(approvalRequired({ repoExec: { approval: { required: true } }, planning: { featureBranches: false } }), false);
  assert.equal(approvalRequired({ planning: { featureBranches: true } }), false);
  assert.equal(runIdFor("docs/plans/p.md", "f1"), "p-f1");
  assert.equal(evaluateApproval(null, {}).ok, false);
  assert.equal(evaluateApproval({ status: "requested" }, {}).ok, false);
  assert.equal(evaluateApproval({ status: "decided", choice: "merge", head_sha: "a" }, { headSha: "b" }).ok, false);
  assert.deepEqual(evaluateApproval({ status: "decided", choice: "open-pr", head_sha: "a" }, { headSha: "a" }), { ok: true, choice: "open-pr" });
});

test("land-feature: refuses without an approval record, pushes nothing", () => {
  const t = setup();
  try {
    const before = t.baseHead();
    const r = t.land();
    assert.equal(r.parked, true);
    assert.match(r.error, /no approval record/);
    assert.ok(r.decision.question && r.decision.options.length);
    assert.equal(t.baseHead(), before);
  } finally { done(t); }
});

test("land-feature: lands with a decided matching record and marks it landed", () => {
  const t = setup();
  try {
    t.record();
    const r = t.land();
    assert.equal(r.merged, true);
    assert.equal(t.baseHead(), r.merge_sha);
    const rec = JSON.parse(fs.readFileSync(path.join(t.root, ".craftsman", "approvals", "p-f1.json"), "utf8"));
    assert.equal(rec.status, "landed");
    assert.equal(rec.landed_sha, r.merge_sha);
  } finally { done(t); }
});

test("land-feature: a requested (undecided) record and a head mismatch park", () => {
  const t = setup();
  try {
    const before = t.baseHead();
    t.record({ status: "requested" });
    assert.equal(t.land().parked, true);
    t.record({ head_sha: "0".repeat(40) });
    const r = t.land();
    assert.equal(r.parked, true);
    assert.match(r.error, /head/);
    assert.equal(t.baseHead(), before);
  } finally { done(t); }
});

test("land-feature: base moved since approval re-merges base and lands when green", () => {
  const t = setup();
  try {
    t.record();
    fs.writeFileSync(path.join(t.root, "b.txt"), "b\n");
    git(t.root, "add", "b.txt"); git(t.root, "commit", "-q", "-m", "base moves");
    git(t.root, "push", "-q", "origin", "main");
    const r = t.land();
    assert.equal(r.merged, true);
    assert.equal(git(path.join(t.ws, "origin.git"), "show", "main:b.txt"), "b");
    assert.equal(git(path.join(t.ws, "origin.git"), "show", "main:a.txt"), "a");
  } finally { done(t); }
});

test("land-feature: moved base that conflicts PARKs and lands nothing", () => {
  const t = setup();
  try {
    t.record();
    fs.writeFileSync(path.join(t.root, "a.txt"), "different\n");
    git(t.root, "add", "a.txt"); git(t.root, "commit", "-q", "-m", "conflicting base");
    git(t.root, "push", "-q", "origin", "main");
    const before = t.baseHead();
    const r = t.land();
    assert.equal(r.parked, true);
    assert.equal(r.reason, "conflict");
    assert.equal(t.baseHead(), before);
  } finally { done(t); }
});

test("land-feature: approval not required: lands without a record", () => {
  const t = setup({ required: false });
  try {
    assert.equal(t.land().merged, true);
  } finally { done(t); }
});

test("land-feature: a thrown retire scan leaves the landing successful; candidates are logged", () => {
  const t = setup();
  try {
    t.record();
    const r = t.land({ retireCheck: () => { throw new Error("scan exploded"); } });
    assert.equal(r.merged, true);
    assert.doesNotMatch(events(t), /doc_retire_candidate/);
  } finally { done(t); }
  const u = setup({ required: false });
  try {
    const r = u.land({ retireCheck: (plans) => plans.map((plan) => ({ plan, referrers: ["x.md"] })) });
    assert.equal(r.merged, true);
    assert.match(events(u), /doc_retire_candidate/);
  } finally { done(u); }
});

test("tracker.publish: off, push and on-approve modes", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-pubmode-"));
  try {
    const ctx = (mode) => {
      fs.writeFileSync(path.join(root, "craftsman.config.json"), JSON.stringify({ tracker: { publish: mode } }));
      return { id: ".", root, stateDir: path.join(root, ".craftsman") };
    };
    assert.deepEqual(publishTracker({ approved: true, manual: true }, ctx("off")), { published: false, mode: "off" });
    assert.deepEqual(publishTracker({}, ctx("on-approve")), { published: false, mode: "on-approve" });
    assert.deepEqual(publishTracker({ approved: false }, ctx("on-approve")), { published: false, mode: "on-approve" });
    // push mode and approved on-approve both proceed past the mode check (no repo here, so they fail later, not with the mode result)
    for (const [mode, input] of [["push", {}], ["on-approve", { approved: true }], ["on-approve", { manual: true }]]) {
      let out;
      try { out = publishTracker(input, ctx(mode)); } catch { out = null; }
      assert.notDeepEqual(out, { published: false, mode });
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
