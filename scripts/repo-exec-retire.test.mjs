import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { inspectRepo, merge, prepare } from "./repo-exec.mjs";
import { ledgerPath } from "./tracker.mjs";
import { projectContext } from "./lib/core.mjs";

const ENV = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t", LC_ALL: "C" };
const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", env: ENV, stdio: ["ignore", "pipe", "pipe"] }).trim();

// A local repo (no remote) with one committed unit branch and a ledger of the given rows.
function setup(rows) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-retire-"));
  git(root, "init", "-q", "-b", "main");
  fs.writeFileSync(path.join(root, "craftsman.config.json"), JSON.stringify({ repoExec: { land: "direct" } }));
  fs.writeFileSync(path.join(root, "README.md"), "x\n");
  git(root, "add", "."); git(root, "commit", "-q", "-m", "init");
  fs.writeFileSync(path.join(root, "craftsman.workspace.json"), JSON.stringify({ version: 1, projects: { one: { root: "." } } }));
  process.env.CRAFTSMAN_WORKSPACE_MANIFEST = path.join(root, "craftsman.workspace.json");
  const context = projectContext("one");
  const info = inspectRepo(context);
  const wt = prepare(context, { unit: "u1", slug: "u1" }, info);
  fs.writeFileSync(path.join(wt.worktree_path, "a.txt"), "a\n");
  git(wt.worktree_path, "add", "a.txt"); git(wt.worktree_path, "commit", "-q", "-m", "a");
  fs.mkdirSync(path.dirname(ledgerPath(context)), { recursive: true });
  fs.writeFileSync(ledgerPath(context), rows.map((r) => JSON.stringify({ project: ".", plan: "docs/plans/p.md", session_id: "s", evidence: "x", updated_at: "2026-01-01T00:00:00Z", ...r, key: `.::docs/plans/p.md::${r.unit}` })).join("\n") + "\n");
  const input = { unit: "u1", slug: "u1", plan: "docs/plans/p.md", worktree_path: wt.worktree_path, push: false, gate: false };
  return { root, context, info, input };
}
const events = (t) => { try { return fs.readFileSync(path.join(t.root, ".craftsman", "events.jsonl"), "utf8"); } catch { return ""; } };

test("merge: completing a plan's last row logs doc_retire_candidate", () => {
  const t = setup([{ unit: "u0", status: "COMPLETE" }, { unit: "u1", status: "IN_PROGRESS" }]);
  try {
    const r = merge(t.context, t.input, t.info, { retireCheck: (plans) => plans.map((plan) => ({ plan, referrers: ["x.md"] })) });
    assert.equal(r.merged, true);
    const hit = events(t).split("\n").filter(Boolean).map((l) => JSON.parse(l)).find((e) => e.ev === "doc_retire_candidate");
    assert.deepEqual({ plan: hit.plan, referrers: hit.referrers }, { plan: "docs/plans/p.md", referrers: ["x.md"] });
  } finally { fs.rmSync(t.root, { recursive: true, force: true }); }
});

test("merge: a plan with another open row logs nothing, and a throwing scan keeps the merge", () => {
  const t = setup([{ unit: "u0", status: "IN_PROGRESS" }, { unit: "u1", status: "IN_PROGRESS" }]);
  try {
    const r = merge(t.context, t.input, t.info, { retireCheck: (plans) => plans.map((plan) => ({ plan, referrers: [] })) });
    assert.equal(r.merged, true);
    assert.doesNotMatch(events(t), /doc_retire_candidate/);
  } finally { fs.rmSync(t.root, { recursive: true, force: true }); }
  const u = setup([{ unit: "u1", status: "IN_PROGRESS" }]);
  try {
    const r = merge(u.context, u.input, u.info, { retireCheck: () => { throw new Error("scan exploded"); } });
    assert.equal(r.merged, true);
  } finally { fs.rmSync(u.root, { recursive: true, force: true }); }
});
