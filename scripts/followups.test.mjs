// Superproject / worktree / background-session follow-ups to ARCH-LAND-19.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadWorkspaceManifest, projectIdOf, resolveSelectedProject } from "./lib/core.mjs";
import { orderSteps, validateSteps } from "./plan-graph.mjs";
import { buildRunArgs } from "./run-args.mjs";
import { writeState } from "./state-write.mjs";
import { inspectRepo } from "./repo-exec.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const tmp = (name) => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `craftsman-${name}-`)));
function git(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}
function repo(dir) {
  fs.mkdirSync(dir, { recursive: true });
  git(dir, ["init", "-q"]);
  git(dir, ["config", "user.email", "t@example.com"]);
  git(dir, ["config", "user.name", "t"]);
  fs.writeFileSync(path.join(dir, "README.md"), "x\n");
  git(dir, ["add", "README.md"]);
  git(dir, ["commit", "-q", "-m", "init"]);
  return dir;
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
function workspace(projects) {
  const root = tmp("ws");
  for (const [relative, kind] of Object.entries(projects)) {
    const dir = path.join(root, relative);
    if (kind === "git") repo(dir); else fs.mkdirSync(dir, { recursive: true });
  }
  const manifest = path.join(root, "craftsman.workspace.json");
  fs.writeFileSync(manifest, JSON.stringify({ version: 1, projects: Object.fromEntries(Object.keys(projects).map((relative) => [path.basename(relative), { root: relative }])) }));
  return { root, manifest };
}

// 4. A worktree without its submodules checked out still loads.
test("workspace manifest: an uninitialised (empty) submodule dir loads, and fails only when selected", () => {
  const ws = workspace({ "src/a": "git", "src/b": "empty" });
  try {
    withManifest(ws.manifest, () => {
      const manifest = loadWorkspaceManifest();
      assert.equal(manifest.projects.a.initialized, true);
      assert.equal(manifest.projects.b.initialized, false);
      assert.equal(resolveSelectedProject("a").id, "a");
      assert.throws(() => resolveSelectedProject("b"), /not checked out.*submodule update --init -- src\/b/);
      assert.equal(resolveSelectedProject(".").id, ".", "the root project needs no submodule");
    });
    fs.writeFileSync(path.join(ws.root, "src/b", "stray.txt"), "not a repo\n");
    withManifest(ws.manifest, () => assert.throws(() => loadWorkspaceManifest(), /not a Git root/));
  } finally { fs.rmSync(ws.root, { recursive: true, force: true }); }
});

// 3. Path-form project and bumps resolve through the manifest's roots.
test("plan-graph: project and bumps accept a manifest id or the project's root path", () => {
  const ws = workspace({ "src/UI/ui_nuxt": "git", "src/api": "git" });
  try {
    withManifest(ws.manifest, () => {
      const manifest = loadWorkspaceManifest();
      assert.equal(projectIdOf(manifest, "src/UI/ui_nuxt"), "ui_nuxt");
      assert.equal(projectIdOf(manifest, "./src/UI/ui_nuxt/"), "ui_nuxt");
      assert.equal(projectIdOf(manifest, "ui_nuxt"), "ui_nuxt");
      assert.equal(projectIdOf(manifest, "../src/api"), null);
      assert.equal(projectIdOf(manifest, "src/nope"), null);
      const steps = [
        { id: "1", scope_id: "ui", project: "src/UI/ui_nuxt", depends_on: [] },
        { id: "2", scope_id: "api", project: "api", depends_on: ["1"] },
      ];
      const ordered = orderSteps(steps, { workspace: manifest, isGitlink: () => false });
      assert.deepEqual(ordered.map((s) => s.project), ["ui_nuxt", "api"]);
      assert.throws(() => validateSteps([{ id: "1", scope_id: "x", project: "src/nope", depends_on: [] }], { workspace: manifest }), /unknown workspace project: src\/nope/);
    });
  } finally { fs.rmSync(ws.root, { recursive: true, force: true }); }
});

test("plan-submodules: a bump written with paths matches its submodule", () => {
  const workspaceRoot = "/w";
  const mk = (id, relativeRoot) => [id, { id, root: `/w/${relativeRoot}`, relativeRoot, declaredRoot: relativeRoot, initialized: true }];
  const manifest = { workspaceRoot, projects: Object.fromEntries([mk("parent", "parent"), mk("child", "parent/child")]) };
  const steps = [
    { id: "1", scope_id: "c", project: "parent/child", depends_on: [] },
    { id: "2", scope_id: "bump", project: "parent", bumps: "parent/child", depends_on: ["1"] },
  ];
  assert.deepEqual(validateSteps(steps, { workspace: manifest, isGitlink: () => true }).map((s) => s.bumps), [undefined, "child"]);
  const missing = [steps[0], { ...steps[1], bumps: undefined }];
  assert.throws(() => validateSteps(missing, { workspace: manifest, isGitlink: () => true }), /need a bump step/);
});

// 1 + 2. Root builds run.js args from a plan; a plan across projects becomes ordered runs.
test("run-args: builds structured args per project run, in plan-graph order, with criteria and task text", () => {
  const ws = workspace({ "src/a": "git", "src/b": "empty" });
  const plan = repo(path.join(ws.root, "main"));
  try {
    fs.mkdirSync(path.join(plan, "docs", "plans"), { recursive: true });
    fs.writeFileSync(path.join(plan, "docs", "plans", "p.md"), [
      "---", "slug: p", "units:",
      "  - id: 1", "    scope_id: lib", "    project: src/a", "    depends_on: []", "    scope:", "      read: [src/x.txt]", "      docs: []", "      write: [src/x.txt]", "    arch: [ARCH-X-01]",
      "  - id: 2", "    scope_id: ui", "    project: src/b", "    depends_on: [lib]", "    scope:", "      read: []", "      docs: []", "      write: [y.txt]",
      "  - id: 3", "    scope_id: lib2", "    project: a", "    depends_on: [2]", "    scope:", "      read: []", "      docs: []", "      write: [z.txt]",
      "---", "", "# Plan: p", "", "## Scope Steps", "", "### Step 1 — lib (a, js, normal)", "- [ ] 1.1 write x → accept: file exists", "", "### Step 2 — ui (b, js, normal)", "- [ ] 2.1 write y", "", "## Sequencing", "after",
    ].join("\n"));
    const acceptance = "- [ ] [unit:lib] x exists\n- [ ] [unit:ui] y exists\n- [ ] untagged\n";
    const out = withManifest(ws.manifest, () => buildRunArgs({ root: plan, plan: "docs/plans/p.md", sessionId: "sess", workspace: loadWorkspaceManifest(), acceptanceText: acceptance, pluginRoot: "/plugin" }));
    assert.deepEqual(out.runs.map((r) => [r.project, r.units]), [["a", ["lib"]], ["b", ["ui"]], ["a", ["lib2"]]]);
    const first = out.runs[0].args;
    assert.equal(first.sessionId, "sess");
    assert.equal(first.pluginRoot, "/plugin");
    assert.equal(first.project, "a");
    assert.equal(first.plan, "docs/plans/p.md");
    assert.deepEqual(first.units[0].criteria, ["- [ ] [unit:lib] x exists"]);
    assert.deepEqual(first.units[0].arch, ["ARCH-X-01"]);
    assert.deepEqual(first.units[0].scope.write, ["src/x.txt"]);
    assert.match(first.units[0].task, /1\.1 write x/);
    assert.doesNotMatch(first.units[0].task, /2\.1/);
    assert.deepEqual(out.runs[1].args.units[0].depends_on, ["lib"], "dependencies are unit names");
    assert.deepEqual(out.runs[2].args.units[0].depends_on, ["ui"]);
    assert.ok(out.warnings.some((w) => /lib2/.test(w)), "a unit with no step section is reported");
    assert.doesNotThrow(() => JSON.stringify(out));
  } finally { fs.rmSync(ws.root, { recursive: true, force: true }); fs.rmSync(plan, { recursive: true, force: true }); }
});

// 5. scope.mjs from a linked worktree and pre-guard in the main checkout share one state dir.
test("scope.mjs: run from a linked worktree it writes the session markers in the main checkout", () => {
  const main = repo(path.join(tmp("scope"), "main"));
  try {
    const linked = path.join(main, ".worktrees", "u1");
    git(main, ["worktree", "add", "-q", "-b", "feat/u1", linked]);
    const env = { ...process.env };
    delete env.CLAUDE_PROJECT_DIR; delete env.CLAUDE_CODE_SESSION_ID;
    const result = spawnSync(process.execPath, [path.join(HERE, "scope.mjs")], {
      cwd: linked, env, encoding: "utf8", input: JSON.stringify({ action: "require", session_id: "s1", project: "." }),
    });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(fs.existsSync(path.join(main, ".craftsman", "sessions", "s1", "scope-required")), "marker is in the main checkout");
    assert.equal(fs.existsSync(path.join(linked, ".craftsman", "sessions", "s1", "scope-required")), false);
  } finally { fs.rmSync(path.dirname(main), { recursive: true, force: true }); }
});

// 6. The plugin's own reference files are readable under an active scope; never writable.
test("scope + pre-guard: ${CLAUDE_PLUGIN_ROOT} reads pass under an active scope, writes there do not", () => {
  const base = tmp("plugin");
  const project = repo(path.join(base, "project"));
  const plugin = path.join(base, "plugin");
  fs.mkdirSync(path.join(plugin, "commands"), { recursive: true });
  fs.writeFileSync(path.join(plugin, "commands", "_shared-x.md"), "shared\n");
  fs.copyFileSync(path.join(HERE, "..", "craftsman.config.json"), path.join(plugin, "craftsman.config.json"));
  const env = { ...process.env, CLAUDE_PROJECT_DIR: project, CLAUDE_PLUGIN_ROOT: plugin };
  const call = (script, input) => spawnSync(process.execPath, [path.join(HERE, script)], { cwd: project, env, encoding: "utf8", input: JSON.stringify(input) });
  try {
    const target = path.join(plugin, "commands", "_shared-x.md");
    const manifest = { session_id: "s", plan: "docs/plans/p.md", unit: "u", project: ".", scope: { read: [target], docs: [], write: ["src/a.txt"] } };
    const activated = call("scope.mjs", manifest);
    assert.equal(activated.status, 0, `an absolute plugin path is a valid read entry: ${activated.stderr}`);
    const noEntry = { ...manifest, session_id: "s2", scope: { read: [], docs: [], write: ["src/a.txt"] } };
    assert.equal(call("scope.mjs", noEntry).status, 0);
    assert.equal(call("pre-guard.mjs", { session_id: "s2", tool_name: "Read", tool_input: { file_path: target } }).status, 0, "plugin read allowed without a scope entry");
    assert.equal(call("pre-guard.mjs", { session_id: "s2", tool_name: "Read", tool_input: { file_path: path.join(project, "README.md") } }).status, 2, "project files stay scoped");
    assert.equal(call("pre-guard.mjs", { session_id: "s2", tool_name: "Write", tool_input: { file_path: target, content: "x" } }).status, 2, "never a write");
    const writeEntry = { ...manifest, session_id: "s3", scope: { read: [], docs: [], write: [target] } };
    assert.equal(call("scope.mjs", writeEntry).status, 2, "a plugin path is not a write entry");
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});

// 7. A detached submodule checkout attaches when that loses nothing.
test("repo-exec inspect: a detached repo at origin/<base> is attached; a diverged or elsewhere one is refused", () => {
  const base = tmp("detached");
  try {
    const seed = repo(path.join(base, "seed"));
    const branch = git(seed, ["branch", "--show-current"]);
    const origin = path.join(base, "origin.git");
    git(base, ["clone", "-q", "--bare", seed, origin]);
    const clone = path.join(base, "clone");
    git(base, ["clone", "-q", origin, clone]);
    git(clone, ["config", "user.email", "t@example.com"]); git(clone, ["config", "user.name", "t"]);
    const context = { id: ".", root: clone, stateDir: path.join(clone, ".craftsman") };

    git(clone, ["checkout", "-q", "--detach"]);
    const info = inspectRepo(context);
    assert.equal(info.base_branch, branch);
    assert.equal(git(clone, ["branch", "--show-current"]), branch, "attached to base");

    // local base behind origin: fast-forwarded, then attached
    fs.writeFileSync(path.join(seed, "n.txt"), "n\n");
    git(seed, ["add", "n.txt"]); git(seed, ["commit", "-q", "-m", "next"]);
    git(seed, ["push", "-q", origin, `HEAD:${branch}`]);
    git(clone, ["fetch", "-q", "origin"]);
    git(clone, ["checkout", "-q", "--detach", `origin/${branch}`]);
    inspectRepo(context);
    assert.equal(git(clone, ["rev-parse", branch]), git(clone, ["rev-parse", `origin/${branch}`]));
    assert.equal(git(clone, ["branch", "--show-current"]), branch);

    // detached somewhere other than origin/<base>: refused
    git(clone, ["checkout", "-q", "--detach", "HEAD~1"]);
    assert.throws(() => inspectRepo(context), /detached.*HEAD is not at origin/);

    // local base ahead of / diverged from HEAD: refused, ref untouched
    git(clone, ["checkout", "-q", "--detach", `origin/${branch}`]);
    git(clone, ["checkout", "-q", branch]);
    fs.writeFileSync(path.join(clone, "local.txt"), "l\n");
    git(clone, ["add", "local.txt"]); git(clone, ["commit", "-q", "-m", "local only"]);
    const local = git(clone, ["rev-parse", branch]);
    git(clone, ["checkout", "-q", "--detach", `origin/${branch}`]);
    assert.throws(() => inspectRepo(context), /not an ancestor of HEAD/);
    assert.equal(git(clone, ["rev-parse", branch]), local, "nothing moved");
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});

// 8. State a background session cannot Write is written by script into the main checkout.
test("state-write: writes acceptance.md and goal files into the main checkout; nothing else", () => {
  const main = repo(path.join(tmp("state"), "main"));
  try {
    const linked = path.join(main, ".worktrees", "w");
    git(main, ["worktree", "add", "-q", "-b", "feat/w", linked]);
    const context = { id: ".", root: linked, stateDir: path.join(linked, ".craftsman") };
    const written = writeState({ file: "acceptance.md", content: "- [ ] a\n" }, context);
    assert.equal(written.written, path.join(main, ".craftsman", "acceptance.md"));
    assert.equal(fs.readFileSync(written.written, "utf8"), "- [ ] a\n");
    writeState({ file: "instructions/s.goal.txt", content: "/goal x\n" }, context);
    assert.ok(fs.existsSync(path.join(main, ".craftsman", "instructions", "s.goal.txt")));
    for (const file of ["../escape.txt", "instructions/../x.goal.txt", "events.jsonl", "src/a.ts", "instructions/s.txt"]) {
      assert.throws(() => writeState({ file, content: "x" }, context), /only writes/, file);
    }
  } finally { fs.rmSync(path.dirname(main), { recursive: true, force: true }); }
});
