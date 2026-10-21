// ARCH-SAFETY-06: the unpushed-work report, built from local refs only. Each case builds a real
// repo (with a bare remote) in a temp dir.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import * as unpushed from "./unpushed.mjs";

function git(cwd, ...args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
  return r.stdout.trim();
}

function fixture() {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-unpushed-")));
  const remote = path.join(base, "remote.git");
  const repo = path.join(base, "repo");
  git(base, "init", "-q", "--bare", "-b", "main", remote);
  git(base, "init", "-q", "-b", "main", repo);
  for (const [k, v] of [["user.email", "t@example.com"], ["user.name", "t"], ["commit.gpgsign", "false"]]) git(repo, "config", k, v);
  fs.writeFileSync(path.join(repo, "a.txt"), "a\n");
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "init");
  git(repo, "remote", "add", "origin", remote);
  git(repo, "push", "-q", "-u", "origin", "main");
  return { base, repo, remote, cleanup: () => fs.rmSync(base, { recursive: true, force: true }) };
}
const lines = (repo) => unpushed.unpushedReport(repo).lines;
const commit = (cwd, file, msg = "work") => { fs.writeFileSync(path.join(cwd, file), `${msg}\n`); git(cwd, "add", "-A"); git(cwd, "commit", "-q", "-m", msg); };

test("unpushedReport: a clean, pushed repo reports nothing", () => {
  const f = fixture();
  try { assert.deepEqual(lines(f.repo), []); } finally { f.cleanup(); }
});

test("unpushedReport: not a git repository reports nothing", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-notgit-"));
  try { assert.deepEqual(lines(dir), []); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("unpushedReport: uncommitted changes in the main checkout, ignoring craftsman's own state", () => {
  const f = fixture();
  try {
    fs.mkdirSync(path.join(f.repo, ".craftsman"));
    fs.writeFileSync(path.join(f.repo, ".craftsman", "state.json"), "{}");
    assert.deepEqual(lines(f.repo), [], "only .craftsman state: nothing to report");
    fs.writeFileSync(path.join(f.repo, "a.txt"), "changed\n");
    fs.writeFileSync(path.join(f.repo, "new.txt"), "new\n");
    const out = lines(f.repo);
    assert.equal(out.length, 1);
    assert.match(out[0], /uncommitted changes in the main checkout: 2 file\(s\)/);
  } finally { f.cleanup(); }
});

test("unpushedReport: a stash entry", () => {
  const f = fixture();
  try {
    fs.writeFileSync(path.join(f.repo, "a.txt"), "stash me\n");
    git(f.repo, "stash", "push", "-q", "-m", "wip");
    assert.deepEqual(lines(f.repo), ["1 stash entry (git stash list)"]);
  } finally { f.cleanup(); }
});

test("unpushedReport: a branch ahead of its upstream", () => {
  const f = fixture();
  try {
    commit(f.repo, "b.txt");
    commit(f.repo, "c.txt");
    assert.deepEqual(lines(f.repo), ["branch main is ahead of origin/main by 2 commit(s)"]);
  } finally { f.cleanup(); }
});

test("unpushedReport: a branch with no upstream and commits on no remote; one fully on a remote is not reported", () => {
  const f = fixture();
  try {
    git(f.repo, "branch", "copy");
    assert.deepEqual(lines(f.repo), [], "copy points at a pushed commit");
    git(f.repo, "checkout", "-q", "-b", "feature");
    commit(f.repo, "f.txt");
    assert.deepEqual(lines(f.repo), ["branch feature has no upstream: 1 commit(s) on no remote"]);
  } finally { f.cleanup(); }
});

test("unpushedReport: a branch whose upstream is gone and still holds commits on no remote", () => {
  const f = fixture();
  try {
    git(f.repo, "checkout", "-q", "-b", "topic");
    commit(f.repo, "t.txt");
    git(f.repo, "push", "-q", "-u", "origin", "topic");
    git(f.repo, "checkout", "-q", "main");
    git(f.repo, "push", "-q", "origin", "--delete", "topic");
    git(f.repo, "fetch", "-q", "--prune");
    assert.deepEqual(lines(f.repo), ["branch topic's upstream origin/topic is gone: 1 commit(s) on no remote"]);
  } finally { f.cleanup(); }
});

test("unpushedReport: uncommitted work and detached commits in a linked worktree", () => {
  const f = fixture();
  try {
    const wt = path.join(f.base, "wt");
    git(f.repo, "worktree", "add", "-q", "-b", "wtbranch", wt);
    fs.writeFileSync(path.join(wt, "wip.txt"), "wip\n");
    const detached = path.join(f.base, "detached");
    git(f.repo, "worktree", "add", "-q", "--detach", detached);
    for (const [k, v] of [["user.email", "t@example.com"], ["user.name", "t"]]) git(detached, "config", k, v);
    commit(detached, "d.txt");
    const out = lines(f.repo);
    assert.ok(out.some((l) => l === `uncommitted changes in ${wt}: 1 file(s)`), out.join("\n"));
    assert.ok(out.some((l) => l === `detached HEAD in ${detached} holds 1 commit(s) on no branch`), out.join("\n"));
    assert.equal(out.length, 2, "wtbranch sits on a pushed commit and is not reported");
  } finally { f.cleanup(); }
});

test("unpushedReport: local refs only, so it works with the remote unreachable", () => {
  const f = fixture();
  try {
    commit(f.repo, "x.txt");
    git(f.repo, "remote", "set-url", "origin", path.join(f.base, "does-not-exist.git"));
    assert.deepEqual(lines(f.repo), ["branch main is ahead of origin/main by 1 commit(s)"]);
  } finally { f.cleanup(); }
});

test("unpushedReport: a long report is capped and says how many were left out; formatReport headlines it", () => {
  const f = fixture();
  try {
    for (let i = 0; i < 5; i++) { git(f.repo, "checkout", "-q", "-b", `b${i}`, "main"); commit(f.repo, `b${i}.txt`); }
    const report = unpushed.unpushedReport(f.repo, { max: 3 });
    assert.equal(report.lines.length, 4);
    assert.match(report.lines[3], /… and 2 more/);
    assert.match(unpushed.formatReport(report.lines), /^craftsman: unpushed work \(local refs only\):\n  - /);
    assert.equal(unpushed.formatReport([]), "");
  } finally { f.cleanup(); }
});
