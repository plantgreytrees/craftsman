import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { baseRefs, listWorktrees, lockOwnerAlive, sweep } from "./worktree-sweep.mjs";

function git(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

// A repo whose main is pushed to a bare remote: a branch counts as merged only into origin/main
// (ARCH-SAFETY-07). `remote: false` is a repo with no remote at all.
function fixture({ remote = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-sweep-"));
  git(root, ["init", "-q", "-b", "main"]);
  git(root, ["config", "user.email", "test@example.com"]);
  git(root, ["config", "user.name", "test"]);
  fs.writeFileSync(path.join(root, "README.md"), "fixture\n");
  fs.writeFileSync(path.join(root, ".gitignore"), "node_modules/\n.env\ndata/\n");
  git(root, ["add", "-A"]);
  git(root, ["commit", "-q", "-m", "init"]);
  if (remote) {
    const bare = `${root}-remote.git`;
    spawnSync("git", ["init", "-q", "--bare", "-b", "main", bare]);
    git(root, ["remote", "add", "origin", bare]);
    git(root, ["push", "-q", "-u", "origin", "main"]);
  }
  return root;
}
const cleanup = (root) => { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(`${root}-remote.git`, { recursive: true, force: true }); };

// A worktree on its own branch; `ahead` adds a commit main does not have. Lives in .worktrees/ (repo-exec's
// home); `dir: ".claude/worktrees"` is Claude Code's own.
function addWorktree(root, name, { ahead = false, dir = ".worktrees" } = {}) {
  const worktree = path.join(root, dir, name);
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
    assert.equal(inv.merged.merged_into, "origin/main");
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
  } finally { cleanup(root); }
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
  } finally { cleanup(root); }
});

test("worktree-sweep: a merged feature/ branch is never swept", () => {
  const root = fixture();
  try {
    const worktree = path.join(root, ".worktrees", "plan-f1");
    git(root, ["worktree", "add", "-q", "-b", "feature/plan-f1", worktree]);
    const entry = byName(listWorktrees(root))["plan-f1"];
    assert.equal(entry.removable, false);
    assert.equal(entry.keep_reason, "feature branch");
    const result = sweep(root, { all_merged: true });
    assert.deepEqual(result.removed, []);
    assert.equal(fs.existsSync(worktree), true);
  } finally { cleanup(root); }
});

test("worktree-sweep: .gitignore ignores .claude/worktrees/", () => {
  const ignore = fs.readFileSync(new URL("../.gitignore", import.meta.url), "utf8");
  assert.match(ignore, /^\.claude\/worktrees\/$/m);
});

// ---- ARCH-SAFETY-07 -------------------------------------------------------------------------

const readLog = (root) => fs.readFileSync(path.join(root, ".craftsman", "sweep-log.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));

test("worktree-sweep: baseRefs are remote-tracking refs only, never local main or master (10.1)", () => {
  const root = fixture();
  try {
    assert.deepEqual(baseRefs(root), ["origin/main"]);
    git(root, ["branch", "master"]);
    assert.deepEqual(baseRefs(root), ["origin/main"], "a local master is not a base");
  } finally { cleanup(root); }
});

test("worktree-sweep: a branch merged only into LOCAL main is kept; once main is pushed it can go (10.1)", () => {
  const root = fixture();
  try {
    const wt = addWorktree(root, "local-only", { ahead: true });
    git(root, ["merge", "-q", "--no-ff", "-m", "merge", "worktree-local-only"]);
    const kept = byName(listWorktrees(root))["local-only"];
    assert.equal(kept.removable, false);
    assert.match(kept.keep_reason, /not merged into the base branch/);
    assert.deepEqual(sweep(root, { all_merged: true }).removed, []);
    git(root, ["push", "-q", "origin", "main"]);
    assert.equal(byName(listWorktrees(root))["local-only"].removable, true);
    assert.equal(sweep(root, { all_merged: true }).removed.length, 1);
    assert.equal(fs.existsSync(wt), false);
  } finally { cleanup(root); }
});

test("worktree-sweep: with no remote ref at all nothing is merged, so nothing is swept (10.1)", () => {
  const root = fixture({ remote: false });
  try {
    assert.deepEqual(baseRefs(root), []);
    const wt = addWorktree(root, "no-remote");
    const entry = byName(listWorktrees(root))["no-remote"];
    assert.equal(entry.removable, false);
    assert.match(entry.keep_reason, /not merged into the base branch/);
    assert.deepEqual(sweep(root, { all_merged: true }).removed, []);
    assert.equal(fs.existsSync(wt), true);
  } finally { cleanup(root); }
});

test("worktree-sweep: ignored files that are not disposable keep a worktree; only build dirs may go (10.2)", () => {
  const root = fixture();
  try {
    const withEnv = addWorktree(root, "has-env");
    fs.writeFileSync(path.join(withEnv, ".env"), "SECRET=1\n");
    const withDb = addWorktree(root, "has-db");
    fs.mkdirSync(path.join(withDb, "data"));
    fs.writeFileSync(path.join(withDb, "data", "local.db"), "db");
    const buildOnly = addWorktree(root, "build-only");
    fs.mkdirSync(path.join(buildOnly, "node_modules", "dep"), { recursive: true });
    fs.writeFileSync(path.join(buildOnly, "node_modules", "dep", "index.js"), "x");
    const inv = byName(listWorktrees(root));
    assert.equal(inv["has-env"].removable, false);
    assert.match(inv["has-env"].keep_reason, /ignored file\(s\) that are not disposable: \.env/);
    assert.match(inv["has-db"].keep_reason, /ignored file\(s\) that are not disposable: data/);
    assert.equal(inv["build-only"].removable, true, "node_modules is a build dir");
    const result = sweep(root, { all_merged: true });
    assert.deepEqual(result.removed.map((r) => path.basename(r.path)), ["build-only"]);
    assert.equal(fs.existsSync(path.join(withEnv, ".env")), true);
    assert.equal(fs.existsSync(path.join(withDb, "data", "local.db")), true);
  } finally { cleanup(root); }
});

test("worktree-sweep: worktrees.disposable is configurable (10.2)", () => {
  const root = fixture();
  try {
    fs.writeFileSync(path.join(root, "craftsman.config.json"), JSON.stringify({ worktrees: { disposable: ["data/**", "**/node_modules/**"] } }));
    const wt = addWorktree(root, "data-ok");
    fs.mkdirSync(path.join(wt, "data"));
    fs.writeFileSync(path.join(wt, "data", "scratch.db"), "db");
    assert.equal(byName(listWorktrees(root))["data-ok"].removable, true);
  } finally { cleanup(root); }
});

test("worktree-sweep: every branch deletion is logged with its sha first, and the sha restores it (10.3)", () => {
  const root = fixture();
  try {
    const wt = addWorktree(root, "logged");
    const sha = git(wt, ["rev-parse", "HEAD"]);
    const result = sweep(root, { all_merged: true });
    assert.equal(result.removed[0].branch_deleted, true);
    const [line] = readLog(root);
    assert.equal(line.branch, "worktree-logged");
    assert.equal(line.sha, sha);
    assert.match(line.reason, /merged into origin\/main/);
    assert.ok(Date.parse(line.time) > 0);
    assert.equal(git(root, ["branch", "--list", "worktree-logged"]), "");
    git(root, ["branch", line.branch, line.sha]);
    assert.equal(git(root, ["rev-parse", "worktree-logged"]), sha, "git branch <name> <sha> restores it");
  } finally { cleanup(root); }
});

test("worktree-sweep: if the log cannot be appended the branch is not deleted (10.3)", () => {
  const root = fixture();
  try {
    addWorktree(root, "unlogged");
    fs.writeFileSync(path.join(root, ".craftsman"), "a file where the state dir should be");
    const result = sweep(root, { all_merged: true });
    assert.equal(result.removed.length, 1, "the clean, merged worktree itself still goes");
    assert.equal(result.removed[0].branch_deleted, false);
    assert.equal(git(root, ["branch", "--list", "worktree-unlogged"]).replace(/^[*+ ]+/, ""), "worktree-unlogged");
  } finally { cleanup(root); }
});

test("worktree-sweep: .claude/worktrees is never swept unless worktrees.sweepClaudeWorktrees is true (10.4)", () => {
  const root = fixture();
  try {
    const claude = addWorktree(root, "claude-owned", { dir: ".claude/worktrees" });
    const mine = addWorktree(root, "repo-exec-owned");
    const off = byName(listWorktrees(root));
    assert.equal(off["claude-owned"].removable, false);
    assert.match(off["claude-owned"].keep_reason, /worktrees\.sweepClaudeWorktrees/);
    assert.equal(off["repo-exec-owned"].removable, true, ".worktrees is repo-exec's and is still swept");
    assert.deepEqual(sweep(root, { all_merged: true }).removed.map((r) => path.basename(r.path)), ["repo-exec-owned"]);
    assert.equal(fs.existsSync(claude), true);
    fs.writeFileSync(path.join(root, "craftsman.config.json"), JSON.stringify({ worktrees: { sweepClaudeWorktrees: true } }));
    assert.equal(byName(listWorktrees(root))["claude-owned"].removable, true);
    assert.equal(sweep(root, { all_merged: true }).removed.length, 1);
    assert.equal(fs.existsSync(claude), false);
    assert.equal(fs.existsSync(mine), false);
  } finally { cleanup(root); }
});

test("worktree-sweep: the shipped config keeps .claude/worktrees and lists the build dirs as disposable (10.2, 10.4)", () => {
  const cfg = JSON.parse(fs.readFileSync(new URL("../craftsman.config.json", import.meta.url), "utf8"));
  assert.equal(cfg.worktrees.sweepClaudeWorktrees, false);
  for (const dir of ["node_modules", "dist", "build", "target", "coverage", ".cache"]) {
    assert.ok(cfg.worktrees.disposable.some((p) => p.includes(`/${dir}/`)), dir);
  }
});
