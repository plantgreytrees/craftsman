import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { cleanup, inspectRepo, merge, prepare, sync } from "./repo-exec.mjs";
import { projectContext, readSessionWorktrees } from "./lib/core.mjs";

function git(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

function fixture() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-repo-exec-"));
  const projects = { one: "one", two: "two" };
  for (const relative of Object.values(projects)) {
    const root = path.join(workspace, relative);
    fs.mkdirSync(root, { recursive: true });
    git(root, ["init", "-q"]);
    git(root, ["config", "user.email", "test@example.com"]);
    git(root, ["config", "user.name", "test"]);
    fs.writeFileSync(path.join(root, "README.md"), `${relative}\n`);
    git(root, ["add", "README.md"]);
    git(root, ["commit", "-q", "-m", "init"]);
  }
  const manifest = path.join(workspace, "craftsman.workspace.json");
  fs.writeFileSync(manifest, JSON.stringify({ version: 1, projects: Object.fromEntries(
    Object.entries(projects).map(([id, root]) => [id, { root }])
  ) }));
  return { workspace, manifest };
}

function withManifest(file, callback) {
  const previous = process.env.CRAFTSMAN_WORKSPACE_MANIFEST;
  process.env.CRAFTSMAN_WORKSPACE_MANIFEST = file;
  try { return callback(); }
  finally {
    if (previous === undefined) delete process.env.CRAFTSMAN_WORKSPACE_MANIFEST;
    else process.env.CRAFTSMAN_WORKSPACE_MANIFEST = previous;
  }
}

test("repo-exec: prepares, merges, and cleans a selected repository locally", () => {
  const data = fixture();
  try {
    withManifest(data.manifest, () => {
      const context = projectContext("one");
      const info = inspectRepo(context);
      assert.equal(info.project, "one");
      assert.equal(info.has_remote, false);
      const prepared = prepare(context, { unit: "unit-one", slug: "unit-one" }, info);
      assert.equal(prepared.reattached, false);
      fs.writeFileSync(path.join(prepared.worktree_path, "feature.txt"), "feature\n");
      git(prepared.worktree_path, ["add", "feature.txt"]);
      git(prepared.worktree_path, ["commit", "-q", "-m", "feat: selected project"]);
      const synced = sync(context, { ...prepared, unit: "unit-one", slug: "unit-one" }, info);
      assert.equal(synced.project_root, context.root);
      const merged = merge(context, { ...prepared, unit: "unit-one", slug: "unit-one" }, info);
      assert.equal(merged.merged, true);
      assert.equal(merged.cleaned, true, "a successful merge cleans its own worktree");
      assert.equal(merged.branch_deleted, true);
      assert.equal(fs.existsSync(path.join(context.root, "feature.txt")), true);
      assert.equal(fs.existsSync(prepared.worktree_path), false);
      assert.equal(git(context.root, ["branch", "--list", prepared.branch]), "");
    });
  } finally { fs.rmSync(data.workspace, { recursive: true, force: true }); }
});

// The session ledger is what makes stop-gate.mjs's worktree sweep session-local:
// only a worktree this session prepared is ever swept, and cleanup must retract
// it so a finished unit stops being the session's responsibility.
test("repo-exec: prepare records the worktree in the session ledger and cleanup forgets it", () => {
  const data = fixture();
  try {
    withManifest(data.manifest, () => {
      const context = projectContext("one");
      const info = inspectRepo(context);
      const input = { unit: "ledger-unit", slug: "ledger-unit", session_id: "ledger-session", project: "one" };
      const prepared = prepare(context, input, info);
      assert.deepEqual(
        readSessionWorktrees(input, context),
        [path.resolve(prepared.worktree_path)],
        "prepare must record the worktree for this session"
      );
      assert.deepEqual(
        readSessionWorktrees({ ...input, session_id: "other-session" }, context),
        [],
        "another session must not inherit this session's worktree"
      );
      cleanup(context, { ...prepared, ...input }, info);
      assert.deepEqual(readSessionWorktrees(input, context), []);
    });
  } finally { fs.rmSync(data.workspace, { recursive: true, force: true }); }
});

test("repo-exec: identical unit slugs use independent repositories and worktrees", () => {
  const data = fixture();
  try {
    withManifest(data.manifest, () => {
      const one = projectContext("one");
      const two = projectContext("two");
      const first = prepare(one, { unit: "same", slug: "same" }, inspectRepo(one));
      const second = prepare(two, { unit: "same", slug: "same" }, inspectRepo(two));
      assert.notEqual(first.worktree_path, second.worktree_path);
      assert.equal(first.branch, second.branch, "repository-local branch names may be reused safely");
      cleanup(one, { ...first, unit: "same", slug: "same" }, inspectRepo(one));
      cleanup(two, { ...second, unit: "same", slug: "same" }, inspectRepo(two));
    });
  } finally { fs.rmSync(data.workspace, { recursive: true, force: true }); }
});

test("repo-exec: refuses an ambiguous feature branch without an explicit base", () => {
  const data = fixture();
  try {
    withManifest(data.manifest, () => {
      const root = projectContext("one").root;
      git(root, ["checkout", "-q", "-b", "feat/current"]);
      assert.throws(() => inspectRepo(projectContext("one")), /cannot infer a safe base branch/);
      assert.equal(inspectRepo(projectContext("one"), { base_branch: "feat/current" }).base_branch, "feat/current");
    });
  } finally { fs.rmSync(data.workspace, { recursive: true, force: true }); }
});

test("repo-exec: reclaims an ownerless stale merge lock", () => {
  const data = fixture();
  try {
    withManifest(data.manifest, () => {
      const context = projectContext("one");
      const info = inspectRepo(context);
      const lock = path.join(info.common_git_dir, ".craftsman", "merge-locks", `${info.base_branch}.lock`);
      fs.mkdirSync(lock, { recursive: true });
      const stale = new Date(Date.now() - 31 * 60 * 1000);
      fs.utimesSync(lock, stale, stale);
      const prepared = prepare(context, { unit: "stale-lock", slug: "stale-lock" }, info);
      fs.writeFileSync(path.join(prepared.worktree_path, "stale.txt"), "stale\n");
      git(prepared.worktree_path, ["add", "stale.txt"]);
      git(prepared.worktree_path, ["commit", "-q", "-m", "feat: reclaim lock"]);
      assert.equal(merge(context, prepared, info).merged, true);
    });
  } finally { fs.rmSync(data.workspace, { recursive: true, force: true }); }
});

// Before, cleanup ran `git branch -d`, which judges "merged" against the
// primary checkout's HEAD. merge() restores whatever branch was checked out,
// so with the primary checkout on another branch -d refused AFTER the
// worktree was removed, stranding the branch and the session ledger entry.
test("repo-exec: merge cleans up even when the primary checkout is not on the base branch", () => {
  const data = fixture();
  try {
    withManifest(data.manifest, () => {
      const context = projectContext("one");
      const info = inspectRepo(context);
      git(context.root, ["checkout", "-q", "-b", "scratch"]);
      const input = { unit: "off-base", slug: "off-base", session_id: "off-base-session", project: "one" };
      const prepared = prepare(context, input, info);
      fs.writeFileSync(path.join(prepared.worktree_path, "off.txt"), "off\n");
      git(prepared.worktree_path, ["add", "off.txt"]);
      git(prepared.worktree_path, ["commit", "-q", "-m", "feat: off base"]);
      const merged = merge(context, { ...prepared, ...input }, info);
      assert.equal(merged.cleaned, true, merged.cleanup_error);
      assert.equal(merged.branch_deleted, true);
      assert.equal(git(context.root, ["branch", "--show-current"]), "scratch");
      assert.equal(git(context.root, ["branch", "--list", prepared.branch]), "");
      assert.deepEqual(readSessionWorktrees(input, context), []);
    });
  } finally { fs.rmSync(data.workspace, { recursive: true, force: true }); }
});

test("repo-exec: cleanup:false keeps the worktree; cleanup of an unmerged branch keeps the branch", () => {
  const data = fixture();
  try {
    withManifest(data.manifest, () => {
      const context = projectContext("one");
      const info = inspectRepo(context);
      const kept = prepare(context, { unit: "kept", slug: "kept" }, info);
      fs.writeFileSync(path.join(kept.worktree_path, "kept.txt"), "kept\n");
      git(kept.worktree_path, ["add", "kept.txt"]);
      git(kept.worktree_path, ["commit", "-q", "-m", "feat: kept"]);
      const merged = merge(context, { ...kept, cleanup: false }, info);
      assert.equal(merged.cleaned, false);
      assert.equal(fs.existsSync(kept.worktree_path), true);
      cleanup(context, kept, info);

      const parked = prepare(context, { unit: "parked", slug: "parked" }, info);
      fs.writeFileSync(path.join(parked.worktree_path, "wip.txt"), "wip\n");
      git(parked.worktree_path, ["add", "wip.txt"]);
      git(parked.worktree_path, ["commit", "-q", "-m", "wip: parked"]);
      const cleaned = cleanup(context, parked, info);
      assert.equal(cleaned.branch_deleted, false, "a parked branch must survive its worktree");
      assert.equal(fs.existsSync(parked.worktree_path), false);
      assert.equal(git(context.root, ["branch", "--list", parked.branch]).replace(/^[*+ ]+/, ""), parked.branch);
    });
  } finally { fs.rmSync(data.workspace, { recursive: true, force: true }); }
});
