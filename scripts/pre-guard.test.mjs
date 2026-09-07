import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { worktreeBindingPath } from "./lib/core.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SCOPE = path.join(ROOT, "scope.mjs");
const GUARD = path.join(ROOT, "pre-guard.mjs");
const DOC_WRITE = path.join(ROOT, "doc-write.mjs");

function run(script, dir, input, extraEnv = {}) {
  return spawnSync(process.execPath, [script], {
    cwd: dir,
    input: JSON.stringify(input),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir, ...extraEnv },
  });
}

test("pre-guard: active scope allows declared reads and blocks undeclared reads", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-scope-"));
  try {
    const sid = "scope-test";
    const allowed = path.join(dir, "src", "needed.ts");
    const forbidden = path.join(dir, "src", "unlisted.ts");
    fs.mkdirSync(path.dirname(allowed), { recursive: true });
    fs.writeFileSync(allowed, "export {}\n");
    const manifest = {
      session_id: sid,
      plan: "docs/plans/example.md",
      unit: "unit-1",
      project: ".",
      scope: { read: ["src/needed.ts"], docs: [], write: ["src/needed.ts"] },
    };
    assert.equal(run(SCOPE, dir, manifest).status, 0);
    assert.equal(run(GUARD, dir, { session_id: sid, tool_name: "Read", tool_input: { file_path: allowed } }).status, 0);
    const blocked = run(GUARD, dir, { session_id: sid, tool_name: "Read", tool_input: { file_path: forbidden } });
    assert.equal(blocked.status, 2);
    assert.match(blocked.stderr, /re-analyse the unit dependencies/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("pre-guard: tracker + plan-doc reads pass as orchestration metadata even when out of declared scope", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-metadata-"));
  try {
    const sid = "metadata-test";
    fs.mkdirSync(path.join(dir, "docs", "plans"), { recursive: true });
    const tracker = path.join(dir, "docs", "plans", "TRACKER.md");
    const plan = path.join(dir, "docs", "plans", "example.md");
    fs.writeFileSync(tracker, "# tracker\n");
    fs.writeFileSync(plan, "# plan\n");
    const manifest = {
      session_id: sid,
      plan: "docs/plans/example.md",
      unit: "unit-1",
      project: ".",
      scope: { read: [], docs: [], write: [] },
    };
    assert.equal(run(SCOPE, dir, manifest).status, 0);
    // /orchestrate's real first action grants doc-write authority before any
    // docs/ access — the guard's doc-authority gate applies to Read too.
    assert.equal(run(DOC_WRITE, dir, {}).status, 0);
    assert.equal(run(GUARD, dir, { session_id: sid, tool_name: "Read", tool_input: { file_path: tracker } }).status, 0);
    assert.equal(run(GUARD, dir, { session_id: sid, tool_name: "Read", tool_input: { file_path: plan } }).status, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("pre-guard: Glob/Grep pass when the search root itself is a declared '**' scope entry", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-searchroot-"));
  try {
    const sid = "searchroot-test";
    fs.mkdirSync(path.join(dir, "src", "widgets"), { recursive: true });
    const manifest = {
      session_id: sid,
      plan: "docs/plans/example.md",
      unit: "unit-1",
      project: ".",
      scope: { read: ["src/widgets/**"], docs: [], write: [] },
    };
    assert.equal(run(SCOPE, dir, manifest).status, 0);
    const allowed = run(GUARD, dir, {
      session_id: sid, tool_name: "Glob", tool_input: { path: path.join(dir, "src", "widgets"), pattern: "*.ts" },
    });
    assert.equal(allowed.status, 0);
    const blocked = run(GUARD, dir, {
      session_id: sid, tool_name: "Glob", tool_input: { path: dir, pattern: "**/*.ts" },
    });
    assert.equal(blocked.status, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("pre-guard: scope-required blocks calls before activation", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-required-"));
  try {
    const sid = "required-test";
    assert.equal(run(SCOPE, dir, { action: "require", session_id: sid }).status, 0);
    const result = run(GUARD, dir, { session_id: sid, tool_name: "Glob", tool_input: { path: ".", pattern: "**/*" } });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /requires an active unit scope/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("pre-guard: project boundary blocks a sibling project", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-project-"));
  try {
    spawnSync("git", ["init", "-q"], { cwd: dir });
    fs.mkdirSync(path.join(dir, "services", "a"), { recursive: true });
    fs.mkdirSync(path.join(dir, "services", "b"), { recursive: true });
    spawnSync("git", ["init", "-q"], { cwd: path.join(dir, "services", "a") });
    spawnSync("git", ["init", "-q"], { cwd: path.join(dir, "services", "b") });
    const manifestPath = path.join(dir, "craftsman.workspace.json");
    fs.writeFileSync(manifestPath, JSON.stringify({ version: 1, projects: { payments: { root: "services/a" }, other: { root: "services/b" } } }));
    const sid = "project-test";
    const manifest = {
      session_id: sid,
      plan: "docs/plans/example.md",
      unit: "unit-1",
      project: "services/a",
      scope: { read: ["src/file.ts"], docs: [], write: ["src/file.ts"] },
    };
    assert.equal(run(SCOPE, dir, { ...manifest, project: "payments" }, { CRAFTSMAN_WORKSPACE_MANIFEST: manifestPath }).status, 0);
    const blocked = run(GUARD, dir, {
      session_id: sid,
      tool_name: "Read",
      tool_input: { file_path: path.join(dir, "services", "b", "src", "file.ts") },
    }, { CRAFTSMAN_WORKSPACE_MANIFEST: manifestPath });
    assert.equal(blocked.status, 2);
    assert.match(blocked.stderr, /outside active unit scope/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("pre-guard: blocks mutating Git in the primary checkout while a worktree is bound", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-git-guard-"));
  try {
    spawnSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
    const worktree = path.join(dir, ".worktrees", "unit-1");
    fs.mkdirSync(path.dirname(worktree), { recursive: true });
    spawnSync("git", ["worktree", "add", "-q", "-b", "feat/unit-1", worktree], { cwd: dir });
    const sid = "git-guard-test";
    const bindingContext = { root: dir, stateDir: path.join(dir, ".craftsman") };
    fs.mkdirSync(path.dirname(worktreeBindingPath({ session_id: sid }, bindingContext)), { recursive: true });
    fs.writeFileSync(worktreeBindingPath({ session_id: sid }, bindingContext), JSON.stringify({
      session_id: sid, unit: "unit-1", worktree_path: worktree, branch: "feat/unit-1",
    }));
    const blocked = run(GUARD, dir, {
      session_id: sid, tool_name: "Bash", tool_input: { command: "git checkout main" },
    });
    assert.equal(blocked.status, 2);
    assert.match(blocked.stderr, /Git mutation blocked outside the active worktree/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("pre-guard: allows mutating Git inside the bound worktree", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-git-guard-"));
  try {
    spawnSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
    const worktree = path.join(dir, ".worktrees", "unit-1");
    fs.mkdirSync(path.dirname(worktree), { recursive: true });
    spawnSync("git", ["worktree", "add", "-q", "-b", "feat/unit-1", worktree], { cwd: dir });
    const sid = "git-guard-worktree-test";
    const bindingContext = { root: worktree, stateDir: path.join(dir, ".craftsman") };
    fs.mkdirSync(path.dirname(worktreeBindingPath({ session_id: sid }, bindingContext)), { recursive: true });
    fs.writeFileSync(worktreeBindingPath({ session_id: sid }, bindingContext), JSON.stringify({
      session_id: sid, unit: "unit-1", worktree_path: worktree, branch: "feat/unit-1",
    }));
    const allowed = run(GUARD, worktree, {
      session_id: sid, tool_name: "Bash", tool_input: { command: "git commit --allow-empty -m test" },
    });
    assert.equal(allowed.status, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("pre-guard: blocks Git mutations that target another directory explicitly", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-git-target-"));
  try {
    spawnSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
    const worktree = path.join(dir, ".worktrees", "unit-1");
    fs.mkdirSync(path.dirname(worktree), { recursive: true });
    spawnSync("git", ["worktree", "add", "-q", "-b", "feat/unit-1", worktree], { cwd: dir });
    const sid = "git-target-test";
    const bindingContext = { root: worktree, stateDir: path.join(dir, ".craftsman") };
    fs.mkdirSync(path.dirname(worktreeBindingPath({ session_id: sid }, bindingContext)), { recursive: true });
    fs.writeFileSync(worktreeBindingPath({ session_id: sid }, bindingContext), JSON.stringify({
      session_id: sid, unit: "unit-1", worktree_path: worktree, branch: "feat/unit-1",
    }));
    const blocked = run(GUARD, worktree, {
      session_id: sid, tool_name: "Bash", tool_input: { command: `\n  git -C "${dir}" checkout main` },
    });
    assert.equal(blocked.status, 2);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("pre-guard: blocks a symlinked scope target outside the project", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-symlink-"));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-outside-"));
  try {
    const link = path.join(dir, "linked");
    fs.symlinkSync(outside, link, "dir");
    const sid = "symlink-test";
    assert.equal(run(SCOPE, dir, {
      session_id: sid, plan: "docs/plans/example.md", unit: "unit-1", project: ".",
      scope: { read: ["linked/**"], docs: [], write: [] },
    }).status, 0);
    const blocked = run(GUARD, dir, {
      session_id: sid, tool_name: "Read", tool_input: { file_path: path.join(link, "secret.txt") },
    });
    assert.equal(blocked.status, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});
