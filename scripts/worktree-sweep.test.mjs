import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { listWorktrees, lockOwnerAlive, sweep } from "./worktree-sweep.mjs";

function git(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-sweep-"));
  git(root, ["init", "-q", "-b", "main"]);
  git(root, ["config", "user.email", "test@example.com"]);
  git(root, ["config", "user.name", "test"]);
  fs.writeFileSync(path.join(root, "README.md"), "fixture\n");
  git(root, ["add", "README.md"]);
  git(root, ["commit", "-q", "-m", "init"]);
  return root;
}

// A worktree on its own branch; `ahead` adds a commit main does not have.
function addWorktree(root, name, { ahead = false } = {}) {
  const worktree = path.join(root, ".claude", "worktrees", name);
  git(root, ["worktree", "add", "-q", "-b", `worktree-${name}`, worktree]);
  if (ahead) {
    fs.writeFileSync(path.join(worktree, `${name}.txt`), `${name}\n`);
    git(worktree, ["add", "."]);
    git(worktree, ["commit", "-q", "-m", `wip ${name}`]);
  }
  return worktree;
}

function deadPid() {
  return spawnSync(process.execPath, ["-e", ""]).pid; // exited by the time this returns
}

function byName(inventory) {
  return Object.fromEntries(inventory.map((e) => [path.basename(e.path), e]));
}

test("worktree-sweep: lock owners — dead pid, reused pid, live pid, and a human lock", () => {
  assert.equal(lockOwnerAlive(`claude session x (pid ${deadPid()} start 1)`), false);
  assert.equal(lockOwnerAlive(`claude session x (pid ${process.pid})`), true);
  assert.equal(lockOwnerAlive("do not touch — rebasing"), null);
  if (fs.existsSync(`/proc/${process.pid}/stat`)) {
    assert.equal(lockOwnerAlive(`claude session x (pid ${process.pid} start 1)`), false, "a reused pid is not the lock owner");
  }
});

test("worktree-sweep: only merged, clean, unowned worktrees are removable", () => {
  const root = fixture();
  try {
    addWorktree(root, "merged");
    addWorktree(root, "unmerged", { ahead: true });
    fs.writeFileSync(path.join(addWorktree(root, "dirty"), "scratch.txt"), "x\n");
    git(root, ["worktree", "lock", "--reason", `claude session live (pid ${process.pid})`, addWorktree(root, "live")]);
    git(root, ["worktree", "lock", "--reason", `claude session gone (pid ${deadPid()})`, addWorktree(root, "orphan")]);
    git(root, ["worktree", "lock", "--reason", "keep: manual bisect", addWorktree(root, "human")]);
    const here = addWorktree(root, "here");

    const inv = byName(listWorktrees(root, { cwd: here }));
    assert.equal(inv.merged.removable, true);
    assert.equal(inv.merged.merged_into, "main");
    assert.equal(inv.orphan.removable, true, "a lock held by a dead process is an orphan");
    assert.match(inv.unmerged.keep_reason, /not merged/);
    assert.match(inv.dirty.keep_reason, /uncommitted/);
    assert.match(inv.live.keep_reason, /live session/);
    assert.match(inv.human.keep_reason, /manual bisect/);
    assert.match(inv.here.keep_reason, /current working directory/);

    const result = sweep(root, { all_merged: true, cwd: here });
    assert.deepEqual(result.removed.map((r) => path.basename(r.path)).sort(), ["merged", "orphan"]);
    assert.ok(result.removed.every((r) => r.branch_deleted));
    const left = listWorktrees(root, { cwd: here }).map((e) => path.basename(e.path)).sort();
    assert.deepEqual(left, ["dirty", "here", "human", "live", "unmerged"]);
    assert.equal(git(root, ["branch", "--list", "worktree-unmerged"]).replace(/^[*+ ]+/, ""), "worktree-unmerged");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("worktree-sweep: an explicitly named worktree that must be kept is skipped with its reason", () => {
  const root = fixture();
  try {
    const unmerged = addWorktree(root, "unmerged", { ahead: true });
    const result = sweep(root, { paths: [unmerged, path.join(root, "nope")] });
    assert.deepEqual(result.removed, []);
    assert.match(result.skipped.find((s) => s.path === unmerged).reason, /not merged/);
    assert.match(result.skipped.find((s) => s.path.endsWith("nope")).reason, /not a worktree/);
    assert.equal(fs.existsSync(unmerged), true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
