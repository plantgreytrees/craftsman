import test from "node:test";
import assert from "node:assert/strict";
import { destructiveGit } from "./force-block.mjs";

const own = ["feature/plan-*", "feat/unit-a"];
const blocked = (cmd) => destructiveGit(cmd, own) !== null;

test("force-with-lease to a named own branch is allowed (ARCH-LAND-23)", () => {
  for (const cmd of [
    "git push --force-with-lease origin feature/plan-x:refs/heads/feature/plan-x",
    "git push --force-with-lease=feature/plan-x:abc123 origin HEAD:refs/heads/feature/plan-x",
    "git push -u --force-with-lease origin HEAD:refs/heads/feat/unit-a",
    "git push --force-with-lease origin HEAD:refs/heads/feature/plan-y",
    "git -C /tmp/w push --force-with-lease --force-if-includes origin feat/unit-a:refs/heads/feat/unit-a",
  ]) assert.equal(destructiveGit(cmd, own), null, cmd);
});

test("force-with-lease elsewhere, and every other force, is refused", () => {
  for (const cmd of [
    "git push --force-with-lease origin main",
    "git push --force-with-lease origin HEAD:main",
    "git push --force-with-lease origin other-branch",
    "git push --force-with-lease origin feature/plan-x main",
    "git push --force-with-lease origin",
    "git push --force-with-lease",
    "git push --force-with-lease --all origin",
    "git push --force-with-lease --force origin feat/unit-a",
    "git push --force-with-lease -f origin feat/unit-a",
    "git push --force-with-lease origin +feat/unit-a",
    "git push --force-with-lease origin +HEAD:feat/unit-a",
    "git push --force-with-lease origin feature/plan-x/y",
    "git push --force-with-lease origin $BRANCH",
    "git push --force origin feat/unit-a",
    "git push -f origin feat/unit-a",
    "git push origin +feat/unit-a",
    "git reset --hard",
    "git worktree remove --force wt",
    "bash -c 'git push --force-with-lease origin main'",
  ]) assert.ok(blocked(cmd), cmd);
});

test("without own branches force-with-lease stays refused", () => {
  assert.equal(destructiveGit("git push --force-with-lease origin feat/unit-a"), "git push --force");
});

test("a lease push is refused when the shell could expand a ref into another branch (round 9)", () => {
  const dollar = "$";
  for (const cmd of [
    `X=x:main; git push --force-with-lease origin feature/plan-${dollar}X`,
    `git push --force-with-lease origin HEAD:feature/plan-\`echo :main\``,
    `git push --force-with-lease origin HEAD:feature/plan-${dollar}(echo :main)`,
    `git push --force-with-lease origin HEAD:feature/plan-${dollar}'\\x3a'main`,
    "git push --force-with-lease origin HEAD:feature/plan-x:main",
    "git push --force-with-lease origin feature/plan-{x,y}",
    "git push --force-with-lease origin feature/plan-*",
    "git push --force-with-lease origin feature/plan-?",
    "git push --force-with-lease origin feature/plan-[x]",
    "git push --force-with-lease origin feature/plan-",
    "git push --force-with-lease origin feat/unit-a:feat/unit-a:main",
  ]) assert.ok(blocked(cmd), cmd);
});

test("ownBranchesOf matches the bound branch exactly and rejects odd names (round 9)", async () => {
  const { ownBranchesOf } = await import("./force-block.mjs");
  assert.deepEqual(ownBranchesOf({ branch: "feat/unit-a" }, { plan: "docs/plans/p.md" }), ["feat/unit-a", "feature/p-*"]);
  for (const odd of ["*", "feat/*", "a b", "feat/x;y", "main", "master", "feat/${x}"]) assert.deepEqual(ownBranchesOf({ branch: odd }, null), [], odd);
  assert.ok(destructiveGit("git push --force-with-lease origin HEAD:main", ownBranchesOf({ branch: "*" }, null)), "a star branch must not open main");
});

test("a lease push needs a fully qualified own destination and no config override (round 10)", () => {
  const ok = "git push --force-with-lease origin HEAD:refs/heads/feat/unit-a";
  assert.equal(destructiveGit(ok, own), null);
  for (const cmd of [
    "git push --force-with-lease origin feat/unit-a", // colon-less: git applies remote.<n>.push / push.default
    "git push --force-with-lease origin HEAD:feat/unit-a", // dst not fully qualified
    "git push --force-with-lease origin HEAD:heads/feat/unit-a",
    "git push --force-with-lease origin HEAD:refs/heads/main",
    "git -c remote.origin.push=refs/heads/feat/unit-a:refs/heads/main " + ok.replace("git ", "").replace(/^pu/, "pu"),
    "git --config-env=remote.origin.push=X " + ok.replace("git ", ""),
    "git --git-dir=/tmp/x " + ok.replace("git ", ""),
    "git --work-tree=/tmp/x " + ok.replace("git ", ""),
    "GIT_CONFIG_COUNT=1 " + ok,
    "env " + ok,
  ]) assert.ok(blocked(cmd), cmd);
  assert.equal(destructiveGit("git -C /tmp/w " + ok.replace("git ", ""), own), null, "-C stays allowed");
});

test("ownBranchesOf rejects names that resolve to a protected ref (round 10)", async () => {
  const { ownBranchesOf } = await import("./force-block.mjs");
  for (const odd of ["HEAD", "-x", "refs/heads/main", "refs/heads/feat/a", "heads/main", "heads/feat/a", "Main", "MASTER", "a/main", "a/Master"]) assert.deepEqual(ownBranchesOf({ branch: odd }, null), [], odd);
  assert.deepEqual(ownBranchesOf({ branch: "feat/unit-a" }, null), ["feat/unit-a"]);
});
