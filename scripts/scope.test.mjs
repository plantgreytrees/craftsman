import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { normalizeScope } from "./scope.mjs";

test("normalizeScope: keeps a narrow deduplicated read/docs/write manifest", () => {
  const scope = normalizeScope({
    plan: "docs/plans/example.md",
    unit: "unit-1",
    project: ".",
    scope: {
      read: ["src/a.ts", "src/a.ts"],
      docs: ["docs/standards/typescript.md"],
      write: ["src/a.ts", "tests/a.test.ts"],
    },
  });
  assert.deepEqual(scope.scope.read, ["src/a.ts"]);
  assert.deepEqual(scope.scope.docs, ["docs/standards/typescript.md"]);
  assert.deepEqual(scope.scope.write, ["src/a.ts", "tests/a.test.ts"]);
  assert.match(scope.activated_at, /^\d{4}-\d{2}-\d{2}T/);
});

test("normalizeScope: rejects a missing scope list", () => {
  assert.throws(() => normalizeScope({ plan: "p", unit: "u", project: ".", scope: { read: [], docs: [] } }), /scope.write/);
});

test("normalizeScope: binds the project root to an explicit worktree", () => {
  const scope = normalizeScope({
    plan: "p",
    unit: "u",
    project: ".",
    worktree_path: "/tmp/worktree",
    scope: { read: ["src/a.ts"], docs: [], write: ["src/a.ts"] },
  });
  assert.equal(scope.project_root, "/tmp/worktree");
  assert.equal(scope.worktree_path, "/tmp/worktree");
});

// ARCH-STATE-03: inside an agent the session id is the root session's, so a
// unit's scope is keyed by its worktree — two units, two independent scopes.
const HERE = path.dirname(fileURLToPath(import.meta.url));
function hook(script, cwd, root, input) {
  return spawnSync(process.execPath, [path.join(HERE, script)], {
    cwd, input: JSON.stringify(input), encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: root },
  });
}
function repoWithWorktrees(...names) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-scopes-")));
  const git = (...args) => spawnSync("git", args, { cwd: root, encoding: "utf8" });
  git("init", "-q");
  git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "init");
  const trees = names.map((name) => {
    const tree = path.join(root, ".worktrees", name);
    git("worktree", "add", "-q", "-b", `feat/${name}`, tree);
    return tree;
  });
  return { root, trees };
}
const manifest = (sid, unit, write, worktree) => ({
  session_id: sid, plan: "docs/plans/p.md", unit, project: ".",
  ...(worktree ? { worktree_path: worktree } : {}),
  scope: { read: write, docs: [], write },
});
const edit = (sid, file) => ({ session_id: sid, tool_name: "Write", tool_input: { file_path: file, content: "x" } });

test("scope: two worktrees hold two independent scopes in one session", () => {
  const { root, trees: [a, b] } = repoWithWorktrees("unit-a", "unit-b");
  try {
    assert.equal(hook("scope.mjs", a, root, manifest("s1", "unit-a", ["a.txt"], a)).status, 0);
    assert.equal(hook("scope.mjs", b, root, manifest("s1", "unit-b", ["b.txt"], b)).status, 0);
    assert.equal(hook("pre-guard.mjs", a, root, edit("s1", path.join(a, "a.txt"))).status, 0);
    assert.equal(hook("pre-guard.mjs", a, root, edit("s1", path.join(a, "b.txt"))).status, 2);
    assert.equal(hook("pre-guard.mjs", b, root, edit("s1", path.join(b, "b.txt"))).status, 0);
    assert.equal(hook("pre-guard.mjs", b, root, edit("s1", path.join(b, "a.txt"))).status, 2);
    const scopes = fs.readdirSync(path.join(root, ".craftsman", "sessions", "s1")).filter((n) => n.startsWith("scope"));
    assert.equal(scopes.length, 2, "both scopes live in the root session dir");
    assert.equal(fs.existsSync(path.join(a, ".craftsman")), false, "nothing lands in the unit worktree");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("scope: a session with no worktree falls back to the session scope", () => {
  const { root } = repoWithWorktrees();
  try {
    assert.equal(hook("scope.mjs", root, root, { action: "require", session_id: "s2" }).status, 0);
    assert.equal(hook("pre-guard.mjs", root, root, edit("s2", path.join(root, "c.txt"))).status, 2, "armed, no scope yet");
    assert.equal(hook("scope.mjs", root, root, manifest("s2", "unit-c", ["c.txt"])).status, 0);
    assert.equal(fs.existsSync(path.join(root, ".craftsman", "sessions", "s2", "scope.json")), true);
    assert.equal(hook("pre-guard.mjs", root, root, edit("s2", path.join(root, "c.txt"))).status, 0);
    assert.equal(hook("pre-guard.mjs", root, root, edit("s2", path.join(root, "d.txt"))).status, 2);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
