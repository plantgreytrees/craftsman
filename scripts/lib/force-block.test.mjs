import test from "node:test";
import assert from "node:assert/strict";
import { destructiveGit } from "./force-block.mjs";

const own = ["feature/plan-*", "feat/unit-a"];
const blocked = (cmd) => destructiveGit(cmd, own) !== null;

test("force-with-lease to a named own branch is allowed (ARCH-LAND-23)", () => {
  for (const cmd of [
    "git push --force-with-lease origin feature/plan-x",
    "git push --force-with-lease=feature/plan-x:abc123 origin feature/plan-x",
    "git push -u --force-with-lease origin HEAD:feat/unit-a",
    "git push --force-with-lease origin HEAD:refs/heads/feature/plan-y",
    "git -C /tmp/w push --force-with-lease --force-if-includes origin feat/unit-a",
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
