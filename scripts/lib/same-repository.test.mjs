// ARCH-STATE-24: one sameRepository for Stop's baseline lookup and scope.mjs's worktree check. Equal real paths, else equal real
// git common directories; a git failure, a missing directory or a non-repository is a different repository.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { sameRepository } from "./same-repository.mjs";

const scratch = (prefix = "same-repo-") => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
function repo(prefix) {
  const dir = scratch(prefix);
  git(dir, "init", "-q");
  git(dir, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "init");
  return dir;
}

test("the same directory is the same repository without asking git", () => {
  const dir = scratch();
  assert.equal(sameRepository(dir, dir), true);
});

test("a symlinked spelling of the same repository is the same repository, in either order (/home against /var/home)", () => {
  const dir = repo();
  const link = path.join(scratch(), "link");
  fs.symlinkSync(dir, link);
  assert.equal(sameRepository(dir, link), true);
  assert.equal(sameRepository(link, dir), true);
});

test("a symlinked spelling of a linked worktree matches the main checkout through the git common directory", () => {
  const dir = repo();
  const wt = path.join(scratch(), "wt");
  git(dir, "worktree", "add", "-q", "-b", "side", wt);
  const link = path.join(scratch(), "wt-link");
  fs.symlinkSync(wt, link);
  const mainLink = path.join(scratch(), "main-link");
  fs.symlinkSync(dir, mainLink);
  assert.equal(sameRepository(dir, link), true);
  assert.equal(sameRepository(mainLink, wt), true);
  assert.equal(sameRepository(mainLink, link), true);
  git(dir, "worktree", "remove", "--force", wt);
});

test("two different repositories are not the same repository", () => {
  assert.equal(sameRepository(repo(), repo()), false);
});

test("a git failure, a missing directory or a directory that is not a repository is a different repository", () => {
  const dir = repo();
  const bare = scratch();
  assert.equal(sameRepository(dir, bare), false);
  assert.equal(sameRepository(bare, dir), false);
  assert.equal(sameRepository(dir, path.join(bare, "missing")), false);
  assert.equal(sameRepository(path.join(bare, "missing"), dir), false);
});

test("stop-gate.mjs and scope.mjs import the one helper and define no sameRepository of their own", () => {
  for (const name of ["stop-gate.mjs", "scope.mjs"]) {
    const source = fs.readFileSync(fileURLToPath(new URL(`../${name}`, import.meta.url)), "utf8");
    assert.match(source, /from "\.\/lib\/same-repository\.mjs"/, name);
    assert.doesNotMatch(source, /function sameRepository/, name);
  }
});
