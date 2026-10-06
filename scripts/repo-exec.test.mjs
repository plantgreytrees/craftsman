import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { cleanup, inspectRepo, merge, prepare, sync } from "./repo-exec.mjs";
import { plainArgs } from "./lib/land.mjs";
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
      assert.equal(merged.land, "direct");
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

// repoExec.land:"pr" — for a base branch the host protects against direct
// pushes. The host CLI is faked; git, the push and the bare origin are real.
function usePrLanding(root, repoExec = {}) {
  fs.writeFileSync(path.join(root, "craftsman.config.json"), JSON.stringify({ repoExec: { land: "pr", host: "github", ...repoExec } }));
}

function addOrigin(workspace, root) {
  const origin = path.join(workspace, `${path.basename(root)}-origin.git`);
  git(workspace, ["init", "-q", "--bare", origin]);
  git(root, ["remote", "add", "origin", origin]);
  const base = git(root, ["branch", "--show-current"]);
  git(root, ["push", "-q", "-u", "origin", base]);
  return { origin, base };
}

function fakeGh(existing = null) {
  const calls = [];
  const runner = (cli, args) => {
    calls.push([cli, ...plainArgs(args)].join(" "));
    if (args[0] === "pr" && args[1] === "list") return { status: 0, stdout: JSON.stringify(existing ? [existing] : []), stderr: "" };
    if (args[0] === "pr" && args[1] === "create") return { status: 0, stdout: "https://github.com/o/r/pull/12\n", stderr: "" };
    return { status: 0, stdout: "", stderr: "" };
  };
  return { runner, calls };
}

function commitUnit(context, info, slug) {
  const prepared = prepare(context, { unit: slug, slug }, info);
  fs.writeFileSync(path.join(prepared.worktree_path, `${slug}.txt`), `${slug}\n`);
  git(prepared.worktree_path, ["add", `${slug}.txt`]);
  git(prepared.worktree_path, ["commit", "-q", "-m", `feat: ${slug} through a pull request`]);
  return prepared;
}

test("repo-exec: a direct merge of a pushed branch pushes base and deletes the remote branch too", () => {
  const data = fixture();
  try {
    withManifest(data.manifest, () => {
      const context = projectContext("one");
      const { origin, base } = addOrigin(data.workspace, context.root);
      const info = inspectRepo(context, { base_branch: base });
      const prepared = commitUnit(context, info, "pushed-unit");
      git(prepared.worktree_path, ["push", "-q", "origin", prepared.branch]);
      git(context.root, ["fetch", "-q", "origin"]);
      const unitHead = git(prepared.worktree_path, ["rev-parse", "HEAD"]);

      const merged = merge(context, { ...prepared, unit: "pushed-unit", slug: "pushed-unit" }, info);

      assert.equal(merged.merged, true);
      assert.equal(merged.branch_deleted, true);
      assert.equal(merged.remote_branch_deleted, true);
      assert.equal(git(origin, ["merge-base", "--is-ancestor", unitHead, base]), "", "origin's base contains the unit");
      assert.equal(git(origin, ["branch", "--list", prepared.branch]), "", "the remote branch is gone");
    });
  } finally { fs.rmSync(data.workspace, { recursive: true, force: true }); }
});

// /craftsman:merge lands branches no plan unit prepared — e.g. a Claude Code
// session worktree — by path and branch alone, with no unit or slug.
test("repo-exec: merges a plain .claude/worktrees worktree by path, with no unit or slug", () => {
  const data = fixture();
  try {
    withManifest(data.manifest, () => {
      const context = projectContext("one");
      const info = inspectRepo(context);
      const worktree = path.join(context.root, ".claude", "worktrees", "session-fix");
      git(context.root, ["worktree", "add", "-q", "-b", "worktree-session-fix", worktree]);
      fs.writeFileSync(path.join(worktree, "fix.txt"), "fix\n");
      git(worktree, ["add", "fix.txt"]);
      git(worktree, ["commit", "-q", "-m", "fix: from a session worktree"]);

      const merged = merge(context, { worktree_path: worktree, branch: "worktree-session-fix" }, info);

      assert.equal(merged.merged, true);
      assert.equal(merged.cleaned, true, merged.cleanup_error);
      assert.equal(merged.branch_deleted, true);
      assert.equal(merged.remote_branch_deleted, false, "no remote, nothing to delete");
      assert.equal(fs.existsSync(path.join(context.root, "fix.txt")), true);
      assert.equal(fs.existsSync(worktree), false);
    });
  } finally { fs.rmSync(data.workspace, { recursive: true, force: true }); }
});

test("repo-exec: land:pr pushes only the unit branch, opens a PR, and keeps base untouched", () => {
  const data = fixture();
  try {
    withManifest(data.manifest, () => {
      const context = projectContext("one");
      const { origin, base } = addOrigin(data.workspace, context.root);
      usePrLanding(context.root);
      const info = inspectRepo(context, { base_branch: base });
      const input = { unit: "pr-unit", slug: "pr-unit", session_id: "pr-session", project: "one" };
      const prepared = prepare(context, input, info);
      fs.writeFileSync(path.join(prepared.worktree_path, "pr.txt"), "pr\n");
      git(prepared.worktree_path, ["add", "pr.txt"]);
      git(prepared.worktree_path, ["commit", "-q", "-m", "feat: through a pull request"]);
      const baseBefore = git(origin, ["rev-parse", base]);
      const localBefore = git(context.root, ["rev-parse", "HEAD"]);
      const unitHead = git(prepared.worktree_path, ["rev-parse", "HEAD"]);
      const { runner, calls } = fakeGh();

      const landed = merge(context, { ...prepared, ...input }, info, { runner });

      assert.equal(landed.land, "pr");
      assert.equal(landed.merged, false, "an open PR is not a merge into base");
      assert.equal(landed.pushed, true);
      assert.deepEqual(landed.pr, { host: "github", url: "https://github.com/o/r/pull/12", id: "12", state: "opened" });
      assert.equal(landed.auto_merge, true);
      assert.equal(git(origin, ["rev-parse", prepared.branch]), unitHead, "the unit branch reached origin");
      assert.equal(git(origin, ["rev-parse", base]), baseBefore, "origin's base branch is untouched");
      assert.equal(git(context.root, ["rev-parse", "HEAD"]), localBefore, "the primary checkout is untouched");
      assert.equal(fs.existsSync(path.join(context.root, "pr.txt")), false);
      assert.equal(landed.cleaned, true, landed.cleanup_error);
      assert.equal(landed.branch_deleted, false, "the branch stays until the host merges it");
      assert.equal(fs.existsSync(prepared.worktree_path), false);
      assert.deepEqual(readSessionWorktrees(input, context), []);
      assert.deepEqual(calls.map((line) => line.split(" ").slice(0, 3).join(" ")),
        ["gh auth status", "gh pr list", "gh pr create", "gh pr merge"]);
      assert.match(calls[2], /--title=feat: through a pull request --body=/);
    });
  } finally { fs.rmSync(data.workspace, { recursive: true, force: true }); }
});

test("repo-exec: land:pr reuses an open PR on retry and honours autoMerge:false", () => {
  const data = fixture();
  try {
    withManifest(data.manifest, () => {
      const context = projectContext("one");
      const { base } = addOrigin(data.workspace, context.root);
      usePrLanding(context.root, { autoMerge: false });
      const info = inspectRepo(context, { base_branch: base });
      const prepared = commitUnit(context, info, "retry");
      const { runner, calls } = fakeGh({ url: "https://github.com/o/r/pull/5", number: 5 });
      const landed = merge(context, prepared, info, { runner });
      assert.equal(landed.pr.state, "existing");
      assert.equal(landed.auto_merge, false);
      assert.ok(!calls.some((line) => line.startsWith("gh pr create") || line.startsWith("gh pr merge")));
    });
  } finally { fs.rmSync(data.workspace, { recursive: true, force: true }); }
});

test("repo-exec: land:pr refuses before any push without a remote, host or CLI", () => {
  const data = fixture();
  try {
    withManifest(data.manifest, () => {
      const context = projectContext("one");
      usePrLanding(context.root);
      const info = inspectRepo(context);
      const prepared = commitUnit(context, info, "refused");
      assert.throws(() => merge(context, prepared, info, { runner: fakeGh().runner }), /has no origin remote/);
      assert.equal(fs.existsSync(prepared.worktree_path), true, "a refused landing keeps the worktree");

      const { origin, base } = addOrigin(data.workspace, context.root);
      const withRemote = inspectRepo(context, { base_branch: base });
      usePrLanding(context.root, { host: "auto" });
      assert.throws(() => merge(context, prepared, withRemote, { runner: fakeGh().runner }), /cannot tell which host/);
      usePrLanding(context.root);
      assert.throws(() => merge(context, prepared, withRemote, { runner: () => ({ missing: true }) }), /gh is not installed/);
      assert.equal(git(origin, ["branch", "--list", prepared.branch]), "", "nothing was pushed");

      fs.writeFileSync(path.join(context.root, "craftsman.config.json"), JSON.stringify({ repoExec: { land: "rebase-it" } }));
      assert.throws(() => merge(context, prepared, withRemote), /repoExec.land must be/);
    });
  } finally { fs.rmSync(data.workspace, { recursive: true, force: true }); }
});
