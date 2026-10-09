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
  // A git root: a non-git CLAUDE_PROJECT_DIR is "above a repo" and leaves craftsman off.
  if (!fs.existsSync(path.join(dir, ".git"))) spawnSync("git", ["init", "-q"], { cwd: dir });
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

test("pre-guard: blocks restore and add mutations outside the bound worktree", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-git-guard-extra-"));
  try {
    spawnSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
    const worktree = path.join(dir, ".worktrees", "unit-1");
    fs.mkdirSync(path.dirname(worktree), { recursive: true });
    spawnSync("git", ["worktree", "add", "-q", "-b", "feat/unit-1", worktree], { cwd: dir });
    const sid = "git-guard-extra-test";
    const bindingContext = { root: dir, stateDir: path.join(dir, ".craftsman") };
    fs.mkdirSync(path.dirname(worktreeBindingPath({ session_id: sid }, bindingContext)), { recursive: true });
    fs.writeFileSync(worktreeBindingPath({ session_id: sid }, bindingContext), JSON.stringify({
      session_id: sid, unit: "unit-1", worktree_path: worktree, branch: "feat/unit-1",
    }));
    for (const command of ["git restore README.md", "git add README.md"]) {
      const blocked = run(GUARD, dir, { session_id: sid, tool_name: "Bash", tool_input: { command } });
      assert.equal(blocked.status, 2, command);
      assert.match(blocked.stderr, /Git mutation blocked outside the active worktree/);
    }
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

function gitRepoWithWorktree() {
  const main = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-tracker-guard-")));
  const git = (...args) => spawnSync("git", ["-C", main, "-c", "user.email=t@t", "-c", "user.name=t", ...args], { encoding: "utf8" });
  git("init", "-q");
  git("commit", "-q", "--allow-empty", "-m", "init");
  const worktree = path.join(main, ".claude", "worktrees", "wt");
  git("worktree", "add", "-q", "-b", "wt", worktree);
  const block = "<!-- craftsman:ledger:begin -->\n| plan | status |\n| a | PENDING |\n<!-- craftsman:ledger:end -->";
  const text = `# Execution tracker\n\nHand notes.\n\n${block}\n`;
  for (const root of [main, worktree]) {
    fs.mkdirSync(path.join(root, "docs", "plans"), { recursive: true });
    fs.writeFileSync(path.join(root, "docs", "plans", "TRACKER.md"), text);
  }
  return { main, worktree, text };
}

test("pre-guard: a linked worktree's copy of TRACKER.md is blocked and points at the main checkout's", () => {
  const { main, worktree } = gitRepoWithWorktree();
  try {
    const result = run(GUARD, worktree, {
      session_id: "tracker-wt", tool_name: "Edit",
      tool_input: { file_path: path.join(worktree, "docs", "plans", "TRACKER.md"), old_string: "Hand notes.", new_string: "x" },
    });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /tracker lives only in the main checkout/);
    assert.ok(result.stderr.includes(path.join(main, "docs", "plans", "TRACKER.md")));
  } finally {
    fs.rmSync(main, { recursive: true, force: true });
  }
});

test("pre-guard: the root TRACKER.md's generated block can't be hand-edited; the hand-written rest can", () => {
  const { main, text } = gitRepoWithWorktree();
  try {
    const file = path.join(main, "docs", "plans", "TRACKER.md");
    assert.equal(run(DOC_WRITE, main, {}).status, 0);
    const blocked = run(GUARD, main, {
      session_id: "tracker-root", tool_name: "Edit",
      tool_input: { file_path: file, old_string: "| a | PENDING |", new_string: "| a | COMPLETE |" },
    });
    assert.equal(blocked.status, 2);
    assert.match(blocked.stderr, /generated ledger block/);
    const overwrite = run(GUARD, main, {
      session_id: "tracker-root", tool_name: "Write", tool_input: { file_path: file, content: "# Execution tracker\n" },
    });
    assert.equal(overwrite.status, 2, "a Write that drops the block changes it too");
    const allowed = run(GUARD, main, {
      session_id: "tracker-root", tool_name: "Edit",
      tool_input: { file_path: file, old_string: "Hand notes.", new_string: "Better hand notes." },
    });
    assert.equal(allowed.status, 0, allowed.stderr);
    assert.equal(fs.readFileSync(file, "utf8"), text, "the guard only decides; it never writes");
  } finally {
    fs.rmSync(main, { recursive: true, force: true });
  }
});

// ARCH-LAND-05: destructive git is blocked only while /auto's marker exists.
const DESTRUCTIVE = [
  "git push --force origin feat/x",
  "git push -f origin main",
  "git push -uf origin main",
  "git push --force-with-lease origin main",
  "git push --force-with-lease=main:abc123 origin main",
  "git push origin +main",
  "git push origin +HEAD:main",
  "git fetch origin && git reset --hard origin/main",
  "git -C /tmp/repo reset --hard",
  "git worktree remove --force .worktrees/u1",
  "git worktree remove -f .worktrees/u1",
  // Wrapped forms (S1): a nested shell, a subshell, $( ), backticks, an alias.
  "bash -c 'git push -f origin main'",
  "sh -c \"git reset --hard origin/main\"",
  "(git push --force origin main)",
  "echo $(git reset --hard)",
  "echo `git push -f origin main`",
  "git -c alias.p='push --force' p origin main",
  "git -c alias.r=\"!git reset --hard\" r",
];
const ALLOWED = ["git push origin HEAD:main", "git push -u origin feat/x", "git reset --soft HEAD~1", "git worktree remove .worktrees/u1", "git status"];
const bash = (sid, command) => ({ session_id: sid, tool_name: "Bash", tool_input: { command } });

test("pre-guard: while /auto is active, force pushes, hard resets and forced worktree removal are blocked", () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-auto-force-")));
  try {
    const sid = "auto-run";
    fs.mkdirSync(path.join(dir, ".craftsman", "sessions", sid), { recursive: true });
    fs.writeFileSync(path.join(dir, ".craftsman", "sessions", sid, "auto-active"), JSON.stringify({ plan: "p", at: new Date().toISOString() }));
    for (const command of DESTRUCTIVE) {
      const r = run(GUARD, dir, bash(sid, command));
      assert.equal(r.status, 2, command);
      assert.match(r.stderr, /BLOCKED while \/auto is active \(ARCH-LAND-05\)/, command);
    }
    for (const command of ALLOWED) assert.equal(run(GUARD, dir, bash(sid, command)).status, 0, command);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("pre-guard: the force block lapses once the /auto run is over (ARCH-LAND-05)", () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-auto-lapsed-")));
  const marker = (sid, body) => {
    fs.mkdirSync(path.join(dir, ".craftsman", "sessions", sid), { recursive: true });
    fs.writeFileSync(path.join(dir, ".craftsman", "sessions", sid, "auto-active"), body);
  };
  try {
    fs.mkdirSync(path.join(dir, ".craftsman", "tracker"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".craftsman", "tracker", "events.jsonl"),
      JSON.stringify({ key: ".::docs/plans/done.md::u1", plan: "docs/plans/done.md", unit: "u1", status: "PENDING" }) + "\n" +
      JSON.stringify({ key: ".::docs/plans/done.md::u1", plan: "docs/plans/done.md", unit: "u1", status: "MERGED", evidence: "x" }) + "\n");
    marker("finished", JSON.stringify({ plan: "done", at: new Date().toISOString() }));
    marker("aged", JSON.stringify({ plan: "p", at: new Date(Date.now() - 25 * 3600 * 1000).toISOString() }));
    marker("legacy", "2026-10-09T00:00:00.000Z\n");
    for (const sid of ["finished", "aged", "legacy"]) {
      assert.equal(run(GUARD, dir, bash(sid, "git push --force origin main")).status, 0, sid);
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("pre-guard: without /auto the destructive git forms are unchanged (not blocked here)", () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "craftsman-no-auto-")));
  try {
    for (const command of [...DESTRUCTIVE, ...ALLOWED]) assert.equal(run(GUARD, dir, bash("plain", command)).status, 0, command);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
