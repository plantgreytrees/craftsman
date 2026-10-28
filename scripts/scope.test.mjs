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

test("scope: released and removed units leave no scope behind for root", () => {
  const { root, trees: [a, b] } = repoWithWorktrees("unit-a", "unit-b");
  const dir = path.join(root, ".craftsman", "sessions", "s3");
  try {
    for (const [tree, unit] of [[a, "unit-a"], [b, "unit-b"]]) {
      assert.equal(hook("scope.mjs", tree, root, { action: "require", session_id: "s3", worktree_path: tree }).status, 0);
      assert.equal(hook("scope.mjs", tree, root, manifest("s3", unit, [`${unit}.txt`], tree)).status, 0);
    }
    assert.equal(hook("scope.mjs", root, root, { action: "release", session_id: "s3", project: ".", worktree_path: a }).status, 0);
    assert.deepEqual(fs.readdirSync(dir).filter((n) => n.startsWith("scope")).length, 1, "release unlinks unit-a's scope");
    // unit-b's worktree disappears without a release (a sweep, a crash).
    spawnSync("git", ["worktree", "remove", b], { cwd: root });
    const read = { session_id: "s3", tool_name: "Read", tool_input: { file_path: path.join(root, "README.md") } };
    const result = hook("pre-guard.mjs", root, root, read);
    assert.equal(result.status, 0, `root is not held to a stale unit scope: ${result.stderr}`);
    assert.doesNotMatch(result.stderr, /ambiguous|outside active unit scope/);
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

// ARCH-STATE-09: one shared feature worktree, units run one after another.
test("scope: activating unit B in a shared worktree replaces unit A's scope", () => {
  const { root, trees: [w] } = repoWithWorktrees("feature");
  const dir = path.join(root, ".craftsman", "sessions", "s4");
  const scopeFiles = () => fs.readdirSync(dir).filter((n) => n.startsWith("scope") && !n.startsWith("scope-required"));
  try {
    assert.equal(hook("scope.mjs", w, root, manifest("s4", "unit-a", ["a.txt"], w)).status, 0);
    assert.equal(hook("pre-guard.mjs", w, root, edit("s4", path.join(w, "a.txt"))).status, 0);
    assert.equal(hook("pre-guard.mjs", w, root, edit("s4", path.join(w, "b.txt"))).status, 2);
    assert.equal(hook("scope.mjs", w, root, manifest("s4", "unit-b", ["b.txt"], w)).status, 0);
    assert.equal(scopeFiles().length, 1, "same worktree key: one scope file");
    assert.equal(hook("pre-guard.mjs", w, root, edit("s4", path.join(w, "a.txt"))).status, 2, "a.txt now blocked");
    assert.equal(hook("pre-guard.mjs", w, root, edit("s4", path.join(w, "b.txt"))).status, 0, "b.txt now allowed");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("scope: release between units in a shared worktree clears the scope", () => {
  const { root, trees: [w] } = repoWithWorktrees("feature");
  const dir = path.join(root, ".craftsman", "sessions", "s5");
  const scopeFiles = () => fs.readdirSync(dir).filter((n) => n.startsWith("scope"));
  try {
    assert.equal(hook("scope.mjs", w, root, manifest("s5", "unit-a", ["a.txt"], w)).status, 0);
    assert.equal(hook("scope.mjs", root, root, { action: "release", session_id: "s5", project: ".", worktree_path: w }).status, 0);
    assert.equal(scopeFiles().length, 0, "release removes unit-a's scope");
    assert.equal(hook("scope.mjs", w, root, { action: "require", session_id: "s5", worktree_path: w }).status, 0);
    assert.equal(hook("pre-guard.mjs", w, root, edit("s5", path.join(w, "a.txt"))).status, 2, "armed, no scope: blocked");
    assert.equal(hook("scope.mjs", w, root, manifest("s5", "unit-b", ["b.txt"], w)).status, 0);
    assert.equal(hook("pre-guard.mjs", w, root, edit("s5", path.join(w, "b.txt"))).status, 0);
    assert.equal(hook("pre-guard.mjs", w, root, edit("s5", path.join(w, "a.txt"))).status, 2);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

// 8.2: scope activation belongs to the safety side, so CRAFTSMAN=off must not make it a silent no-op
// while pre-guard still demands a scope.
test("scope.mjs: activation still works under CRAFTSMAN=off, and is a no-op only under CRAFTSMAN_SAFETY=off", () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-scope-env-")));
  try {
    spawnSync("git", ["init", "-q"], { cwd: dir });
    const script = fileURLToPath(new URL("./scope.mjs", import.meta.url));
    const manifest = JSON.stringify({ session_id: "scope-env", plan: "docs/plans/p.md", unit: "u", project: ".", scope: { read: ["a.txt"], docs: [], write: ["a.txt"] } });
    const activate = (env) => spawnSync(process.execPath, [script], { cwd: dir, input: manifest, encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: dir, ...env } });
    assert.match(activate({ CRAFTSMAN: "off" }).stdout, /scope active for u/);
    fs.rmSync(path.join(dir, ".craftsman"), { recursive: true, force: true });
    assert.equal(activate({ CRAFTSMAN_SAFETY: "off" }).stdout.trim(), "");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ARCH-SAFETY-05: the exemption pre-guard gives a scope that names hooks.json or the config is only as
// strong as scope activation, so activation refuses such a manifest unless /orchestrate or /auto ran.
test("scope.mjs: a manifest that names hooks.json or craftsman.config.json needs /orchestrate or /auto first", () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-scope-self-")));
  try {
    spawnSync("git", ["init", "-q"], { cwd: dir });
    const scopeScript = fileURLToPath(new URL("./scope.mjs", import.meta.url));
    const guardScript = fileURLToPath(new URL("./orchestrate-scope-guard.mjs", import.meta.url));
    const env = { ...process.env, CLAUDE_PROJECT_DIR: dir };
    delete env.CRAFTSMAN; delete env.CRAFTSMAN_SAFETY;
    const manifest = (write) => JSON.stringify({ session_id: "scope-self", plan: "docs/plans/p.md", unit: "u", project: ".", scope: { read: [], docs: [], write } });
    const activate = (write) => spawnSync(process.execPath, [scopeScript], { cwd: dir, input: manifest(write), encoding: "utf8", env });
    assert.match(activate(["a.txt"]).stdout, /scope active/, "an ordinary manifest needs nothing");
    for (const write of [["hooks/hooks.json"], ["craftsman.config.json"], ["hooks/*.json"], ["**"],
      [".claude/settings.json"], [".claude/settings.local.json"], [".claude/**"], [".claude/*"], ["*.json"], [".claude"], ["./.claude/settings.json"]]) {
      const refused = activate(write);
      assert.equal(refused.status, 2, JSON.stringify(write));
      assert.match(refused.stderr, /only a unit run by \/orchestrate or \/auto/);
    }
    spawnSync(process.execPath, [guardScript], { cwd: dir, input: JSON.stringify({ session_id: "scope-self", prompt: "/craftsman:orchestrate docs/plans/p.md" }), encoding: "utf8", env });
    assert.match(activate(["hooks/hooks.json"]).stdout, /scope active/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// Round 3 (19.2): a write entry that reaches a self-scoped file only through a symlink the session made is judged by where it leads.
test("scope.mjs: a write entry that reaches a self-scoped file through a symlinked directory needs /orchestrate or /auto first (19.2)", () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-scope-link-")));
  try {
    spawnSync("git", ["init", "-q"], { cwd: dir });
    fs.mkdirSync(path.join(dir, ".claude"));
    fs.mkdirSync(path.join(dir, "src"));
    fs.symlinkSync(".claude", path.join(dir, "c"));
    fs.symlinkSync("src", path.join(dir, "s"));
    const scopeScript = fileURLToPath(new URL("./scope.mjs", import.meta.url));
    const guardScript = fileURLToPath(new URL("./orchestrate-scope-guard.mjs", import.meta.url));
    const env = { ...process.env, CLAUDE_PROJECT_DIR: dir };
    delete env.CRAFTSMAN; delete env.CRAFTSMAN_SAFETY;
    const activate = (write) => spawnSync(process.execPath, [scopeScript], { cwd: dir, encoding: "utf8", env,
      input: JSON.stringify({ session_id: "scope-link", plan: "docs/plans/p.md", unit: "u", project: ".", scope: { read: [], docs: [], write } }) });
    for (const write of [["c/**"], ["c/settings.json"], ["c/*"], ["c"]]) {
      const refused = activate(write);
      assert.equal(refused.status, 2, JSON.stringify(write));
      assert.match(refused.stderr, /only a unit run by \/orchestrate or \/auto/);
    }
    assert.match(activate(["s/**"]).stdout, /scope active/, "a link to an ordinary directory needs nothing");
    spawnSync(process.execPath, [guardScript], { cwd: dir, input: JSON.stringify({ session_id: "scope-link", prompt: "/craftsman:orchestrate docs/plans/p.md" }), encoding: "utf8", env });
    assert.match(activate(["c/**"]).stdout, /scope active/, "after /orchestrate it may activate");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// Release refuses a worktree with uncommitted work (a wip: commit comes first).
test("scope: release refuses a dirty worktree and succeeds once committed", () => {
  const { root, trees: [w] } = repoWithWorktrees("dirty");
  const dir = path.join(root, ".craftsman", "sessions", "s6");
  const names = () => fs.readdirSync(dir);
  const release = (tree = w) => hook("scope.mjs", root, root, { action: "release", session_id: "s6", project: ".", worktree_path: tree });
  const commit = (msg) => spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qam", msg], { cwd: w });
  try {
    assert.equal(hook("scope.mjs", w, root, manifest("s6", "unit-a", ["a.txt"], w)).status, 0);
    fs.writeFileSync(path.join(w, "tracked.txt"), "1\n");
    spawnSync("git", ["add", "tracked.txt"], { cwd: w });
    commit("t");
    fs.writeFileSync(path.join(w, "tracked.txt"), "2\n");
    const before = names().sort();
    assert.ok(before.some((n) => n.startsWith("scope")), "scope file exists");
    let result = release();
    assert.equal(result.status, 2, "modified tracked file");
    assert.ok(result.stderr.includes(w) && /uncommitted changes/.test(result.stderr), result.stderr);
    assert.deepEqual(names().sort(), before, "nothing removed");
    spawnSync("git", ["checkout", "--", "tracked.txt"], { cwd: w });
    fs.writeFileSync(path.join(w, "new.txt"), "x\n");
    result = release();
    assert.equal(result.status, 2, "untracked file");
    assert.deepEqual(names().sort(), before);
    spawnSync("git", ["add", "new.txt"], { cwd: w });
    commit("wip: t");
    assert.equal(release().status, 0);
    assert.equal(names().filter((n) => n.startsWith("scope")).length, 0, "scope gone");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("scope: release ignores gitignored files, a swept worktree; fails closed on a non-repo", () => {
  const { root, trees: [w] } = repoWithWorktrees("ign");
  const release = (tree) => hook("scope.mjs", root, root, { action: "release", session_id: "s7", project: ".", worktree_path: tree });
  try {
    fs.appendFileSync(path.join(root, ".git", "info", "exclude"), "junk.log\n");
    fs.writeFileSync(path.join(w, "junk.log"), "x\n");
    assert.equal(release(w).status, 0, "only a gitignored file");
    spawnSync("git", ["worktree", "remove", "--force", w], { cwd: root });
    assert.equal(release(w).status, 0, "swept worktree");
    const plain = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-plain-"));
    try { assert.equal(release(plain).status, 2, "not a git repo"); } finally { fs.rmSync(plain, { recursive: true, force: true }); }
    assert.equal(hook("scope.mjs", root, root, { action: "release", session_id: "s7", project: "." }).status, 0, "no worktree_path");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("scope: release on an unreadable worktree names git worktree prune, not a dirty tree", () => {
  const { root, trees: [w] } = repoWithWorktrees("unread");
  const release = (tree) => hook("scope.mjs", root, root, { action: "release", session_id: "s8", project: ".", worktree_path: tree });
  const names = () => fs.readdirSync(path.join(root, ".craftsman", "sessions", "s8")).sort();
  try {
    assert.equal(hook("scope.mjs", w, root, manifest("s8", "unit-a", ["a.txt"], w)).status, 0);
    const before = names();
    fs.writeFileSync(path.join(w, ".git"), "gitdir: /nonexistent/nowhere\n");
    const result = release(w);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /is not a readable git worktree/);
    assert.match(result.stderr, /remove it, run `git worktree prune`, and release again/);
    assert.doesNotMatch(result.stderr, /fatal:|uncommitted changes/);
    assert.deepEqual(names(), before, "scope and binding remain");
    const evs = fs.readFileSync(path.join(root, ".craftsman", "events.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
    assert.ok(evs.some((e) => e.ev === "scope_release_refused" && e.sid === "s8"), "refused event carries sid");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
