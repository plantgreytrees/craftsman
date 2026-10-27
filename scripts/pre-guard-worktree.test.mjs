import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { worktreeBindingPath } from "./lib/core.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const GUARD = path.join(ROOT, "pre-guard.mjs");

function run(script, dir, input, cwd = dir) {
  return spawnSync(process.execPath, [script], {
    cwd,
    input: JSON.stringify(input),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
  });
}

const sh = (cwd, ...args) =>
  spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], {
    cwd,
    encoding: "utf8",
  });
const sid = "wt-guard-test";
let tmp, A, AW, B, W, WS, NESTED;

function bind(id, worktree, branch) {
  const ctx = { root: B, stateDir: path.join(B, ".craftsman") };
  const p = worktreeBindingPath({ session_id: id }, ctx);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(
    p,
    JSON.stringify({
      session_id: id,
      unit: "u",
      worktree_path: worktree,
      branch,
    }),
  );
}

before(() => {
  tmp = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-wtguard-")),
  );
  const mk = (name) => {
    const d = path.join(tmp, name);
    fs.mkdirSync(d);
    sh(d, "init", "-q", "-b", "main");
    sh(d, "commit", "-q", "--allow-empty", "-m", "i");
    return d;
  };
  A = mk("A");
  B = mk("B");
  AW = path.join(A, ".worktrees", "a1");
  sh(A, "worktree", "add", "-q", "-b", "feat/a1", AW);
  W = path.join(B, ".worktrees", "w1");
  sh(B, "worktree", "add", "-q", "-b", "feat/w", W);
  WS = path.join(B, ".worktrees", "w s");
  NESTED = path.join(W, "nested");
  fs.mkdirSync(NESTED);
  sh(NESTED, "init", "-q", "-b", "feat/w");
  bind(sid, W, "feat/w");
});
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const guard = (command, cwd = B, id = sid) =>
  run(
    GUARD,
    B,
    { session_id: id, tool_name: "Bash", tool_input: { command } },
    cwd,
  );

test("allow: git -C W and cd W from the main checkout and a sibling repo's worktree", () => {
  for (const cwd of [B, AW]) {
    for (const command of [
      `git -C ${W} add f`,
      `cd ${W} && git add f && git commit -m x`,
      `pushd ${W} && git add f`,
      `git -C ${W}/. add f`,
    ]) {
      const r = guard(command, cwd);
      assert.equal(r.status, 0, `${command} from ${cwd}: ${r.stderr}`);
    }
  }
});

test("allow: a worktree path containing a space", () => {
  sh(B, "worktree", "add", "-q", "-b", "feat/ws", WS);
  bind("sp", WS, "feat/ws");
  const r = guard(`git -C "${WS}" add f`, B, "sp");
  assert.equal(r.status, 0, r.stderr);
});

test("block 1.5 cases", () => {
  const cases = [
    [`git add f; git -C ${W} commit -m x`, B],
    [`cd ${W} && cd .. && git add f`, B],
    [`cd ${W} && cd .. && git add f`, W],
    [`cd $WT && git add f`, B],
    [`cd ~/x && git add f`, B],
    ["cd `echo x` && git add f", B],
    [`cd $(echo x) && git add f`, B],
    [`git -C $(echo x) add f`, B],
    [`(cd ${W} && git add f)`, B],
    [`{ cd ${W}; git add f; }`, B],
    [`pushd ${W} && popd && git add f`, B],
    [`cd ${W} & git add f`, B],
    [`cd ${W} | git add f`, B],
    [`git -C ${W} -C .. add f`, B],
    [`cd ${W} && git add f; cd /tmp && git commit -m x`, B],
    [`git -C ${NESTED} add f`, B],
    [`git -C ${B} add f`, AW],
    [`git --git-dir=${B}/.git -C ${W} add f`, B],
    [`GIT_DIR=${B}/.git git -C ${W} add f`, B],
    [`git -C ${W}/missing add f`, B],
  ];
  for (const [command, cwd] of cases) {
    assert.equal(guard(command, cwd).status, 2, `${command} from ${cwd}`);
  }
});

test("block (j): W on the wrong branch reached through -C from outside", () => {
  sh(W, "checkout", "-q", "-b", "other");
  try {
    const r = guard(`git -C ${W} add f`, B);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /not the bound branch/);
  } finally {
    sh(W, "checkout", "-q", "feat/w");
  }
});

test("branch check runs in the resolved target, not the cwd repo", () => {
  sh(AW, "branch", "-m", "feat/a1", "feat/w");
  try {
    assert.equal(guard(`git -C ${W} add f`, AW).status, 0);
  } finally {
    sh(AW, "branch", "-m", "feat/w", "feat/a1");
  }
});

test("block: deleted W", () => {
  const d = path.join(B, ".worktrees", "gone");
  sh(B, "worktree", "add", "-q", "-b", "feat/gone", d);
  bind("gone", d, "feat/gone");
  fs.rmSync(d, { recursive: true, force: true });
  assert.equal(guard(`git -C ${d} add f`, B, "gone").status, 2);
});

test("block message names git -C and omits release/EnterWorktree", () => {
  const r = guard("git add f", B);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Git mutation blocked outside the active worktree/);
  assert.match(r.stderr, /git -C /);
  assert.doesNotMatch(r.stderr, /release|EnterWorktree/);
});

// fix-guard-chain: a cd counts only when it provably ran in the shell that runs the later git call.
test("W1: a cd that did not provably run before a later git blocks; a plain chain still allows", () => {
  for (const command of [
    `cd ${W} | true; git commit -m x`,
    `cd ${W} & true; git commit -m x`,
    `false && cd ${W}; git commit -m x`,
    `cd ${W} || x; git commit -m x`,
    `(cd ${W}); git commit -m x`,
  ]) {
    assert.equal(guard(command, B).status, 2, command);
  }
  for (const command of [`cd ${W} && git commit -m x`, `cd ${W}\ngit commit -m x`]) {
    const r = guard(command, B);
    assert.equal(r.status, 0, `${command}: ${r.stderr}`);
  }
});

test("W2: git global options that move the repository or take a value", () => {
  for (const command of [
    `git --git-dir /O/.git commit -m x`,
    `git --git-dir /O/.git -C ${W} add f`,
    `git --work-tree /O add f`,
    `git --config-env n=V commit`,
    `git --attr-source X add f`,
    `git --super-prefix X add f`,
    `git --unknown-opt commit -m x`,
    `git --unknown-opt -C ${W} add f`,
  ]) {
    assert.equal(guard(command, B).status, 2, command);
  }
  const r = guard(`git -C ${W} -c k=v --no-pager add f`, B);
  assert.equal(r.status, 0, r.stderr);
});

test("W3: read-only git under shell syntax is silent; mutating git there still blocks", () => {
  for (const command of [
    `for f in $(git ls-files); do wc -c "$f"; done`,
    `if git diff --quiet; then echo ok; fi`,
    `time git status`,
    `! git diff --quiet`,
  ]) {
    const r = guard(command, B);
    assert.equal(r.status, 0, `${command}: ${r.stderr}`);
  }
  for (const command of [`for f in a; do git commit -m x; done`, `! git commit -m x`, `time git commit -m x`]) {
    assert.equal(guard(command, B).status, 2, command);
  }
});

test("W4: wrappers and unresolvable shell forms before a git mutation block, naming git -C", () => {
  const wrapped = [
    "env A=1 git commit -m x", "env -i git commit", "command git commit", "sudo -u x git commit",
    "nice -n 5 git commit", "timeout 5 git commit", "xargs git commit", `sh -c "git commit"`,
    `bash -lc "git commit"`, `eval "cd /other"; git commit`, "source f; git commit", ". f; git commit",
  ];
  for (const command of wrapped) {
    const r = guard(command, B);
    assert.equal(r.status, 2, command);
    assert.match(r.stderr, /git -C /, command);
  }
  for (const command of [`eval "cd /other"; git commit`, "source f; git commit", ". f; git commit", "builtin cd /other && git commit -m x", `bash -lc "git commit"`]) {
    const r = guard(command, W);
    assert.equal(r.status, 2, `${command} from W`);
    assert.match(r.stderr, /git -C /, command);
  }
  assert.equal(guard("env A=1 git status", B).status, 0);
});

test("W5: the branch check reads the resolved target, not the cwd repo", () => {
  sh(AW, "branch", "-m", "feat/a1", "feat/w");
  sh(W, "checkout", "-q", "-B", "other");
  try {
    const r = guard(`git -C ${W} add f`, AW);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /not the bound branch/);
  } finally {
    sh(W, "checkout", "-q", "feat/w");
    sh(AW, "branch", "-m", "feat/w", "feat/a1");
  }
  assert.equal(guard(`git -C ${W} add f`, AW).status, 0);
});
